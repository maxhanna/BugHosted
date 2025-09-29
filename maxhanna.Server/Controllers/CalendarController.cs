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

					string sql =
						@"SELECT Id, Type, Note, Date, Ownership FROM maxhanna.calendar 
                            WHERE Ownership = @Owner 
                              AND (
                                  (Date BETWEEN @StartDate AND @EndDateWithTime) -- Specific date range
                                  OR 
                                  (Type = 'Weekly' AND DATE_FORMAT(Date, '%w') = DATE_FORMAT(@StartDate, '%w')) -- Weekly on the same day of the week
                                  OR 
                                  (Type = 'Monthly') -- Monthly on the same day of the month
                                  OR 
                                  (Type IN ('Annually', 'Birthday', 'Milestone', 'Newyears', 'Christmas', 'Anniversary') AND MONTH(Date) = MONTH(@StartDate)) -- Annually on the same day and month
                                  OR 
                                  (Type IN ('Daily')) -- Daily regardless of month, year.
                              )
                          UNION 
                          SELECT 
                              user_id AS Id, 
                              'birthday' AS Type, 
                              description AS Note, 
                              birthday AS Date, 
                              @Owner AS Ownership 
                          FROM user_about 
                          WHERE 
                              user_id = @Owner 
                              AND 
                              MONTH(birthday) = MONTH(@StartDate) 
                              AND 
                              DAY(birthday) = DAY(@StartDate);";

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

				return Ok(entries); // Return list of entries if successful
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
