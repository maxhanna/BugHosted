using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Text.Json;
using System.Text;

namespace maxhanna.Server.Controllers
{
    /// <summary>
    /// Filesystem endpoints for the BugHosted Weaver IDE.
    /// Proxies file operations to the local Weaver instance using the address
    /// reported in the most recent heartbeat.
    /// </summary>
    [ApiController]
    [Route("api/bughosted")]
    public class BughostedController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly IHttpClientFactory _clientFactory;

        public BughostedController(IConfiguration config, IHttpClientFactory clientFactory)
        {
            _config = config;
            _clientFactory = clientFactory;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/list?clientId=&path=
        // ─────────────────────────────────────────────────────────────────────────
        [HttpGet("fs/list")]
        public async Task<IActionResult> ListDirectory([FromQuery] string clientId, [FromQuery] string? path)
        {
            var (weaverUrl, err) = await ResolveWeaverUrl(clientId);
            if (err != null) return err;
            if (string.IsNullOrWhiteSpace(weaverUrl))
                return BadRequest(new { error = "Weaver address not available from heartbeat" });

            try
            {
                var client = _clientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                var url = $"{weaverUrl}/api/bughosted/fs/list?clientId={Uri.EscapeDataString(clientId)}&path={Uri.EscapeDataString(path ?? "")}";
                var response = await client.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                return Content(body, "application/json");
            }
            catch (TaskCanceledException)
            {
                return StatusCode(504, new { error = "Weaver instance timed out" });
            }
            catch (Exception ex)
            {
                return StatusCode(502, new { error = $"Cannot reach Weaver: {ex.Message}" });
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/content?clientId=&path=
        // ─────────────────────────────────────────────────────────────────────────
        [HttpGet("fs/content")]
        public async Task<IActionResult> GetFileContent([FromQuery] string clientId, [FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return BadRequest(new { error = "path required" });

            var (weaverUrl, err) = await ResolveWeaverUrl(clientId);
            if (err != null) return err;
            if (string.IsNullOrWhiteSpace(weaverUrl))
                return BadRequest(new { error = "Weaver address not available from heartbeat" });

            try
            {
                var client = _clientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                var url = $"{weaverUrl}/api/bughosted/fs/content?clientId={Uri.EscapeDataString(clientId)}&path={Uri.EscapeDataString(path)}";
                var response = await client.GetAsync(url);
                var body = await response.Content.ReadAsStringAsync();
                return Content(body, "application/json");
            }
            catch (TaskCanceledException)
            {
                return StatusCode(504, new { error = "Weaver instance timed out" });
            }
            catch (Exception ex)
            {
                return StatusCode(502, new { error = $"Cannot reach Weaver: {ex.Message}" });
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // POST /api/bughosted/fs/save
        // Body: { clientId, path, content, createIfMissing? }
        // ─────────────────────────────────────────────────────────────────────────
        [HttpPost("fs/save")]
        public async Task<IActionResult> SaveFile([FromBody] BughostedSaveRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Path) || req.Content == null)
                return BadRequest(new { error = "path and content required" });

            var (weaverUrl, err) = await ResolveWeaverUrl(req.ClientId);
            if (err != null) return err;
            if (string.IsNullOrWhiteSpace(weaverUrl))
                return BadRequest(new { error = "Weaver address not available from heartbeat" });

            try
            {
                var client = _clientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                var payload = JsonSerializer.Serialize(new
                {
                    clientId = req.ClientId,
                    path = req.Path,
                    content = req.Content,
                    createIfMissing = req.CreateIfMissing ?? false
                });
                var httpReq = new HttpRequestMessage(HttpMethod.Post, $"{weaverUrl}/api/bughosted/fs/save")
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };
                var response = await client.SendAsync(httpReq);
                var body = await response.Content.ReadAsStringAsync();
                return Content(body, "application/json");
            }
            catch (TaskCanceledException)
            {
                return StatusCode(504, new { error = "Weaver instance timed out" });
            }
            catch (Exception ex)
            {
                return StatusCode(502, new { error = $"Cannot reach Weaver: {ex.Message}" });
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // Helpers
        // ─────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Look up the Weaver instance URL for this clientId from the most recent heartbeat.
        /// Tries weaver_address first, falls back to constructing from remote_ip.
        /// Returns (url, null) on success or (null, IActionResult error) on failure.
        /// </summary>
        private async Task<(string? weaverUrl, IActionResult? error)> ResolveWeaverUrl(string? clientId)
        {
            if (string.IsNullOrWhiteSpace(clientId))
                return (null, Unauthorized(new { error = "clientId required" }));

            string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
            await using var conn = new MySqlConnector.MySqlConnection(cs);
            await conn.OpenAsync();

            // Ensure schema columns exist
            try
            {
                await using var migrateCmd = new MySqlConnector.MySqlCommand(
                    "ALTER TABLE maxhanna.weaver_heartbeat " +
                    "ADD COLUMN IF NOT EXISTS weaver_address VARCHAR(255) DEFAULT NULL, " +
                    "ADD COLUMN IF NOT EXISTS remote_ip VARCHAR(45) DEFAULT NULL", conn);
                await migrateCmd.ExecuteNonQueryAsync();
            }
            catch { }

            const string sql = @"
                SELECT weaver_address, remote_ip
                FROM maxhanna.weaver_heartbeat
                WHERE client_id = @ClientId
                ORDER BY last_heartbeat DESC
                LIMIT 1";
            await using var cmd = new MySqlConnector.MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ClientId", clientId);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return (null, NotFound(new { error = "No heartbeat found for clientId" }));

            var weaverAddress = reader.IsDBNull(reader.GetOrdinal("weaver_address")) ? null : reader.GetString("weaver_address");
            var remoteIp = reader.IsDBNull(reader.GetOrdinal("remote_ip")) ? null : reader.GetString("remote_ip");

            // Prefer the full weaver_address reported by the client
            if (!string.IsNullOrWhiteSpace(weaverAddress))
                return (weaverAddress, null);

            // Fallback: construct URL from the remote IP (default port 5000)
            if (!string.IsNullOrWhiteSpace(remoteIp))
                return ($"http://{remoteIp}:5000", null);

            return (null, BadRequest(new { error = "Weaver address not available" }));
        }
    }

    public class BughostedSaveRequest
    {
        public string ClientId { get; set; } = "";
        public string Path { get; set; } = "";
        public string Content { get; set; } = "";
        public bool? CreateIfMissing { get; set; }
    }
}
