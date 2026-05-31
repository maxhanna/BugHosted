using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class MaestroController : ControllerBase
	{
		private readonly IConfiguration _config;
		private static readonly ConcurrentDictionary<string, MaestroSession> _sessions = new();
		private static readonly Random _rng = new();

		public MaestroController(IConfiguration config)
		{
			_config = config;
		}

		[HttpPost("login")]
		public async Task<IActionResult> Login([FromBody] MaestroLoginRequest req)
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
			_sessions[token] = new MaestroSession
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

		[HttpPost("heartbeat")]
		public async Task<IActionResult> Heartbeat([FromBody] MaestroHeartbeatRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			// Ensure tables exist (idempotent)


			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = @"
				INSERT INTO maxhanna.maestro_heartbeat (user_id, client_id, status, last_heartbeat, kanban_data)
				VALUES (@UserId, @ClientId, @Status, UTC_TIMESTAMP(), @KanbanData)
				ON DUPLICATE KEY UPDATE status = @Status, last_heartbeat = UTC_TIMESTAMP(), kanban_data = @KanbanData";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@ClientId", req.ClientId ?? "");
			cmd.Parameters.AddWithValue("@Status", req.Status ?? "online");
			cmd.Parameters.AddWithValue("@KanbanData", req.KanbanData ?? "");
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		[HttpGet("commands")]
		public async Task<IActionResult> GetCommands([FromQuery] string token)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });



			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT id, command, params, created_at FROM maxhanna.maestro_remote_command WHERE user_id = @UserId AND status = 'pending' ORDER BY id ASC";
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
		public async Task<IActionResult> AckCommand([FromBody] MaestroAckRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "UPDATE maxhanna.maestro_remote_command SET status = @Status, result = @Result, executed_at = UTC_TIMESTAMP() WHERE id = @Id AND user_id = @UserId";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@Id", req.CommandId);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@Status", req.Status ?? "executed");
			cmd.Parameters.AddWithValue("@Result", req.Result ?? "");
			await cmd.ExecuteNonQueryAsync();

			return Ok(new { status = "ok" });
		}

		[HttpPost("commands/add")]
		public async Task<IActionResult> AddCommand([FromBody] MaestroAddCommandRequest req)
		{
			if (string.IsNullOrWhiteSpace(req.Token) || !_sessions.TryGetValue(req.Token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			if (string.IsNullOrWhiteSpace(req.Command))
				return BadRequest(new { error = "Command required" });



			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "INSERT INTO maxhanna.maestro_remote_command (user_id, command, params, status, created_at) VALUES (@UserId, @Command, @Params, 'pending', UTC_TIMESTAMP())";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", session.UserId);
			cmd.Parameters.AddWithValue("@Command", req.Command);
			cmd.Parameters.AddWithValue("@Params", req.Params ?? "");
			await cmd.ExecuteNonQueryAsync();
			int id = (int)cmd.LastInsertedId;

			return Ok(new { id, status = "pending" });
		}

		[HttpGet("heartbeat/status")]
		public async Task<IActionResult> GetHeartbeatStatus([FromQuery] string token, [FromQuery] int userId)
		{
			if (string.IsNullOrWhiteSpace(token) || !_sessions.TryGetValue(token, out var session))
				return Unauthorized(new { error = "Invalid token" });

			string cs = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using var conn = new MySqlConnection(cs);
			await conn.OpenAsync();

			string sql = "SELECT client_id, status, last_heartbeat, kanban_data FROM maxhanna.maestro_heartbeat WHERE user_id = @UserId ORDER BY last_heartbeat DESC LIMIT 1";
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId > 0 ? userId : session.UserId);
			using var reader = await cmd.ExecuteReaderAsync();

			if (await reader.ReadAsync())
			{
				return Ok(new
				{
					clientId = reader.GetString("client_id"),
					status = reader.GetString("status"),
					lastHeartbeat = reader.GetDateTime("last_heartbeat").ToString("O"),
					kanbanData = reader.IsDBNull(reader.GetOrdinal("kanban_data")) ? null : reader.GetString("kanban_data")
				});
			}
			return NotFound(new { error = "No heartbeat data" });
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
	}

	public class MaestroLoginRequest
	{
		public string Username { get; set; } = "";
		public string Password { get; set; } = "";
	}

	public class MaestroHeartbeatRequest
	{
		public string Token { get; set; } = "";
		public string? ClientId { get; set; }
		public string? Status { get; set; }
		public string? KanbanData { get; set; }
	}

	public class MaestroAckRequest
	{
		public string Token { get; set; } = "";
		public int CommandId { get; set; }
		public string? Status { get; set; }
		public string? Result { get; set; }
	}

	public class MaestroAddCommandRequest
	{
		public string Token { get; set; } = "";
		public string Command { get; set; } = "";
		public string? Params { get; set; }
	}

	public class MaestroSession
	{
		public int UserId { get; set; }
		public string Username { get; set; } = "";
		public DateTime CreatedAt { get; set; }
	}
}
