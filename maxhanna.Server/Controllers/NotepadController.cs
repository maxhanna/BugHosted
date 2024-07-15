using maxhanna.Server.Controllers.DataContracts.Notepad;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

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

        [HttpPost("/Notepad", Name = "GetNotes")]
        public async Task<IActionResult> Get([FromBody] User user)
        {
            _logger.LogInformation($"GET /Notepad (for user: {user.Id})");

            string sql = "SELECT " +
                            "id, LEFT(note, 25) AS note, date, ownership " +
                        "FROM " +
                            "maxhanna.notepad " +
                        "WHERE " +
                            "ownership = @Owner " +
                            "OR " +
                            "ownership LIKE CONCAT('%,', @Owner, ',%') " +
                            "OR " +
                            "ownership LIKE CONCAT(@Owner, ',%') " +
                            "OR " +
                            "ownership LIKE CONCAT('%,', @Owner)";
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Owner", user.Id);

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var entries = new List<NotepadEntry>();

                            while (await rdr.ReadAsync())
                            {
                                entries.Add(new NotepadEntry(
                                    id: rdr.GetInt32(0),
                                    note: rdr.GetString(1),
                                    date: rdr.GetDateTime(2),
                                    ownership: rdr.IsDBNull(3) ? null : rdr.GetString(3)
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

        [HttpPost("/Notepad/Share/{noteId}", Name = "ShareNote")]
        public async Task<IActionResult> Get([FromBody] ShareNotepadRequest request, int noteId)
        {
            if (request.User1 == null || request.User2 == null)
            {
                return BadRequest("Both users must be present in the request");
            }
            _logger.LogInformation($"POST /Notepad/Share/{noteId} (for user: {request.User1.Id} to user: {request.User2.Id})");

            string sql = "UPDATE maxhanna.notepad SET Ownership = CONCAT(Ownership, ',', @user2id) WHERE id = @noteId";
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@user2id", request.User2.Id);
                        cmd.Parameters.AddWithValue("@noteId", noteId);

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
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching Notepad.");
                return StatusCode(500, "An error occurred while fetching Notepad.");
            }
        }
        [HttpPost("/Notepad/{id}", Name = "GetNoteById")]
        public async Task<IActionResult> Get([FromBody] User user, int id)
        {
            _logger.LogInformation($"GET /Notepad/" + id);

            string sql = "SELECT " +
                            "id, note, date, ownership " +
                        "FROM " +
                            "maxhanna.notepad " +
                        "WHERE " +
                            "id = @ID " +
                            "AND " +
                            "(" +
                                "ownership = @Owner " +
                                "OR " +
                                "ownership LIKE CONCAT('%,', @Owner, ',%') " +
                                "OR " +
                                "ownership LIKE CONCAT(@Owner, ',%') " +
                                "OR " +
                                "ownership LIKE CONCAT('%,', @Owner)" +
                            ")";
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@ID", id);
                        cmd.Parameters.AddWithValue("@Owner", user.Id);

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            while (await rdr.ReadAsync())
                            {
                                return Ok(new NotepadEntry(
                                    id: rdr.GetInt32(0),
                                    note: rdr.GetString(1),
                                    date: rdr.GetDateTime(2),
                                    ownership: rdr.IsDBNull(3) ? null : rdr.GetString(3)
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

        [HttpPost("/Notepad/Create", Name = "CreateNote")]
        public async Task<IActionResult> Post([FromBody] CreateNote note)
        {
            _logger.LogInformation("POST /Notepad");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                // Assuming CalendarEntryModel has properties for Type, Note, and Date
                string sql = "INSERT INTO maxhanna.notepad (note, ownership) VALUES (@Note, @Owner)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Note", note.note);
                cmd.Parameters.AddWithValue("@Owner", note.user.Id);
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
        public async Task<IActionResult> Post(string id, [FromBody] CreateNote note)
        {
            _logger.LogInformation("POST /Notepad");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql =
                    "UPDATE " +
                        "maxhanna.notepad " +
                    "SET " +
                        "note = @Note " +
                    "WHERE " +
                        "id = @ID " +
                        "AND " +
                        "(" +
                            "ownership LIKE @Owner " +
                            "OR " +
                            "ownership LIKE CONCAT('%,', @Owner, ',%') " +
                            "OR " +
                            "ownership LIKE CONCAT(@Owner, ',%') " +
                            "OR " +
                            "ownership LIKE CONCAT('%,', @Owner)" +
                        ")";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Note", note.note);
                cmd.Parameters.AddWithValue("@ID", id);
                cmd.Parameters.AddWithValue("@Owner", note.user.Id);
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
        public async Task<IActionResult> Delete([FromBody] User user, int id)
        {
            _logger.LogInformation($"DELETE /Notepad/{id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();
                string sql =
                    "DELETE FROM " +
                        "maxhanna.notepad " +
                    "WHERE " +
                        "ID = @Id " +
                    "AND " +
                    "(" +
                        "ownership = @Owner " +
                        "OR " +
                        "ownership LIKE CONCAT('%,', @Owner, ',%') " +
                        "OR " +
                        "ownership LIKE CONCAT(@Owner, ',%') " +
                        "OR " +
                        "ownership LIKE CONCAT('%,', @Owner)" +
                    ")";
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
    public class ShareNotepadRequest
    {
        public User? User1 { get; set; }
        public User? User2 { get; set; }
    }
}
