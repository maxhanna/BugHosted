using System;
using System.Linq;
using maxhanna.Server.Controllers.DataContracts.Calendar;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

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

					// Fetch all calendar rows for the owner that are either within the requested range
					// or are recurring types which we'll evaluate in C# for occurrences inside the range.
					// SQL-based selection: pick explicit entries in range or recurring templates matching the requested startDate
					string sql = @"
							SELECT Id, Type, Note, Date, Ownership FROM maxhanna.calendar
							WHERE Ownership = @Owner
								AND (
									(Date BETWEEN @StartDate AND @EndDateWithTime) -- explicit entries in the range
									OR (Type = 'Weekly' AND DATE_FORMAT(Date, '%w') = DATE_FORMAT(@StartDate, '%w')) -- same weekday
									OR (Type = 'BiWeekly' AND DATE_FORMAT(Date, '%w') = DATE_FORMAT(@StartDate, '%w') AND MOD(TIMESTAMPDIFF(WEEK, Date, @StartDate), 2) = 0) -- every 2 weeks on same weekday
									OR (Type = 'Monthly' AND DAY(Date) = DAY(@StartDate)) -- same day of month
									OR (
											Type = 'BiMonthly' AND MOD(TIMESTAMPDIFF(MONTH, Date, @StartDate), 2) = 0
											AND (
												DAY(Date) = DAY(@StartDate)
												OR (DAY(Date) > DAY(LAST_DAY(@StartDate)) AND DAY(@StartDate) = DAY(LAST_DAY(@StartDate)))
											)
									) -- every 2 months on same day or last-day fallback
									OR (Type IN ('Annually','Birthday','Milestone','Newyears','Christmas','Anniversary') AND MONTH(Date) = MONTH(@StartDate) AND DAY(Date) = DAY(@StartDate)) -- annually same month/day
									OR (Type = 'Daily') -- daily
								)
							UNION
							SELECT user_id AS Id,
											'Birthday' AS Type,
											description AS Note,
											birthday AS Date,
											@Owner AS Ownership
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
								entries.Add(new CalendarEntry(rdr.GetInt32(0), rdr.GetString(1), rdr.GetString(2), rdr.GetDateTime(3), rdr.GetString(4)));
							}
						}
					}

				}

				// Return the SQL-selected entries directly (query includes recurring templates and birthday union)
				return Ok(entries);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching calendar entries. " + ex.Message, userId, "CALENDAR");
				return StatusCode(500, "An error occurred while fetching calendar entries.");
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
				string sql = "INSERT INTO maxhanna.calendar (Type, Note, Date, Ownership) VALUES (@Type, @Note, @Date, @Owner)";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Type", req.calendarEntry.Type);
				cmd.Parameters.AddWithValue("@Note", req.calendarEntry.Note);
				cmd.Parameters.AddWithValue("@Date", req.calendarEntry.Date);
				cmd.Parameters.AddWithValue("@Owner", req.userId);
				await cmd.ExecuteNonQueryAsync();
				return Ok();

			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request." + ex.Message, null);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
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
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the DELETE request. " + ex.Message, userId, "CALENDAR");
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
						Date = @Date
					WHERE Id = @Id AND Ownership = @Owner
					LIMIT 1;";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Type", req.calendarEntry.Type);
				cmd.Parameters.AddWithValue("@Note", req.calendarEntry.Note);
				cmd.Parameters.AddWithValue("@Date", req.calendarEntry.Date);
				cmd.Parameters.AddWithValue("@Id", req.calendarEntry.Id);
				cmd.Parameters.AddWithValue("@Owner", req.userId);
				int rows = await cmd.ExecuteNonQueryAsync();
				if (rows > 0) return Ok();
				return NotFound();
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the Edit request." + ex.Message, req.userId, "CALENDAR");
				return StatusCode(500, "An error occurred while processing the edit request.");
			}
			finally
			{
				conn.Close();
			}
		}
	}
}
