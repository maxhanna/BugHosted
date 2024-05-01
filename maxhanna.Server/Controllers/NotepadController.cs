using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.ObjectModel;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class NotepadController : ControllerBase
    {
        private readonly ILogger<NotepadController> _logger;
        private readonly IConfiguration _config;

        public NotepadController(ILogger<NotepadController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpGet("/Notepad", Name = "GetNotes")]
        public async Task<IActionResult> Get()
        {
            _logger.LogInformation($"GET /Notepad");

            string sql = "SELECT id, LEFT(note, 25) AS note, date FROM maxhanna.notepad";
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var entries = new List<NotepadEntry>();

                            while (await rdr.ReadAsync())
                            {
                                entries.Add(new NotepadEntry(
                                    id: rdr.GetInt32(0),
                                    note: rdr.GetString(1),
                                    date: rdr.GetDateTime(2)
                                ));
                            }
                            return Ok(entries);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching Notepad.");
                return StatusCode(500, "An error occurred while fetching Notepad.");
            }
        }
        [HttpGet("/Notepad/{id}", Name = "GetNoteById")]
        public async Task<IActionResult> Get(int id)
        {
            _logger.LogInformation($"GET /Notepad/" + id);

            string sql = "SELECT id, note, date FROM maxhanna.notepad WHERE id = @ID";
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@ID", id);
                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            while (await rdr.ReadAsync())
                            {
                                return Ok(new NotepadEntry(
                                    id: rdr.GetInt32(0),
                                    note: rdr.GetString(1),
                                    date: rdr.GetDateTime(2)
                                ));
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching Notepad.");
                return StatusCode(500, "An error occurred while fetching Notepad.");
            }
            return StatusCode(404, "Note/Server problem?.");
        }

        [HttpPost(Name = "CreateNote")]
        public async Task<IActionResult> Post([FromBody] string note)
        {
            _logger.LogInformation("POST /Notepad");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                // Assuming CalendarEntryModel has properties for Type, Note, and Date
                string sql = "INSERT INTO maxhanna.notepad (note) VALUES (@Note)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Note", note);
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
        [HttpPost("/Notepad/Update/{id}", Name = "UpdateNote")]
        public async Task<IActionResult> Post(string id, [FromBody] string note)
        {
            _logger.LogInformation("POST /Notepad");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                // Assuming CalendarEntryModel has properties for Type, Note, and Date
                string sql = "UPDATE maxhanna.notepad SET note = @Note WHERE id = @ID";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Note", note);
                cmd.Parameters.AddWithValue("@ID", id);
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

        [HttpDelete("/Notepad/{id}", Name = "DeleteNote")]
        public async Task<IActionResult> Delete(int id)
        {
            _logger.LogInformation($"DELETE /Notepad/{id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                string sql = "DELETE FROM maxhanna.notepad WHERE ID = @Id";
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
