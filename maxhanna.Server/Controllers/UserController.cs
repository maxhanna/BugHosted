using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using maxhanna.Server.Controllers.DataContracts;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class UserController : ControllerBase
    {
        private readonly ILogger<UserController> _logger;
        private readonly IConfiguration _config;

        public UserController(ILogger<UserController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpGet(Name = "GetUserCount")]
        public async Task<IActionResult> GetUserCount()
        {
            _logger.LogInformation($"GET /User");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "SELECT COUNT(*) as count FROM maxhanna.users";

                MySqlCommand cmd = new MySqlCommand(sql, conn);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    if (reader.Read())
                    { 
                        return Ok(reader["count"].ToString());
                    }
                    else
                    {
                        // User not found
                        return NotFound();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the GET request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

        [HttpPost(Name = "GetUser")]
        public async Task<IActionResult> GetUser([FromBody] User user)
        {
            _logger.LogInformation($"GET /User with username: {user.Username} and password: {user.Pass}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "SELECT * FROM maxhanna.users WHERE LOWER(username) = LOWER(@Username) AND pass = @Password";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Username", user.Username);
                cmd.Parameters.AddWithValue("@Password", user.Pass);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    if (reader.Read())
                    {
                        // User found, return the user details
                        return Ok(new User
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            Username = reader["username"].ToString(),
                            Pass = reader["pass"].ToString()
                        });
                    }
                    else
                    {
                        // User not found
                        return NotFound();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the GET request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

        [HttpPost("/User/CreateUser", Name = "CreateUser")]
        public async Task<IActionResult> CreateUser([FromBody] User user)
        {
            _logger.LogInformation("POST /User");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = @"SELECT COUNT(*) FROM maxhanna.users WHERE LOWER(username) = LOWER(@Username)";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Username", user.Username);

                int userCount = Convert.ToInt32(await cmd.ExecuteScalarAsync());

                if (userCount == 0)
                {
                    // User doesn't exist, proceed with insertion
                    string insertSql = @"
                        INSERT INTO maxhanna.users (username, pass) VALUES (@Username, @Password);
                        SELECT 'Successfully added user' AS Result;";
                    MySqlCommand insertCmd = new MySqlCommand(insertSql, conn);
                    insertCmd.Parameters.AddWithValue("@Username", user.Username);
                    insertCmd.Parameters.AddWithValue("@Password", user.Pass);

                    string result = await insertCmd.ExecuteScalarAsync() as string;
                    _logger.LogInformation(result);

                    return Ok(new { message = result });
                }
                else
                {
                    // User already exists, return conflict
                    string result = "Error: User already exists";
                    return Conflict(new { message = result });
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

        [HttpPatch(Name = "UpdateUser")]
        public async Task<IActionResult> UpdateUser([FromBody] User user)
        {
            _logger.LogInformation($"PATCH /User with ID: {user.Id}");

            if (string.IsNullOrEmpty(user.Username)) {
                return BadRequest("Username cannot be empty!");
            }

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                // Check if the user with the provided ID exists
                string selectSql = "SELECT * FROM maxhanna.users WHERE id = @Id";
                MySqlCommand selectCmd = new MySqlCommand(selectSql, conn);
                selectCmd.Parameters.AddWithValue("@Id", user.Id);

                using (var reader = await selectCmd.ExecuteReaderAsync())
                {
                    if (!reader.Read())
                    {
                        // User with the provided ID not found
                        return NotFound();
                    }
                }
                // Update the user record
                string updateSql = "UPDATE maxhanna.users SET username = @Username, pass = @Password WHERE id = @Id";
                MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
                updateCmd.Parameters.AddWithValue("@Username", user.Username);
                updateCmd.Parameters.AddWithValue("@Password", user.Pass);
                updateCmd.Parameters.AddWithValue("@Id", user.Id);

                int rowsAffected = await updateCmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    // User record updated successfully
                    return Ok(new { message = "User updated successfully" }); // Return JSON object
                }
                else
                {
                    // No rows affected, possibly due to no changes in data
                    return Ok(new { message = "User not updated" }); // Return JSON object
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the PATCH request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }
        [HttpDelete("/User/DeleteUser", Name = "DeleteUser")]
        public async Task<IActionResult> DeleteUser([FromBody] User user)
        {
            _logger.LogInformation($"DELETE /User with ID: {user.Id}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                // Check if the user with the provided ID exists
                string selectSql = "SELECT * FROM maxhanna.users WHERE id = @Id";
                MySqlCommand selectCmd = new MySqlCommand(selectSql, conn);
                selectCmd.Parameters.AddWithValue("@Id", user.Id);

                using (var reader = await selectCmd.ExecuteReaderAsync())
                {
                    if (!reader.Read())
                    {
                        // User with the provided ID not found
                        return NotFound();
                    }
                }

                // Delete the user record
                string deleteSql = "DELETE FROM maxhanna.users WHERE id = @Id";
                MySqlCommand deleteCmd = new MySqlCommand(deleteSql, conn);
                deleteCmd.Parameters.AddWithValue("@Id", user.Id);

                int rowsAffected = await deleteCmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    // User record deleted successfully
                    return Ok(new { message = "User deleted successfully" }); // Return JSON object
                }
                else
                {
                    // No rows affected, possibly due to the user not existing
                    return Ok(new { message = "User not found or already deleted" }); // Return JSON object
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
