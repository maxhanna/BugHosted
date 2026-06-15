using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    /// <summary>
    /// Filesystem endpoints for the BugHosted Weaver IDE.
    /// Uses command/ack long-polling through the database — the Weaver frontend
    /// processes these commands locally and sends the result via the ack endpoint.
    /// This works through NAT because the Weaver's browser-initiated channel
    /// (SSE/polling) handles command delivery and ack, not server-to-server HTTP.
    /// </summary>
    [ApiController]
    [Route("api/bughosted")]
    public class BughostedController : ControllerBase
    {
        private readonly IConfiguration _config;

        public BughostedController(IConfiguration config)
        {
            _config = config;
        }

        private async Task<int> GetUserIdForClientId(string? clientId)
        {
            if (string.IsNullOrWhiteSpace(clientId)) return 0;
            string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();
            await using var cmd = new MySqlCommand(
                "SELECT user_id FROM maxhanna.weaver_heartbeat WHERE client_id = @ClientId ORDER BY last_heartbeat DESC LIMIT 1", conn);
            cmd.Parameters.AddWithValue("@ClientId", clientId);
            var result = await cmd.ExecuteScalarAsync();
            return result is int id ? id : 0;
        }

        /// <summary>
        /// Creates a pending command in the database and long-polls for the result.
        /// The Weaver frontend picks up the command via SSE/polling, executes it
        /// locally, and sends the ack with the same requestId.
        /// </summary>
        private async Task<IActionResult> CreateCommandAndWait(string clientId, string command, string paramsJson, int timeoutSec = 30)
        {
            var userId = await GetUserIdForClientId(clientId);
            if (userId == 0)
                return BadRequest(new { error = "No heartbeat found for this clientId" });

            var requestId = Guid.NewGuid().ToString("N");
            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            FsPendingRequests.Requests[requestId] = tcs;

            string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();

            // Merge requestId into the command params so the Weaver frontend passes it back in the ack
            var parsed = string.IsNullOrWhiteSpace(paramsJson)
                ? new Dictionary<string, object>()
                : JsonSerializer.Deserialize<Dictionary<string, object>>(paramsJson) ?? new Dictionary<string, object>();
            parsed["requestId"] = requestId;
            var mergedParams = JsonSerializer.Serialize(parsed);

            await using var insertCmd = new MySqlCommand(
                "INSERT INTO maxhanna.weaver_remote_command (user_id, command, params, status, created_at) VALUES (@UserId, @Command, @Params, 'pending', UTC_TIMESTAMP())", conn);
            insertCmd.Parameters.AddWithValue("@UserId", userId);
            insertCmd.Parameters.AddWithValue("@Command", command);
            insertCmd.Parameters.AddWithValue("@Params", mergedParams);
            await insertCmd.ExecuteNonQueryAsync();

            // Long-poll: wait for the ack or timeout
            var completed = await Task.WhenAny(tcs.Task, Task.Delay(timeoutSec * 1000));
            FsPendingRequests.Requests.TryRemove(requestId, out _);

            if (completed == tcs.Task)
                return Content(tcs.Task.Result, "application/json");

            return StatusCode(504, new { error = "Weaver did not respond in time" });
        }

        // ─────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/list?clientId=&path=
        // ─────────────────────────────────────────────────────────────────────
        [HttpGet("fs/list")]
        public Task<IActionResult> ListDirectory([FromQuery] string clientId, [FromQuery] string? path)
        {
            var paramsJson = JsonSerializer.Serialize(new { path = path ?? "" });
            return CreateCommandAndWait(clientId, "requestFileListing", paramsJson);
        }

        // ─────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/content?clientId=&path=
        // ─────────────────────────────────────────────────────────────────────
        [HttpGet("fs/content")]
        public Task<IActionResult> GetFileContent([FromQuery] string clientId, [FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return Task.FromResult<IActionResult>(BadRequest(new { error = "path required" }));

            var paramsJson = JsonSerializer.Serialize(new { path });
            return CreateCommandAndWait(clientId, "requestFileContent", paramsJson);
        }

        // ─────────────────────────────────────────────────────────────────────
        // POST /api/bughosted/fs/save
        // Body: { clientId, path, content, createIfMissing? }
        // ─────────────────────────────────────────────────────────────────────
        [HttpPost("fs/save")]
        public Task<IActionResult> SaveFile([FromBody] BughostedSaveRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Path) || req.Content == null)
                return Task.FromResult<IActionResult>(BadRequest(new { error = "path and content required" }));

            var paramsJson = JsonSerializer.Serialize(new
            {
                path = req.Path,
                content = req.Content,
                createIfMissing = req.CreateIfMissing ?? false
            });
            return CreateCommandAndWait(clientId: req.ClientId, command: "fileEdit", paramsJson);
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
