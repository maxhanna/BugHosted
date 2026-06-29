using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;

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
		private static readonly ConcurrentDictionary<string, WeaverSession> _sessions = new();
		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1);

		public WeaverController(IConfiguration config)
		{
			_config = config;
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

			int userId;
			try { userId = Log.DecryptUserId(token); }
			catch { return Unauthorized(new { error = "Invalid session token" }); }

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, username FROM maxhanna.users WHERE id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			using var reader = await cmd.ExecuteReaderAsync();

			if (!reader.Read())
				return Unauthorized(new { error = "User not found" });

			string username = reader.GetString("username");
			string weaverToken = GenerateToken();
			_sessions[weaverToken] = new WeaverSession
			{
				UserId = userId,
				Username = username,
				CreatedAt = DateTime.UtcNow
			};

			return Ok(new { token = weaverToken, user = new { id = userId, username } });
		}

		[HttpPost("heartbeat")]
		public async Task<IActionResult> Heartbeat([FromBody] WeaverHeartbeatRequest req)
		{
			try
			{
				if (!await _semaphore.WaitAsync(0))
					return Conflict(new { Message = "Heartbeat is already running." });

				try
				{
					if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
						return Unauthorized(new { error = "Invalid token" });

					var remoteIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
					var weaverAddress = req.WeaverAddress ?? "";

					string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
					using var conn = new MySqlConnection(cs);
					await conn.OpenAsync();

					// Cache check
					using (var checkConn = new MySqlConnection(cs))
					{
						await checkConn.OpenAsync();
						using var checkCmd = new MySqlCommand(
							"SELECT 1 FROM maxhanna.weaver_heartbeat WHERE client_id = @ClientId AND last_heartbeat >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)",
							checkConn);
						checkCmd.Parameters.AddWithValue("@ClientId", req.ClientId);
						var cached = await checkCmd.ExecuteScalarAsync();
						if (cached != null)
						{
							Console.WriteLine("Ignored heartbeat from " + remoteIp);
							return Ok(new { status = "ok" });
						}
					}

					var kanbanData = GzipDecompress(req.KanbanData ?? "");

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
			catch (MySqlConnector.MySqlException ex) when (ex.Message.Contains("Command Timeout expired"))
			{
				return Ok(new { status = "abort" });
			}
			catch (System.Net.Sockets.SocketException)
			{
				return Ok(new { status = "abort" });
			}
			catch (SemaphoreFullException)
			{
				return Ok(new { status = "abort" });
			}
			catch (OperationCanceledException)
			{
				return Ok(new { status = "abort" });
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
		public async Task<IActionResult> GetCommands([FromQuery] string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });



			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, command, params, created_at FROM maxhanna.weaver_remote_command WHERE user_id = @UserId AND status = 'pending' ORDER BY id ASC";
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
}
