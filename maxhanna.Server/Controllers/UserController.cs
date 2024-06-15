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
            _logger.LogInformation($"POST /User with username: {user.Username} and password: {user.Pass}");
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
                        (
                            Convert.ToInt32(reader["id"]),
                            reader["username"].ToString()!,
                            reader["pass"].ToString()
                        ));
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

        [HttpPost("/User/{id}",Name = "GetUserById")]
        public async Task<IActionResult> GetUserById([FromBody] User? user, int id)
        {
            _logger.LogInformation($"POST /User/{id} with user: {user?.Id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "SELECT * FROM maxhanna.users WHERE id = @user_id;";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@user_id", id); 

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    if (reader.Read())
                    {
                        // User found, return the user details
                        return Ok(new User
                        (
                            Convert.ToInt32(reader["id"]),
                            reader["username"].ToString()!
                        ));
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
                _logger.LogError(ex, "An error occurred while processing the request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

        [HttpPost("/User/GetAllUsers", Name = "GetAllUsers")]
        public async Task<IActionResult> GetAllUsers([FromBody] UserSearchRequest request)
        {
            _logger.LogInformation($"GET /User/GetAllUsers (for user: {request.User?.Id})");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "SELECT id, username FROM maxhanna.users ";
                if (!string.IsNullOrEmpty(request.Search))
                {
                    sql += "WHERE username like @search; ";
                }

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                if (!string.IsNullOrEmpty(request.Search)) { 
                    cmd.Parameters.AddWithValue("@search", "%"+request.Search+ "%");
                }

                List<User> users = new List<User>();

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (reader.Read())
                    {
                        users.Add(new User
                        (
                            Convert.ToInt32(reader["id"]),
                            (string)reader["username"]
                        ));
                    }
                }

                if (users.Count > 0)
                {
                    return Ok(users);
                }
                else
                {
                    return NotFound();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the GET request for all users.");
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

                string checkUserSql = @"SELECT COUNT(*) FROM maxhanna.users WHERE LOWER(username) = LOWER(@Username)";
                MySqlCommand checkUserCmd = new MySqlCommand(checkUserSql, conn);
                checkUserCmd.Parameters.AddWithValue("@Username", user.Username);

                int userCount = Convert.ToInt32(await checkUserCmd.ExecuteScalarAsync());

                if (userCount == 0)
                {
                    // User doesn't exist, proceed with insertion
                    string insertSql = @"INSERT INTO maxhanna.users (username, pass) VALUES (@Username, @Password);";
                    MySqlCommand insertCmd = new MySqlCommand(insertSql, conn);
                    insertCmd.Parameters.AddWithValue("@Username", user.Username);
                    insertCmd.Parameters.AddWithValue("@Password", user.Pass);

                    int rowsAffected = await insertCmd.ExecuteNonQueryAsync();
                    if (rowsAffected > 0)
                    {
                        // Retrieve the inserted user's ID
                        string selectIdSql = @"SELECT id FROM maxhanna.users WHERE username = @Username AND pass = @Password";
                        MySqlCommand selectIdCmd = new MySqlCommand(selectIdSql, conn);
                        selectIdCmd.Parameters.AddWithValue("@Username", user.Username);
                        selectIdCmd.Parameters.AddWithValue("@Password", user.Pass);

                        int userId = Convert.ToInt32(await selectIdCmd.ExecuteScalarAsync());

                        _logger.LogInformation($"User created successfully with ID: {userId}");
                        return Ok(userId);
                    }
                    else
                    {
                        string result = "Error: Failed to create user";
                        return StatusCode(500, new { message = result });
                    }
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
            if (user.Id == 0 || user.Id == 1)
            {
                return BadRequest("Who do you think you are?");
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

        [HttpPost("/User/Menu", Name = "GetUserMenu")]
        public async Task<IActionResult> GetUserMenu([FromBody] User user)
        {
            _logger.LogInformation($"GET /UserMenu for user with ID: {user.Id}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "SELECT * FROM maxhanna.menu WHERE ownership = @UserId";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", user.Id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    List<MenuItem> menuItems = new List<MenuItem>();

                    while (reader.Read())
                    {
                        menuItems.Add(new MenuItem
                        {
                            Ownership = Convert.ToInt32(reader["ownership"]),
                            Title = reader["title"].ToString()!
                        });
                    }

                    if (menuItems.Count > 0)
                    {
                        return Ok(menuItems);
                    }
                    else
                    {
                        return NotFound();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the GET request for user menu.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }
        [HttpDelete("/User/Menu", Name = "DeleteMenuItem")]
        public async Task<IActionResult> DeleteMenuItem([FromBody] MenuItemRequest request)
        {
            _logger.LogInformation($"DELETE /User/Menu for user with ID: {request.User.Id} and title: {request.Title}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "DELETE FROM maxhanna.menu WHERE ownership = @UserId AND title = @Title";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", request.User.Id);
                cmd.Parameters.AddWithValue("@Title", request.Title);

                int rowsAffected = await cmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    return Ok("Menu item deleted successfully.");
                }
                else
                {
                    return NotFound("Menu item not found for the specified user and title.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the DELETE request for menu item.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }
        [HttpPost("/User/Menu/Add", Name = "AddMenuItem")]
        public async Task<IActionResult> AddMenuItem([FromBody] MenuItemRequest request)
        {
            _logger.LogInformation($"POST /User/Menu/Add for user with ID: {request.User.Id} and title: {request.Title}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "INSERT INTO maxhanna.menu (ownership, title) VALUES (@UserId, @Title)";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", request.User.Id);
                cmd.Parameters.AddWithValue("@Title", request.Title);

                int rowsAffected = await cmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    return Ok("Menu item added successfully.");
                }
                else
                {
                    return StatusCode(500, "Failed to add menu item.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request to add menu item.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

    }
}
