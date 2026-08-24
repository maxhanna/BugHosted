using maxhanna.Server.Controllers.DataContracts.Calendar;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Security.Cryptography;
using System.Text;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CalendarController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
 
		public CalendarController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}


		[HttpGet("feed/{token}.ics", Name = "CalendarFeed")]
		public async Task<IActionResult> Feed(string token)
		{
			if (string.IsNullOrWhiteSpace(token)) return NotFound();
			try
			{
				await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
 				var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
				await using var cmd = new MySqlCommand("SELECT user_id FROM maxhanna.calendar_feed_tokens WHERE token_hash=@Hash AND revoked_utc IS NULL LIMIT 1", conn);
				cmd.Parameters.AddWithValue("@Hash", hash);
				var id = await cmd.ExecuteScalarAsync();
				if (id == null) return NotFound();
				var userId = Convert.ToInt32(id);
				var entries = new List<(int Id, string Type, string Note, DateTime Date)>();
				await using var events = new MySqlCommand("SELECT Id, Type, Note, Date FROM maxhanna.calendar WHERE Ownership=@Owner ORDER BY Date", conn);
				events.Parameters.AddWithValue("@Owner", userId);
				await using var reader = await events.ExecuteReaderAsync();
				while (await reader.ReadAsync()) entries.Add((reader.GetInt32(0), reader.GetString(1), reader.GetString(2), DateTime.SpecifyKind(reader.GetDateTime(3), DateTimeKind.Utc)));
				var ics = BuildIcs(entries);
				return File(Encoding.UTF8.GetBytes(ics), "text/calendar; charset=utf-8", "bughosted-calendar.ics");
			}
			catch (Exception ex)
			{
				_ = _log.Db("Calendar feed error: " + ex.Message, null, "CALENDAR");
				return StatusCode(500);
			}
		}

		[HttpPost("feed-token", Name = "CreateCalendarFeedToken")]
		public async Task<IActionResult> CreateFeedToken([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest();
			var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "-").Replace("/", "_").Replace("=", "");
			try
			{
				await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
 				await using var cmd = new MySqlCommand("INSERT INTO maxhanna.calendar_feed_tokens (user_id, token_hash, created_utc, revoked_utc) VALUES (@UserId,@Hash,UTC_TIMESTAMP(),NULL) ON DUPLICATE KEY UPDATE token_hash=@Hash, created_utc=UTC_TIMESTAMP(), revoked_utc=NULL", conn);
				cmd.Parameters.AddWithValue("@UserId", userId);
				cmd.Parameters.AddWithValue("@Hash", Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant());
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { url = $"{Request.Scheme}://{Request.Host}/calendar/feed/{token}.ics", token });
			}
			catch (Exception ex) { _ = _log.Db("Calendar feed token error: " + ex.Message, userId, "CALENDAR"); return StatusCode(500); }
		}

		[HttpDelete("feed-token/{userId}", Name = "RevokeCalendarFeedToken")]
		public async Task<IActionResult> RevokeFeedToken(int userId)
		{
			try
			{
				await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")); await conn.OpenAsync();
				await using var cmd = new MySqlCommand("UPDATE maxhanna.calendar_feed_tokens SET revoked_utc=UTC_TIMESTAMP() WHERE user_id=@UserId", conn); cmd.Parameters.AddWithValue("@UserId", userId); await cmd.ExecuteNonQueryAsync(); return Ok();
			}
			catch { return StatusCode(500); }
		}

		private static string BuildIcs(List<(int Id, string Type, string Note, DateTime Date)> entries)
		{
			static string Escape(string value) => (value ?? "").Replace("\\", "\\\\").Replace("\n", "\\n").Replace(";", "\\;").Replace(",", "\\,");
			static string DateValue(DateTime d) => $"{d:yyyyMMdd'T'HHmmss'Z'}";
			var lines = new List<string> { "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BugHosted//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:BugHosted Calendar" };
			foreach (var e in entries) { lines.Add("BEGIN:VEVENT"); lines.Add($"UID:cal-{e.Id}@bughosted"); lines.Add($"DTSTAMP:{DateValue(DateTime.UtcNow)}"); lines.Add($"DTSTART:{DateValue(e.Date)}"); lines.Add($"DTEND:{DateValue(e.Date.AddHours(1))}"); lines.Add($"SUMMARY:{Escape($"{e.Type}: {e.Note}".Trim())}"); lines.Add($"DESCRIPTION:{Escape(e.Note)}"); lines.Add("END:VEVENT"); }
			lines.Add("END:VCALENDAR"); return string.Join("\r\n", lines) + "\r\n";
		}

		[HttpPost(Name = "GetCalendar")]
		public async Task<IActionResult> Get([FromBody] int userId, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
		{
			if (startDate > endDate)
			{
				_ = _log.Db("An error occurred while fetching calendar entries. StartDate > EndDate", userId, "CALENDAR");
				return StatusCode(500, "An error occurred while fetching calendar entries. StartDate > EndDate");
			}
			var entries = new List<CalendarEntry>();

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					string sql = @"
							SELECT Id, Type, Note, Date, Ownership, Reminder FROM maxhanna.calendar
							WHERE Ownership = @Owner
								AND (
									(Date BETWEEN @StartDate AND @EndDateWithTime) -- explicit entries in the range
									OR (Type = 'Weekly' AND DATE_FORMAT(Date, '%w') = DATE_FORMAT(@StartDate, '%w')) -- same weekday
									OR (Type = 'BiWeekly') -- every 2 weeks
									OR (Type = 'Monthly') -- every month
									OR (Type = 'BiMonthly' AND MOD(TIMESTAMPDIFF(MONTH, Date, @StartDate), 2) = 0) -- every 2 months
									OR (Type IN ('Annually','Birthday','Milestone','Newyears','Christmas','Anniversary') AND MONTH(Date) = MONTH(@StartDate)) -- annually same month
									OR (Type = 'Daily') -- daily
								)
						UNION
						SELECT user_id AS Id,
									'Birthday' AS Type,
									description AS Note,
									birthday AS Date,
									@Owner AS Ownership,
									NULL AS Reminder
						FROM user_about
						WHERE user_id = @Owner
							AND MONTH(birthday) = MONTH(@StartDate)
							AND DAY(birthday) = DAY(@StartDate);
					";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						cmd.Parameters.AddWithValue("@StartDate", startDate);
						cmd.Parameters.AddWithValue("@EndDateWithTime", endDate.AddDays(1).AddSeconds(-1)); // Adds 23:59:59

						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							while (await rdr.ReadAsync())
							{
								// The DATETIME column stores UTC wall-clock (clients always send UTC
							// instants). Mark it Kind=Utc so JSON serializes with a trailing 'Z'
							// and the client can parse the true instant instead of assuming
							// local time — the fix for cross-timezone drift.
							var storedDate = DateTime.SpecifyKind(rdr.GetDateTime(3), DateTimeKind.Utc);
							entries.Add(new CalendarEntry(rdr.GetInt32(0), rdr.GetString(1), rdr.GetString(2), storedDate, rdr.GetString(4), rdr.IsDBNull(5) ? (int?)null : rdr.GetInt32(5)));
							}
						}
					}

				}

				// Return the SQL-selected entries directly (query includes recurring templates and birthday union)
				return Ok(entries);
			}
			catch (MySqlException ex)
			{
				_ = _log.Db("Database error while fetching calendar entries: " + ex.Message, userId, "CALENDAR");
				return StatusCode(503, "Database error while fetching calendar entries.");
			}
			catch (ArgumentException ex)
			{
				_ = _log.Db("Invalid argument while fetching calendar entries: " + ex.Message, userId, "CALENDAR");
				return BadRequest("Invalid request parameters.");
			}
			catch (OperationCanceledException)
			{
				_ = _log.Db("Calendar fetch operation cancelled.", userId, "CALENDAR");
				return StatusCode(499, "Client closed request.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An unexpected error occurred while fetching calendar entries. " + ex.Message, userId, "CALENDAR");
				return StatusCode(500, "An unexpected error occurred while fetching calendar entries.");
			}
		}

		[HttpPost("/Calendar/Create", Name = "CreateCalendarEntry")]
		public async Task<IActionResult> Post([FromBody] CreateCalendarEntry req)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// Assuming CalendarEntryModel has properties for Type, Note, and Date
				string sql = "INSERT INTO maxhanna.calendar (Type, Note, Date, Ownership, Reminder) VALUES (@Type, @Note, @Date, @Owner, @Reminder)";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Type", req.calendarEntry.Type);
				cmd.Parameters.AddWithValue("@Note", req.calendarEntry.Note);
				cmd.Parameters.AddWithValue("@Date", req.calendarEntry.Date);
				cmd.Parameters.AddWithValue("@Owner", req.userId);
				cmd.Parameters.AddWithValue("@Reminder", req.calendarEntry.Reminder ?? (object)DBNull.Value);
				await cmd.ExecuteNonQueryAsync();

				if (req.sharedUserIds != null)
				{
					foreach (var sharedUserId in req.sharedUserIds.Where(id => id > 0 && id != req.userId).Distinct())
					{
						using var sharedCmd = new MySqlCommand(sql, conn);
						sharedCmd.Parameters.AddWithValue("@Type", req.calendarEntry.Type);
						sharedCmd.Parameters.AddWithValue("@Note", req.calendarEntry.Note);
						sharedCmd.Parameters.AddWithValue("@Date", req.calendarEntry.Date);
						sharedCmd.Parameters.AddWithValue("@Owner", sharedUserId);
						sharedCmd.Parameters.AddWithValue("@Reminder", req.calendarEntry.Reminder ?? (object)DBNull.Value);
						await sharedCmd.ExecuteNonQueryAsync();
					}
				}
				return Ok();

			}
			catch (MySqlException ex)
			{
				_ = _log.Db("Database error while creating calendar entry: " + ex.Message, null, "CALENDAR");
				return StatusCode(503, "Database error while creating calendar entry.");
			}
			catch (ArgumentNullException ex)
			{
				_ = _log.Db("Missing required field in calendar entry: " + ex.Message, null, "CALENDAR");
				return BadRequest("Missing required field in request.");
			}
			catch (ArgumentException ex)
			{
				_ = _log.Db("Invalid data for calendar entry: " + ex.Message, null, "CALENDAR");
				return BadRequest("Invalid data in request.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An unexpected error occurred while processing the POST request." + ex.Message, null, "CALENDAR");
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/Calendar/NotificationsSent", Name = "GetCalendarNotificationsSent")]
		public async Task<IActionResult> GetNotificationsSent([FromBody] int userId)
		{
			var rows = new List<CalendarNotificationSent>();
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					const string sql = @"
						SELECT calendar_text, calendar_date, notification_sent
						FROM maxhanna.calendar_notifications_sent
						WHERE user_id = @Owner
						ORDER BY notification_sent DESC
						LIMIT 20;";
					await using var cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@Owner", userId);
					await using var rdr = await cmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						rows.Add(new CalendarNotificationSent(
							rdr.IsDBNull(0) ? "" : rdr.GetString(0),
							rdr.IsDBNull(1) ? (DateTime?)null : DateTime.SpecifyKind(rdr.GetDateTime(1), DateTimeKind.Utc),
							rdr.IsDBNull(2) ? (DateTime?)null : DateTime.SpecifyKind(rdr.GetDateTime(2), DateTimeKind.Utc)));
					}
				}
				return Ok(rows);
			}
			catch (MySqlException ex)
			{
				_ = _log.Db("Database error while fetching sent calendar notifications: " + ex.Message, userId, "CALENDAR");
				return StatusCode(503, "Database error while fetching sent calendar notifications.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An unexpected error occurred while fetching sent calendar notifications. " + ex.Message, userId, "CALENDAR");
				return StatusCode(500, "An unexpected error occurred while fetching sent calendar notifications.");
			}
		}

		[HttpDelete("{id}", Name = "DeleteCalendarEntry")]
		public async Task<IActionResult> Delete([FromBody] int userId, int id)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql = "DELETE FROM maxhanna.calendar WHERE ID = @Id AND Ownership = @Owner";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Id", id);
				cmd.Parameters.AddWithValue("@Owner", userId);
				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				if (rowsAffected > 0)
				{
					return Ok();
				}
				else
				{
					return NotFound();
				}
			}
			catch (MySqlException ex)
			{
				_ = _log.Db("Database error while deleting calendar entry: " + ex.Message, userId, "CALENDAR");
				return StatusCode(503, "Database error while deleting calendar entry.");
			}
			catch (ArgumentException ex)
			{
				_ = _log.Db("Invalid argument while deleting calendar entry: " + ex.Message, userId, "CALENDAR");
				return BadRequest("Invalid request parameters.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An unexpected error occurred while processing the DELETE request. " + ex.Message, userId, "CALENDAR");
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/Calendar/Edit", Name = "EditCalendarEntry")]
		public async Task<IActionResult> Edit([FromBody] EditCalendarEntry req)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = @"
						UPDATE maxhanna.calendar
						SET Type = @Type,
							Note = @Note,
							Date = @Date,
							Reminder = @Reminder
						WHERE Id = @Id AND Ownership = @Owner
						LIMIT 1;";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Type", req.calendarEntry.Type);
				cmd.Parameters.AddWithValue("@Note", req.calendarEntry.Note);
				cmd.Parameters.AddWithValue("@Date", req.calendarEntry.Date);
				cmd.Parameters.AddWithValue("@Reminder", req.calendarEntry.Reminder ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@Id", req.calendarEntry.Id);
				cmd.Parameters.AddWithValue("@Owner", req.userId);
				int rows = await cmd.ExecuteNonQueryAsync();
				if (rows > 0) return Ok();
				return NotFound();
			}
			catch (MySqlException ex)
			{
				_ = _log.Db("Database error while editing calendar entry: " + ex.Message, req.userId, "CALENDAR");
				return StatusCode(503, "Database error while editing calendar entry.");
			}
			catch (ArgumentException ex)
			{
				_ = _log.Db("Invalid argument while editing calendar entry: " + ex.Message, req.userId, "CALENDAR");
				return BadRequest("Invalid request parameters.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An unexpected error occurred while processing the Edit request." + ex.Message, req.userId, "CALENDAR");
				return StatusCode(500, "An error occurred while processing the edit request.");
			}
			finally
			{
				conn.Close();
			}
		} 
	}
}
