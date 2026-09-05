using maxhanna.Server.Services;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("globepings")]
	public class GlobePingsController : ControllerBase
	{
		private readonly Log _log;
		private readonly string _connectionString;

		public GlobePingsController(IConfiguration config, Log log)
		{
			_log = log;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
		}
 

		public class CreatePingRequest
		{
			public int UserId { get; set; }
			public double Lat { get; set; }
			public double Lon { get; set; }
			public string? Label { get; set; }
		}

		/// <summary>Every ping saved by any user — the globe is a shared board.</summary>
		[HttpGet("all")]
		public async Task<IActionResult> GetAll()
		{
			try
			{
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
 				var list = new List<object>();
				var sql = @"SELECT p.id, p.user_id, p.lat, p.lon, p.label, p.created_at,
								   u.username
							FROM maxhanna.globe_pings p
							LEFT JOIN maxhanna.users u ON u.id = p.user_id
							ORDER BY p.created_at DESC
							LIMIT 2000";
				await using (var cmd = new MySqlCommand(sql, conn))
				await using (var rdr = await cmd.ExecuteReaderAsync())
				{
					while (await rdr.ReadAsync())
					{
						list.Add(new
						{
							id = rdr.GetInt64("id"),
							userId = rdr.GetInt32("user_id"),
							username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Unknown" : rdr.GetString("username"),
							lat = rdr.GetDouble("lat"),
							lon = rdr.GetDouble("lon"),
							label = rdr.IsDBNull(rdr.GetOrdinal("label")) ? null : rdr.GetString("label"),
							createdUtc = rdr.GetDateTime("created_at"),
						});
					}
				}
				return Ok(list);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GlobePings GetAll failed: {ex.Message}", null, "GLOBE", true);
				return StatusCode(500, "Failed to load pings.");
			}
		}

		[HttpPost("create")]
		public async Task<IActionResult> Create([FromBody] CreatePingRequest req)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (req.Lat < -90 || req.Lat > 90 || req.Lon < -180 || req.Lon > 180
					|| double.IsNaN(req.Lat) || double.IsNaN(req.Lon))
					return BadRequest("Invalid coordinates.");
				if (req.Label != null && req.Label.Length > 120) req.Label = req.Label[..120];

				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
 				var sql = @"INSERT INTO maxhanna.globe_pings (user_id, lat, lon, label, created_at)
							VALUES (@uid, @lat, @lon, @label, UTC_TIMESTAMP());
							SELECT LAST_INSERT_ID();";
				long id;
				await using (var cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@uid", req.UserId);
					cmd.Parameters.AddWithValue("@lat", req.Lat);
					cmd.Parameters.AddWithValue("@lon", req.Lon);
					cmd.Parameters.AddWithValue("@label", string.IsNullOrWhiteSpace(req.Label) ? DBNull.Value : req.Label);
					var result = await cmd.ExecuteScalarAsync();
					id = Convert.ToInt64(result);
				}
				return Ok(new { id });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GlobePings Create failed: {ex.Message}", req.UserId, "GLOBE", true);
				return StatusCode(500, "Failed to save ping.");
			}
		}

		[HttpDelete("{id:long}")]
		public async Task<IActionResult> Delete(long id, [FromQuery] int userId)
		{
			try
			{
				if (userId <= 0) return BadRequest("userId required.");
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
 				// A user may only remove their own pings.
				await using var cmd = new MySqlCommand(
					"DELETE FROM maxhanna.globe_pings WHERE id = @id AND user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@id", id);
				cmd.Parameters.AddWithValue("@uid", userId);
				var rows = await cmd.ExecuteNonQueryAsync();
				if (rows == 0) return NotFound("Ping not found (or not yours).");
				return Ok();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GlobePings Delete failed: {ex.Message}", userId, "GLOBE", true);
				return StatusCode(500, "Failed to delete ping.");
			}
		}
	}
}
