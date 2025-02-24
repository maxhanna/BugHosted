using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Files;
using Newtonsoft.Json;
using maxhanna.Server.Controllers.DataContracts.Crypto;
using System.Xml.Linq;
using System.Security.Cryptography;
using System.Text;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class UserController : ControllerBase
	{
		private readonly ILogger<UserController> _logger;
		private readonly IConfiguration _config;
		private readonly IHttpClientFactory _httpClientFactory;
		private readonly string _baseTarget;

		public UserController(IHttpClientFactory httpClientFactory, ILogger<UserController> logger, IConfiguration config)
		{
			_httpClientFactory = httpClientFactory;
			_logger = logger;
			_config = config;
			_baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? "";
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
			_logger.LogInformation($"POST /GetUser with username: {user.Username}");

			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					// Step 1: Retrieve stored hash and salt for the given username
					string selectSql = @"
                SELECT id, pass, salt FROM maxhanna.users 
                WHERE LOWER(username) = LOWER(@Username);";

					using (MySqlCommand selectCmd = new MySqlCommand(selectSql, conn))
					{
						selectCmd.Parameters.AddWithValue("@Username", (user.Username ?? "").Trim());

						using (var reader = await selectCmd.ExecuteReaderAsync())
						{
							if (!reader.Read())
							{
								return NotFound("User not found");
							}

							int userId = reader.GetInt32("id");
							string storedHash = reader.GetString("pass");
							string storedSalt = reader.IsDBNull(2) ? GenerateSalt() : reader.GetString("salt"); // Handle missing salt

							// Step 2: Hash the input password with the stored salt
							string inputHashedPassword = HashPassword(user.Pass ?? "", storedSalt);

							// Step 3: Compare the hashed input password with the stored hash
							if (!storedHash.Equals(inputHashedPassword, StringComparison.Ordinal))
							{
								return Unauthorized("Invalid username or password.");
							}

							// Close the reader before executing the next query
							reader.Close();

							// Step 4: Update last_seen and fetch user details
							string sql = @"
                        UPDATE maxhanna.users 
                        SET last_seen = NOW() 
                        WHERE id = @UserId;

                        SELECT 
                            u.*, 
                            dp.file_id AS latest_file_id,
                            dpf.file_name,
                            dpf.folder_path,
                            ua.description,
                            ua.phone,
                            ua.email,
                            ua.birthday,
                            ua.currency,
                            ua.is_email_public
                        FROM 
                            maxhanna.users u
                        LEFT JOIN  
                            maxhanna.user_display_pictures dp ON dp.user_id = u.id 
                        LEFT JOIN  
                            maxhanna.user_about ua ON ua.user_id = u.id 
                        LEFT JOIN  
                            maxhanna.file_uploads dpf ON dpf.id = dp.file_id 
                        WHERE
                            u.id = @UserId;
                    ";

							using (MySqlCommand cmd = new MySqlCommand(sql, conn))
							{
								cmd.Parameters.AddWithValue("@UserId", userId);

								using (var dataReader = await cmd.ExecuteReaderAsync())
								{
									if (dataReader.Read())
									{
										Console.WriteLine("Found user : " + user.Username);
										FileEntry displayPic = new FileEntry()
										{
											Id = dataReader.IsDBNull(dataReader.GetOrdinal("latest_file_id")) ? 0 : dataReader.GetInt32("latest_file_id"),
											FileName = dataReader.IsDBNull(dataReader.GetOrdinal("file_name")) ? "" : dataReader.GetString("file_name"),
											Directory = dataReader.IsDBNull(dataReader.GetOrdinal("folder_path")) ? "" : dataReader.GetString("folder_path"),
										};
										UserAbout tmpAbout = new UserAbout()
										{
											UserId = dataReader.IsDBNull(dataReader.GetOrdinal("id")) ? 0 : dataReader.GetInt32("id"),
											Description = dataReader.IsDBNull(dataReader.GetOrdinal("description")) ? "" : dataReader.GetString("description"),
											Phone = dataReader.IsDBNull(dataReader.GetOrdinal("phone")) ? "" : dataReader.GetString("phone"),
											Email = dataReader.IsDBNull(dataReader.GetOrdinal("email")) ? "" : dataReader.GetString("email"),
											Birthday = dataReader.IsDBNull(dataReader.GetOrdinal("birthday")) ? null : dataReader.GetDateTime("birthday"),
											Currency = dataReader.IsDBNull(dataReader.GetOrdinal("currency")) ? null : dataReader.GetString("currency"),
											IsEmailPublic = dataReader.IsDBNull(dataReader.GetOrdinal("is_email_public")) ? true : dataReader.GetBoolean("is_email_public"),
										};

										return Ok(new User
										(
												Convert.ToInt32(dataReader["id"]),
												dataReader["username"].ToString()!,
												null, // Password should never be returned
												displayPic.Id != 0 ? displayPic : null,
												tmpAbout,
												(DateTime)dataReader["created"],
												(DateTime)dataReader["last_seen"]
										));
									}
								}
							}
						}
					}

					return NotFound("User details not found.");
				}
				catch (Exception ex)
				{
					_logger.LogError(ex, "An error occurred while processing the GET request.");
					return StatusCode(500, "An error occurred while processing the request.");
				}
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
                        ua.birthday,
												ua.currency,
												ua.is_email_public
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
							Birthday = reader.IsDBNull(reader.GetOrdinal("birthday")) ? null : reader.GetDateTime("birthday"),
							Currency = reader.IsDBNull(reader.GetOrdinal("currency")) ? null : reader.GetString("currency"),
							IsEmailPublic = reader.IsDBNull(reader.GetOrdinal("is_email_public")) ? true : reader.GetBoolean("is_email_public"),
						};

						// User found, return the user details
						return Ok(new User
						(
								Convert.ToInt32(reader["id"]),
								reader["username"].ToString()!,
								null, // Password is not returned in this method 
								displayPic.Id == 0 ? null : displayPic,
								tmpAbout,
								(DateTime)reader["created"],
								(DateTime)reader["last_seen"]
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

				string sql = @"
					SELECT 
						u.id, 
						u.username,
						udp.file_id as display_file_id
					FROM maxhanna.users u 
					LEFT JOIN maxhanna.user_display_pictures udp on udp.user_id = u.id ";
				if (!string.IsNullOrEmpty(request.Search))
				{
					sql += " WHERE u.username like @search; ";
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
								(string)reader["username"],
								reader.IsDBNull(reader.GetOrdinal("display_file_id")) ? null : new FileEntry(Convert.ToInt32(reader["display_file_id"]))
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
					// Generate a random salt
					string salt = GenerateSalt();

					// Hash the password with the salt
					string hashedPassword = HashPassword(user.Pass, salt);

					string insertSql = @"INSERT INTO maxhanna.users (username, pass, salt) VALUES (@Username, @Password, @Salt);";
					MySqlCommand insertCmd = new MySqlCommand(insertSql, conn);
					insertCmd.Parameters.AddWithValue("@Username", user.Username);
					insertCmd.Parameters.AddWithValue("@Password", hashedPassword);
					insertCmd.Parameters.AddWithValue("@Salt", salt); // Store salt separately

					int rowsAffected = await insertCmd.ExecuteNonQueryAsync();
					if (rowsAffected > 0)
					{
						string selectIdSql = @"SELECT id FROM maxhanna.users WHERE username = @Username";
						MySqlCommand selectIdCmd = new MySqlCommand(selectIdSql, conn);
						selectIdCmd.Parameters.AddWithValue("@Username", user.Username);

						int userId = Convert.ToInt32(await selectIdCmd.ExecuteScalarAsync());

						if (user.Username != null && !user.Username.ToLower().Contains("guest"))
						{
							await AppendToSitemapAsync(userId);
						}

						_logger.LogInformation($"User created successfully with ID: {userId}");
						return Ok(userId);
					}
					else
					{
						return StatusCode(500, new { message = "Error: Failed to create user" });
					}
				}
				else
				{
					return Conflict(new { message = "Error: User already exists" });
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

		// Generate a random salt
		private string GenerateSalt()
		{
			byte[] saltBytes = new byte[16];
			using (var rng = RandomNumberGenerator.Create())
			{
				rng.GetBytes(saltBytes);
			}
			return Convert.ToBase64String(saltBytes);
		}

		// Hash password with SHA-256
		private string HashPassword(string password, string salt)
		{
			using (SHA256 sha256 = SHA256.Create())
			{
				byte[] inputBytes = Encoding.UTF8.GetBytes(password + salt);
				byte[] hashedBytes = sha256.ComputeHash(inputBytes);
				return Convert.ToBase64String(hashedBytes);
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

			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					// Check if the user exists and get the current username and salt
					string selectSql = "SELECT username, salt FROM maxhanna.users WHERE id = @Id";
					using (MySqlCommand selectCmd = new MySqlCommand(selectSql, conn))
					{
						selectCmd.Parameters.AddWithValue("@Id", user.Id);

						string oldUsername, existingSalt;
						using (var reader = await selectCmd.ExecuteReaderAsync())
						{
							if (!reader.Read())
							{
								return NotFound("User not found");
							}
							oldUsername = reader.GetString("username");
							existingSalt = reader.IsDBNull(1) ? GenerateSalt() : reader.GetString("salt"); // Handle missing salt
						}

						// Check if the new username already exists in the database
						string checkUsernameSql = "SELECT COUNT(*) FROM maxhanna.users WHERE username = @Username AND id != @Id";
						using (MySqlCommand checkUsernameCmd = new MySqlCommand(checkUsernameSql, conn))
						{
							checkUsernameCmd.Parameters.AddWithValue("@Username", user.Username);
							checkUsernameCmd.Parameters.AddWithValue("@Id", user.Id);

							int usernameCount = Convert.ToInt32(await checkUsernameCmd.ExecuteScalarAsync());
							if (usernameCount > 0)
							{
								return Conflict("Username already exists!");
							}
						}

						// Hash the new password with the existing salt
						string hashedPassword = HashPassword(user.Pass, existingSalt);

						// Handle renaming directories if username changes
						if (!oldUsername.Equals(user.Username, StringComparison.OrdinalIgnoreCase))
						{
							string oldPath = Path.Combine(_baseTarget + "Users/", oldUsername);
							string newPath = Path.Combine(_baseTarget + "Users/", user.Username);

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
							using (MySqlCommand updateFileUploadsCmd = new MySqlCommand(updateFileUploadsSql, conn))
							{
								updateFileUploadsCmd.Parameters.AddWithValue("@OldPath", oldUsername);
								updateFileUploadsCmd.Parameters.AddWithValue("@NewPath", user.Username);
								updateFileUploadsCmd.Parameters.AddWithValue("@UserId", user.Id);
								await updateFileUploadsCmd.ExecuteNonQueryAsync();
							}
						}

						// Update the user record with hashed password
						string updateSql = "UPDATE maxhanna.users SET username = @Username, pass = @Password, salt = @Salt WHERE id = @Id";
						using (MySqlCommand updateCmd = new MySqlCommand(updateSql, conn))
						{
							updateCmd.Parameters.AddWithValue("@Username", user.Username);
							updateCmd.Parameters.AddWithValue("@Password", hashedPassword);
							updateCmd.Parameters.AddWithValue("@Salt", existingSalt);
							updateCmd.Parameters.AddWithValue("@Id", user.Id);

							int rowsAffected = await updateCmd.ExecuteNonQueryAsync();

							if (rowsAffected > 0)
							{
								return Ok(new { message = "User updated successfully" });
							}
							else
							{
								return Ok(new { message = "No changes made to the user" });
							}
						}
					}
				}
				catch (Exception ex)
				{
					_logger.LogError(ex, "An error occurred while processing the PATCH request.");
					return StatusCode(500, "An error occurred while processing the request.");
				}
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
				await RemoveFromSitemapAsync(user.Id ?? 0);

				if (rowsAffected > 0)
				{
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

		[HttpPost("/User/GetIpAndLocation", Name = "GetIpAndLocation")]
		public async Task<IActionResult> GetIpAndLocation([FromBody] string ip)
		{
			_logger.LogInformation($"GET /User/GetIpAndLocation (for ip: {ip})");
			using (var client = _httpClientFactory.CreateClient())
			{
				try
				{
					HttpResponseMessage response = await client.GetAsync($"http://ip-api.com/json/{ip}");

					if (!response.IsSuccessStatusCode)
					{
						throw new Exception("Failed to fetch IP information");
					}

					var jsonResponse = await response.Content.ReadAsStringAsync();
					IpApiResponse data = JsonConvert.DeserializeObject<IpApiResponse>(jsonResponse);

					// Log full response data
					_logger.LogInformation($"IP API Response: {jsonResponse}");

					// Return IP and city
					var result = new
					{
						ip = data.Query,  // Use explicit properties from the class
						city = data.City,
						country = data.Country
					};

					return Ok(result);
				}
				catch (Exception ex)
				{
					_logger.LogError($"Error: {ex.Message}");
					return StatusCode(500, "Failed to get IP information");
				}
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
					string fileName = reader["file_name"].ToString() ?? "";
					string folderPath = reader["folder_path"].ToString() ?? "";
					string fullPath = Path.Combine(_baseTarget, folderPath, fileName);
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
			var tmpPath = Path.Combine(_baseTarget + "Users/", user.Username!);
			if (tmpPath.Contains(_baseTarget + "Users/") && tmpPath.TrimEnd('/') != (_baseTarget + "Users") && Directory.Exists(tmpPath))
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
                    INSERT INTO maxhanna.user_about (user_id, description, birthday, phone, email, currency, is_email_public)
                    VALUES (@userId, @description, @birthday, @phone, @email, @currency, @is_email_public)
                    ON DUPLICATE KEY UPDATE 
                        description = VALUES(description),
                        birthday = VALUES(birthday),
                        phone = VALUES(phone),
                        email = VALUES(email),
                        is_email_public = VALUES(is_email_public),
                        currency = VALUES(currency);
                ";
				MySqlCommand checkUserCmd = new MySqlCommand(checkUserSql, conn);
				checkUserCmd.Parameters.AddWithValue("@userId", request.User.Id);
				checkUserCmd.Parameters.AddWithValue("@description", request.About.Description);
				checkUserCmd.Parameters.AddWithValue("@birthday", request.About.Birthday);
				checkUserCmd.Parameters.AddWithValue("@phone", request.About.Phone);
				checkUserCmd.Parameters.AddWithValue("@email", request.About.Email);
				checkUserCmd.Parameters.AddWithValue("@is_email_public", request.About.IsEmailPublic);
				checkUserCmd.Parameters.AddWithValue("@currency", request.About.Currency);
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
					List<MenuItem> menuItems = [];

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
			_logger.LogInformation($"DELETE /User/Menu for user with ID: {request.User?.Id} and title: {request.Titles}");
			if (request.User == null)
			{
				return BadRequest("User missing from DeleteMenuItem request");
			}
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				int rowsAffected = 0;
				if (request.Titles != null && request.Titles.Length > 0)
				{
					foreach (string item in request.Titles)
					{
						string sql = "DELETE FROM maxhanna.menu WHERE ownership = @UserId AND title = @Title";

						MySqlCommand cmd = new MySqlCommand(sql, conn);
						cmd.Parameters.AddWithValue("@UserId", request.User.Id);
						cmd.Parameters.AddWithValue("@Title", item);

						rowsAffected += await cmd.ExecuteNonQueryAsync();
					}
				}


				if (rowsAffected > 0)
				{
					return Ok($"{rowsAffected} menu item(s) deleted successfully.");
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
			_logger.LogInformation($"POST /User/Menu/Add for user with ID: {request.User?.Id} and title: {request.Titles}");
			if (request.User == null)
			{
				return BadRequest("User missing from AddMenuItem request");
			}
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				int rowsAffected = 0;
				if (request.Titles != null && request.Titles.Length > 0)
				{
					foreach (string item in request.Titles)
					{
						string sql = "INSERT INTO maxhanna.menu (ownership, title) VALUES (@UserId, @Title)";

						MySqlCommand cmd = new MySqlCommand(sql, conn);
						cmd.Parameters.AddWithValue("@UserId", request.User.Id);
						cmd.Parameters.AddWithValue("@Title", item);
						rowsAffected += await cmd.ExecuteNonQueryAsync();
					}
				}

				if (rowsAffected > 0)
				{
					return Ok($"{rowsAffected} menu item(s) added successfully.");
				}
				else
				{
					return StatusCode(500, "Failed to add menu item(s).");
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

		[HttpPost("/User/BTCWalletAddresses/Update", Name = "UpdateBTCWalletAddresses")]
		public async Task<IActionResult> UpdateBTCWalletAddresses([FromBody] AddBTCWalletRequest request)
		{
			_logger.LogInformation($"POST /User/BTCWalletAddresses/Update for user with ID: {request.User?.Id} and wallets: {string.Join(", ", request.Wallets ?? Array.Empty<string>())}");

			if (request.User == null)
			{
				return BadRequest("User missing from AddBTCWalletAddress request");
			}

			if (request.Wallets == null || request.Wallets.Length == 0)
			{
				return BadRequest("Wallets missing from AddBTCWalletAddress request");
			}

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				int rowsAffected = 0;

				using (var transaction = await conn.BeginTransactionAsync())
				{
					using (var cmd = conn.CreateCommand())
					{
						cmd.Transaction = transaction;

						// Define the base SQL command with parameters for insertion
						cmd.CommandText = @"
                    INSERT INTO user_btc_wallet_info 
                    (user_id, btc_address, final_balance, total_received, total_sent, last_fetched) 
                    VALUES (@UserId, @BtcAddress, 0, 0, 0, NOW())
                    ON DUPLICATE KEY UPDATE 
                        btc_address = VALUES(btc_address),
                        last_fetched = VALUES(last_fetched);";

						// Add parameters
						cmd.Parameters.AddWithValue("@UserId", request.User.Id);
						cmd.Parameters.Add("@BtcAddress", MySqlDbType.VarChar);

						// Execute the insert for each wallet address
						foreach (string wallet in request.Wallets)
						{
							cmd.Parameters["@BtcAddress"].Value = wallet;
							rowsAffected += await cmd.ExecuteNonQueryAsync();
						}

						// Commit the transaction
						await transaction.CommitAsync();
					}
				}

				return Ok(new { Message = $"{rowsAffected} wallet(s) added or updated successfully." });
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error adding or updating BTC wallet addresses");
				return StatusCode(500, "An error occurred while adding wallet addresses");
			}
			finally
			{
				await conn.CloseAsync();
			}
		}

		[HttpPost("/User/BTCWallet/GetBTCWalletData", Name = "GetBTCWalletData")]
		public async Task<IActionResult> GetBTCWalletData([FromBody] User user)
		{
			_logger.LogInformation($"GET /User/BTCWallet/GetBTCWalletData for user with ID: {user.Id}");

			try
			{
				// Call the private method to get wallet info from the database
				CryptoWallet? miningWallet = await GetMiningWalletFromDb(user.Id);

				if (miningWallet != null && miningWallet.currencies != null && miningWallet.currencies.Count > 0)
				{
					return Ok(miningWallet); // Return the MiningWallet object as the response
				}
				else
				{
					return NotFound("No BTC wallet addresses found for the user."); // Return NotFound if no addresses found
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing GetBTCWalletAddresses.");
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}

		[HttpPost("/User/BTCWallet/DeleteBTCWalletAddress", Name = "DeleteBTCWalletAddress")]
		public async Task<IActionResult> DeleteBTCWalletAddress([FromBody] DeleteCryptoWalletAddress request)
		{
			_logger.LogInformation($"GET /User/BTCWallet/DeleteBTCWalletAddress for user with ID: {request.User?.Id}, address: {request.Address}");

			if (request.User == null || request.User.Id == 0)
			{
				return BadRequest("You must be logged in");
			}
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				int rowsAffected = 0;

				using (var transaction = await conn.BeginTransactionAsync())
				{
					using (var cmd = conn.CreateCommand())
					{
						cmd.Transaction = transaction;

						// Define the base SQL command with parameters for insertion
						cmd.CommandText = @"DELETE FROM maxhanna.user_btc_wallet_info WHERE user_id = @UserId AND btc_address = @Address LIMIT 1;";

						// Add parameters
						cmd.Parameters.AddWithValue("@UserId", request.User.Id);
						cmd.Parameters.AddWithValue("@Address", request.Address);

						rowsAffected += await cmd.ExecuteNonQueryAsync();


						// Commit the transaction
						await transaction.CommitAsync();
					}
				}

				return Ok(new { Message = $"{rowsAffected} wallet addresses(s) deleted successfully." });
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error adding or updating BTC wallet addresses");
				return StatusCode(500, "An error occurred while adding wallet addresses");
			}
			finally
			{
				await conn.CloseAsync();
			}
		}

		private async Task<CryptoWallet?> GetMiningWalletFromDb(int? userId)
		{
			if (userId == null) { return null; }
			var miningWallet = new CryptoWallet
			{
				total = new Total
				{
					currency = "BTC",
					totalBalance = "0",
					available = "0",
					debt = "0",
					pending = "0"
				},
				currencies = new List<Currency>()
			};

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = @"
                SELECT btc_address, final_balance, total_received, total_sent, last_fetched
                FROM user_btc_wallet_info
                WHERE user_id = @UserId";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);

						using (var reader = await cmd.ExecuteReaderAsync())
						{
							decimal totalBalance = 0;
							decimal totalAvailable = 0;

							while (await reader.ReadAsync())
							{
								// Retrieve the final balance as Int64 and convert to decimal
								long finalBalanceSatoshis = reader.GetInt64("final_balance");
								decimal finalBalance = finalBalanceSatoshis / 100_000_000M;

								var currency = new Currency
								{
									active = true,
									address = reader.GetString("btc_address"),
									currency = "BTC",
									totalBalance = finalBalance.ToString("F8"),
									available = finalBalance.ToString("F8"),
									debt = "0",
									pending = "0",
									btcRate = 1,
									fiatRate = null,
									status = "active"
								};

								miningWallet.currencies.Add(currency);

								// Accumulate totals
								totalBalance += finalBalance;
								totalAvailable += finalBalance;
							}

							// Update totals in MiningWallet
							miningWallet.total.totalBalance = totalBalance.ToString("F8");
							miningWallet.total.available = totalAvailable.ToString("F8");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching wallet data from the database.");
				throw;
			}

			return miningWallet;
		}

		private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
		private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");
		private async Task AppendToSitemapAsync(int targetId)
		{
			string userUrl = $"https://bughosted.com/User/{targetId}";
			string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

			await _sitemapLock.WaitAsync();
			try
			{
				XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
				XDocument sitemap;

				if (System.IO.File.Exists(_sitemapPath))
				{
					sitemap = XDocument.Load(_sitemapPath);
					var existingUrl = sitemap.Descendants(ns + "loc")
																	 .FirstOrDefault(x => x.Value == userUrl);
					if (existingUrl != null)
					{
						// Update lastmod if the entry exists
						existingUrl.Parent.Element(ns + "lastmod")?.SetValue(lastMod);
						sitemap.Save(_sitemapPath);
						return;
					}
				}
				else
				{
					sitemap = new XDocument(
							new XElement(ns + "urlset")
					);
				}

				// Add new entry with proper namespace
				XElement newUrlElement = new XElement(ns + "url",
						new XElement(ns + "loc", userUrl),
						new XElement(ns + "lastmod", lastMod),
						new XElement(ns + "changefreq", "daily"),
						new XElement(ns + "priority", "0.8")
				);

				sitemap.Root.Add(newUrlElement);

				sitemap.Save(_sitemapPath);
			}
			finally
			{
				_sitemapLock.Release();
			}
		}
		private async Task RemoveFromSitemapAsync(int targetId)
		{
			string targetUrl = $"https://bughosted.com/User/{targetId}";
			_logger.LogInformation($"Removing {targetUrl} from sitemap...");

			await _sitemapLock.WaitAsync();
			try
			{
				if (System.IO.File.Exists(_sitemapPath))
				{
					XDocument sitemap = XDocument.Load(_sitemapPath);

					// Define the namespace for the sitemap
					XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

					// Use LINQ to find the <url> element that contains the target URL in <loc>
					var targetElement = sitemap.Descendants(ns + "url")
							.FirstOrDefault(x => x.Element(ns + "loc")?.Value == targetUrl);

					if (targetElement != null)
					{
						// Remove the element if found
						targetElement.Remove();
						sitemap.Save(_sitemapPath);
						_logger.LogInformation($"Removed {targetUrl} from sitemap!");
					}
					else
					{
						_logger.LogWarning($"URL {targetUrl} not found in sitemap.");
					}
				}
			}
			finally
			{
				_sitemapLock.Release();
			}
		}
	}
}
public class IpApiResponse
{
	public string? Query { get; set; }  // This is the IP
	public string? City { get; set; }
	public string? Country { get; set; }
}