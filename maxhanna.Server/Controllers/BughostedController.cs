using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
    /// <summary>
    /// Filesystem endpoints for the BugHosted Weaver IDE.
    /// All requests require a valid clientId that matches an active Weaver heartbeat session.
    /// Paths are resolved relative to the workspace root and may not escape it.
    /// </summary>
    [ApiController]
    [Route("api/bughosted")]
    public class BughostedController : ControllerBase
    {
        private readonly IConfiguration _config;

        // Share the same session map as WeaverController (both live in the same process)
        // We resolve the workspace root from the session's client heartbeat.
        public BughostedController(IConfiguration config)
        {
            _config = config;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/list?clientId=&path=
        // ─────────────────────────────────────────────────────────────────────────
        [HttpGet("fs/list")]
        public async Task<IActionResult> ListDirectory([FromQuery] string clientId, [FromQuery] string? path)
        {
            var (root, err) = await ResolveWorkspaceRoot(clientId);
            if (err != null) return err;

            var fullPath = ResolveSafePath(root!, path ?? "");
            if (fullPath == null) return BadRequest(new { error = "Path traversal not allowed" });

            if (!Directory.Exists(fullPath))
                return NotFound(new { error = "Directory not found", path = fullPath });

            var entries = new List<object>();
            try
            {
                foreach (var dir in Directory.GetDirectories(fullPath).OrderBy(d => d))
                {
                    var name = Path.GetFileName(dir);
                    if (name.StartsWith('.')) continue; // skip hidden dirs
                    entries.Add(new
                    {
                        name,
                        path = NormaliseForClient(dir, root!),
                        isDirectory = true
                    });
                }
                foreach (var file in Directory.GetFiles(fullPath).OrderBy(f => f))
                {
                    var name = Path.GetFileName(file);
                    entries.Add(new
                    {
                        name,
                        path = NormaliseForClient(file, root!),
                        isDirectory = false
                    });
                }
            }
            catch (UnauthorizedAccessException)
            {
                return StatusCode(403, new { error = "Access denied" });
            }

            return Ok(new
            {
                path = NormaliseForClient(fullPath, root!),
                entries
            });
        }

        // ─────────────────────────────────────────────────────────────────────────
        // GET /api/bughosted/fs/content?clientId=&path=
        // ─────────────────────────────────────────────────────────────────────────
        [HttpGet("fs/content")]
        public async Task<IActionResult> GetFileContent([FromQuery] string clientId, [FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return BadRequest(new { error = "path required" });

            var (root, err) = await ResolveWorkspaceRoot(clientId);
            if (err != null) return err;

            var fullPath = ResolveSafePath(root!, path);
            if (fullPath == null) return BadRequest(new { error = "Path traversal not allowed" });

            if (!System.IO.File.Exists(fullPath))
                return NotFound(new { error = "File not found" });

            try
            {
                var content = await System.IO.File.ReadAllTextAsync(fullPath);
                return Ok(new
                {
                    path = NormaliseForClient(fullPath, root!),
                    content
                });
            }
            catch (UnauthorizedAccessException)
            {
                return StatusCode(403, new { error = "Access denied" });
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

            var (root, err) = await ResolveWorkspaceRoot(req.ClientId);
            if (err != null) return err;

            var fullPath = ResolveSafePath(root!, req.Path);
            if (fullPath == null) return BadRequest(new { error = "Path traversal not allowed" });

            bool exists = System.IO.File.Exists(fullPath);
            if (!exists && !(req.CreateIfMissing ?? false))
                return NotFound(new { error = "File not found (use createIfMissing=true to create)" });

            try
            {
                if (!exists)
                {
                    var dir = Path.GetDirectoryName(fullPath)!;
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                }
                await System.IO.File.WriteAllTextAsync(fullPath, req.Content);
                return Ok(new { status = "saved", path = NormaliseForClient(fullPath, root!) });
            }
            catch (UnauthorizedAccessException)
            {
                return StatusCode(403, new { error = "Access denied" });
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // Helpers
        // ─────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Look up the workspace root for this clientId from the most recent heartbeat.
        /// Returns (root, null) on success or (null, IActionResult error) on failure.
        /// </summary>
        private async Task<(string? root, IActionResult? error)> ResolveWorkspaceRoot(string? clientId)
        {
            if (string.IsNullOrWhiteSpace(clientId))
                return (null, Unauthorized(new { error = "clientId required" }));

            string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
            await using var conn = new MySqlConnector.MySqlConnection(cs);
            await conn.OpenAsync();

            // Find the most recent heartbeat for this clientId
            const string sql = @"
                SELECT kanban_data
                FROM maxhanna.weaver_heartbeat
                WHERE client_id = @ClientId
                ORDER BY last_heartbeat DESC
                LIMIT 1";
            await using var cmd = new MySqlConnector.MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@ClientId", clientId);
            var result = await cmd.ExecuteScalarAsync();

            if (result == null || result == DBNull.Value)
                return (null, NotFound(new { error = "No heartbeat found for clientId" }));

            // Extract workspace root from kanban_data JSON
            try
            {
                var doc = JsonDocument.Parse(result.ToString()!);
                if (doc.RootElement.TryGetProperty("workspaceRoot", out var rootEl))
                {
                    var root = rootEl.GetString();
                    if (!string.IsNullOrWhiteSpace(root) && Directory.Exists(root))
                        return (Path.GetFullPath(root), null);
                }
                // Fallback: try "projects" array first path
                if (doc.RootElement.TryGetProperty("projects", out var projects) &&
                    projects.GetArrayLength() > 0)
                {
                    var firstPath = projects[0].TryGetProperty("path", out var pe) ? pe.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(firstPath) && Directory.Exists(firstPath))
                        return (Path.GetFullPath(firstPath), null);
                }
            }
            catch { }

            return (null, BadRequest(new { error = "Cannot determine workspace root from heartbeat data" }));
        }

        /// <summary>
        /// Resolve a client-supplied relative or absolute path under root.
        /// Returns null if the resolved path would escape the root (traversal guard).
        /// </summary>
        private static string? ResolveSafePath(string root, string clientPath)
        {
            // Strip leading slashes/backslashes so Path.Combine treats it as relative
            var sanitised = clientPath.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(Path.Combine(root, sanitised));
            var rootFull = Path.GetFullPath(root);

            // Ensure the resolved path is inside the root
            if (!full.StartsWith(rootFull + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                && !full.Equals(rootFull, StringComparison.OrdinalIgnoreCase))
                return null;

            return full;
        }

        /// <summary>
        /// Convert an absolute server path to a root-relative forward-slash path for the client.
        /// </summary>
        private static string NormaliseForClient(string fullPath, string root)
        {
            var rootFull = Path.GetFullPath(root);
            var rel = Path.GetRelativePath(rootFull, fullPath);
            return rel.Replace('\\', '/');
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
