using FirebaseAdmin.Messaging;
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

		[HttpGet("/User/GetLoginStreak/{userId}", Name = "GetLoginStreak")]
		public async Task<IActionResult> GetLoginStreak(int userId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"SELECT current_streak, longest_streak FROM maxhanna.user_login_streaks WHERE user_id = @UserId LIMIT 1;";

				using (var cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@UserId", userId);
					using (var reader = await cmd.ExecuteReaderAsync())
					{
						if (await reader.ReadAsync())
						{
							int current = reader.IsDBNull(0) ? 0 : reader.GetInt32(0);
							int longest = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
							return Ok(new { CurrentStreak = current, LongestStreak = longest });
						}
						else
						{
							// No streak info yet for this user
							return Ok(new { CurrentStreak = 0, LongestStreak = 0 });
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the GetLoginStreak request. " + ex.Message, userId, "USER", true);
				return StatusCode(500, "An error occurred while processing the GetLoginStreak request.");
			}
			finally
			{
				conn.Close();
			}
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

		[HttpGet("/User/ActiveGamers", Name = "GetActiveGamers")]
		public async Task<IActionResult> GetActiveGamers()
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				// Combine the union of activity sources with user/profile info in one query to avoid per-row lookups
				string sql = @"
				SELECT t.userId, t.username, t.game, t.lastActivity,
					   u.created, u.last_seen,
					   dp.file_id AS latest_file_id, dp.tag_background_file_id AS tag_background_file_id,
					   dpf.file_name, dpf.folder_path,
					   ua.description, ua.phone, ua.email, ua.birthday, ua.currency, ua.is_email_public
				FROM (
					SELECT u.id AS userId, u.username AS username, 'bones' AS game, MAX(h.updated) AS lastActivity
					FROM maxhanna.users u
					JOIN maxhanna.bones_hero h ON h.user_id = u.id
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'ender' AS game,
					(
						SELECT MAX(ebw.created_at) FROM maxhanna.ender_bike_wall ebw
						JOIN maxhanna.bones_hero bh ON bh.id = ebw.hero_id
						WHERE bh.user_id = u.id
					) AS lastActivity
					FROM maxhanna.users u
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'array' AS game,
					(
						SELECT MAX(lastActivity) FROM (
							SELECT g.timestamp AS lastActivity FROM maxhanna.array_characters_graveyard g WHERE g.user_id = u.id AND g.timestamp IS NOT NULL
							UNION ALL
							SELECT NULL
						) recent_array
					) AS lastActivity
					FROM maxhanna.users u
					LEFT JOIN maxhanna.array_characters ac ON ac.user_id = u.id
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'wordler' AS game, MAX(wg.date) AS lastActivity
					FROM maxhanna.users u
					JOIN maxhanna.wordler_guess wg ON wg.user_id = u.id
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'mastermind' AS game, MAX(mg.guess_time_utc) AS lastActivity
					FROM maxhanna.users u
					JOIN maxhanna.mastermind_games mg_g ON mg_g.user_id = u.id
					JOIN maxhanna.mastermind_guesses mg ON mg.game_id = mg_g.id
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'meta' AS game, MAX(p.last_used) AS lastActivity
					FROM maxhanna.users u
					JOIN maxhanna.meta_hero mh ON mh.user_id = u.id
					JOIN maxhanna.meta_bot_part p ON p.hero_id = mh.id
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'emulation' AS game,
					(
						SELECT MAX(lastActivity) FROM (
							SELECT ept.save_time AS lastActivity FROM maxhanna.emulation_play_time ept WHERE ept.user_id = u.id AND ept.save_time IS NOT NULL
							UNION ALL
							SELECT ept.start_time AS lastActivity FROM maxhanna.emulation_play_time ept WHERE ept.user_id = u.id AND ept.start_time IS NOT NULL
							UNION ALL
							SELECT fu.upload_date AS lastActivity FROM maxhanna.file_uploads fu WHERE fu.user_id = u.id AND (fu.file_type = 'sav' OR fu.file_name LIKE '%.sav') AND fu.upload_date IS NOT NULL
							UNION ALL
							SELECT fu.last_access AS lastActivity FROM maxhanna.file_uploads fu WHERE fu.user_id = u.id AND (fu.file_type = 'sav' OR fu.file_name LIKE '%.sav') AND fu.last_access IS NOT NULL
						) recent_emulation
					) AS lastActivity
					FROM maxhanna.users u
					GROUP BY u.id
					UNION
					SELECT u.id AS userId, u.username AS username, 'nexus' AS game,
					(
						SELECT MAX(lastActivity) FROM (
							SELECT nas.timestamp AS lastActivity FROM maxhanna.nexus_attacks_sent nas WHERE nas.origin_user_id = u.id AND nas.timestamp IS NOT NULL
							UNION ALL
							SELECT nas.timestamp AS lastActivity FROM maxhanna.nexus_attacks_sent nas WHERE nas.destination_user_id = u.id AND nas.timestamp IS NOT NULL
							UNION ALL
							SELECT nds.timestamp AS lastActivity FROM maxhanna.nexus_defences_sent nds WHERE nds.origin_user_id = u.id AND nds.timestamp IS NOT NULL
							UNION ALL
							SELECT nds.timestamp AS lastActivity FROM maxhanna.nexus_defences_sent nds WHERE nds.destination_user_id = u.id AND nds.timestamp IS NOT NULL
							UNION ALL
							SELECT p.timestamp AS lastActivity FROM maxhanna.nexus_unit_purchases p JOIN maxhanna.nexus_bases nb ON nb.coords_x = p.coords_x AND nb.coords_y = p.coords_y WHERE nb.user_id = u.id AND p.timestamp IS NOT NULL
							UNION ALL
							SELECT u2.timestamp AS lastActivity FROM maxhanna.nexus_unit_upgrades u2 JOIN maxhanna.nexus_bases nb2 ON nb2.coords_x = u2.coords_x AND nb2.coords_y = u2.coords_y WHERE nb2.user_id = u.id AND u2.timestamp IS NOT NULL
							UNION ALL
							SELECT bu.command_center_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.command_center_upgraded IS NOT NULL
							UNION ALL
							SELECT bu.mines_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.mines_upgraded IS NOT NULL
							UNION ALL
							SELECT bu.supply_depot_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.supply_depot_upgraded IS NOT NULL
							UNION ALL
							SELECT bu.factory_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.factory_upgraded IS NOT NULL
							UNION ALL
							SELECT bu.starport_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.starport_upgraded IS NOT NULL
							UNION ALL
							SELECT bu.warehouse_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.warehouse_upgraded IS NOT NULL
							UNION ALL
							SELECT bu.engineering_bay_upgraded AS lastActivity FROM maxhanna.nexus_base_upgrades bu JOIN maxhanna.nexus_bases nb3 ON nb3.coords_x = bu.coords_x AND nb3.coords_y = bu.coords_y WHERE nb3.user_id = u.id AND bu.engineering_bay_upgraded IS NOT NULL
						) recent_nexus
					) AS lastActivity
					FROM maxhanna.users u
					GROUP BY u.id
				) t
				LEFT JOIN maxhanna.users u ON u.id = t.userId
				LEFT JOIN maxhanna.user_display_pictures dp ON dp.user_id = u.id
				LEFT JOIN maxhanna.user_about ua ON ua.user_id = u.id
				LEFT JOIN maxhanna.file_uploads dpf ON dpf.id = dp.file_id
				WHERE t.lastActivity >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
				ORDER BY t.lastActivity DESC
				LIMIT 200;";

				using var cmd = new MySqlCommand(sql, conn);
				using var rdr = await cmd.ExecuteReaderAsync();
				var list = new List<maxhanna.Server.Controllers.DataContracts.Users.ActiveGamer>();
				while (await rdr.ReadAsync())
				{
					var userId = rdr.IsDBNull(rdr.GetOrdinal("userId")) ? 0 : rdr.GetInt32("userId");

					var displayPicId = rdr.IsDBNull(rdr.GetOrdinal("latest_file_id")) ? 0 : rdr.GetInt32("latest_file_id");
					var displayPic = new FileEntry()
					{
						Id = displayPicId,
						FileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? string.Empty : rdr.GetString("file_name"),
						Directory = rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? string.Empty : rdr.GetString("folder_path")
					};

					var bgPicId = rdr.IsDBNull(rdr.GetOrdinal("tag_background_file_id")) ? 0 : rdr.GetInt32("tag_background_file_id");
					var bgPic = new FileEntry() { Id = bgPicId };

					var about = new UserAbout()
					{
						UserId = userId,
						Description = rdr.IsDBNull(rdr.GetOrdinal("description")) ? string.Empty : rdr.GetString("description"),
						Phone = rdr.IsDBNull(rdr.GetOrdinal("phone")) ? string.Empty : rdr.GetString("phone"),
						Email = rdr.IsDBNull(rdr.GetOrdinal("email")) ? string.Empty : rdr.GetString("email"),
						Birthday = rdr.IsDBNull(rdr.GetOrdinal("birthday")) ? (DateTime?)null : rdr.GetDateTime("birthday"),
						Currency = rdr.IsDBNull(rdr.GetOrdinal("currency")) ? null : rdr.GetString("currency"),
						IsEmailPublic = rdr.IsDBNull(rdr.GetOrdinal("is_email_public")) ? true : rdr.GetBoolean("is_email_public")
					};

					var fullUser = new maxhanna.Server.Controllers.DataContracts.Users.User()
					{
						Id = userId,
						Username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : rdr.GetString("username"),
						Created = rdr.IsDBNull(rdr.GetOrdinal("created")) ? (DateTime?)null : rdr.GetDateTime("created"),
						LastSeen = rdr.IsDBNull(rdr.GetOrdinal("last_seen")) ? (DateTime?)null : rdr.GetDateTime("last_seen"),
						DisplayPictureFile = (displayPic != null && displayPic.Id != 0) ? displayPic : null,
						ProfileBackgroundPictureFile = (bgPic != null && bgPic.Id != 0) ? bgPic : null,
						About = about
					};

					var ag = new maxhanna.Server.Controllers.DataContracts.Users.ActiveGamer
					{
						UserId = userId,
						Username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? null : rdr.GetString("username"),
						Game = rdr.IsDBNull(rdr.GetOrdinal("game")) ? null : rdr.GetString("game"),
						LastActivityUtc = rdr.IsDBNull(rdr.GetOrdinal("lastActivity")) ? (DateTime?)null : rdr.GetDateTime("lastActivity"),
						User = fullUser
					};
					list.Add(ag);
				}
				return Ok(list);
			}
			catch (Exception ex)
			{
				_ = _log.Db("GetActiveGamers failed: " + ex.Message, null, "USER", true);
				return StatusCode(500, "Failed to fetch active gamers");
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
                            dp.tag_background_file_id AS tag_background_file_id,
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
										FileEntry profileBackgroundPicture = new FileEntry()
										{
											Id = dataReader.IsDBNull(dataReader.GetOrdinal("tag_background_file_id")) ? 0 : dataReader.GetInt32("tag_background_file_id"),
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
												profileBackgroundPicture.Id != 0 ? profileBackgroundPicture : null,
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
                        dp.tag_background_file_id AS tag_background_file_id,
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
                        u.id = @user_id;";

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
						FileEntry userTagBackgroundPic = new FileEntry()
						{
							Id = reader.IsDBNull(reader.GetOrdinal("tag_background_file_id")) ? 0 : reader.GetInt32("tag_background_file_id"), 
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
								userTagBackgroundPic.Id == 0 ? null : userTagBackgroundPic,
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


		[HttpPost("/User/Username/{username}", Name = "GetUserByUsername")]
		public async Task<IActionResult> GetUserByUsername(string username)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = @"
                    SELECT 
                        u.*, 
                        dp.file_id AS latest_file_id,
                        dp.tag_background_file_id AS tag_background_file_id,
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
                        u.username = @username;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@username", username);

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
						FileEntry profileBackgroundPicture = new FileEntry()
						{
							Id = reader.IsDBNull(reader.GetOrdinal("tag_background_file_id")) ? 0 : reader.GetInt32("tag_background_file_id"), 
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
								profileBackgroundPicture.Id == 0 ? null : profileBackgroundPicture,
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
				_ = _log.Db($"An error occurred while processing the GetUserByUsername request for username: {username}. " + ex.Message, null, "USER", true);
				return StatusCode(500, "An error occurred while processing the GetUserById request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/User/GetAllUsers", Name = "GetAllUsers")]
		public async Task<IActionResult> GetAllUsers([FromBody] UserSearchRequest? request)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = @"
					SELECT 
						u.id, 
						u.username,
						u.last_seen,
						udp.file_id as display_file_id
					FROM maxhanna.users u 
					LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
					WHERE 1=1"; 
 
				if (request?.UserId > 0)
				{
					sql += " AND u.id != @searchingUserId";
				}

				// Skip block checks if userId is null/0
				if (request?.UserId > 0)
				{
					sql += @"
						AND NOT EXISTS (
							SELECT 1 FROM maxhanna.user_blocks ub1 
							WHERE ub1.user_id = u.id AND ub1.blocked_user_id = @searchingUserId
						)
						AND NOT EXISTS (
							SELECT 1 FROM maxhanna.user_blocks ub2 
							WHERE ub2.user_id = @searchingUserId AND ub2.blocked_user_id = u.id
						)";
				}

				// Add search filter if provided
				if (!string.IsNullOrEmpty(request?.Search))
				{
					sql += " AND u.username LIKE @search";
				}

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@searchingUserId", request?.UserId ?? 0);

				if (!string.IsNullOrEmpty(request?.Search))
				{
					cmd.Parameters.AddWithValue("@search", "%" + request.Search + "%");
				}

				List<User> users = new List<User>();

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						User tmpUser = new User
						(
							Convert.ToInt32(reader["id"]),
							(string)reader["username"],
							reader.IsDBNull(reader.GetOrdinal("display_file_id")) ? null : new FileEntry(Convert.ToInt32(reader["display_file_id"]))
						);
						tmpUser.LastSeen = reader.IsDBNull(reader.GetOrdinal("last_seen")) ? null : reader.GetDateTime("last_seen");
						users.Add(tmpUser);
					}
				}

				return users.Count > 0 ? Ok(users) : NotFound();
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error in GetAllUsers: " + ex.Message, null, "USER", true);
				return StatusCode(500, "An error occurred.");
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
					string hashedPassword = HashPassword(user.Pass ?? "", salt);

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

						// Ensure a user directory exists under Users/ and mark it private
						try
						{
							string usersRoot = Path.Combine(_baseTarget, "Users");
							string userDir = Path.Combine(usersRoot, user.Username ?? userId.ToString());
							if (!Directory.Exists(userDir))
							{
								Directory.CreateDirectory(userDir);
								// Create a marker file to indicate this folder is private (used by client/server logic)
								string marker = Path.Combine(userDir, ".private");
								try { System.IO.File.WriteAllText(marker, "private"); } catch { }
							}
						}
						catch (Exception ex)
						{
							_ = _log.Db("Failed to create user directory: " + ex.Message, userId, "USER", false);
						}

						// Also create a virtual folder entry in the file_uploads table so the Users/username
						// shows up in the client file browser (mirror of FileController.MakeDirectory behavior).
						try
						{
							string usersRoot = Path.Combine(_baseTarget, "Users");
							string userDir = Path.Combine(usersRoot, user.Username ?? userId.ToString());
							string fileName = Path.GetFileName(userDir);
							string directoryName = (Path.GetDirectoryName(userDir) ?? "").Replace("\\", "/");
							if (!directoryName.EndsWith("/")) directoryName += "/";

							string insertFolderSql = @"INSERT INTO maxhanna.file_uploads (user_id, upload_date, file_name, folder_path, is_public, is_folder) VALUES (@user_id, UTC_TIMESTAMP(), @fileName, @folderPath, @isPublic, @isFolder);";
							using (var insertFolderCmd = new MySqlCommand(insertFolderSql, conn))
							{
								insertFolderCmd.Parameters.AddWithValue("@user_id", userId);
								insertFolderCmd.Parameters.AddWithValue("@fileName", fileName);
								insertFolderCmd.Parameters.AddWithValue("@folderPath", directoryName);
								insertFolderCmd.Parameters.AddWithValue("@isPublic", 0);
								insertFolderCmd.Parameters.AddWithValue("@isFolder", 1);
								try
								{
									await insertFolderCmd.ExecuteNonQueryAsync();
								}
								catch (MySqlException mex)
								{
									// Ignore duplicate folder entry or other DB errors but log them
									_ = _log.Db("Failed to insert virtual folder entry: " + mex.Message, userId, "FILE", true);
								}
							}
						}
						catch (Exception ex2)
						{
							_ = _log.Db("Failed to create virtual folder entry for user directory: " + ex2.Message, userId, "FILE", true);
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
		public async Task<IActionResult> UpdateUser([FromBody] User user, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			if (string.IsNullOrEmpty(user.Username) || user?.Id == null)
			{
				return BadRequest("Username cannot be empty!");
			}
			if (!await _log.ValidateUserLoggedIn(user.Id.Value, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

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
						string hashedPassword = HashPassword(user.Pass ?? "", existingSalt);

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
		public async Task<IActionResult> DeleteUser([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			_ = _log.Db($"DELETE /User with ID: {userId}", userId, "USER", true);
			if (userId == 0 || userId == 1)
			{
				return BadRequest("Who do you fucking think you are?");
			}
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open(); 
				string selectSql = "SELECT * FROM maxhanna.users WHERE id = @Id";
				MySqlCommand selectCmd = new MySqlCommand(selectSql, conn);
				selectCmd.Parameters.AddWithValue("@Id", userId);

				using (var reader = await selectCmd.ExecuteReaderAsync())
				{
					if (!reader.Read())
					{ 
						return NotFound();
					}
				}

				await DeleteUserFiles(userId, conn);

				string deleteSql = "DELETE FROM maxhanna.users WHERE id = @Id";
				MySqlCommand deleteCmd = new MySqlCommand(deleteSql, conn);
				deleteCmd.Parameters.AddWithValue("@Id", userId);

				int rowsAffected = await deleteCmd.ExecuteNonQueryAsync();
				await RemoveFromSitemapAsync(userId);

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
				_ = _log.Db("An error occurred while processing the DELETE request. " + ex.Message, userId, "USER", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}


		[HttpPost("/User/UpdateLastSeen", Name = "UpdateLastSeen")]
		public async Task<IActionResult> UpdateLastSeen([FromBody] int userId)
		{
			string? connectionString = _config?.GetValue<string>("ConnectionStrings:maxhanna");

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					// 1) Update users.last_seen to current UTC timestamp
					string updateUserSql = @"
					UPDATE maxhanna.users 
					SET last_seen = UTC_TIMESTAMP() 
					WHERE id = @UserId;";

					using (MySqlCommand cmd = new MySqlCommand(updateUserSql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);
						await cmd.ExecuteNonQueryAsync();
					}

					// 2) Compute and update streaks in user_login_streaks table using a single upsert.
					// We'll use UTC date for comparisons (date only)
					DateTime utcNow = DateTime.UtcNow.Date; // Date only (midnight UTC)

					string upsertSql = @"
						INSERT INTO maxhanna.user_login_streaks (user_id, last_seen_date, current_streak, longest_streak, created_at, updated_at)
						VALUES (@UserId, @LastSeenDate, 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
						ON DUPLICATE KEY UPDATE
						  current_streak = CASE
							WHEN DATEDIFF(@LastSeenDate, last_seen_date) = 0 THEN current_streak
							WHEN DATEDIFF(@LastSeenDate, last_seen_date) = 1 THEN current_streak + 1
							ELSE 1
						  END,
						  longest_streak = CASE
							WHEN DATEDIFF(@LastSeenDate, last_seen_date) = 1 THEN GREATEST(longest_streak, current_streak + 1)
							ELSE longest_streak
						  END,
						  last_seen_date = CASE WHEN DATEDIFF(@LastSeenDate, last_seen_date) = 0 THEN last_seen_date ELSE @LastSeenDate END,
						  updated_at = UTC_TIMESTAMP();";

					using (MySqlCommand upsertCmd = new MySqlCommand(upsertSql, conn))
					{
						upsertCmd.Parameters.AddWithValue("@UserId", userId);
						upsertCmd.Parameters.AddWithValue("@LastSeenDate", utcNow);
						await upsertCmd.ExecuteNonQueryAsync();
					}

					return Ok();
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the UpdateLastSeen request. " + ex.Message, userId, "USER", true);
					return StatusCode(500, "An error occurred while processing the UpdateLastSeen request.");
				}
				finally
				{
					conn.Close();
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
					IpApiResponse? data = JsonConvert.DeserializeObject<IpApiResponse>(jsonResponse);

					// Return IP and city
					var result = new
					{
						ip = data?.Query,  // Use explicit properties from the class
						city = data?.City,
						country = data?.Country
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

		private async Task DeleteUserFiles(int userId, MySqlConnection conn)
		{
			string username = string.Empty;
			string getUserSql = "SELECT username FROM maxhanna.users WHERE id = @UserId";
			using (var getUserCmd = new MySqlCommand(getUserSql, conn))
			{
				getUserCmd.Parameters.AddWithValue("@UserId", userId);
				var result = await getUserCmd.ExecuteScalarAsync();
				if (result != null)
				{
					username = result.ToString() ?? string.Empty;
				}
			}

			string selectFilesSql = "SELECT file_name, folder_path FROM maxhanna.file_uploads WHERE user_id = @UserId";
			MySqlCommand selectFilesCmd = new MySqlCommand(selectFilesSql, conn);
			selectFilesCmd.Parameters.AddWithValue("@UserId", userId);
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
			var tmpPath = Path.Combine(_baseTarget + "Users/", username);
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

		
		[HttpPost("/User/UpdateProfileBackgroundPicture", Name = "UpdateProfileBackgroundPicture")]
		public async Task<IActionResult> UpdateProfileBackgroundPicture([FromBody] DisplayPictureRequest request)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string checkUserSql = $@"
                    INSERT INTO maxhanna.user_display_pictures (user_id, tag_background_file_id)
                    VALUES (@userId, @fileId)
                    ON DUPLICATE KEY UPDATE tag_background_file_id = VALUES(tag_background_file_id);
                ";
				MySqlCommand updateCmd = new MySqlCommand(checkUserSql, conn);
				updateCmd.Parameters.AddWithValue("@userId", request.UserId);
				updateCmd.Parameters.AddWithValue("@fileId", request.FileId);

				await updateCmd.ExecuteNonQueryAsync();
				return Ok();
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the profile background picture POST request. " + ex.Message, request.UserId, "USER", true);
				return StatusCode(500, "An error occurred while processing the profile background picture request.");
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



		[HttpPost("/User/UpdateCompactness", Name = "UpdateCompactness")]
		public async Task<IActionResult> UpdateCompactness([FromBody] UpdateCompactnessRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string updateSql = @"
						INSERT INTO maxhanna.user_settings (user_id, compactness)
						VALUES (@userId, @compactness)
						ON DUPLICATE KEY UPDATE 
							compactness = VALUES(compactness);";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@compactness", request.Compactness.ToString());

					await updateCmd.ExecuteNonQueryAsync();

					return Ok(new { message = "Successfully updated Compactness setting." });
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update Compactness request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update compactness request.");
				}
				finally
				{
					conn.Close();
				}
			}
		}

		[HttpPost("/User/UpdateShowPostsFrom", Name = "UpdateShowPostsFrom")]
		public async Task<IActionResult> UpdateShowPostsFrom([FromBody] UpdateShowPostsFromRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();
					// Map enum to string values expected by DB
					string showPostsFromValue = request.ShowPostsFrom switch
					{
						ShowPostsFrom.Subscribed => "subscribed",
						ShowPostsFrom.Local => "local",
						ShowPostsFrom.Popular => "popular",
						ShowPostsFrom.All => "all",
						ShowPostsFrom.Oldest => "oldest",
						_ => "all"
					};

					string updateSql = @"
						INSERT INTO maxhanna.user_settings (user_id, show_posts_from)
						VALUES (@userId, @showPostsFrom)
						ON DUPLICATE KEY UPDATE 
							show_posts_from = VALUES(show_posts_from);";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@showPostsFrom", showPostsFromValue);

					await updateCmd.ExecuteNonQueryAsync();

					return Ok(new { message = "Successfully updated ShowPostsFrom setting." });
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update ShowPostsFrom request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update ShowPostsFrom request.");
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
                ON DUPLICATE KEY UPDATE notifications_enabled = VALUES(notifications_enabled),
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

		[HttpPost("/User/UpdateLastCharacterColor", Name = "UpdateLastCharacterColor")]
		public async Task<IActionResult> UpdateLastCharacterColor([FromBody] maxhanna.Server.Controllers.DataContracts.Users.UpdateLastCharacterColorRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string upsertSql = @"
                INSERT INTO maxhanna.user_settings (user_id, last_character_color)
                VALUES (@UserId, @Color)
                ON DUPLICATE KEY UPDATE last_character_color = VALUES(last_character_color);";

					MySqlCommand cmd = new MySqlCommand(upsertSql, conn);
					cmd.Parameters.AddWithValue("@UserId", request.UserId);
					cmd.Parameters.AddWithValue("@Color", request.Color ?? string.Empty);

					await cmd.ExecuteNonQueryAsync();

					return Ok("Updated");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while updating last character color. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while updating last character color.");
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
						SELECT 
							nsfw_enabled, 
							ghost_read, 
							compactness, 
							show_posts_from, 
							notifications_enabled, 
							last_character_name, 
							last_character_color, 
							show_hidden_files, 
							mute_sounds,
							IFNULL(mute_music_ender,0) AS mute_music_ender, 
							IFNULL(mute_sfx_ender,0) AS mute_sfx_ender,
							IFNULL(mute_music_emulator,0) AS mute_music_emulator, 
							IFNULL(mute_music_bones,0) AS mute_music_bones, 
							IFNULL(mute_sfx_bones,0) AS mute_sfx_bones
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
							userSettings.Compactness = reader.GetString("compactness") ?? "no";
							userSettings.ShowPostsFrom = reader.GetString("show_posts_from") ?? "all";
							userSettings.NotificationsEnabled = reader.IsDBNull("notifications_enabled") ? null : reader.GetInt32("notifications_enabled") == 1;
							userSettings.LastCharacterName = reader.IsDBNull(reader.GetOrdinal("last_character_name")) ? null : reader.GetString("last_character_name");
							userSettings.LastCharacterColor = reader.IsDBNull(reader.GetOrdinal("last_character_color")) ? null : reader.GetString("last_character_color");
							userSettings.ShowHiddenFiles = !reader.IsDBNull(reader.GetOrdinal("show_hidden_files")) && reader.GetInt32("show_hidden_files") == 1;
							userSettings.MuteSounds = !reader.IsDBNull(reader.GetOrdinal("mute_sounds")) && reader.GetInt32("mute_sounds") == 1;
							userSettings.MuteMusicEnder = !reader.IsDBNull(reader.GetOrdinal("mute_music_ender")) && reader.GetInt32("mute_music_ender") == 1;
							userSettings.MuteSfxEnder = !reader.IsDBNull(reader.GetOrdinal("mute_sfx_ender")) && reader.GetInt32("mute_sfx_ender") == 1;
							userSettings.MuteMusicEmulator = !reader.IsDBNull(reader.GetOrdinal("mute_music_emulator")) && reader.GetInt32("mute_music_emulator") == 1;
							userSettings.MuteSfxEmulator = !reader.IsDBNull(reader.GetOrdinal("mute_sfx_emulator")) && reader.GetInt32("mute_sfx_emulator") == 1;
							userSettings.MuteMusicBones = !reader.IsDBNull(reader.GetOrdinal("mute_music_bones")) && reader.GetInt32("mute_music_bones") == 1;
							userSettings.MuteSfxBones = !reader.IsDBNull(reader.GetOrdinal("mute_sfx_bones")) && reader.GetInt32("mute_sfx_bones") == 1;
						}
						else
						{
							// If user settings are not found, return a default value (NSFW disabled)
							userSettings.NsfwEnabled = false;
							userSettings.GhostReadEnabled = false;
							userSettings.Compactness = "no"; 
							userSettings.ShowPostsFrom = "all";
							userSettings.ShowHiddenFiles = false;
							userSettings.MuteSounds = false;
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

		[HttpPost("/User/UpdateShowHiddenFiles", Name = "UpdateShowHiddenFiles")]
		public async Task<IActionResult> UpdateShowHiddenFiles([FromBody] UpdateNsfwRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string updateSql = @"
                INSERT INTO maxhanna.user_settings (user_id, show_hidden_files)
                VALUES (@userId, @showHiddenFiles)
                ON DUPLICATE KEY UPDATE 
                    show_hidden_files = VALUES(show_hidden_files);";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@showHiddenFiles", request.IsAllowed ? 1 : 0);

					await updateCmd.ExecuteNonQueryAsync();

					return Ok("Successfully updated show_hidden_files setting.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update show_hidden_files POST request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update show_hidden_files request.");
				}
				finally
				{
					conn.Close();
				}
			}
		}

		[HttpPost("/User/UpdateMuteSounds", Name = "UpdateMuteSounds")]
		public async Task<IActionResult> UpdateMuteSounds([FromBody] UpdateNsfwRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string updateSql = @"
                INSERT INTO maxhanna.user_settings (user_id, mute_sounds)
                VALUES (@userId, @muteSounds)
                ON DUPLICATE KEY UPDATE 
                    mute_sounds = VALUES(mute_sounds);";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);
					updateCmd.Parameters.AddWithValue("@muteSounds", request.IsAllowed ? 1 : 0);

					await updateCmd.ExecuteNonQueryAsync();

					return Ok("Successfully updated mute_sounds setting.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the update mute_sounds POST request. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while processing the update mute_sounds request.");
				}
				finally
				{
					conn.Close();
				}
			}
		}

		[HttpPost("/User/UpdateComponentMute", Name = "UpdateComponentMute")]
		public async Task<IActionResult> UpdateComponentMute([FromBody] UpdateComponentMuteRequest request)
		{
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string? column = request?.Component?.ToLower() switch
					{
						"ender" => request.IsMusic ? "mute_music_ender" : "mute_sfx_ender",
						"emulator" => request.IsMusic ? "mute_music_emulator" : "mute_sfx_emulator",
						"bones" => request.IsMusic ? "mute_music_bones" : "mute_sfx_bones",
						null => null,
						_ => null
					};

					if (column == null) return BadRequest("Unknown component");

					string updateSql = $@"
					INSERT INTO maxhanna.user_settings (user_id, {column})
					VALUES (@userId, @value)
					ON DUPLICATE KEY UPDATE {column} = VALUES({column});";

					MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
					if (request != null)
					{
						updateCmd.Parameters.AddWithValue("@userId", request.UserId);
						updateCmd.Parameters.AddWithValue("@value", request.IsAllowed ? 1 : 0);
					}

					await updateCmd.ExecuteNonQueryAsync();
					return Ok("Successfully updated component mute setting.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing UpdateComponentMute. " + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while updating component mute setting.");
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
								string dbBackgroundColor = GetStringSafe(reader, "background_color");
								string dbComponentBackgroundColor = GetStringSafe(reader, "component_background_color");
								string dbSecondaryComponentBackgroundColor = GetStringSafe(reader, "secondary_component_background_color");
								string dbFontColor = GetStringSafe(reader, "font_color");
								string dbSecondaryFontColor = GetStringSafe(reader, "secondary_font_color");
								string dbThirdFontColor = GetStringSafe(reader, "third_font_color");
								string dbMainHighlightColor = GetStringSafe(reader, "main_highlight_color");
								string dbMainHighlightColorQuarterOpacity = GetStringSafe(reader, "main_highlight_color_quarter_opacity");
								string dbLinkColor = GetStringSafe(reader, "link_color");
								int? dbFontSize = GetNullableInt(reader, "font_size");
								string dbFontFamily = GetStringSafe(reader, "font_family");

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
								BackgroundImage = GetNullableInt(reader, "background_image"),
								BackgroundColor = GetStringSafe(reader, "background_color"),
								ComponentBackgroundColor = GetStringSafe(reader, "component_background_color"),
								SecondaryComponentBackgroundColor = GetStringSafe(reader, "secondary_component_background_color"),
								FontColor = GetStringSafe(reader, "font_color"),
								SecondaryFontColor = GetStringSafe(reader, "secondary_font_color"),
								ThirdFontColor = GetStringSafe(reader, "third_font_color"),
								MainHighlightColor = GetStringSafe(reader, "main_highlight_color"),
								MainHighlightColorQuarterOpacity = GetStringSafe(reader, "main_highlight_color_quarter_opacity"),
								LinkColor = GetStringSafe(reader, "link_color"),
								FontSize = GetIntSafe(reader, "font_size", 16),
								FontFamily = GetStringSafe(reader, "font_family"),
								Name = GetStringSafe(reader, "name") 
							};

							return Ok(theme);
						}
						else
						{
							return Ok(new { message = "No theme found for the user." });
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
								BackgroundImage = GetNullableInt(reader, "background_image"),
								BackgroundColor = GetStringSafe(reader, "background_color"),
								ComponentBackgroundColor = GetStringSafe(reader, "component_background_color"),
								SecondaryComponentBackgroundColor = GetStringSafe(reader, "secondary_component_background_color"),
								FontColor = GetStringSafe(reader, "font_color"),
								SecondaryFontColor = GetStringSafe(reader, "secondary_font_color"),
								ThirdFontColor = GetStringSafe(reader, "third_font_color"),
								MainHighlightColor = GetStringSafe(reader, "main_highlight_color"),
								MainHighlightColorQuarterOpacity = GetStringSafe(reader, "main_highlight_color_quarter_opacity"),
								LinkColor = GetStringSafe(reader, "link_color"),
								FontSize = GetIntSafe(reader, "font_size", 16),
								FontFamily = GetStringSafe(reader, "font_family"),
								Name = GetStringSafe(reader, "name") 
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
								BackgroundImage = GetNullableInt(reader, "background_image"),
								BackgroundColor = GetStringSafe(reader, "background_color"),
								ComponentBackgroundColor = GetStringSafe(reader, "component_background_color"),
								SecondaryComponentBackgroundColor = GetStringSafe(reader, "secondary_component_background_color"),
								FontColor = GetStringSafe(reader, "font_color"),
								SecondaryFontColor = GetStringSafe(reader, "secondary_font_color"),
								ThirdFontColor = GetStringSafe(reader, "third_font_color"),
								MainHighlightColor = GetStringSafe(reader, "main_highlight_color"),
								MainHighlightColorQuarterOpacity = GetStringSafe(reader, "main_highlight_color_quarter_opacity"),
								LinkColor = GetStringSafe(reader, "link_color"),
								FontSize = GetIntSafe(reader, "font_size", 16),
								FontFamily = GetStringSafe(reader, "font_family"),
								Name = GetStringSafe(reader, "name"),
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

		[HttpGet("/User/NewUsersToday", Name = "GetNewUsersToday")]
		public async Task<IActionResult> GetNewUsersToday()
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty);
			try
			{
				await conn.OpenAsync();

				string sql = @"
					SELECT 
						u.id, 
						u.username,
						u.last_seen,
						udp.file_id as display_file_id
					FROM maxhanna.users u 
					LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
					-- include users created in the last 24 hours (UTC) instead of strict date equality
					WHERE u.created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR);
				";

				using var cmd = new MySqlCommand(sql, conn);
				var users = new List<User>();
				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					var u = new User(
						reader.GetInt32("id"),
						reader["username"]?.ToString() ?? string.Empty,
						reader.IsDBNull(reader.GetOrdinal("display_file_id")) ? null : new FileEntry(reader.GetInt32("display_file_id"))
					);
					u.LastSeen = reader.IsDBNull(reader.GetOrdinal("last_seen")) ? null : reader.GetDateTime("last_seen");
					users.Add(u);
				}

				// Always return the list (may be empty). Client treats empty array as no users today.
				return Ok(users);
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error in GetNewUsersToday: " + ex.Message, null, "USER", true);
				return StatusCode(500, "An error occurred.");
			}
			finally
			{
				conn.Close();
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

					// Delete user�s selected theme from user_theme_selected
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
		[HttpPost("/User/Block", Name = "BlockUser")]
		public async Task<IActionResult> BlockUser([FromBody] BlockRequest request)
		{
			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					// Check if block relationship already exists
					string checkSql = @"
                SELECT COUNT(*) FROM maxhanna.user_blocks 
                WHERE user_id = @UserId AND blocked_user_id = @BlockedUserId;
            ";

					using (MySqlCommand checkCmd = new MySqlCommand(checkSql, conn))
					{
						checkCmd.Parameters.AddWithValue("@UserId", request.UserId);
						checkCmd.Parameters.AddWithValue("@BlockedUserId", request.BlockedUserId);

						long? existingCount = (long?)await checkCmd.ExecuteScalarAsync();
						if (existingCount > 0)
						{
							return Ok("User already blocked");
						}
					}

					// Insert new block relationship
					string insertSql = @"
                INSERT INTO maxhanna.user_blocks (user_id, blocked_user_id, created_at)
                VALUES (@UserId, @BlockedUserId, UTC_TIMESTAMP());
            ";

					using (MySqlCommand insertCmd = new MySqlCommand(insertSql, conn))
					{
						insertCmd.Parameters.AddWithValue("@UserId", request.UserId);
						insertCmd.Parameters.AddWithValue("@BlockedUserId", request.BlockedUserId);

						int rowsAffected = await insertCmd.ExecuteNonQueryAsync();
						if (rowsAffected == 1)
						{
							return Ok("User blocked successfully");
						}
						else
						{
							return StatusCode(500, "Failed to block user");
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error blocking user." + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while blocking user");
				}
			}
		}

		[HttpPost("/User/Unblock", Name = "UnblockUser")]
		public async Task<IActionResult> UnblockUser([FromBody] BlockRequest request)
		{
			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					string sql = @"
                DELETE FROM maxhanna.user_blocks 
                WHERE user_id = @UserId AND blocked_user_id = @BlockedUserId;
            ";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", request.UserId);
						cmd.Parameters.AddWithValue("@BlockedUserId", request.BlockedUserId);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();
						if (rowsAffected == 1)
						{
							return Ok("User unblocked successfully");
						}
						else
						{
							return NotFound("Block relationship not found");
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error unblocking user." + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while unblocking user");
				}
			}
		}

		[HttpPost("/User/IsUserBlocked", Name = "IsUserBlocked")]
		public async Task<IActionResult> IsUserBlocked([FromBody] BlockRequest request)
		{
			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					string sql = @"
                SELECT COUNT(*) FROM maxhanna.user_blocks 
                WHERE user_id = @UserId AND blocked_user_id = @BlockedUserId;
            ";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", request.UserId);
						cmd.Parameters.AddWithValue("@BlockedUserId", request.BlockedUserId);

						long? count = (long?)await cmd.ExecuteScalarAsync();
						return Ok(new { IsBlocked = count > 0 });
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error checking block status." + ex.Message, request.UserId, "USER", true);
					return StatusCode(500, "An error occurred while checking block status");
				}
			}
		}

		[HttpPost("/User/GetBlockedUsers", Name = "GetBlockedUsers")]
		public async Task<IActionResult> GetBlockedUsers([FromBody] int userId)
		{
			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					string sql = @"
                SELECT 
                    ub.blocked_user_id,
                    u.username,
                    udp.file_id,
                    ub.created_at AS blocked_at
                FROM maxhanna.user_blocks ub
                JOIN maxhanna.users u ON ub.blocked_user_id = u.id
                LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
                WHERE ub.user_id = @UserId
                ORDER BY ub.created_at DESC;
            ";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);

						var blockedUsers = new List<User>();
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								blockedUsers.Add(new User
								{
									Id = reader.GetInt32("blocked_user_id"),
									Username = reader.GetString("username"),
									DisplayPictureFile = reader.IsDBNull("file_id") ?
												null : new FileEntry(reader.GetInt32("file_id")),
								});
							}
						}

						return Ok(blockedUsers);
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error getting blocked users for user {userId}. " + ex.Message, userId, "USER", true);
					return StatusCode(500, "An error occurred while retrieving blocked users");
				}
			}
	  
		}


		public class BlockRequest
		{
			public int UserId { get; set; }
			public int BlockedUserId { get; set; }
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
						existingUrl.Parent?.Element(ns + "lastmod")?.SetValue(lastMod);
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

				sitemap?.Root?.Add(newUrlElement);

				sitemap?.Save(_sitemapPath);
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
		string GetStringSafe(IDataRecord reader, string columnName)
		{
			return reader[columnName] == DBNull.Value ? "" : reader[columnName]?.ToString()?.Trim() ?? "";
		}

		int? GetNullableInt(IDataRecord reader, string columnName)
		{
			return reader[columnName] == DBNull.Value ? (int?)null : Convert.ToInt32(reader[columnName]);
		}
		int GetIntSafe(IDataRecord reader, string columnName, int fallback = 0)
		{
			return reader[columnName] == DBNull.Value ? fallback : Convert.ToInt32(reader[columnName]);
		}
	}
}
public class IpApiResponse
{
	public string? Query { get; set; }  // This is the IP
	public string? City { get; set; }
	public string? Country { get; set; }
}