using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.ObjectModel;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class TodoController : ControllerBase
    {
        private readonly ILogger<TodoController> _logger;
        private readonly IConfiguration _config;

        public TodoController(ILogger<TodoController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpGet(Name = "GetTodo")]
        public async Task<IActionResult> Get([FromQuery] string type)
        {
            string sql = "SELECT id, todo, type, url, date, done FROM maxhanna.todo";

            if (!string.IsNullOrEmpty(type))
            {
                sql += " WHERE type = @Todo";
            }

            _logger.LogInformation($"GET /Todo{(type != null ? "/" + type : "")}");

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        if (!string.IsNullOrEmpty(type))
                        {
                            cmd.Parameters.AddWithValue("@Todo", type);
                        }

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var entries = new List<Todo>();

                            while (await rdr.ReadAsync())
                            {
                                entries.Add(new Todo(
                                    id: rdr.GetInt32(0),
                                    todo: rdr.GetString(1),
                                    type: rdr.GetString(2),
                                    url: rdr.IsDBNull(3) ? null : rdr.GetString(3),
                                    date: rdr.GetDateTime(4),
                                    done: rdr.GetBoolean(5)
                                ));
                            }

                            return Ok(entries);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching todos.");
                return StatusCode(500, "An error occurred while fetching todos.");
            }
        }

        [HttpPost(Name = "CreateTodo")]
        public async Task<IActionResult> Post([FromBody] Todo model)
        {
            _logger.LogInformation("POST /Todo"); 
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                // Assuming CalendarEntryModel has properties for Type, Note, and Date
                string sql = "INSERT INTO maxhanna.todo (todo, type, url, date, done) VALUES (@Todo, @Type, @Url, @Date, 0)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Todo", model.todo);
                cmd.Parameters.AddWithValue("@Type", model.type);
                cmd.Parameters.AddWithValue("@Url", model.url);
                cmd.Parameters.AddWithValue("@Date", model.date); 
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
        }

        [HttpDelete("/Todo/{id}", Name = "DeleteTodo")]
        public async Task<IActionResult> Delete(int id)
        {
            _logger.LogInformation($"DELETE /Todo/{id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                string sql = "DELETE FROM maxhanna.todo WHERE ID = @Id";
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
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }
    }
}
