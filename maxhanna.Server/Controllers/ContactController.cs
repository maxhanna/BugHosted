using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ContactController : ControllerBase
    {
        private readonly ILogger<ContactController> _logger;
        private readonly IConfiguration _config;

        public ContactController(ILogger<ContactController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost(Name = "GetContacts")]
        public async Task<IActionResult> GetContacts([FromBody] User user)
        {
            _logger.LogInformation($"GET /Contact (User : {user.Id}) ");

            string sql = "SELECT id, name, phone, birthday, notes, email, ownership FROM contacts";

            try
            {
                using (var conn = new MySqlConnection(_config.GetConnectionString("maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var contacts = new List<Contact>();

                            while (await rdr.ReadAsync())
                            {
                                contacts.Add(new Contact
                                {
                                    Id = rdr.GetInt32(0),
                                    Name = rdr.GetString(1),
                                    Phone = rdr.IsDBNull(2) ? null : rdr.GetString(2),
                                    Birthday = rdr.IsDBNull(3) ? null : rdr.GetDateTime(3),
                                    Notes = rdr.IsDBNull(4) ? null : rdr.GetString(4),
                                    Email = rdr.IsDBNull(5) ? null : rdr.GetString(5),
                                    Ownership = rdr.IsDBNull(6) ? null : rdr.GetString(6)
                                });
                            }

                            return Ok(contacts);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching contacts.");
                return StatusCode(500, "An error occurred while fetching contacts.");
            }
        }

        [HttpPost("/Contact/Create", Name = "CreateContact")]
        public async Task<IActionResult> CreateContact([FromBody] CreateContact req)
        {
            _logger.LogInformation($"POST /Contact/Create (User: {req.user.Id})");
            MySqlConnection conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));

            try
            {
                await conn.OpenAsync();
                string sql = "INSERT INTO contacts (name, phone, birthday, notes, email, ownership) VALUES (@Name, @Phone, @Birthday, @Notes, @Email, @Owner)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Name", req.contact.Name);
                cmd.Parameters.AddWithValue("@Phone", req.contact.Phone ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Birthday", req.contact.Birthday ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Notes", req.contact.Notes ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Email", req.contact.Email ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Owner", req.user.Id);
                await cmd.ExecuteNonQueryAsync();

                _logger.LogInformation("Returned OK");
                return Ok();
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

        [HttpPut("/Contact/{id}", Name = "UpdateContact")]
        public async Task<IActionResult> UpdateContact(int id, [FromBody] CreateContact req)
        {
            _logger.LogInformation($"PUT /Contact/{id} (User: {req.user.Id})");
            MySqlConnection conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));

            try
            {
                await conn.OpenAsync();
                string sql = "UPDATE contacts SET name = @Name, phone = @Phone, birthday = @Birthday, notes = @Notes, email = @Email WHERE id = @Id AND ownership = @Owner;";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Name", req.contact.Name);
                cmd.Parameters.AddWithValue("@Phone", req.contact.Phone ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Birthday", req.contact.Birthday ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Notes", req.contact.Notes ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Email", req.contact.Email ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.Parameters.AddWithValue("@Owner", req.user.Id);
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
                _logger.LogError(ex, "An error occurred while processing the PUT request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete([FromBody] User user, int id)
        {
            _logger.LogInformation($"DELETE /Contact/{id} (User: {user.Id})");

            try
            {
                using (var connection = new MySqlConnection(_config.GetConnectionString("maxhanna")))
                {
                    await connection.OpenAsync();

                    string query = "DELETE FROM contacts WHERE id = @Id AND ownership = @Owner";
                    using (var command = new MySqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@Id", id);
                        command.Parameters.AddWithValue("@Owner", user.Id);

                        int rowsAffected = await command.ExecuteNonQueryAsync();
                        if (rowsAffected > 0)
                        {
                            return Ok();
                        }
                        else
                        {
                            return NotFound();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"An error occurred while deleting the contact: {ex.Message}");
            }
        }
    }
}
