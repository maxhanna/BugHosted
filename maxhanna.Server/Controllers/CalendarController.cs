using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class CalendarController : ControllerBase
    {
        private readonly ILogger<CalendarController> _logger;
        private readonly IConfiguration _config;

        public CalendarController(ILogger<CalendarController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }


        [HttpPost(Name = "GetCalendar")]
        public async Task<IActionResult> Get([FromBody] User user, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
        {
            _logger.LogInformation($"GET /Calendar (startDate : {startDate}, endDate : {endDate}, user: {user.Id})");
            if (startDate > endDate)
            {
                _logger.LogError("An error occurred while fetching calendar entries. StartDate > EndDate");
                return StatusCode(500, "An error occurred while fetching calendar entries. StartDate > EndDate");
            }
            var entries = new List<CalendarEntry>();

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    string sql = 
                        "SELECT Id, Type, Note, Date, Ownership FROM maxhanna.calendar " +
                        "WHERE Ownership = @Owner AND " +
                            "(" +
                                "(Date BETWEEN (@StartDate - interval 1 day) AND @EndDate) " +
                                "OR " +
                                "(Type = 'weekly' OR Type = 'monthly') " +
                                "OR " +
                                "((Type = 'annually' OR Type = 'birthday' OR Type = 'milestone') AND MONTH(Date) = MONTH(@StartDate))" +
                            ") ";
                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Owner", user.Id);
                        cmd.Parameters.AddWithValue("@StartDate", startDate);
                        cmd.Parameters.AddWithValue("@EndDate", endDate);

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
                _logger.LogError(ex, "An error occurred while fetching calendar entries.");
                return StatusCode(500, "An error occurred while fetching calendar entries."); // Return 500 Internal Server Error with error message
            }
        }

        [HttpPost("/Calendar/Create", Name = "CreateCalendarEntry")]
        public async Task<IActionResult> Post([FromBody] CreateCalendarEntry req)
        {
            _logger.LogInformation("POST /Calendar");
            _logger.LogInformation($"Type : {req.calendarEntry.Type} Note: {req.calendarEntry.Note} Date: {req.calendarEntry.Date}, User: {req.user.Id}");
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
                cmd.Parameters.AddWithValue("@Owner", req.user.Id);
                _logger.LogInformation("note : " + req.calendarEntry.Note);
                if (await cmd.ExecuteNonQueryAsync() > 0)
                {
                    _logger.LogInformation("Returned OK");
                    return Ok();
                }
                else
                {
                    _logger.LogInformation("Returned 500");
                    return StatusCode(500, "Failed to insert data");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

        [HttpDelete("{id}", Name = "DeleteCalendarEntry")]
        public async Task<IActionResult> Delete([FromBody] User user, int id)
        {
            _logger.LogInformation($"Inside DELETE() of CalendarController for User: {user.Id} , CalendarEntryID: {id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "DELETE FROM maxhanna.calendar WHERE ID = @Id AND Ownership = @Owner";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.Parameters.AddWithValue("@Owner", user.Id);
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
                _logger.LogError(ex, "An error occurred while processing the DELETE request.");
                return StatusCode(500, "An error occurred while processing the request."); // 500 Internal Server Error if an exception occurred
            }
            finally
            {
                conn.Close();
            }
        }
    }
}
