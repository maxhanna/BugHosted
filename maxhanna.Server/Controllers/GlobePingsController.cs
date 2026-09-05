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
			public string? Note { get; set; }
		}

		public class UpdatePingRequest
		{
			public int UserId { get; set; }
			public long Id { get; set; }
			public string? Note { get; set; }
			public long? PhotoFileId { get; set; }
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
				var sql = @"SELECT p.id, p.user_id, p.lat, p.lon, p.label, p.note, p.photo_file_id, p.created_at,
								   u.username, fu.file_name AS photo_file_name, fu.folder_path AS photo_folder
							FROM maxhanna.globe_pings p
							LEFT JOIN maxhanna.users u ON u.id = p.user_id
							LEFT JOIN maxhanna.file_uploads fu ON fu.id = p.photo_file_id
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
						note = rdr.IsDBNull(rdr.GetOrdinal("note")) ? null : rdr.GetString("note"),						photoFileId = rdr.IsDBNull(rdr.GetOrdinal("photo_file_id")) ? null : (long?)rdr.GetInt64("photo_file_id"),
						photoUrl = BuildPhotoUrl(rdr.IsDBNull(rdr.GetOrdinal("photo_folder")) ? null : rdr.GetString("photo_folder"),
							rdr.IsDBNull(rdr.GetOrdinal("photo_file_name")) ? null : rdr.GetString("photo_file_name")),
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

		/// <summary>Builds the public asset URL for an attached photo from the
		/// file_uploads row (folder_path is stored as a full disk path — take the
		/// part after assets/Uploads/).</summary>
		private static string? BuildPhotoUrl(string? folderPath, string? fileName)
		{
			if (string.IsNullOrWhiteSpace(fileName)) return null;
			var rel = "";
			if (!string.IsNullOrWhiteSpace(folderPath))
			{
				const string marker = "assets/Uploads/";
				var idx = folderPath.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
				if (idx >= 0) rel = folderPath[(idx + marker.Length)..];
			}
			rel = rel.Replace("\\\\", "/").TrimEnd('/');
			return "/assets/Uploads/" + (rel.Length > 0 ? rel + "/" : "") + Uri.EscapeDataString(fileName);
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
				if (req.Note != null && req.Note.Length > 2000) req.Note = req.Note[..2000];

				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
 				var sql = @"INSERT INTO maxhanna.globe_pings (user_id, lat, lon, label, note, created_at)
							VALUES (@uid, @lat, @lon, @label, @note, UTC_TIMESTAMP());
							SELECT LAST_INSERT_ID();";
				long id;
				await using (var cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@uid", req.UserId);
					cmd.Parameters.AddWithValue("@lat", req.Lat);
					cmd.Parameters.AddWithValue("@lon", req.Lon);
					cmd.Parameters.AddWithValue("@label", string.IsNullOrWhiteSpace(req.Label) ? DBNull.Value : req.Label);
					cmd.Parameters.AddWithValue("@note", string.IsNullOrWhiteSpace(req.Note) ? DBNull.Value : req.Note);
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

		/// <summary>Owner-only: attach or replace a note and/or photo on a ping.
		/// photoFileId references a file uploaded through the normal file API.</summary>
		[HttpPost("update")]
		public async Task<IActionResult> Update([FromBody] UpdatePingRequest req)
		{
			try
			{
				if (req.UserId <= 0) return BadRequest("userId required.");
				if (req.Id <= 0) return BadRequest("id required.");
				if (req.Note != null && req.Note.Length > 2000) req.Note = req.Note[..2000];
				// Never allow one user to decorate another user's ping.
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				await using var cmd = new MySqlCommand(@"
					UPDATE maxhanna.globe_pings
					SET note = COALESCE(@note, note),
					    photo_file_id = COALESCE(@photo, photo_file_id)
					WHERE id = @id AND user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@id", req.Id);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@note", string.IsNullOrWhiteSpace(req.Note) ? DBNull.Value : req.Note);
				cmd.Parameters.AddWithValue("@photo", req.PhotoFileId.HasValue && req.PhotoFileId.Value > 0 ? req.PhotoFileId.Value : DBNull.Value);
				var rows = await cmd.ExecuteNonQueryAsync();
				if (rows == 0) return NotFound("Ping not found (or not yours).");
				return Ok();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"GlobePings Update failed: {ex.Message}", req.UserId, "GLOBE", true);
				return StatusCode(500, "Failed to update ping.");
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
