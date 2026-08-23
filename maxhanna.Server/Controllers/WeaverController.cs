using System.Collections.Concurrent;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using MySqlConnector;

// Shared pending-requests dictionary for command/ack long-polling.
// BughostedController creates entries; WeaverController.AckCommand completes them.
public static class FsPendingRequests
{
	public static readonly ConcurrentDictionary<string, TaskCompletionSource<string>> Requests = new();
}

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class WeaverController : ControllerBase
	{
		private readonly IConfiguration _config;
		private readonly Log _log;
		private static readonly ConcurrentDictionary<string, WeaverSession> _sessions = new();
		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1);
		private static readonly MemoryCache _rankingsCache = new(new MemoryCacheOptions());
		private const string RankingsCacheKey = "weaver_rankings_v1";
		private const int RankingsCacheTtlMinutes = 30;
		private const int OversizedKanbanDataChars = 1_000_000;

		public WeaverController(IConfiguration config, Log log)
		{
			_config = config;
			_log = log;
		}

		[HttpGet("version")]
		public async Task<IActionResult> GetVersion()
		{
			string? filePath = FindRepoFile(".weaver-version");
			if (string.IsNullOrWhiteSpace(filePath) || !System.IO.File.Exists(filePath))
				return NotFound(new { error = ".weaver-version not found" });

			string version = await System.IO.File.ReadAllTextAsync(filePath);
			return Content(version.Trim(), "text/plain");
		}

		[HttpPost("login")]
		public async Task<IActionResult> Login([FromBody] WeaverLoginRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
				return BadRequest(new { error = "Username and password required" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, pass, salt FROM maxhanna.users WHERE LOWER(username) = LOWER(@Username)";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@Username", req.Username.Trim());
			using var reader = await cmd.ExecuteReaderAsync();

			if (!reader.Read())
				return Unauthorized(new { error = "Invalid username or password" });

			int userId = reader.GetInt32("id");
			string storedHash = reader.GetString("pass");
			string storedSalt = reader.IsDBNull(reader.GetOrdinal("salt")) ? "" : reader.GetString("salt");

			if (!storedHash.Equals(HashPassword(req.Password, storedSalt), StringComparison.Ordinal))
				return Unauthorized(new { error = "Invalid username or password" });

			string token = GenerateToken();
			_sessions[token] = new WeaverSession
			{
				UserId = userId,
				Username = req.Username,
				CreatedAt = DateTime.UtcNow
			};

			return Ok(new
			{
				token,
				user = new { id = userId, username = req.Username }
			});
		}

		[HttpPost("auto-login")]
		public async Task<IActionResult> AutoLogin()
		{
			if (!Request.Cookies.TryGetValue("BHUserToken", out var token) || string.IsNullOrWhiteSpace(token))
				return Unauthorized(new { error = "No session token" });

			// The BHUserToken cookie is now a server-issued session token (see
			// Log.CreateSession), so validate it against the session store instead
			// of decrypting a client-encrypted userId.
			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			int? userId = await Log.ValidateSessionUserId(cs, token);
			if (userId == null)
				return Unauthorized(new { error = "Invalid session token" });

			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, username FROM maxhanna.users WHERE id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId.Value);
			using var reader = await cmd.ExecuteReaderAsync();

			if (!reader.Read())
				return Unauthorized(new { error = "User not found" });

			string username = reader.GetString("username");
			string weaverToken = GenerateToken();
			_sessions[weaverToken] = new WeaverSession
			{
				UserId = userId.Value,
				Username = username,
				CreatedAt = DateTime.UtcNow
			};

			return Ok(new { token = weaverToken, user = new { id = userId.Value, username } });
		}

		[HttpPost("heartbeat")]
		public async Task<IActionResult> Heartbeat([FromBody] WeaverHeartbeatRequest req)
		{
			int? userId = null;
			try
			{
				if (!await _semaphore.WaitAsync(0))
				{
					Console.WriteLine("Weaver heartbeat rejected — another heartbeat is already running.");
					return Conflict(new { Message = "Heartbeat is already running." });
				}

				try
				{
					if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
					{
						Console.WriteLine("Weaver heartbeat rejected — invalid or expired session token.");
						return Unauthorized(new { error = "Invalid token" });
					}
					userId = session.UserId;

					var remoteIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
					var weaverAddress = req.WeaverAddress ?? "";

					string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
					using var conn = new MySqlConnection(cs);
					await conn.OpenAsync();

					// Cache check: skip INSERT if this user+client has sent a heartbeat in the last 5 minutes
					using (var checkConn = new MySqlConnection(cs))
					{
						await checkConn.OpenAsync();
						using var checkCmd = new MySqlCommand(
							@"SELECT EXISTS (
								SELECT 1
								FROM maxhanna.weaver_heartbeat h
								WHERE h.user_id = @UserId
								AND h.client_id = @ClientId
								AND h.last_heartbeat >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
							) AS result;",
							checkConn);
						checkCmd.Parameters.AddWithValue("@UserId", session.UserId);
						checkCmd.Parameters.AddWithValue("@ClientId", req.ClientId ?? "");
						var cached = await checkCmd.ExecuteScalarAsync();
						if (cached is long l && l == 1)
						{
							Console.WriteLine("Ignored heartbeat from " + remoteIp);
							return Ok(new { status = "ok" });
						}
					}

					var rawKanban = GzipDecompress(req.KanbanData ?? "");
					if (rawKanban.Length > OversizedKanbanDataChars)
					{
						_ = _log.Db($"Weaver heartbeat oversized kanban_data ({rawKanban.Length:N0} chars) from user {session.UserId} — slimming before storage.", session.UserId, "WEAVER", outputToConsole: true);
					}
					var kanbanData = SlimKanbanData(rawKanban);

					string sql = @"
						INSERT INTO maxhanna.weaver_heartbeat (user_id, client_id, status, last_heartbeat, kanban_data, weaver_address, remote_ip)
						VALUES (@UserId, @ClientId, @Status, UTC_TIMESTAMP(), @KanbanData, @WeaverAddress, @RemoteIp)
						ON DUPLICATE KEY UPDATE status = @Status, last_heartbeat = UTC_TIMESTAMP(), kanban_data = @KanbanData, weaver_address = @WeaverAddress, remote_ip = @RemoteIp";

					using var cmd = new MySqlCommand(sql, conn);
					cmd.CommandTimeout = 45;
					cmd.Parameters.AddWithValue("@UserId", session.UserId);
					cmd.Parameters.AddWithValue("@ClientId", req.ClientId ?? "");
					cmd.Parameters.AddWithValue("@Status", req.Status ?? "online");
					cmd.Parameters.AddWithValue("@KanbanData", kanbanData);
					cmd.Parameters.AddWithValue("@WeaverAddress", weaverAddress);
					cmd.Parameters.AddWithValue("@RemoteIp", remoteIp);
					await cmd.ExecuteNonQueryAsync();

					var settings = GzipDecompress(req.Settings ?? "");
					if (!string.IsNullOrWhiteSpace(settings))
					{
						string settingsSql = @"
							INSERT INTO maxhanna.weaver_settings (user_id, settings_data, updated_at)
							VALUES (@UserId, @SettingsData, UTC_TIMESTAMP())
							ON DUPLICATE KEY UPDATE settings_data = @SettingsData, updated_at = UTC_TIMESTAMP()";

						using var settingsCmd = new MySqlCommand(settingsSql, conn);
						settingsCmd.Parameters.AddWithValue("@UserId", session.UserId);
						settingsCmd.Parameters.AddWithValue("@SettingsData", settings);
						await settingsCmd.ExecuteNonQueryAsync();
					}

					return Ok(new { status = "ok" });
				}
				finally
				{
					_semaphore.Release();
				}
			}
			catch (MySqlConnector.MySqlException ex)
			{
				_ = _log.Db("Weaver heartbeat database error: " + ex.Message, userId, "WEAVER", outputToConsole: true);
				return Ok(new { status = "abort", error = ex.Message });
			}
			catch (System.Net.Sockets.SocketException ex)
			{
				_ = _log.Db("Weaver heartbeat socket error: " + ex.Message, userId, "WEAVER", outputToConsole: true);
				return Ok(new { status = "abort" });
			}
			catch (SemaphoreFullException ex)
			{
				_ = _log.Db("Weaver heartbeat semaphore error: " + ex.Message, userId, "WEAVER", outputToConsole: true);
				return Ok(new { status = "abort" });
			}
			catch (OperationCanceledException ex)
			{
				_ = _log.Db("Weaver heartbeat cancelled: " + ex.Message, userId, "WEAVER", outputToConsole: true);
				return Ok(new { status = "abort" });
			}
			catch (Exception ex)
			{
				_ = _log.Db("Weaver heartbeat failed: " + ex.Message, userId, "WEAVER", outputToConsole: true);
				return Ok(new { status = "abort", error = ex.Message });
			}
		}

	 	[HttpPost("feedback")]
		public async Task<IActionResult> SubmitFeedback([FromBody] WeaverFeedbackRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });
			if (string.IsNullOrWhiteSpace(req.Message))
				return BadRequest(new { error = "Feedback message required" });
			try
			{
				var cs = _config.GetValue<string>("ConnectionStrings:maxhanna");
				using var conn = new MySqlConnection(cs);
				await conn.OpenAsync();
			 
 				using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.weaver_feedback (user_id, username, card_id, card_text, message, plan_summary, files_edited)
					VALUES (@uid, @username, @cardId, @cardText, @message, @planSummary, @filesEdited)", conn);
				cmd.Parameters.AddWithValue("@uid", session.UserId);
				cmd.Parameters.AddWithValue("@username", session.Username);
				cmd.Parameters.AddWithValue("@cardId", (object?)req.CardId ?? DBNull.Value);
				cmd.Parameters.AddWithValue("@cardText", (object?)req.CardText ?? DBNull.Value);
				cmd.Parameters.AddWithValue("@message", req.Message);
				cmd.Parameters.AddWithValue("@planSummary", (object?)req.PlanSummary ?? DBNull.Value);
				cmd.Parameters.AddWithValue("@filesEdited", req.FilesEdited != null ? (object)JsonSerializer.Serialize(req.FilesEdited) : DBNull.Value);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true, id = cmd.LastInsertedId });
			}
			catch (Exception ex)
			{
				return StatusCode(500, new { error = ex.Message });
			}
		}

		[HttpGet("commands/{id}")]
		public async Task<IActionResult> GetCommandResult([FromRoute] int id, [FromQuery] string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, command, params, status, result, created_at, executed_at FROM maxhanna.weaver_remote_command WHERE id = @Id AND user_id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@Id", id);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			using var reader = await cmd.ExecuteReaderAsync();

			if (!await reader.ReadAsync())
				return NotFound(new { error = "Command not found" });

			return Ok(new
			{
				id = reader.GetInt32("id"),
				command = reader.GetString("command"),
				parameters = reader.IsDBNull(reader.GetOrdinal("params")) ? null : reader.GetString("params"),
				status = reader.GetString("status"),
				result = reader.IsDBNull(reader.GetOrdinal("result")) ? null : reader.GetString("result"),
				createdAt = reader.GetDateTime("created_at").ToString("O"),
				executedAt = reader.IsDBNull(reader.GetOrdinal("executed_at")) ? null : reader.GetDateTime("executed_at").ToString("O")
			});
		}

		[HttpGet("commands")]
		public async Task<IActionResult> GetCommands([FromQuery] string token, [FromQuery] string? clientId = null)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });



			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, command, params, status, created_at FROM maxhanna.weaver_remote_command " +
				"WHERE user_id = @UserId AND (status = 'pending' OR created_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY) " +
				"ORDER BY (status = 'pending') DESC, id ASC LIMIT 200";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			using var reader = await cmd.ExecuteReaderAsync();

			var commands = new List<object>();
			while (await reader.ReadAsync())
			{
				commands.Add(new
				{
					id = reader.GetInt32("id"),
					command = reader.GetString("command"),
					status = reader.GetString("status"),
					parameters = reader.IsDBNull(reader.GetOrdinal("params")) ? null : reader.GetString("params"),
					createdAt = reader.GetDateTime("created_at").ToString("O")
				});
			}
			return Ok(commands);
		}

		[HttpPost("commands/ack")]
		public async Task<IActionResult> AckCommand([FromBody] WeaverAckRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			// Complete any pending long-poll request for this requestId
			if (!string.IsNullOrWhiteSpace(req.RequestId) && FsPendingRequests.Requests.TryRemove(req.RequestId, out var tcs))
			{
				tcs.TrySetResult(req.Result ?? "");
			}

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "UPDATE maxhanna.weaver_remote_command SET status = @Status, result = @Result, executed_at = UTC_TIMESTAMP() WHERE id = @Id AND user_id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@Id", req.CommandId);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@Status", req.Status ?? "executed");
			cmd.Parameters.AddWithValue("@Result", req.Result ?? "");
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		[HttpPost("commands/add")]
		public async Task<IActionResult> AddCommand([FromBody] WeaverAddCommandRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			if (string.IsNullOrWhiteSpace(req.Command))
				return BadRequest(new { error = "Command required" });



			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "INSERT INTO maxhanna.weaver_remote_command (user_id, command, params, status, created_at) VALUES (@UserId, @Command, @Params, 'pending', UTC_TIMESTAMP())";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@Command", req.Command);
			cmd.Parameters.AddWithValue("@Params", req.Params ?? "");
			await cmd.ExecuteNonQueryAsync();
			int id = (int)cmd.LastInsertedId;

			// Per-user cap: keep only the newest 200 rows so rapid card edits can't
			// grow the table unbounded. Pending commands are never deleted (the agent
			// must still see them); only stale executed/cancelled history is trimmed.
			// Best-effort maintenance: a cap failure must never fail the insert above.
			try
			{
				string capSql = @"DELETE FROM maxhanna.weaver_remote_command
					WHERE user_id = @UserId
					  AND status IN ('executed','cancelled')
					  AND id <= (SELECT cutoff FROM (SELECT id AS cutoff FROM maxhanna.weaver_remote_command
						WHERE user_id = @UserId ORDER BY id DESC LIMIT 1 OFFSET 199) c)";
				using var capCmd = new MySqlCommand(capSql, conn);
				capCmd.Parameters.AddWithValue("@UserId", session.UserId);
				await capCmd.ExecuteNonQueryAsync();
			}
			catch { /* cap is best-effort; ignore */ }

			return Ok(new { id, status = "pending" });
		}

		// ── File request table endpoints (Weaver backend polls these) ────

		[HttpGet("file-requests/pending")]
		public async Task<IActionResult> GetPendingFileRequests([FromQuery] string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(@"
				SELECT id, type, path, content, created_at
				FROM maxhanna.weaver_file_request
				WHERE status = 'pending'
				ORDER BY id ASC LIMIT 20", conn);

			var results = new List<object>();
			using var reader = await cmd.ExecuteReaderAsync();
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

		[HttpPost("file-requests/fulfill")]
		public async Task<IActionResult> FulfillFileRequest([FromBody] WeaverFulfillFileRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			if (req.RequestId <= 0)
				return BadRequest(new { error = "requestId required" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(@"
				UPDATE maxhanna.weaver_file_request
				SET status = @Status, result = @Result, fulfilled_at = UTC_TIMESTAMP()
				WHERE id = @Id", conn);
			cmd.Parameters.AddWithValue("@Id", req.RequestId);
			cmd.Parameters.AddWithValue("@Status", req.Status ?? "fulfilled");
			cmd.Parameters.AddWithValue("@Result", req.Result ?? "");
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		[HttpPost("fileEdit")]
		public async Task<IActionResult> FileEdit([FromBody] WeaverFileEditRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			if (string.IsNullOrWhiteSpace(req.Path) || req.Content == null)
				return BadRequest(new { error = "Path and content required" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = @"
				INSERT INTO maxhanna.weaver_file_edit (user_id, client_id, path, content, created_at)
				VALUES (@UserId, @ClientId, @Path, @Content, UTC_TIMESTAMP())";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@ClientId", req.ClientId ?? "");
			cmd.Parameters.AddWithValue("@Path", req.Path);
			cmd.Parameters.AddWithValue("@Content", req.Content);
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		[HttpGet("fileEdits")]
		public async Task<IActionResult> GetFileEdits([FromQuery] string token, [FromQuery] int userId, [FromQuery] string? path)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql;
			if (!string.IsNullOrWhiteSpace(path))
			{
				sql = "SELECT id, user_id, client_id, path, content, created_at FROM maxhanna.weaver_file_edit WHERE user_id = @UserId AND path = @Path ORDER BY id DESC LIMIT 50";
			}
			else
			{
				sql = "SELECT id, user_id, client_id, path, content, created_at FROM maxhanna.weaver_file_edit WHERE user_id = @UserId ORDER BY id DESC LIMIT 50";
			}
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId > 0 ? userId : session.UserId);
			if (!string.IsNullOrWhiteSpace(path))
				cmd.Parameters.AddWithValue("@Path", path);
			using var reader = await cmd.ExecuteReaderAsync();

			var edits = new List<object>();
			while (await reader.ReadAsync())
			{
				edits.Add(new
				{
					id = reader.GetInt32("id"),
					userId = reader.GetInt32("user_id"),
					clientId = reader.IsDBNull(reader.GetOrdinal("client_id")) ? null : reader.GetString("client_id"),
					path = reader.GetString("path"),
					content = reader.IsDBNull(reader.GetOrdinal("content")) ? null : reader.GetString("content"),
					createdAt = reader.GetDateTime("created_at").ToString("O")
				});
			}
			return Ok(edits);
		}

		[HttpPost("commands/update")]
		public async Task<IActionResult> UpdateCommand([FromBody] WeaverUpdateCommandRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			if (req.CommandId <= 0 || string.IsNullOrWhiteSpace(req.Params))
				return BadRequest(new { error = "CommandId and Params required" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "UPDATE maxhanna.weaver_remote_command SET params = @Params WHERE id = @Id AND user_id = @UserId AND status = 'pending'";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@Id", req.CommandId);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@Params", req.Params);
			int affected = await cmd.ExecuteNonQueryAsync();

			if (affected == 0)
				return NotFound(new { error = "Command not found or already executed" });

			return Ok(new { status = "updated" });
		}

		[HttpPost("settings")]
		public async Task<IActionResult> SaveSettings([FromBody] WeaverSettingsRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });


			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = @"
				INSERT INTO maxhanna.weaver_settings (user_id, settings_data, updated_at)
				VALUES (@UserId, @SettingsData, UTC_TIMESTAMP())
				ON DUPLICATE KEY UPDATE settings_data = @SettingsData, updated_at = UTC_TIMESTAMP()";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@SettingsData", req.SettingsData);
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		[HttpGet("settings")]
		public async Task<IActionResult> GetSettings([FromQuery] string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });


			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT settings_data, updated_at FROM maxhanna.weaver_settings WHERE user_id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			using var reader = await cmd.ExecuteReaderAsync();

			if (await reader.ReadAsync())
			{
				return Ok(new
				{
					settingsData = reader.IsDBNull(reader.GetOrdinal("settings_data")) ? null : reader.GetString("settings_data"),
					updatedAt = reader.GetDateTime("updated_at").ToString("O")
				});
			}
			return NotFound(new { error = "No settings found" });
		}

		[HttpGet("heartbeat/status")]
		public async Task<IActionResult> GetHeartbeatStatus([FromQuery] string token, [FromQuery] int userId)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
					return Unauthorized(new { error = "Invalid token" });

				string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
				using var conn = new MySqlConnection(cs);
				await conn.OpenAsync();

				string sql = "SELECT client_id, status, last_heartbeat, kanban_data, weaver_address, remote_ip FROM maxhanna.weaver_heartbeat WHERE user_id = @UserId ORDER BY last_heartbeat DESC LIMIT 1";
				using var cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", userId > 0 ? userId : session.UserId);

				using var reader = await cmd.ExecuteReaderAsync();
				if (!await reader.ReadAsync())
					return NotFound(new { error = "No heartbeat data" });

				var result = new Dictionary<string, object?>
				{
					["clientId"] = reader.GetString("client_id"),
					["status"] = reader.GetString("status"),
					["lastHeartbeat"] = reader.GetDateTime("last_heartbeat").ToString("O"),
					["kanbanData"] = reader.IsDBNull(reader.GetOrdinal("kanban_data")) ? null : reader.GetString("kanban_data"),
					["weaverAddress"] = reader.IsDBNull(reader.GetOrdinal("weaver_address")) ? null : reader.GetString("weaver_address"),
					["remoteIp"] = reader.IsDBNull(reader.GetOrdinal("remote_ip")) ? null : reader.GetString("remote_ip")
				};
				reader.Close();

				// --- Query 2: settings ---
				string settingsSql = "SELECT settings_data, updated_at FROM maxhanna.weaver_settings WHERE user_id = @UserId";
				using var settingsCmd = new MySqlCommand(settingsSql, conn);
				settingsCmd.Parameters.AddWithValue("@UserId", userId > 0 ? userId : session.UserId);
				using var settingsReader = await settingsCmd.ExecuteReaderAsync();
				if (await settingsReader.ReadAsync())
				{
					result["settingsData"] = settingsReader.IsDBNull(settingsReader.GetOrdinal("settings_data")) ? null : settingsReader.GetString("settings_data");
					result["settingsUpdatedAt"] = settingsReader.GetDateTime("updated_at").ToString("O");
				}
				settingsReader.Close();

				var fileRequests = new List<object>();
				string frSql = @"
					SELECT id, type, path, status, result, created_at
					FROM maxhanna.weaver_file_request
					WHERE user_id = @UserId AND status IN ('fulfilled','error') AND fulfilled_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)
					ORDER BY fulfilled_at DESC LIMIT 20";
				using var frCmd = new MySqlCommand(frSql, conn);
				frCmd.Parameters.AddWithValue("@UserId", userId > 0 ? userId : session.UserId);
				using var frReader = await frCmd.ExecuteReaderAsync();
				while (await frReader.ReadAsync())
				{
					fileRequests.Add(new
					{
						id = frReader.GetInt32("id"),
						type = frReader.GetString("type"),
						path = frReader.GetString("path"),
						status = frReader.GetString("status"),
						result = frReader.IsDBNull(frReader.GetOrdinal("result")) ? null : frReader.GetString("result"),
						createdAt = frReader.GetDateTime("created_at").ToString("O")
					});
				}
				frReader.Close();
				result["fileRequests"] = fileRequests;

				return Ok(result);
			}
			catch (OperationCanceledException)
			{
				return Ok(new { cancelled = true });
			}
			catch (System.Net.Sockets.SocketException)
			{
				return Ok(new { cancelled = true });
			}
			catch (IOException)
			{
				return Ok(new { cancelled = true });
			}
		}

		[HttpGet("rankings")]
		public async Task<IActionResult> GetRankings([FromQuery] string token)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
					return Unauthorized(new { error = "Invalid token" });

				string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

				// The heavy part (latest-per-user query + parsing every kanban_data row)
				// is cached for a few minutes so the leaderboard doesn't re-read the whole
				// heartbeat table on every request. Freshness of the online dots and the
				// last-seen column is overlaid per request with one cheap query instead,
				// so the board stays live even inside the cache window.
				List<WeaverRankingEntry>? entries;
				if (!_rankingsCache.TryGetValue(RankingsCacheKey, out entries) || entries == null)
				{
					using var conn = new MySqlConnection(cs);
					await conn.OpenAsync();

					// Latest heartbeat per user, joined with usernames. The weaver client
					// reports its rank score/title inside the kanban_data JSON (userScore,
					// rankTitle) so the leaderboard reflects each user's own rank ladder.
					string sql = @"
						SELECT h.user_id, u.username, h.client_id, h.status, h.last_heartbeat, h.kanban_data
						FROM maxhanna.weaver_heartbeat h
						INNER JOIN (
							SELECT user_id, MAX(last_heartbeat) AS last_hb
							FROM maxhanna.weaver_heartbeat
							GROUP BY user_id
						) latest ON latest.user_id = h.user_id AND latest.last_hb = h.last_heartbeat
						INNER JOIN maxhanna.users u ON u.id = h.user_id";

					using var cmd = new MySqlCommand(sql, conn);
					cmd.CommandTimeout = 45;
					using var reader = await cmd.ExecuteReaderAsync();

					entries = new List<WeaverRankingEntry>();
					var seen = new HashSet<int>();
					while (await reader.ReadAsync())
					{
						int userId = reader.GetInt32("user_id");
						if (!seen.Add(userId)) continue; // dedupe ties on identical timestamps

						var entry = new WeaverRankingEntry
						{
							UserId = userId,
							Username = reader.GetString("username"),
							ClientId = reader.IsDBNull(reader.GetOrdinal("client_id")) ? "" : reader.GetString("client_id"),
							Status = reader.IsDBNull(reader.GetOrdinal("status")) ? "" : reader.GetString("status"),
							LastHeartbeat = reader.GetDateTime("last_heartbeat").ToString("O")
						};
						if (!reader.IsDBNull(reader.GetOrdinal("kanban_data")))
						{
							try
							{
								using var doc = JsonDocument.Parse(reader.GetString("kanban_data"));
								if (doc.RootElement.TryGetProperty("userScore", out var scoreEl) && scoreEl.TryGetInt32(out var score))
									entry.Score = score;
								if (doc.RootElement.TryGetProperty("rankTitle", out var titleEl))
									entry.RankTitle = titleEl.GetString() ?? "";
							}
							catch { /* malformed kanban_data — score stays 0 */ }
						}
						entries.Add(entry);
					}
					reader.Close();

					_rankingsCache.Set(RankingsCacheKey, entries, TimeSpan.FromMinutes(RankingsCacheTtlMinutes));
				}

				await OverlayFreshHeartbeats(cs, entries);
				await OverlayShareFlags(cs, entries);

				// Privacy: users who haven't opted in to sharing their rank on
				// BugHosted are omitted from the leaderboard entirely rather than
				// shown as "not sharing". Opt-in state is overlaid per request
				// (it is not part of the 30-min cache), so a user who enables
				// sharing shows up on the next refresh without a cache reset.
				entries = entries.Where(e => e.SharesRank).ToList();

				var ordered = entries.OrderByDescending(e => e.Score).ToList();
				var result = new List<object>(ordered.Count);
				for (int i = 0; i < ordered.Count; i++)
				{
					result.Add(new
					{
						rank = i + 1,
						userId = ordered[i].UserId,
						username = ordered[i].Username,
						rankTitle = ordered[i].RankTitle,
						score = ordered[i].Score,
						sharesRank = ordered[i].SharesRank,
						lastHeartbeat = ordered[i].LastHeartbeat,
						status = ordered[i].Status
					});
				}
				return Ok(result);
			}
			catch (Exception ex)
			{
				return StatusCode(500, new { error = ex.Message });
			}
		}

		// Weaver sends rank score/title as zeros when the user hasn't opted in to
		// sharing ("Share my rank publicly on BugHosted servers" in Weaver settings), so
		// a score of 0 is ambiguous: a real score vs. an opted-out user. The client's
		// settings payload carries bughostedShareRank, so overlay the live opt-in state
		// per request (cheap, and not affected by the 30-min score cache) to let the
		// leaderboard show "not sharing" instead of a confusing 0.
		private async Task OverlayShareFlags(string cs, List<WeaverRankingEntry> entries)
		{
			if (entries.Count == 0) return;
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();
			string sql = "SELECT user_id, settings_data FROM maxhanna.weaver_settings";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.CommandTimeout = 30;
			using var reader = await cmd.ExecuteReaderAsync();
			var shares = new Dictionary<int, bool>();
			while (await reader.ReadAsync())
			{
				int uid = reader.GetInt32("user_id");
				if (reader.IsDBNull(reader.GetOrdinal("settings_data"))) continue;
				try
				{
					using var doc = JsonDocument.Parse(reader.GetString("settings_data"));
					if (doc.RootElement.TryGetProperty("bughostedShareRank", out var el) && el.ValueKind == JsonValueKind.True)
						shares[uid] = true;
				}
				catch { /* malformed settings_data — treat as not sharing */ }
			}
			reader.Close();
			for (int i = 0; i < entries.Count; i++)
			{
				entries[i].SharesRank = shares.ContainsKey(entries[i].UserId);
			}
		}

		// Refresh last_heartbeat for users active in the last 10 minutes (anyone
		// older is definitely offline given the client's 6-minute online window), so
		// online dots and last-seen stay accurate between cache refreshes.
		private async Task OverlayFreshHeartbeats(string cs, List<WeaverRankingEntry> entries)
		{
			if (entries.Count == 0) return;
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();
			string sql = @"
				SELECT user_id, MAX(last_heartbeat) AS last_hb
				FROM maxhanna.weaver_heartbeat
				WHERE last_heartbeat >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)
				GROUP BY user_id";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.CommandTimeout = 30;
			using var reader = await cmd.ExecuteReaderAsync();
			var fresh = new Dictionary<int, string>();
			while (await reader.ReadAsync())
			{
				int uid = reader.GetInt32("user_id");
				if (!fresh.ContainsKey(uid))
					fresh[uid] = reader.GetDateTime("last_hb").ToString("O");
			}
			reader.Close();
			for (int i = 0; i < entries.Count; i++)
			{
				if (fresh.TryGetValue(entries[i].UserId, out var hb))
					entries[i].LastHeartbeat = hb;
			}
		}

		[HttpGet("fileHints")]
		public async Task<IActionResult> GetFileHints([FromQuery] string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT hints, updated_at FROM maxhanna.weaver_file_hints WHERE user_id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			using var reader = await cmd.ExecuteReaderAsync();

			if (await reader.ReadAsync())
			{
				string hints = reader.IsDBNull(reader.GetOrdinal("hints")) ? "[]" : reader.GetString("hints");
				var parsed = System.Text.Json.JsonSerializer.Deserialize<object>(hints) ?? new List<object>();
				return Ok(parsed);
			}
			return Ok(new List<object>());
		}

		[HttpPost("addbenchmark")]
		public async Task<IActionResult> AddBenchmark([FromBody] BenchmarkDataDTO benchmark)
		{

			if (string.IsNullOrWhiteSpace(benchmark.Token) || !_sessions.TryGetValue(benchmark.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			int userId = session.UserId;

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			// Reject only true duplicates: an identical submission (same user,
			// benchmark name, duration and model) within the 24h grace window the
			// daily dedup uses. Older identical rows are legitimate re-runs, so a
			// fresh submission is allowed and the newest is kept.
			string checkSql = @"
				SELECT COUNT(1) FROM maxhanna.weaver_benchmark_data
				WHERE user_id = @UserId AND benchmark_name = @BenchmarkName
				  AND COALESCE(duration, '') = COALESCE(@Duration, '')
				  AND COALESCE(model, '') = COALESCE(@Model, '')
				  AND date >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)";
			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@BenchmarkName", benchmark.Benchmark);
			checkCmd.Parameters.AddWithValue("@Duration", benchmark.Duration);
			checkCmd.Parameters.AddWithValue("@Model", benchmark.Model);
			var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
			if (count > 0)
				return Conflict(new { error = "Benchmark data already exists" });

			string sql = @"
		     INSERT INTO maxhanna.weaver_benchmark_data(user_id, date, benchmark_name, steps, score, status, duration, model, os, cpu, ram, gpu)
		     VALUES(@UserId, UTC_TIMESTAMP(), @BenchmarkName, @Steps, @Score, @Status, @Duration, @Model, @Os, @Cpu, @Ram, @Gpu)";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@BenchmarkName", benchmark.Benchmark);
			cmd.Parameters.AddWithValue("@Steps", benchmark.Steps);
			cmd.Parameters.AddWithValue("@Score", benchmark.Score);
			cmd.Parameters.AddWithValue("@Status", benchmark.Status);
			cmd.Parameters.AddWithValue("@Duration", benchmark.Duration);
			cmd.Parameters.AddWithValue("@Model", benchmark.Model);
			cmd.Parameters.AddWithValue("@Os", benchmark.OS ?? "");
			cmd.Parameters.AddWithValue("@Cpu", benchmark.CPU ?? "");
			cmd.Parameters.AddWithValue("@Ram", benchmark.RAM ?? "");
			cmd.Parameters.AddWithValue("@Gpu", benchmark.GPU ?? "");

			try
			{
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { message = "Benchmark added successfully", userId });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"Error adding benchmark: {ex.Message}");
				return StatusCode(500, new { error = "Failed to add benchmark" });
			}
		}

		[HttpGet("benchmarks")]
		public async Task<IActionResult> GetBenchmarks(string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = @"
				SELECT
					w.id,
					w.user_id,
					u.username,
					w.date,
					w.benchmark_name,
					w.steps,
					w.score,
					w.status, w.duration,
					w.model,
					w.os,
					w.cpu, 
					w.ram,
					w.gpu
				FROM maxhanna.weaver_benchmark_data AS w
				LEFT JOIN maxhanna.users AS u ON w.user_id = u.id
				ORDER BY date DESC;
		    ";
			using var cmd = new MySqlCommand(sql, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			var benchmarks = new List<object>();
			while (await reader.ReadAsync())
			{
				BenchmarkDataDTO bench = new BenchmarkDataDTO();
				bench.UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id");
				bench.UserName = reader.IsDBNull(reader.GetOrdinal("username")) ? "" : reader.GetString("username");
				bench.Date = reader.GetDateTime("date").ToString("yyyy-MM-dd HH:mm:ss");
				bench.Benchmark = reader.GetString("benchmark_name");
				bench.Steps = reader.IsDBNull(reader.GetOrdinal("steps")) ? "0" : reader.GetString("steps");
				bench.Score = reader.IsDBNull(reader.GetOrdinal("score")) ? 0.0f : reader.GetFloat("score");
				bench.Status = reader.GetString("status");
				bench.Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? "" : reader.GetInt32("duration").ToString();
				bench.Model = reader.IsDBNull(reader.GetOrdinal("model")) ? "" : reader.GetString("model");
				bench.OS = reader.IsDBNull(reader.GetOrdinal("os")) ? "" : reader.GetString("os");
				bench.CPU = reader.IsDBNull(reader.GetOrdinal("cpu")) ? "" : reader.GetString("cpu");
				bench.RAM = reader.IsDBNull(reader.GetOrdinal("ram")) ? "" : reader.GetString("ram");
				bench.GPU = reader.IsDBNull(reader.GetOrdinal("gpu")) ? "" : reader.GetString("gpu");
				benchmarks.Add(bench);
			}


			return Ok(benchmarks);
		}

		[HttpPost("fileHints")]
		public async Task<IActionResult> SaveFileHints([FromBody] WeaverFileHintsRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string hintsJson = System.Text.Json.JsonSerializer.Serialize(req.Hints ?? new List<object>());

			string sql = @"
				INSERT INTO maxhanna.weaver_file_hints (user_id, hints, updated_at)
				VALUES (@UserId, @Hints, UTC_TIMESTAMP())
				ON DUPLICATE KEY UPDATE hints = @Hints, updated_at = UTC_TIMESTAMP()";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@Hints", hintsJson);
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		// ── Project file skeleton ──────────────────────────────────────────
		// Aggregates every file path the localhost Weaver has synced to the DB
		// (files it edited via weaver_file_edit, files it read/saved via
		// weaver_file_request, and the directory-listing results it returned).
		// This gives the frontend file picker a full "project skeleton" of known
		// paths instead of only the files already attached to board cards.
		[HttpGet("fileSkeleton")]
		public async Task<IActionResult> GetFileSkeleton([FromQuery] string token, [FromQuery] string? project)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			var paths = new HashSet<string>(StringComparer.Ordinal);

			// 1. Files the agent actually edited.
			using (var cmd = new MySqlCommand(@"
				SELECT DISTINCT path FROM maxhanna.weaver_file_edit
				WHERE user_id = @UserId AND path IS NOT NULL AND path <> ''
				LIMIT 5000", conn))
			{
				cmd.Parameters.AddWithValue("@UserId", session.UserId);
				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
					paths.Add(reader.GetString(0));
			}

			// 2. Files requested (content/save) plus the directory listings the
			//    localhost returned for 'listing' requests.
			using (var cmd = new MySqlCommand(@"
				SELECT type, path, result
				FROM maxhanna.weaver_file_request
				WHERE user_id = @UserId AND status = 'fulfilled'
				ORDER BY id DESC LIMIT 5000", conn))
			{
				cmd.Parameters.AddWithValue("@UserId", session.UserId);
				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					string type = reader.IsDBNull(0) ? "" : reader.GetString(0);
					string path = reader.IsDBNull(1) ? "" : reader.GetString(1);
					string? result = reader.IsDBNull(2) ? null : reader.GetString(2);

					if (type == "content" || type == "save")
					{
						if (!string.IsNullOrWhiteSpace(path))
							paths.Add(path);
					}
					else if (type == "listing" && !string.IsNullOrWhiteSpace(result))
					{
						// Listing results are { path, entries: [{ name, path, isDirectory }] }.
						try
						{
							using var doc = JsonDocument.Parse(result);
							if (doc.RootElement.TryGetProperty("entries", out var entriesEl) && entriesEl.ValueKind == JsonValueKind.Array)
							{
								foreach (var e in entriesEl.EnumerateArray())
								{
									if (e.ValueKind != JsonValueKind.Object) continue;
									// Directories are implied by file paths in the tree; only
									// collect actual files so the picker shows leaves.
									if (e.TryGetProperty("isDirectory", out var isDir) && isDir.ValueKind == JsonValueKind.True)
										continue;
									if (e.TryGetProperty("path", out var ep) && ep.ValueKind == JsonValueKind.String)
										paths.Add(ep.GetString()!);
								}
							}
						}
						catch { /* malformed listing result — skip */ }
					}
				}
			}

			// Optional best-effort project filter: keep paths under the project
			// (or relative paths), drop absolute paths under a different root.
			IEnumerable<string> resultPaths = paths;
			if (!string.IsNullOrWhiteSpace(project))
			{
				string proj = project.Replace('\\', '/').TrimEnd('/');
				resultPaths = paths.Where(p =>
				{
					string np = p.Replace('\\', '/');
					if (np.Equals(proj, StringComparison.OrdinalIgnoreCase)
						|| np.StartsWith(proj + "/", StringComparison.OrdinalIgnoreCase))
						return true;
					if (np.Length >= 2 && np[1] == ':') return false; // windows absolute, other drive
					if (np.StartsWith('/')) return false;              // unix absolute, other root
					return true;                                        // relative path — keep
				});
			}

			return Ok(resultPaths.OrderBy(p => p, StringComparer.OrdinalIgnoreCase).ToList());
		}

		private static string? FindRepoFile(string fileName)
		{
			string? current = Directory.GetCurrentDirectory();
			while (!string.IsNullOrWhiteSpace(current))
			{
				string candidate = System.IO.Path.Combine(current, fileName);
				if (System.IO.File.Exists(candidate))
					return candidate;

				DirectoryInfo? parent = Directory.GetParent(current);
				if (parent == null)
					break;

				current = parent.FullName;
			}

			return null;
		}

		private static string GenerateToken()
		{
			var bytes = new byte[32];
			using var rng = RandomNumberGenerator.Create();
			rng.GetBytes(bytes);
			return Convert.ToHexString(bytes).ToLowerInvariant();
		}

		private static string HashPassword(string password, string salt)
		{
			using var sha256 = SHA256.Create();
			byte[] inputBytes = Encoding.UTF8.GetBytes(password + salt);
			byte[] hashedBytes = sha256.ComputeHash(inputBytes);
			return Convert.ToBase64String(hashedBytes);
		}

		private static string GzipDecompress(string input)
		{
			if (string.IsNullOrWhiteSpace(input)) return "";
			byte[] compressed;
			try
			{
				compressed = Convert.FromBase64String(input);
			}
			catch (FormatException)
			{
				return input;
			}
			if (compressed.Length < 2 || compressed[0] != 0x1F || compressed[1] != 0x8B)
				return input;
			try
			{
				using var ms = new MemoryStream(compressed);
				using var gzip = new GZipStream(ms, CompressionMode.Decompress);
				using var reader = new StreamReader(gzip, Encoding.UTF8);
				return reader.ReadToEnd();
			}
			catch
			{
				return input;
			}
		}

		// ── Heartbeat payload slimming ─────────────────────────────────────
		// Archived cards keep their full agent log/analysis/steps on the localhost,
		// which can push a single kanban_data payload to several megabytes and blow
		// past MySQL's max_allowed_packet / column size. The web dashboard only
		// needs a bounded view of these fields, so cap them before storing — this
		// keeps every board (especially large archives) syncing without dropping
		// cards. Top-level fields (projects, userScore, rankTitle, fileListing,
		// editorState, …) are left untouched.
		private static string SlimKanbanData(string json)
		{
			if (string.IsNullOrWhiteSpace(json))
				return json;
			try
			{
				var root = JsonNode.Parse(json);
				if (root is not JsonObject obj)
					return json;

				JsonObject? state = null;
				foreach (var key in new[] { "state", "State" })
				{
					if (obj[key] is JsonObject s) { state = s; break; }
				}

				if (state != null)
				{
					foreach (var col in new[] { "todo", "doing", "done", "archived", "selfImproving" })
					{
						if (state[col] is JsonArray arr)
						{
							foreach (var item in arr)
							{
								if (item is JsonObject card)
									SlimCard(card);
							}
						}
					}
				}

				return obj.ToJsonString();
			}
			catch
			{
				// Malformed payload — store it as-is rather than corrupting it.
				return json;
			}
		}

		private static void SlimCard(JsonObject card)
		{
			// Bulky ephemeral fields the remote dashboard never renders.
			foreach (var key in new[] { "_meetingReplay", "_appliedDiffs", "confirmedContextFiles", "_cohesion" })
				card.Remove(key);

			if (card["agentLog"] is JsonArray log)
			{
				while (log.Count > 15) log.RemoveAt(0);
				foreach (var entry in log)
				{
					if (entry is JsonObject e)
					{
						CapStringField(e, "detail", 2000);
						CapStringField(e, "message", 2000);
					}
				}
			}

			if (card["agentAnalysis"] is JsonObject analysis)
			{
				CapStringField(analysis, "thinking", 15000);
				CapStringField(analysis, "summary", 15000);
				CapStringField(analysis, "question", 15000);

				if (analysis["steps"] is JsonArray steps)
				{
					while (steps.Count > 20) steps.RemoveAt(0);
					foreach (var step in steps)
					{
						if (step is JsonObject s)
							CapStringField(s, "output", 2000);
					}
				}
			}
		}

		private static void CapStringField(JsonObject obj, string key, int maxLen)
		{
			if (obj[key] is JsonValue val && val.TryGetValue<string>(out var s) && s != null && s.Length > maxLen)
				obj[key] = s.Substring(0, maxLen) + "…";
		}
	}

	public class WeaverLoginRequest
	{
		public string Username { get; set; } = "";
		public string Password { get; set; } = "";
	}

	public class WeaverHeartbeatRequest
	{
		public string Token { get; set; } = "";
		public string? ClientId { get; set; }
		public string? Status { get; set; }
		public string? KanbanData { get; set; }
		public string? Settings { get; set; }
		public string? WeaverAddress { get; set; }
	}

	public class WeaverSettingsRequest
	{
		public string Token { get; set; } = "";
		public string SettingsData { get; set; } = "";
	}

	public class WeaverAckRequest
	{
		public string Token { get; set; } = "";
		public int CommandId { get; set; }
		public string? Status { get; set; }
		public string? Result { get; set; }
		public string? RequestId { get; set; }
	}

	public class WeaverAddCommandRequest
	{
		public string Token { get; set; } = "";
		public string? ClientId { get; set; }
		public string Command { get; set; } = "";
		public string? Params { get; set; }
	}

	public class WeaverUpdateCommandRequest
	{
		public string Token { get; set; } = "";
		public int CommandId { get; set; }
		public string Params { get; set; } = "";
	}

	public class WeaverSession
	{
		public int UserId { get; set; }
		public string Username { get; set; } = "";
		public DateTime CreatedAt { get; set; }
	}

	public class WeaverRankingEntry
	{
		public int UserId { get; set; }
		public string Username { get; set; } = "";
		public string ClientId { get; set; } = "";
		public string Status { get; set; } = "";
		public string LastHeartbeat { get; set; } = "";
		public string RankTitle { get; set; } = "";
		public int Score { get; set; }
		public bool SharesRank { get; set; }
	}

	public class WeaverFulfillFileRequest
	{
		public string Token { get; set; } = "";
		public int RequestId { get; set; }
		public string Status { get; set; } = "fulfilled";
		public string? Result { get; set; }
	}

	public class WeaverFileEditRequest
	{
		public string Token { get; set; } = "";
		public string? ClientId { get; set; }
		public string Path { get; set; } = "";
		public string Content { get; set; } = "";
	}

	public class WeaverFileListingRequest
	{
		public string Token { get; set; } = "";
		public string? Path { get; set; }
		public string Entries { get; set; } = "[]";
	}

	public class WeaverFileContentRequest
	{
		public string Token { get; set; } = "";
		public string Path { get; set; } = "";
		public string Content { get; set; } = "";
	}

	public class WeaverFileHintsRequest
	{
		public string Token { get; set; } = "";
		public List<object>? Hints { get; set; }
	}

	public class WeaverFeedbackRequest
	{
		public string Token { get; set; } = "";
		public string? CardId { get; set; }
		public string? CardText { get; set; }
		public string Message { get; set; } = "";
		/// <summary>The card's run plan summary (what the run was supposed to do).</summary>
		public string? PlanSummary { get; set; }
		/// <summary>Relative paths of the files the run actually edited.</summary>
		public List<string>? FilesEdited { get; set; }
	}
	public class BenchmarkDataDTO
	{
		public string? Token { get; set; }
		public int? UserId { get; set; }
		public string? UserName { get; set; }
		public string? Date { get; set; }
		public string? Benchmark { get; set; }
		public string? Steps { get; set; }
		public float? Score { get; set; }
		public string? Status { get; set; }
		public string? Duration { get; set; }
		public string? Model { get; set; }
		public string? OS { get; set; }
		public string? CPU { get; set; }
		public string? RAM { get; set; }
		public string? GPU { get; set; }
	}
}