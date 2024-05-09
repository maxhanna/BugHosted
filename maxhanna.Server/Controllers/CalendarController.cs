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


        [HttpGet(Name = "GetCalendar")]
        public async Task<IActionResult> Get([FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
        {
            _logger.LogInformation($"GET /Calendar (startDate : {startDate}) (endDate : {endDate})");
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
                        "SELECT Id, Type, Note, Date FROM maxhanna.calendar " +
                        "WHERE " +
                            "(" +
                                "(Date BETWEEN (@StartDate - interval 1 day) AND @EndDate) " +
                                "OR " +
                                "(Type = 'weekly' OR Type = 'monthly') " +
                                "OR " +
                                "((Type = 'annually' OR Type = 'birthday' OR Type = 'milestone') AND MONTH(Date) = MONTH(@StartDate))" +
                            ") ";
                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@StartDate", startDate);
                        cmd.Parameters.AddWithValue("@EndDate", endDate);

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            while (await rdr.ReadAsync())
                            {
                                entries.Add(new CalendarEntry(rdr.GetInt32(0), rdr.GetString(1), rdr.GetString(2), rdr.GetDateTime(3)));
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

        [HttpPost(Name = "CreateCalendarEntry")]
        public async Task<IActionResult> Post([FromBody] CalendarEntry model)
        {
            _logger.LogInformation("POST /Calendar");
            _logger.LogInformation($"Type : {model.Type} Note: {model.Note} Date: {model.Date}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                // Assuming CalendarEntryModel has properties for Type, Note, and Date
                string sql = "INSERT INTO maxhanna.calendar (Type, Note, Date) VALUES (@Type, @Note, @Date)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Type", model.Type);
                cmd.Parameters.AddWithValue("@Note", model.Note);
                cmd.Parameters.AddWithValue("@Date", model.Date);
                _logger.LogInformation("note : " + model.Note);
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
        public async Task<IActionResult> Delete(int id)
        {
            _logger.LogInformation($"Inside DELETE() of CalendarController for ID: {id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "DELETE FROM maxhanna.calendar WHERE ID = @Id";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Id", id);
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
