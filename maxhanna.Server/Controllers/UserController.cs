using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Weather;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class UserController : ControllerBase
	{
		private Log _log;
		private readonly IConfiguration _config;
		private readonly IHttpClientFactory _httpClientFactory;
		private readonly string _baseTarget;

		public UserController(IHttpClientFactory httpClientFactory, Log log, IConfiguration config)
		{
			_httpClientFactory = httpClientFactory;
			_log = log;
			_config = config;
			_baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? "";
		}

		[HttpGet(Name = "GetUserCount")]
		public async Task<IActionResult> GetUserCount()
		{
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
				_ = _log.Db("An error occurred while processing the GetUserCount request. " + ex.Message, null, "USER", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost(Name = "LogIn")]
		public async Task<IActionResult> LogIn([FromBody] Dictionary<string, string> body)
		{
			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			body.TryGetValue("username", out var username);
			body.TryGetValue("password", out var password); 
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
						selectCmd.Parameters.AddWithValue("@Username", (username ?? "").Trim());

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
							string inputHashedPassword = HashPassword(password ?? "", storedSalt);

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
                        SET last_seen = UTC_TIMESTAMP() 
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
					_ = _log.Db("An error occurred while processing the Login request. " + ex.Message, null, "USER", true);
					return StatusCode(500, "An error occurred while processing the request.");
				}
			}
		}

		[HttpPost("/User/{id}", Name = "GetUserById")]
		public async Task<IActionResult> GetUserById(int id)
		{
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
				_ = _log.Db("An error occurred while processing the GetUserById request. " + ex.Message, id, "USER", true);
				return StatusCode(500, "An error occurred while processing the GetUserById request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/User/GetAllUsers", Name = "GetAllUsers")]
		public async Task<IActionResult> GetAllUsers([FromBody] UserSearchRequest request)
		{
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
				_ = _log.Db("An error occurred while processing the GetAllUsers request. " + ex.Message, null, "USER", true);
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
			_ = _log.Db("POST /User", user.Id, "USER", true);
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

					string insertSql = @"INSERT INTO maxhanna.users (username, pass, salt, created, last_seen) VALUES (@Username, @Password, @Salt, UTC_TIMESTAMP(), UTC_TIMESTAMP());";
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

						_ = _log.Db($"User created successfully with ID: {userId}", userId, "USER", true);
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
				_ = _log.Db("An error occurred while processing the CreateUser POST request. " + ex.Message, user.Id, "USER", true);
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
			if (string.IsNullOrEmpty(user.Username) || user?.Id == null)
			{
				return BadRequest("Username cannot be empty!");
			}
			if (!await _log.ValidateUserLoggedIn(user.Id.Value)) return StatusCode(500, "Access Denied.");

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
					_ = _log.Db("An error occurred while processing the UpdateUser PATCH request. " + ex.Message, user.Id, "USER", true);
					return StatusCode(500, "An error occurred while processing the UpdateUser request.");
				}
			}
		}


		[HttpDelete("/User/DeleteUser", Name = "DeleteUser")]
		public async Task<IActionResult> DeleteUser([FromBody] User user)
		{
			_ = _log.Db($"DELETE /User with ID: {user.Id}", user.Id, "USER", true);
			if (user == null || user.Id == null || user.Id == 0 || user.Id == 1)
			{
				return BadRequest("Who do you think you are?");
			}
			if (!await _log.ValidateUserLoggedIn(user.Id.Value)) return StatusCode(500, "Access Denied.");

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
				_ = _log.Db("An error occurred while processing the DELETE request. " + ex.Message, user.Id, "USER", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}


		[HttpPost("/User/UpdateLastSeen", Name = "UpdateLastSeen")]
		public async void UpdateLastSeen([FromBody] int userId)
		{
			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();
					string sql = @"
                    UPDATE maxhanna.users 
                    SET last_seen = UTC_TIMESTAMP() 
                    WHERE id = @UserId;";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);
						await cmd.ExecuteReaderAsync();
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the UpdateLastSeen request. " + ex.Message, userId, "USER", true);
				}
			}
		}

		[HttpPost("/User/GetIpAndLocation", Name = "GetIpAndLocation")]
		public async Task<IActionResult> GetIpAndLocation([FromBody] string ip)
		{
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
					_ = _log.Db($"Error: {ex.Message}. " + ex.Message, null, "USER", true);
					return StatusCode(500, "Failed to get IP information");
				}
			}
		}


		[HttpPost("/User/GetIpAddress", Name = "GetIpAddress")]
		public async Task<WeatherLocation> GetIpAddress([FromBody] int userId)
		{ 
			var loc = new WeatherLocation();

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "SELECT user_id, location, city, country FROM maxhanna.user_ip_address WHERE user_id = @Owner;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							while (await rdr.ReadAsync())
							{
								loc.Ownership = rdr.GetInt32(0);
								loc.Location = rdr.IsDBNull(rdr.GetOrdinal("location")) ? null : rdr.GetString("location");
								loc.City = rdr.IsDBNull(rdr.GetOrdinal("city")) ? null : rdr.GetString("city");
								loc.Country = rdr.IsDBNull(rdr.GetOrdinal("country")) ? null : rdr.GetString("country");
							}
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while retrieving IP information. " + ex.Message, userId, "USER", true);
				throw;
			}

			return loc;
		}

		[HttpPut("/User/UpdateIpAddress", Name = "UpdateIpAddress")]
		public async Task<IActionResult> UpdateIpAddress([FromBody] CreateWeatherLocation location)
		{
			_ = _log.Db($"Updating or creating ip information for user ID: {location.userId}", location.userId, "USER", true);
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "INSERT INTO maxhanna.user_ip_address (user_id, location, city, country) VALUES (@Owner, @Location, @City, @Country) " +
											 "ON DUPLICATE KEY UPDATE location = @Location, city = @City, country = @Country;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", location.userId);
						cmd.Parameters.AddWithValue("@Location", location.location);
						cmd.Parameters.AddWithValue("@City", location.city);
						cmd.Parameters.AddWithValue("@Country", location.country);
						if (await cmd.ExecuteNonQueryAsync() >= 0)
						{
							return Ok("User ip updated.");
						}
						else
						{
							_ = _log.Db("Returned 500 for UpdateIpAddress.", location.userId, "USER", true);
							return StatusCode(500, "Failed to update or create data");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while updating or creating IP information. " + ex.Message, location.userId, "USER", true);
				throw;
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
				checkUserCmd.Parameters.AddWithValue("@userId", request.UserId);
				checkUserCmd.Parameters.AddWithValue("@fileId", request.FileId);
				using (var reader = await checkUserCmd.ExecuteReaderAsync())
				{
					return Ok();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the display picture POST request. " + ex.Message, request.UserId, "USER", true);
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
				checkUserCmd.Parameters.AddWithValue("@userId", request.UserId);
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
				_ = _log.Db("An error occurred while processing the user about POST request. " + ex.Message, request.UserId, "USER", true);
				return StatusCode(500, "An error occurred while processing the user about request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/User/UpdateNsfw", Name = "UpdateNsfw")]
		public async Task<IActionResult> UpdateNsfw([FromBody] UpdateNsfwRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string updateSql = @"
                INSERT INTO maxhanna.user_settings (user_id, nsfw_enabled)
                VALUES (@userId, @nsfwEnabled)
                ON DUPLICATE KEY UPDATE 
                    nsfw_enabled = VALUES(nsfw_enabled);";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@nsfwEnabled", request.IsAllowed ? 1 : 0);

					await updateCmd.ExecuteNonQueryAsync();

					return Ok("Successfully updated NSFW setting.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update NSFW POST request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update NSFW request.");
				}
				finally
				{
					conn.Close();
				}
			}
		}

		[HttpPost("/User/UpdateNotificationsEnabled", Name = "UpdateNotificationsEnabled")]
		public async Task<IActionResult> UpdateNotificationsEnabled([FromBody] UpdateNsfwRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string updateSql = @"
                INSERT INTO maxhanna.user_settings (user_id, notifications_enabled, notifications_changed_date)
                VALUES (@userId, @notifications_enabled, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE 
                    notifications_enabled = VALUES(notifications_enabled)
										notifications_changed_date = UTC_TIMESTAMP();";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@notifications_enabled", request.IsAllowed ? 1 : 0);

					await updateCmd.ExecuteNonQueryAsync();

					return Ok("Successfully updated notifications_enabled setting.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update notifications_enabled POST request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update notifications_enabled request.");
				}
				finally
				{
					conn.Close();
				}
			}
		}

		[HttpPost("/User/UpdateGhostRead", Name = "UpdateGhostRead")]
		public async Task<IActionResult> UpdateGhostRead([FromBody] UpdateNsfwRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string updateSql = @"
                INSERT INTO maxhanna.user_settings (user_id, ghost_read)
                VALUES (@userId, @ghostRead)
                ON DUPLICATE KEY UPDATE 
                    ghost_read = VALUES(ghost_read);";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@ghostRead", request.IsAllowed ? 1 : 0);

					await updateCmd.ExecuteNonQueryAsync();

					return Ok("Successfully updated ghost_read setting.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update ghost_read POST request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update ghost_read request.");
				}
				finally
				{
					conn.Close();
				}
			}
		}

		[HttpPost("/User/GetUserSettings", Name = "GetUserSettings")]
		public async Task<IActionResult> GetUserSettings([FromBody] int userId)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string selectSql = @"
                SELECT nsfw_enabled, ghost_read, notifications_enabled 
                FROM maxhanna.user_settings 
                WHERE user_id = @userId;";

					MySqlCommand selectCmd = new MySqlCommand(selectSql, conn);
					selectCmd.Parameters.AddWithValue("@userId", userId);

					var userSettings = new UserSettings
					{
						UserId = userId
					};

					using (var reader = await selectCmd.ExecuteReaderAsync())
					{
						if (await reader.ReadAsync())
						{
							userSettings.NsfwEnabled = reader.GetInt32("nsfw_enabled") == 1;
							userSettings.GhostReadEnabled = reader.GetInt32("ghost_read") == 1;
							userSettings.NotificationsEnabled = reader.IsDBNull("notifications_enabled") ? null : reader.GetInt32("notifications_enabled") == 1;
						}
						else
						{
							// If user settings are not found, return a default value (NSFW disabled)
							userSettings.NsfwEnabled = false;
							userSettings.GhostReadEnabled = false;
						}
					}

					return Ok(userSettings);
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while fetching user settings. " + ex.Message, userId, "USER", true);
					return StatusCode(500, "An error occurred while fetching user settings.");
				}
				finally
				{
					conn.Close();
				}
			}
		}



		[HttpPost("/User/Menu", Name = "GetUserMenu")]
		public async Task<IActionResult> GetUserMenu([FromBody] int userId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql = "SELECT * FROM maxhanna.menu WHERE ownership = @UserId";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", userId);

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
				_ = _log.Db("An error occurred while processing the GET request for user menu." + ex.Message, userId, "USER", true);
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
			if (request.UserId == 0)
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
						string sql = "DELETE FROM maxhanna.menu WHERE ownership = @UserId AND LOWER(title) = LOWER(@Title) LIMIT 1;";

						MySqlCommand cmd = new MySqlCommand(sql, conn);
						cmd.Parameters.AddWithValue("@UserId", request.UserId);
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
				_ = _log.Db("An error occurred while processing the DELETE request for menu item. " + ex.Message, request.UserId, "USER", true);
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
			if (request.UserId == 0)
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
						cmd.Parameters.AddWithValue("@UserId", request.UserId);
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
				_ = _log.Db("An error occurred while processing the POST request to add menu item. " + ex.Message, request.UserId, "USER", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/User/Trophies", Name = "GetTrophies")]
		public async Task<IActionResult> GetTrophies([FromBody] int userId)
		{
			if (userId == 0)
			{
				return BadRequest("User missing from request");
			}

			List<Trophy> trophies = new List<Trophy>();

			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string sql = @"
                    SELECT 
                        ut.id AS user_trophy_id,
                        ut.user_id,
                        ut.trophy_id,
                        utt.name AS trophy_name,
                        utt.file_id
                    FROM user_trophy ut
                    JOIN user_trophy_type utt ON ut.trophy_id = utt.id
                    WHERE ut.user_id = @UserId;";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);

						using (MySqlDataReader reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								trophies.Add(new Trophy
								{
									Id = reader.GetInt32("user_trophy_id"),
									Name = reader["trophy_name"] as string,
									File = reader["file_id"] != DBNull.Value
												? new FileEntry { Id = reader.GetInt32("file_id") }
												: null
								});
							}
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error fetching trophies: " + ex.Message, userId, "USER", true);
					return StatusCode(500, "An error occurred while retrieving trophies.");
				}
			}

			return Ok(trophies);
		}

		[HttpPost("/User/UpdateUserTheme", Name = "UpdateUserTheme")]
		public async Task<IActionResult> UpdateUserTheme([FromBody] UserThemeRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				using (var transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// Step 1: Check if a theme with the same name exists
						string checkThemeSql = @"
                    SELECT id, user_id, background_image, background_color, component_background_color, 
                           secondary_component_background_color, font_color, secondary_font_color, 
                           third_font_color, main_highlight_color, main_highlight_color_quarter_opacity, 
                           link_color, font_size, font_family
                    FROM maxhanna.user_theme 
                    WHERE name = @Name 
                    LIMIT 1;";

						MySqlCommand checkCmd = new MySqlCommand(checkThemeSql, conn, transaction);
						checkCmd.Parameters.AddWithValue("@Name", request.Theme.Name);

						int? existingThemeId = null;
						int? existingUserId = null;
						bool isSameTheme = false;

						using (var reader = await checkCmd.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								existingThemeId = Convert.ToInt32(reader["id"]);
								existingUserId = Convert.ToInt32(reader["user_id"]);

								// Check if theme values are identical
								int? dbBackgroundImage = reader["background_image"] == DBNull.Value ? (int?)null : Convert.ToInt32(reader["background_image"]);
								string dbBackgroundColor = reader["background_color"] == DBNull.Value ? "" : reader["background_color"].ToString().Trim();
								string dbComponentBackgroundColor = reader["component_background_color"] == DBNull.Value ? "" : reader["component_background_color"].ToString().Trim();
								string dbSecondaryComponentBackgroundColor = reader["secondary_component_background_color"] == DBNull.Value ? "" : reader["secondary_component_background_color"].ToString().Trim();
								string dbFontColor = reader["font_color"] == DBNull.Value ? "" : reader["font_color"].ToString().Trim();
								string dbSecondaryFontColor = reader["secondary_font_color"] == DBNull.Value ? "" : reader["secondary_font_color"].ToString().Trim();
								string dbThirdFontColor = reader["third_font_color"] == DBNull.Value ? "" : reader["third_font_color"].ToString().Trim();
								string dbMainHighlightColor = reader["main_highlight_color"] == DBNull.Value ? "" : reader["main_highlight_color"].ToString().Trim();
								string dbMainHighlightColorQuarterOpacity = reader["main_highlight_color_quarter_opacity"] == DBNull.Value ? "" : reader["main_highlight_color_quarter_opacity"].ToString().Trim();
								string dbLinkColor = reader["link_color"] == DBNull.Value ? "" : reader["link_color"].ToString().Trim();
								int? dbFontSize = reader["font_size"] == DBNull.Value ? (int?)null : Convert.ToInt32(reader["font_size"]);
								string dbFontFamily = reader["font_family"] == DBNull.Value ? "" : reader["font_family"].ToString().Trim();

								isSameTheme =
										dbBackgroundImage == request.Theme.BackgroundImage &&
										dbBackgroundColor.Equals(request.Theme.BackgroundColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbComponentBackgroundColor.Equals(request.Theme.ComponentBackgroundColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbSecondaryComponentBackgroundColor.Equals(request.Theme.SecondaryComponentBackgroundColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbFontColor.Equals(request.Theme.FontColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbSecondaryFontColor.Equals(request.Theme.SecondaryFontColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbThirdFontColor.Equals(request.Theme.ThirdFontColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbMainHighlightColor.Equals(request.Theme.MainHighlightColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbMainHighlightColorQuarterOpacity.Equals(request.Theme.MainHighlightColorQuarterOpacity?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbLinkColor.Equals(request.Theme.LinkColor?.Trim(), StringComparison.OrdinalIgnoreCase) &&
										dbFontSize == request.Theme.FontSize &&
										dbFontFamily.Equals(request.Theme.FontFamily?.Trim(), StringComparison.OrdinalIgnoreCase);
							}
						}

						if (existingThemeId.HasValue)
						{
							// If theme exists for another user, reject request
							if (existingUserId != request.UserId && !isSameTheme)
							{
								return BadRequest("Theme name is already in use by another user.");
							}

							// If theme exists for the same user but with different values, allow update
							if (!isSameTheme)
							{
								string updateSql = @"
                            UPDATE maxhanna.user_theme
                            SET background_image = @BackgroundImage,
                                background_color = @BackgroundColor, 
                                component_background_color = @ComponentBackgroundColor,
                                secondary_component_background_color = @SecondaryComponentBackgroundColor,
                                font_color = @FontColor,
                                secondary_font_color = @SecondaryFontColor,
                                third_font_color = @ThirdFontColor,
                                main_highlight_color = @MainHighlightColor,
                                main_highlight_color_quarter_opacity = @MainHighlightColorQuarterOpacity,
                                link_color = @LinkColor,
                                font_size = @FontSize,
                                font_family = @FontFamily
                            WHERE id = @Id AND user_id = @UserId LIMIT 1;";

								MySqlCommand updateCmd = new MySqlCommand(updateSql, conn, transaction);
								updateCmd.Parameters.AddWithValue("@Id", existingThemeId);
								updateCmd.Parameters.AddWithValue("@UserId", request.UserId);
								updateCmd.Parameters.AddWithValue("@BackgroundImage", request.Theme.BackgroundImage);
								updateCmd.Parameters.AddWithValue("@BackgroundColor", request.Theme.BackgroundColor);
								updateCmd.Parameters.AddWithValue("@ComponentBackgroundColor", request.Theme.ComponentBackgroundColor);
								updateCmd.Parameters.AddWithValue("@SecondaryComponentBackgroundColor", request.Theme.SecondaryComponentBackgroundColor);
								updateCmd.Parameters.AddWithValue("@FontColor", request.Theme.FontColor);
								updateCmd.Parameters.AddWithValue("@SecondaryFontColor", request.Theme.SecondaryFontColor);
								updateCmd.Parameters.AddWithValue("@ThirdFontColor", request.Theme.ThirdFontColor);
								updateCmd.Parameters.AddWithValue("@MainHighlightColor", request.Theme.MainHighlightColor);
								updateCmd.Parameters.AddWithValue("@MainHighlightColorQuarterOpacity", request.Theme.MainHighlightColorQuarterOpacity);
								updateCmd.Parameters.AddWithValue("@LinkColor", request.Theme.LinkColor);
								updateCmd.Parameters.AddWithValue("@FontSize", request.Theme.FontSize);
								updateCmd.Parameters.AddWithValue("@FontFamily", request.Theme.FontFamily);

								await updateCmd.ExecuteNonQueryAsync();
							}
						}
						else
						{
							if (existingThemeId == null)
							{
								string insertSql = @"
                        INSERT INTO maxhanna.user_theme 
                        (user_id, background_image, background_color, component_background_color, 
                         secondary_component_background_color, font_color, secondary_font_color, 
                         third_font_color, main_highlight_color, main_highlight_color_quarter_opacity, 
                         link_color, font_size, font_family, name)
                        VALUES (@UserId, @BackgroundImage, @BackgroundColor, @ComponentBackgroundColor, 
                                @SecondaryComponentBackgroundColor, @FontColor, @SecondaryFontColor, 
                                @ThirdFontColor, @MainHighlightColor, @MainHighlightColorQuarterOpacity, 
                                @LinkColor, @FontSize, @FontFamily, @Name);";

								MySqlCommand insertCmd = new MySqlCommand(insertSql, conn, transaction);
								insertCmd.Parameters.AddWithValue("@UserId", request.UserId);
								insertCmd.Parameters.AddWithValue("@BackgroundImage", request.Theme.BackgroundImage);
								insertCmd.Parameters.AddWithValue("@BackgroundColor", request.Theme.BackgroundColor);
								insertCmd.Parameters.AddWithValue("@ComponentBackgroundColor", request.Theme.ComponentBackgroundColor);
								insertCmd.Parameters.AddWithValue("@SecondaryComponentBackgroundColor", request.Theme.SecondaryComponentBackgroundColor);
								insertCmd.Parameters.AddWithValue("@FontColor", request.Theme.FontColor);
								insertCmd.Parameters.AddWithValue("@SecondaryFontColor", request.Theme.SecondaryFontColor);
								insertCmd.Parameters.AddWithValue("@ThirdFontColor", request.Theme.ThirdFontColor);
								insertCmd.Parameters.AddWithValue("@MainHighlightColor", request.Theme.MainHighlightColor);
								insertCmd.Parameters.AddWithValue("@MainHighlightColorQuarterOpacity", request.Theme.MainHighlightColorQuarterOpacity);
								insertCmd.Parameters.AddWithValue("@LinkColor", request.Theme.LinkColor);
								insertCmd.Parameters.AddWithValue("@FontSize", request.Theme.FontSize);
								insertCmd.Parameters.AddWithValue("@FontFamily", request.Theme.FontFamily);
								insertCmd.Parameters.AddWithValue("@Name", request.Theme.Name);

								await insertCmd.ExecuteNonQueryAsync();
								existingThemeId = (int)insertCmd.LastInsertedId;
							}
						}

						// Update selected theme
						string updateSelectionSql = @"
                    INSERT INTO maxhanna.user_theme_selected (user_id, theme_id)
                    VALUES (@UserId, @ThemeId)
                    ON DUPLICATE KEY UPDATE theme_id = VALUES(theme_id);";

						MySqlCommand selectionCmd = new MySqlCommand(updateSelectionSql, conn, transaction);
						selectionCmd.Parameters.AddWithValue("@UserId", request.UserId);
						selectionCmd.Parameters.AddWithValue("@ThemeId", existingThemeId);

						await selectionCmd.ExecuteNonQueryAsync();

						await transaction.CommitAsync();
						return Ok("User theme updated successfully.");
					}
					catch (Exception ex)
					{
						_ = _log.Db("Error updating user theme. " + ex.Message, request.UserId, "USER", true);
						await transaction.RollbackAsync();
						return StatusCode(500, "An error occurred while updating the theme.");
					}
				}
			}
		}


		[HttpPost("/User/GetUserTheme", Name = "GetUserTheme")]
		public async Task<IActionResult> GetUserTheme([FromBody] int UserId)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string sql = @"
                SELECT ut.id, ut.background_image, ut.background_color, ut.component_background_color, ut.secondary_component_background_color, 
                       ut.font_color, ut.secondary_font_color, ut.third_font_color, ut.main_highlight_color, ut.main_highlight_color_quarter_opacity, 
                       ut.link_color, ut.font_size, ut.font_family, ut.name
                FROM maxhanna.user_theme_selected uts
                INNER JOIN maxhanna.user_theme ut ON uts.theme_id = ut.id
                WHERE uts.user_id = @UserId
                LIMIT 1;";

					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@UserId", UserId);

					using (var reader = await cmd.ExecuteReaderAsync())
					{
						if (reader.Read())
						{
							var theme = new UserTheme()
							{
								Id = Convert.ToInt32(reader["id"]),
								BackgroundImage = reader["background_image"] != DBNull.Value ? Convert.ToInt32(reader["background_image"]) : null,
								BackgroundColor = reader["background_color"].ToString(),
								ComponentBackgroundColor = reader["component_background_color"].ToString(),
								SecondaryComponentBackgroundColor = reader["secondary_component_background_color"].ToString(),
								FontColor = reader["font_color"].ToString(),
								SecondaryFontColor = reader["secondary_font_color"].ToString(),
								ThirdFontColor = reader["third_font_color"].ToString(),
								MainHighlightColor = reader["main_highlight_color"].ToString(),
								MainHighlightColorQuarterOpacity = reader["main_highlight_color_quarter_opacity"].ToString(),
								LinkColor = reader["link_color"].ToString(),
								FontSize = reader["font_size"] != DBNull.Value ? Convert.ToInt32(reader["font_size"]) : 16,
								FontFamily = reader["font_family"].ToString(),
								Name = reader["name"].ToString()
							};

							return Ok(theme);
						}
						else
						{
							return NotFound(new { message = "No theme found for the user." });
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error processing GetUserTheme. " + ex.Message, UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the request.");
				}
			}
		}


		[HttpPost("/User/GetAllThemes", Name = "GetAllThemes")]
		public async Task<IActionResult> GetAllThemes([FromBody] string search)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					// SQL query to get the top 20 themes, ordered by popularity
					string sql = @"
                SELECT ut.id, ut.user_id, ut.background_image, ut.background_color, ut.component_background_color, 
                       ut.secondary_component_background_color, ut.font_color, ut.secondary_font_color, ut.third_font_color, 
                       ut.main_highlight_color, ut.main_highlight_color_quarter_opacity, ut.link_color, ut.font_size, ut.font_family, 
                       ut.name, COUNT(uts.theme_id) AS popularity
                FROM maxhanna.user_theme ut
                LEFT JOIN maxhanna.user_theme_selected uts ON ut.id = uts.theme_id
                WHERE ut.name LIKE @Search
                GROUP BY ut.id
                ORDER BY popularity DESC
                LIMIT 20;";

					MySqlCommand cmd = new MySqlCommand(sql, conn);

					// Using '%' around the search term for partial matches
					cmd.Parameters.AddWithValue("@Search", "%" + (search ?? "") + "%");

					using (var reader = await cmd.ExecuteReaderAsync())
					{
						var themes = new List<UserTheme>();

						while (reader.Read())
						{
							var theme = new UserTheme()
							{
								Id = Convert.ToInt32(reader["id"]),
								UserId = reader["user_id"] != DBNull.Value ? Convert.ToInt32(reader["user_id"]) : null,
								BackgroundImage = reader["background_image"] != DBNull.Value ? Convert.ToInt32(reader["background_image"]) : null,
								BackgroundColor = reader["background_color"].ToString(),
								ComponentBackgroundColor = reader["component_background_color"].ToString(),
								SecondaryComponentBackgroundColor = reader["secondary_component_background_color"].ToString(),
								FontColor = reader["font_color"].ToString(),
								SecondaryFontColor = reader["secondary_font_color"].ToString(),
								ThirdFontColor = reader["third_font_color"].ToString(),
								MainHighlightColor = reader["main_highlight_color"].ToString(),
								MainHighlightColorQuarterOpacity = reader["main_highlight_color_quarter_opacity"].ToString(),
								LinkColor = reader["link_color"].ToString(),
								FontSize = reader["font_size"] != DBNull.Value ? Convert.ToInt32(reader["font_size"]) : 16,
								FontFamily = reader["font_family"].ToString(),
								Name = reader["name"].ToString()
							};

							themes.Add(theme);
						}

						if (themes.Count > 0)
						{
							return Ok(themes);
						}
						else
						{
							return NotFound(new { message = "No themes found matching the search criteria." });
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error processing GetAllThemes. " + ex.Message, null, "USER", true);
					return StatusCode(500, "An error occurred while processing the request.");
				}
			}
		}



		[HttpPost("/User/GetAllUserThemes", Name = "GetAllUserThemes")]
		public async Task<IActionResult> GetAllUserThemes([FromBody] int userId)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					// SQL query to get the top 20 themes, searching by name (using LIKE)
					string sql = @"
                SELECT ut.id, ut.user_id, ut.background_image, ut.background_color, ut.component_background_color, ut.secondary_component_background_color, 
                       ut.font_color, ut.secondary_font_color, ut.third_font_color, ut.main_highlight_color, ut.main_highlight_color_quarter_opacity, 
                       ut.link_color, ut.font_size, ut.font_family, ut.name
                FROM maxhanna.user_theme ut
                WHERE ut.user_id = @UserId;";

					MySqlCommand cmd = new MySqlCommand(sql, conn);

					// Using '%' around the search term for partial matches
					cmd.Parameters.AddWithValue("@UserId", userId);

					using (var reader = await cmd.ExecuteReaderAsync())
					{
						var themes = new List<UserTheme>();

						while (reader.Read())
						{
							var theme = new UserTheme()
							{
								Id = Convert.ToInt32(reader["id"]),
								UserId = reader["user_id"] != DBNull.Value ? Convert.ToInt32(reader["user_id"]) : null,
								BackgroundImage = reader["background_image"] != DBNull.Value ? Convert.ToInt32(reader["background_image"]) : null,
								BackgroundColor = reader["background_color"].ToString(),
								ComponentBackgroundColor = reader["component_background_color"].ToString(),
								SecondaryComponentBackgroundColor = reader["secondary_component_background_color"].ToString(),
								FontColor = reader["font_color"].ToString(),
								SecondaryFontColor = reader["secondary_font_color"].ToString(),
								ThirdFontColor = reader["third_font_color"].ToString(),
								MainHighlightColor = reader["main_highlight_color"].ToString(),
								MainHighlightColorQuarterOpacity = reader["main_highlight_color_quarter_opacity"].ToString(),
								LinkColor = reader["link_color"].ToString(),
								FontSize = reader["font_size"] != DBNull.Value ? Convert.ToInt32(reader["font_size"]) : 16,
								FontFamily = reader["font_family"].ToString(),
								Name = reader["name"].ToString()
							};

							themes.Add(theme);
						}

						if (themes.Count > 0)
						{
							return Ok(themes);
						}
						else
						{
							return NotFound(new { message = "No themes found matching for user." });
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error processing GetAllUserThemes. " + ex.Message, userId, "USER", true);
					return StatusCode(500, "An error occurred while processing the request.");
				}
			}
		}

		[HttpPost("/User/DeleteUserSelectedTheme", Name = "DeleteUserSelectedTheme")]
		public async Task<IActionResult> DeleteUserSelectedTheme([FromBody] int UserId)
		{
			_ = _log.Db($"POST /user/DeleteUserSelectedTheme/{UserId}", UserId, "USER");

			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					// Delete user’s selected theme from user_theme_selected
					string sql = "DELETE FROM maxhanna.user_theme_selected WHERE user_id = @UserId;";

					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@UserId", UserId);

					int affectedRows = await cmd.ExecuteNonQueryAsync();

					return affectedRows > 0
							? Ok(new { message = "User theme selection removed." })
							: NotFound(new { message = "No theme selection found for the user." });
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error processing DeleteUserTheme. " + ex.Message, UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the request.");
				}
			}
		}

		[HttpPost("/User/DeleteUserTheme", Name = "DeleteUserTheme")]
		public async Task<IActionResult> DeleteUserTheme([FromBody] DeleteUserThemeRequest request)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// SQL statement to delete user theme
				string sql = "DELETE FROM maxhanna.user_theme WHERE user_id = @UserId AND id = @Id LIMIT 1;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", request.UserId);
				cmd.Parameters.AddWithValue("@Id", request.ThemeId);

				int affectedRows = await cmd.ExecuteNonQueryAsync();

				if (affectedRows > 0)
				{
					// If a row is deleted, return a success message
					return Ok(new { message = "User theme successfully deleted." });
				}
				else
				{
					// If no rows are affected, the theme doesn't exist for this user
					return NotFound(new { message = "User theme not found for the given UserId." });
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request. " + ex.Message, request.UserId, "USER", true);
				return StatusCode(500, new { message = "An error occurred while processing the request." });
			}
			finally
			{
				conn.Close();
			}
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
						_ = _log.Db($"Removed {targetUrl} from sitemap!", null, "USER", true);
					}
					else
					{
						_ = _log.Db($"URL {targetUrl} not found in sitemap.", null, "USER", true);
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