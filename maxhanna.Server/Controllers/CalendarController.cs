using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.ObjectModel;

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
        public async Task<IEnumerable<CalendarEntry>> Get([FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
        {
            _logger.LogInformation("Inside GET() of CalendarController");
            var entries = new List<CalendarEntry>();

            using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:Calendar")))
            {
                try
                {
                    await conn.OpenAsync();

                    string sql = "SELECT Id, Type, Note, Date FROM task.calendar WHERE Date BETWEEN @StartDate AND @EndDate";
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
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while fetching calendar entries.");
                }
            }

            return entries;
        }

        [HttpPost(Name = "CreateCalendarEntry")]
        public async Task<IActionResult> Post([FromBody] CalendarEntry model)
        {
            _logger.LogInformation("Inside POST() of CalendarController");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:Calendar"));

            try
            {
                conn.Open();

                // Assuming CalendarEntryModel has properties for Type, Note, and Date
                string sql = "INSERT INTO task.calendar (Type, Note, Date) VALUES (@Type, @Note, @Date)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Type", model.Type);
                cmd.Parameters.AddWithValue("@Note", model.Note);
                cmd.Parameters.AddWithValue("@Date", model.Date);
                _logger.LogInformation("note : " + model.Note);
                int rowsAffected = await cmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    return Ok(); // 200 OK response if insertion is successful
                }
                else
                {
                    return StatusCode(500, "Failed to insert data"); // 500 Internal Server Error if insertion failed
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request.");
                return StatusCode(500, "An error occurred while processing the request."); // 500 Internal Server Error if an exception occurred
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
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:Calendar"));

            try
            {
                conn.Open();

                string sql = "DELETE FROM task.calendar WHERE ID = @Id";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Id", id);
                int rowsAffected = await cmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    return Ok(); // 200 OK response if deletion is successful
                }
                else
                {
                    return NotFound(); // 404 Not Found if entry with given ID doesn't exist
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
