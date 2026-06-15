using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    /// <summary>
    /// File request endpoints for the BugHosted Weaver IDE.
    /// Creates pending file requests in the database. The remote Weaver
    /// instance polls these, processes them locally, and fulfills them.
    /// Results are delivered back to the frontend via the heartbeat status.
    /// </summary>
    [ApiController]
    [Route("[controller]")]
    public class BughostedController : ControllerBase
    {
        private readonly IConfiguration _config;

        public BughostedController(IConfiguration config)
        {
            _config = config;
        }

        private async Task<string> GetCs() => _config.GetValue<string>("ConnectionStrings:maxhanna") ?? ""; 
        private async Task<int> GetUserIdForClientId(string clientId)
        {
            var cs = await GetCs();
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();
            await using var cmd = new MySqlCommand(
                "SELECT user_id FROM maxhanna.weaver_heartbeat WHERE client_id = @ClientId ORDER BY last_heartbeat DESC LIMIT 1", conn);
            cmd.Parameters.AddWithValue("@ClientId", clientId);
            var result = await cmd.ExecuteScalarAsync();
            return result == null ? 0 : Convert.ToInt32(result);
        }

        // ─────────────────────────────────────────────────────────────────────
        // POST /bughosted/fs/request
        // Body: { clientId, type: "listing"|"content"|"save", path, content? }
        // Angular calls this to request a directory listing or file content.
        // Deduplicates: if a matching request already exists (pending or recently
        // fulfilled), returns the cached data without creating a new row.
        // Cleans up requests older than 3 minutes.
        // ─────────────────────────────────────────────────────────────────────
        [HttpPost("fs/request")]
        public async Task<IActionResult> CreateRequest([FromBody] BughostedFileRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ClientId))
                return BadRequest(new { error = "clientId required" });
            if (string.IsNullOrWhiteSpace(req.Type))
                return BadRequest(new { error = "type required (listing, content, save)" });
            if (req.Type != "listing" && string.IsNullOrWhiteSpace(req.Path))
                return BadRequest(new { error = "path required" });

            var userId = await GetUserIdForClientId(req.ClientId);
            if (userId == 0)
                return BadRequest(new { error = "No heartbeat found for this clientId" });

            var cs = await GetCs();
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();

            // Check for an existing pending request with same type+path+clientId
            await using var dupCheck = new MySqlCommand(@"
                SELECT id FROM maxhanna.weaver_file_request
                WHERE client_id = @ClientId AND type = @Type AND path = @Path AND status = 'pending'
                LIMIT 1", conn);
            dupCheck.Parameters.AddWithValue("@ClientId", req.ClientId);
            dupCheck.Parameters.AddWithValue("@Type", req.Type);
            dupCheck.Parameters.AddWithValue("@Path", req.Path ?? "");
            var existing = await dupCheck.ExecuteScalarAsync();
            if (existing != null)
            {
                var existingId = Convert.ToInt32(existing);
                return Ok(new { id = existingId, status = "pending", cached = false });
            }

            // Check for a recently fulfilled request with same type+path+clientId (last 10s)
            await using var cacheCheck = new MySqlCommand(@"
                SELECT id, result FROM maxhanna.weaver_file_request
                WHERE client_id = @ClientId2 AND type = @Type2 AND path = @Path2 AND status = 'fulfilled'
                  AND fulfilled_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 SECOND)
                ORDER BY fulfilled_at DESC LIMIT 1", conn);
            cacheCheck.Parameters.AddWithValue("@ClientId2", req.ClientId);
            cacheCheck.Parameters.AddWithValue("@Type2", req.Type);
            cacheCheck.Parameters.AddWithValue("@Path2", req.Path ?? "");
            await using var cacheReader = await cacheCheck.ExecuteReaderAsync();
            if (await cacheReader.ReadAsync())
            {
                var cachedId = cacheReader.GetInt32("id");
                var cachedResult = cacheReader.IsDBNull(cacheReader.GetOrdinal("result")) ? null : cacheReader.GetString("result");
                cacheReader.Close();
                return Ok(new { id = cachedId, status = "fulfilled", result = cachedResult, cached = true });
            }
            cacheReader.Close();

            await using var insertCmd = new MySqlCommand(@"
                INSERT INTO maxhanna.weaver_file_request (user_id, client_id, type, path, content, status, created_at)
                VALUES (@UserId, @ClientId3, @Type3, @Path3, @Content, 'pending', UTC_TIMESTAMP())", conn);
            insertCmd.Parameters.AddWithValue("@UserId", userId);
            insertCmd.Parameters.AddWithValue("@ClientId3", req.ClientId);
            insertCmd.Parameters.AddWithValue("@Type3", req.Type);
            insertCmd.Parameters.AddWithValue("@Path3", req.Path ?? "");
            insertCmd.Parameters.AddWithValue("@Content", req.Content ?? "");
            await insertCmd.ExecuteNonQueryAsync();
            var id = (int)insertCmd.LastInsertedId;

            // Purge requests older than 3 minutes
            await using var purgeCmd = new MySqlCommand(@"
                DELETE FROM maxhanna.weaver_file_request
                WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 MINUTE)", conn);
            await purgeCmd.ExecuteNonQueryAsync();
            
            return Ok(new { id, status = "pending", cached = false });
        }

        // ─────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/requests/pending?clientId=
        // Weaver backend polls this to find pending file requests
        // ─────────────────────────────────────────────────────────────────────
        [HttpGet("fs/requests/pending")]
        public async Task<IActionResult> GetPendingRequests([FromQuery] string clientId)
        {
            if (string.IsNullOrWhiteSpace(clientId))
                return BadRequest(new { error = "clientId required" });
 
            var cs = await GetCs();
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(@"
                SELECT id, type, path, content, created_at
                FROM maxhanna.weaver_file_request
                WHERE client_id = @ClientId AND status = 'pending'
                ORDER BY id ASC LIMIT 20", conn);
            cmd.Parameters.AddWithValue("@ClientId", clientId);

            var results = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new
                {
                    id = reader.GetInt32("id"),
                    type = reader.GetString("type"),
                    path = reader.GetString("path"),
                    content = reader.IsDBNull(reader.GetOrdinal("content")) ? null : reader.GetString("content"),
                    createdAt = reader.GetDateTime("created_at").ToString("O")
                });
            }
            return Ok(results);
        }

        // ─────────────────────────────────────────────────────────────────────
        // POST /api/bughosted/fs/requests/fulfill
        // Body: { requestId, result (JSON string), status ("fulfilled"|"error") }
        // Weaver calls this after processing a request locally
        // ─────────────────────────────────────────────────────────────────────
        [HttpPost("fs/requests/fulfill")]
        public async Task<IActionResult> FulfillRequest([FromBody] BughostedFulfillRequest req)
        {
            if (req.RequestId <= 0)
                return BadRequest(new { error = "requestId required" });
 
            var cs = await GetCs();
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(@"
                UPDATE maxhanna.weaver_file_request
                SET status = @Status, result = @Result, fulfilled_at = UTC_TIMESTAMP()
                WHERE id = @Id", conn);
            cmd.Parameters.AddWithValue("@Id", req.RequestId);
            cmd.Parameters.AddWithValue("@Status", req.Status ?? "fulfilled");
            cmd.Parameters.AddWithValue("@Result", req.Result ?? "");
            await cmd.ExecuteNonQueryAsync();

            return Ok(new { status = "ok" });
        }

        // ─────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/requests/result?id=123
        // Angular polls this to check if a file request has been fulfilled
        // ─────────────────────────────────────────────────────────────────────
        [HttpGet("fs/requests/result")]
        public async Task<IActionResult> GetRequestResult([FromQuery] int id)
        {
            if (id <= 0)
                return BadRequest(new { error = "id required" }); 

            var cs = await GetCs();
            await using var conn = new MySqlConnection(cs);
            await conn.OpenAsync();

            await using var cmd = new MySqlCommand(@"
                SELECT status, result, type, path, created_at, fulfilled_at
                FROM maxhanna.weaver_file_request
                WHERE id = @Id", conn);
            cmd.Parameters.AddWithValue("@Id", id);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                return Ok(new
                {
                    id,
                    type = reader.GetString("type"),
                    path = reader.GetString("path"),
                    status = reader.GetString("status"),
                    result = reader.IsDBNull(reader.GetOrdinal("result")) ? null : reader.GetString("result"),
                    createdAt = reader.GetDateTime("created_at").ToString("O"),
                    fulfilledAt = reader.IsDBNull(reader.GetOrdinal("fulfilled_at")) ? null : reader.GetDateTime("fulfilled_at").ToString("O")
                });
            }
            return NotFound(new { error = "Request not found" });
        }
    }

    public class BughostedFileRequest
    {
        public string ClientId { get; set; } = "";
        public string Type { get; set; } = "";     // "listing", "content", "save"
        public string Path { get; set; } = "";
        public string? Content { get; set; }
    }

    public class BughostedFulfillRequest
    {
        public int RequestId { get; set; }
        public string Status { get; set; } = "fulfilled";
        public string? Result { get; set; }
    }
}
