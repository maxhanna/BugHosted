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
            _logger.LogInformation($"POST /User with username: {user.Username}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = $@"
                   SELECT 
                        u.*, 
                        dp.file_id AS latest_file_id,
                        dpf.file_name,
                        dpf.folder_path,
                        ua.description,
                        ua.phone,
                        ua.email,
                        ua.birthday
                    FROM 
                        maxhanna.users u
                    LEFT JOIN  
                        maxhanna.user_display_pictures dp ON dp.user_id = u.id 
                    LEFT JOIN  
                        maxhanna.user_about ua ON ua.user_id = u.id 
                    LEFT JOIN  
                        maxhanna.file_uploads dpf ON dpf.id = dp.file_id 
                    WHERE
                        LOWER(u.username) = LOWER(@Username) 
                        AND u.pass = @Password;
                ";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Username", user.Username);
                cmd.Parameters.AddWithValue("@Password", user.Pass);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    if (reader.Read())
                    {
                        FileEntry displayPic = new FileEntry()
                        {
                            Id = reader.IsDBNull(reader.GetOrdinal("latest_file_id")) ? 0 : reader.GetInt32("latest_file_id"),
                            FileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? "" : reader.GetString("file_name"),
                            Directory = reader.IsDBNull(reader.GetOrdinal("folder_path")) ? "" : reader.GetString("folder_path"),
                        };
                        UserAbout tmpAbout = new UserAbout()
                        {
                            UserId = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32("id"),
                            Description = reader.IsDBNull(reader.GetOrdinal("description")) ? "" : reader.GetString("description"),
                            Phone = reader.IsDBNull(reader.GetOrdinal("phone")) ? "" : reader.GetString("phone"),
                            Email = reader.IsDBNull(reader.GetOrdinal("email")) ? "" : reader.GetString("email"),
                            Birthday = reader.IsDBNull(reader.GetOrdinal("birthday")) ? null : reader.GetDateOnly("birthday"),
                        };

                        // User found, return the user details
                        return Ok(new User
                        (
                            Convert.ToInt32(reader["id"]),
                            reader["username"].ToString()!,
                            reader["pass"].ToString(),
                            displayPic.Id != 0 ? displayPic : null,
                            tmpAbout
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

        [HttpPost("/User/{id}", Name = "GetUserById")]
        public async Task<IActionResult> GetUserById([FromBody] User? user, int id)
        {
            _logger.LogInformation($"POST /User/{id} with user: {user?.Id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        u.*, 
                        dp.file_id AS latest_file_id,
                        dpf.file_name,
                        dpf.folder_path,
                        ua.description,
                        ua.phone,
                        ua.email,
                        ua.birthday
                    FROM 
                        maxhanna.users u
                    LEFT JOIN 
                        maxhanna.user_display_pictures dp ON dp.user_id = u.id
                    LEFT JOIN 
                        maxhanna.user_about ua ON ua.user_id = u.id
                    LEFT JOIN 
                        maxhanna.file_uploads dpf ON dpf.id = dp.file_id
                    WHERE
                        u.id = @user_id;
                ";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@user_id", id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    if (reader.Read())
                    {
                        FileEntry displayPic = new FileEntry()
                        {
                            Id = reader.IsDBNull(reader.GetOrdinal("latest_file_id")) ? 0 : reader.GetInt32("latest_file_id"),
                            FileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? "" : reader.GetString("file_name"),
                            Directory = reader.IsDBNull(reader.GetOrdinal("folder_path")) ? "" : reader.GetString("folder_path"),
                        };

                        UserAbout tmpAbout = new UserAbout()
                        {
                            UserId = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32("id"),
                            Description = reader.IsDBNull(reader.GetOrdinal("description")) ? "" : reader.GetString("description"),
                            Phone = reader.IsDBNull(reader.GetOrdinal("phone")) ? "" : reader.GetString("phone"),
                            Email = reader.IsDBNull(reader.GetOrdinal("email")) ? "" : reader.GetString("email"),
                            Birthday = reader.IsDBNull(reader.GetOrdinal("birthday")) ? null : reader.GetDateOnly("birthday"),
                        };

                        // User found, return the user details
                        return Ok(new User
                        (
                            Convert.ToInt32(reader["id"]),
                            reader["username"].ToString()!,
                            null, // Password is not returned in this method, you might need to adjust this based on your requirements
                            displayPic.Id == 0 ? null : displayPic,
                            tmpAbout
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
                if (!string.IsNullOrEmpty(request.Search))
                {
                    cmd.Parameters.AddWithValue("@search", "%" + request.Search + "%");
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

            if (string.IsNullOrEmpty(user.Username))
            {
                return BadRequest("Username cannot be empty!");
            }

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                // Check if the user with the provided ID exists and get the current username
                string selectSql = "SELECT username FROM maxhanna.users WHERE id = @Id";
                MySqlCommand selectCmd = new MySqlCommand(selectSql, conn);
                selectCmd.Parameters.AddWithValue("@Id", user.Id);

                string oldUsername;
                using (var reader = await selectCmd.ExecuteReaderAsync())
                {
                    if (!reader.Read())
                    {
                        // User with the provided ID not found
                        return NotFound();
                    }
                    oldUsername = reader.GetString("username");
                }

                if (!oldUsername.Equals(user.Username, StringComparison.OrdinalIgnoreCase))
                {
                    // Update the home folder path if the old username is different from the new username
                    string oldPath = Path.Combine("E:/Uploads/Users/", oldUsername);
                    string newPath = Path.Combine("E:/Uploads/Users/", user.Username);

                    if (Directory.Exists(oldPath))
                    {
                        Directory.Move(oldPath, newPath);
                    }

                    // Update the file paths in the file_uploads table
                    string updateFileUploadsSql = @"
                        UPDATE maxhanna.file_uploads 
                        SET folder_path = REPLACE(folder_path, @OldPath, @NewPath) 
                        WHERE user_id = @UserId;
                    ";
                    MySqlCommand updateFileUploadsCmd = new MySqlCommand(updateFileUploadsSql, conn);
                    updateFileUploadsCmd.Parameters.AddWithValue("@OldPath", oldUsername);
                    updateFileUploadsCmd.Parameters.AddWithValue("@NewPath", user.Username);
                    updateFileUploadsCmd.Parameters.AddWithValue("@UserId", user.Id);
                    await updateFileUploadsCmd.ExecuteNonQueryAsync();
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
                    return Ok(new { message = "User updated successfully" });
                }
                else
                {
                    // No rows affected, possibly due to no changes in data
                    return Ok(new { message = "User not updated" });
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

                await DeleteUserFiles(user, conn); 
                 
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

        private async Task DeleteUserFiles(User user, MySqlConnection conn)
        {
            string selectFilesSql = "SELECT file_name, folder_path FROM maxhanna.file_uploads WHERE user_id = @UserId";
            MySqlCommand selectFilesCmd = new MySqlCommand(selectFilesSql, conn);
            selectFilesCmd.Parameters.AddWithValue("@UserId", user.Id);
            List<string> filePaths = new List<string>();
            using (var reader = await selectFilesCmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    string fileName = reader["file_name"].ToString();
                    string folderPath = reader["folder_path"].ToString();
                    string fullPath = Path.Combine("E:/Uploads/", folderPath, fileName);
                    filePaths.Add(fullPath);
                }
            }
            foreach (var filePath in filePaths)
            { 
                if (System.IO.File.Exists(filePath))
                {
                    System.IO.File.Delete(filePath);
                }
            }
            var tmpPath = Path.Combine("E:/Uploads/Users/", user.Username!);
            if (tmpPath.Contains("E:/Uploads/Users/") && tmpPath.TrimEnd('/') != "E:/Uploads/Users" && Directory.Exists(tmpPath))
            {
                Directory.Delete(tmpPath, true);
            }
        }

        [HttpPost("/User/UpdateDisplayPicture", Name = "UpdateDisplayPicture")]
        public async Task<IActionResult> UpdateDisplayPicture([FromBody] DisplayPictureRequest request)
        {
            _logger.LogInformation($"POST /User/UpdateDisplayPicture (for user: {request.User.Id})");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string checkUserSql = $@"
                    INSERT INTO maxhanna.user_display_pictures (user_id, file_id)
                    VALUES (@userId, @fileId)
                    ON DUPLICATE KEY UPDATE file_id = VALUES(file_id);
                ";
                MySqlCommand checkUserCmd = new MySqlCommand(checkUserSql, conn);
                checkUserCmd.Parameters.AddWithValue("@userId", request.User.Id);
                checkUserCmd.Parameters.AddWithValue("@fileId", request.FileId);
                using (var reader = await checkUserCmd.ExecuteReaderAsync())
                {
                    return Ok();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the display picture POST request.");
                return StatusCode(500, "An error occurred while processing the display picture request.");
            }
            finally
            {
                conn.Close();
            }
        }

        [HttpPost("/User/UpdateAbout", Name = "UpdateAbout")]
        public async Task<IActionResult> UpdateAbout([FromBody] UpdateAboutRequest request)
        {
            _logger.LogInformation($"POST /User/UpdateAbout (for user: {request.User.Id})");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string checkUserSql = $@"
                    INSERT INTO maxhanna.user_about (user_id, description, birthday, phone, email)
                    VALUES (@userId, @description, @birthday, @phone, @email)
                    ON DUPLICATE KEY UPDATE 
                        description = VALUES(description),
                        birthday = VALUES(birthday),
                        phone = VALUES(phone),
                        email = VALUES(email);
                ";
                MySqlCommand checkUserCmd = new MySqlCommand(checkUserSql, conn);
                checkUserCmd.Parameters.AddWithValue("@userId", request.User.Id);
                checkUserCmd.Parameters.AddWithValue("@description", request.About.Description);
                checkUserCmd.Parameters.AddWithValue("@birthday", request.About.Birthday);
                checkUserCmd.Parameters.AddWithValue("@phone", request.About.Phone);
                checkUserCmd.Parameters.AddWithValue("@email", request.About.Email);
                using (var reader = await checkUserCmd.ExecuteReaderAsync())
                {
                    return Ok("Sucessfully updated about information.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the user about POST request.");
                return StatusCode(500, "An error occurred while processing the user about request.");
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
            _logger.LogInformation($"DELETE /User/Menu for user with ID: {request.User?.Id} and title: {request.Title}");
            if (request.User == null)
            {
                return BadRequest("User missing from DeleteMenuItem request");
            }
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
            _logger.LogInformation($"POST /User/Menu/Add for user with ID: {request.User?.Id} and title: {request.Title}");
            if (request.User == null)
            {
                return BadRequest("User missing from AddMenuItem request");
            }
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
