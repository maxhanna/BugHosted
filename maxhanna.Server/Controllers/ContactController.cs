using maxhanna.Server.Controllers.DataContracts.Contacts;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;

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
            _logger.LogInformation($"POST /Contact (User : {user.Id}) ");

            string sql = @"
                SELECT 
                    c.id, 
                    c.name, 
                    c.phone, 
                    c.birthday, 
                    c.notes,
                    c.email, 
                    c.user_id,
                    c.contact_user_id as contact_user_id, 
                    u.username as contact_user_name,
                    ua.description as about_description,
                    ua.phone as about_phone,
                    ua.email as about_email,
                    ua.birthday as about_birthday,
                    udp.file_id as profile_file_id,
                    udpf.folder_path as profile_file_directory
                FROM 
                    maxhanna.contacts as c
                LEFT JOIN 
                    maxhanna.users as u ON c.contact_user_id = u.id
                LEFT JOIN 
                    maxhanna.user_about AS ua ON ua.user_id = u.id
                LEFT JOIN 
                    maxhanna.user_display_pictures AS udp ON udp.user_id = u.id
                LEFT JOIN 
                    maxhanna.file_uploads AS udpf ON udpf.id = udp.file_id
                WHERE c.user_id = @userId";

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        // Add user ID as a parameter to the command
                        cmd.Parameters.AddWithValue("@userId", user.Id);

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var contacts = new List<Contact>();

                            while (await rdr.ReadAsync())
                            {
                                var contact = new Contact
                                {
                                    Id = rdr.GetInt32("id"),
                                    Name = rdr.GetString("name"),
                                    Phone = rdr.IsDBNull("phone") ? "" : rdr.GetString("phone"),
                                    Birthday = rdr.IsDBNull("birthday") ? null : rdr.GetDateTime("birthday"),
                                    Notes = rdr.IsDBNull("notes") ? "" : rdr.GetString("notes"),
                                    Email = rdr.IsDBNull("email") ? "" : rdr.GetString("email"),
                                    User = new User(
                                        rdr.IsDBNull("contact_user_id") ? 0 : rdr.GetInt32("contact_user_id"),
                                        rdr.IsDBNull("contact_user_name") ? "Anonymous" : rdr.GetString("contact_user_name"),
                                        null,
                                        new FileEntry()
                                        {
                                            Id = rdr.IsDBNull("profile_file_id") ? 0 : rdr.GetInt32("profile_file_id"),
                                            Directory = rdr.IsDBNull("profile_file_directory") ? "" : rdr.GetString("profile_file_directory")
                                        },
                                        new UserAbout()
                                        {
                                            Description = rdr.IsDBNull("about_description") ? "" : rdr.GetString("about_description"),
                                            Email = rdr.IsDBNull("about_email") ? "" : rdr.GetString("about_email"),
                                            Phone = rdr.IsDBNull("about_phone") ? "" : rdr.GetString("about_phone"),
                                            Birthday = rdr.IsDBNull("about_birthday") ? null : rdr.GetDateTime("about_birthday")
                                        }
                                    )
                                };

                                contacts.Add(contact);
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
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));

            try
            {
                await conn.OpenAsync();
                string sql = "INSERT INTO contacts (name, phone, birthday, notes, email, user_id) VALUES (@Name, @Phone, @Birthday, @Notes, @Email, @Owner)";
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
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));

            try
            {
                await conn.OpenAsync();
                string sql = "UPDATE contacts SET name = @Name, phone = @Phone, birthday = @Birthday, notes = @Notes, email = @Email WHERE id = @Id AND user_id = @Owner;";
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


        [HttpPost("/Contact/AddUser", Name = "AddUserAsContact")]
        public async Task<IActionResult> AddUserAsContact([FromBody] CreateUserContact req)
        {
            _logger.LogInformation($"POST /Contact/AddUser (User: {req.user.Id})");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            var username = "";
            try
            {
                await conn.OpenAsync();

                // Fetch user details from the user table
                string fetchUserSql = "SELECT id, username FROM users WHERE id = @userId";
                MySqlCommand fetchUserCmd = new MySqlCommand(fetchUserSql, conn);
                fetchUserCmd.Parameters.AddWithValue("@userId", req.contact.Id);
                using (var reader = await fetchUserCmd.ExecuteReaderAsync())
                {
                    if (!await reader.ReadAsync())
                    {
                        return NotFound("User not found.");
                    }

                    var user = new User
                    {
                        Id = reader.GetInt32("id"),
                        Username = reader.GetString("username")
                    };
                    username = user.Username;
                    reader.Close();

                    // Insert user details into the contacts table
                    string insertContactSql = @"
                        INSERT INTO contacts (name, user_id, contact_user_id)
                        VALUES (@Name, @OwnerId, @ContactId)";
                    MySqlCommand insertContactCmd = new MySqlCommand(insertContactSql, conn);
                    insertContactCmd.Parameters.AddWithValue("@Name", user.Username);
                    insertContactCmd.Parameters.AddWithValue("@OwnerId", req.user.Id);
                    insertContactCmd.Parameters.AddWithValue("@ContactId", user.Id);
                    await insertContactCmd.ExecuteNonQueryAsync();
                }

                _logger.LogInformation("Returned OK");
                return Ok($"Added {username} into contacts");
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


        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete([FromBody] User user, int id)
        {
            _logger.LogInformation($"DELETE /Contact/{id} (User: {user.Id})");

            try
            {
                using (var connection = new MySqlConnection(_config.GetConnectionString("maxhanna")))
                {
                    await connection.OpenAsync();

                    string query = "DELETE FROM contacts WHERE id = @Id AND user_id = @Owner";
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
