using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

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

        [HttpPost("/Todo", Name = "GetTodo")]
        public async Task<IActionResult> Get([FromBody] User user, [FromQuery] string type, [FromQuery] string? search)
        {
            _logger.LogInformation($"POST /Todo/ (type: {type}, search: {search})");

            string sql = string.IsNullOrEmpty(search)
                ? "SELECT id, todo, type, url, date, ownership FROM maxhanna.todo WHERE type = @Todo AND ownership = @Owner"
                : "SELECT id, todo, type, url, date, ownership FROM maxhanna.todo WHERE type = @Todo AND todo LIKE CONCAT('%', @Search, '%') AND ownership = @Owner";

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Todo", type);
                        cmd.Parameters.AddWithValue("@Owner", user.Id);
                        if (!string.IsNullOrEmpty(search))
                        {
                            cmd.Parameters.AddWithValue("@Search", search);
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
                                    ownership: rdr.IsDBNull(5) ? null : rdr.GetString(5)
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
         
        [HttpPost("/Todo/Create", Name = "CreateTodo")]
        public async Task<IActionResult> Post([FromBody] CreateTodo model)
        {
            _logger.LogInformation("POST /Todo/Create"); 
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                string sql = "INSERT INTO maxhanna.todo (todo, type, url, ownership) VALUES (@Todo, @Type, @Url, @Owner)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Todo", model.todo.todo);
                cmd.Parameters.AddWithValue("@Type", model.todo.type);
                cmd.Parameters.AddWithValue("@Url", model.todo.url);
                cmd.Parameters.AddWithValue("@Owner", model.user.Id);
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
        public async Task<IActionResult> Delete([FromBody] User user, int id)
        {
            _logger.LogInformation($"DELETE /Todo/{id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                string sql = "DELETE FROM maxhanna.todo WHERE ID = @Id AND ownership = @Owner";
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
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }
    }
}
