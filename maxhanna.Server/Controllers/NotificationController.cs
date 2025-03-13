using FirebaseAdmin.Messaging;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Notification;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Wordler;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class NotificationController : ControllerBase
	{
		private readonly ILogger<NotificationController> _logger;
		private readonly IConfiguration _config;

		public NotificationController(ILogger<NotificationController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
		}

		[HttpPost(Name = "GetNotifications")]
		public async Task<IActionResult> GetNotifications(User user)
		{
			_logger.LogInformation($"POST /Notification for user {user.Id}");
			List<UserNotification> notifications = new List<UserNotification>();
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();

					// SQL query to get the word of the day
					string sql = @"
                        SELECT n.*, u.username, udp.file_id as user_display_picture, su.username as from_user_name, sudp.file_id as sent_user_display_picture
                        FROM maxhanna.notifications n 
                        LEFT JOIN maxhanna.users u ON u.id = n.user_id
                        LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
                        LEFT JOIN maxhanna.users su on su.id = n.from_user_id
                        LEFT JOIN maxhanna.user_display_pictures sudp on sudp.user_id = n.from_user_id
                        WHERE n.user_id = @UserId
                        ORDER BY n.date DESC;";
					using (var command = new MySqlCommand(sql, connection))
					{

						command.Parameters.AddWithValue("@UserId", user.Id);

						try
						{
							using (var reader = await command.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									notifications.Add(MapReaderToNotification(reader));
								}
							}
						}
						catch (Exception ex)
						{
							_logger.LogError(ex, "Error retrieving notifications.");
							return StatusCode(500, "An error occurred while retrieving the notifications.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching the notifications.");
				return StatusCode(500, "An error occurred while fetching the notifications.");
			}
			return Ok(notifications);
		}

		private UserNotification MapReaderToNotification(MySqlDataReader reader)
		{
			int? displayPicId = reader.IsDBNull(reader.GetOrdinal("user_display_picture")) ? null : reader.GetInt32("user_display_picture");
			FileEntry? dpFileEntry = displayPicId != null ? new FileEntry() { Id = (Int32)(displayPicId) } : null;
			User tUser =
					new User(
							reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id"),
							reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString("username"),
							null, dpFileEntry,
							null, null, null);

			int? sentDisplayPicId = reader.IsDBNull(reader.GetOrdinal("sent_user_display_picture")) ? null : reader.GetInt32("sent_user_display_picture");
			FileEntry? sentDpFileEntry = sentDisplayPicId != null ? new FileEntry() { Id = (Int32)(sentDisplayPicId) } : null;
			User sentUser =
					new User(
							reader.IsDBNull(reader.GetOrdinal("from_user_id")) ? 0 : reader.GetInt32("from_user_id"),
							reader.IsDBNull(reader.GetOrdinal("from_user_name")) ? "Anonymous" : reader.GetString("from_user_name"),
							null, sentDpFileEntry,
							null, null, null);

			return new UserNotification
			{
				Id = reader.GetInt32("id"),
				Date = reader.GetDateTime("date"),
				User = tUser,
				FromUser = sentUser,
				ChatId = reader.IsDBNull(reader.GetOrdinal("chat_id")) ? null : reader.GetInt32("chat_id"),
				FileId = reader.IsDBNull(reader.GetOrdinal("file_id")) ? null : reader.GetInt32("file_id"),
				StoryId = reader.IsDBNull(reader.GetOrdinal("story_id")) ? null : reader.GetInt32("story_id"),
				CommentId = reader.IsDBNull(reader.GetOrdinal("comment_id")) ? null : reader.GetInt32("comment_id"),
				UserProfileId = reader.IsDBNull(reader.GetOrdinal("user_profile_id")) ? null : reader.GetInt32("user_profile_id"),
				Text = reader.IsDBNull(reader.GetOrdinal("text")) ? null : reader.GetString("text"),
				IsRead = reader.IsDBNull(reader.GetOrdinal("is_read")) ? null : reader.GetBoolean("is_read"),
			};
		}


		[HttpPost("/Notification/Delete", Name = "DeleteNotifications")]
		public async Task<IActionResult> DeleteNotifications([FromBody] DeleteNotificationRequest req)
		{
			_logger.LogInformation($"POST /Notification/Delete ");
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();

					string sql = $@"
                        DELETE FROM maxhanna.notifications WHERE user_id = @UserId
                        {(req.NotificationId != null ? " AND id = @NotificationId LIMIT 1" : "")};
                    ";

					using (var command = new MySqlCommand(sql, connection))
					{
						command.Parameters.AddWithValue("@UserId", req.User.Id);
						if (req.NotificationId != null)
						{
							command.Parameters.AddWithValue("@NotificationId", req.NotificationId);
						}

						await command.ExecuteNonQueryAsync();
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while deleting the notifications.");
				return StatusCode(500, "An error occurred while deleting the notifications.");
			}
			return Ok(req.NotificationId != null ? "Notification deleted." : "All notifications deleted.");
		}


		[HttpPost("/Notification/Read", Name = "ReadNotifications")]
		public async Task<IActionResult> ReadNotifications([FromBody] ReadNotificationRequest req)
		{
			_logger.LogInformation($"POST /Notification/Read");
			List<UserNotification> notifications = new List<UserNotification>();
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					string sql = "UPDATE maxhanna.notifications SET is_read = 1 WHERE user_id = @UserId";

					List<MySqlParameter> parameters = new List<MySqlParameter> {
							new MySqlParameter("@UserId", req.User.Id)
					};

					if (req.NotificationIds != null && req.NotificationIds.Length > 0)
					{
						// Create parameter placeholders like @id0, @id1, @id2, ...
						var idPlaceholders = req.NotificationIds
								.Select((id, index) => $"@id{index}")
								.ToArray();

						sql += $" AND id IN ({string.Join(",", idPlaceholders)})";

						// Add parameters for each notification ID
						for (int i = 0; i < req.NotificationIds.Length; i++)
						{
							parameters.Add(new MySqlParameter($"@id{i}", req.NotificationIds[i]));
						}
					}

					sql += ";";

					using (var command = new MySqlCommand(sql, connection))
					{
						command.Parameters.AddRange(parameters.ToArray());
						await command.ExecuteNonQueryAsync();
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while deleting the notifications.");
				return StatusCode(500, "An error occurred while deleting the notifications.");
			}

			return Ok(req.NotificationIds != null ? "Notification changed." : "All notifications changed.");
		}


		[HttpPost("/Notification/UnRead", Name = "UnReadNotifications")]
		public async Task<IActionResult> UnReadNotifications([FromBody] ReadNotificationRequest req)
		{
			_logger.LogInformation($"POST /Notification/UnRead");
			List<UserNotification> notifications = new List<UserNotification>();
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					string sql = "UPDATE maxhanna.notifications SET is_read = 0 WHERE user_id = @UserId";

					List<MySqlParameter> parameters = new List<MySqlParameter> {
							new MySqlParameter("@UserId", req.User.Id)
					};

					if (req.NotificationIds != null && req.NotificationIds.Length > 0)
					{
						// Create parameter placeholders like @id0, @id1, @id2, ...
						var idPlaceholders = req.NotificationIds
								.Select((id, index) => $"@id{index}")
								.ToArray();

						sql += $" AND id IN ({string.Join(",", idPlaceholders)})";

						// Add parameters for each notification ID
						for (int i = 0; i < req.NotificationIds.Length; i++)
						{
							parameters.Add(new MySqlParameter($"@id{i}", req.NotificationIds[i]));
						}
					}

					sql += ";";

					using (var command = new MySqlCommand(sql, connection))
					{
						command.Parameters.AddRange(parameters.ToArray());
						await command.ExecuteNonQueryAsync();
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while deleting the notifications.");
				return StatusCode(500, "An error occurred while deleting the notifications.");
			}

			return Ok(req.NotificationIds != null ? "Notification changed." : "All notifications changed.");
		}



		[HttpPost("/Notification/Subscribe", Name = "SubscribeToNotifications")]
		public async Task<IActionResult> SubscribeToNotifications([FromBody] SubscribeToNotificationRequest req)
		{
			_logger.LogInformation($"POST /Notification/Subscribe called with user: {req.User.Id}, topic: {req.Topic}");

			if (string.IsNullOrEmpty(req.Token) || string.IsNullOrEmpty(req.Topic))
			{
				return BadRequest("Token and Topic are required.");
			}

			try
			{
				// Subscribe the token to the topic
				var response = await FirebaseMessaging.DefaultInstance.SubscribeToTopicAsync(
						new List<string> { req.Token },
						req.Topic
				);

				_logger.LogInformation($"Successfully subscribed to topic {req.Topic}: {response.SuccessCount} success(es), {response.FailureCount} failure(s). Token Used : {req.Token} ");

				return Ok(new
				{
					Message = $"Successfully subscribed to topic '{req.Topic}'",
					SuccessCount = response.SuccessCount,
					FailureCount = response.FailureCount,
					Errors = response.Errors
				});
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while subscribing to notifications.");
				return StatusCode(500, "An error occurred while subscribing to notifications.");
			}
		} 

		[HttpPost("/Notification/CreateNotifications", Name = "CreateNotifications")]
		public async Task<IActionResult> CreateNotifications([FromBody] NotificationRequest request)
		{
			_logger.LogInformation($"POST /Notification/CreateNotifications");
			IActionResult? canSendRes = CanSendNotification(request);
			if (canSendRes != null) { return canSendRes; }

			bool sendFirebaseNotification = true;
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var conn = new MySqlConnection(connectionString))
			{
				await conn.OpenAsync();

				if (request.CommentId != null)
				{
					// Fetch parent comment to get the associated file_id or story_id
					string parentQuery = @"
						SELECT file_id, story_id 
						FROM maxhanna.comments 
						WHERE id = @comment_id 
						LIMIT 1;";

					using (var parentCmd = new MySqlCommand(parentQuery, conn))
					{
						parentCmd.Parameters.AddWithValue("@comment_id", request.CommentId);

						using (var reader = await parentCmd.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								request.FileId = reader["file_id"] as int?;
								request.StoryId = reader["story_id"] as int?;
							}
						}
					}

					Console.WriteLine($"Resolved comment parent: FileID={request.FileId}, StoryID={request.StoryId}");
				}

				string notificationSql = "";
				string? targetColumn = request.FileId != null ? "file_id" :
															 request.StoryId != null ? "story_id" :
															 request.CommentId != null ? "comment_id" :
															 null;

				if (targetColumn != null) //Insert notification for Files, Stories or Comments here
				{
					string targetTable = targetColumn == "file_id" ? "file_uploads" :
															 targetColumn == "story_id" ? "stories" : "comments";

					Console.WriteLine($"Sending notif on target column : {targetColumn}");
					notificationSql = $@"
						INSERT INTO maxhanna.notifications (user_id, from_user_id, {targetColumn}, text, date)
						VALUES ((SELECT user_id FROM maxhanna.{targetTable} WHERE id = @{targetColumn}), @user_id, @{targetColumn}, @comment, UTC_TIMESTAMP());";

					if (targetColumn == "file_id")
					{
						notificationSql += @"
							INSERT INTO maxhanna.notifications (user_id, from_user_id, file_id, text)
							SELECT DISTINCT user_id, @user_id, @file_id, @comment
							FROM maxhanna.comments
							WHERE file_id = @file_id AND user_id <> @user_id;";
					}

					using (var cmd = new MySqlCommand(notificationSql, conn))
					{
						cmd.Parameters.AddWithValue("@user_id", request.FromUser?.Id ?? 0);
						cmd.Parameters.AddWithValue("@comment", request.Message);

						if (request.FileId != null)
						{
							cmd.Parameters.AddWithValue("@file_id", request.FileId);
						}
						else if (request.StoryId != null)
						{
							cmd.Parameters.AddWithValue("@story_id", request.StoryId);
						}
						else if (request.CommentId != null)
						{
							cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
						}

						await cmd.ExecuteNonQueryAsync();
					}

				}
				else if (request.UserProfileId != null) // Insert notification for User Profiles here
				{
					Console.WriteLine($"Sending notif on UserProfileId : {request.UserProfileId}");
					notificationSql = $@"
						INSERT INTO maxhanna.notifications (user_id, from_user_id, user_profile_id, text, date)
						VALUES (@to_user, @from_user, @user_profile_id, @comment, UTC_TIMESTAMP());";
					using (var cmd = new MySqlCommand(notificationSql, conn))
					{
						cmd.Parameters.AddWithValue("@to_user", request.ToUser.FirstOrDefault()?.Id ?? 0);
						cmd.Parameters.AddWithValue("@from_user", request.FromUser?.Id ?? 0);
						cmd.Parameters.AddWithValue("@user_profile_id", request.ToUser.FirstOrDefault()?.Id ?? 0);
						cmd.Parameters.AddWithValue("@comment", request.Message);
						await cmd.ExecuteNonQueryAsync();
					}
				}
				else if (request.ChatId != null) // Insert notification for chat messages here
				{
					Console.WriteLine($"Sending notif on ChatId : {request.ChatId}");
					foreach (var receiverUser in request.ToUser)
					{
						if (receiverUser.Id == (request.FromUser?.Id ?? 0))
						{
							continue;
						}
						string checkSql = @"
							SELECT COUNT(*) 
							FROM maxhanna.notifications
							WHERE user_id = @Receiver
								AND chat_id = @ChatId
								AND chat_id IS NOT NULL
								AND date >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE;";

						string updateNotificationSql = @"
							UPDATE maxhanna.notifications
							SET text = CASE
															WHEN LENGTH(text) <= 250 THEN CONCAT(text, ', ', @Content)
															ELSE text
													END,
									date = UTC_TIMESTAMP()
							WHERE user_id = @Receiver
								AND chat_id = @ChatId
								AND chat_id IS NOT NULL
								AND date >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE;";


						string insertNotificationSql = @"
							INSERT INTO maxhanna.notifications
									(user_id, from_user_id, chat_id, text, date)
							VALUES
									(@Receiver, @Sender, @ChatId, @Content, UTC_TIMESTAMP());";

						using (var checkCommand = new MySqlCommand(checkSql, conn))
						{
							checkCommand.Parameters.AddWithValue("@Sender", request.FromUser?.Id ?? 0);
							checkCommand.Parameters.AddWithValue("@Receiver", receiverUser.Id);
							checkCommand.Parameters.AddWithValue("@ChatId", request.ChatId);
							checkCommand.Parameters.AddWithValue("@Content", request.Message);
							Console.WriteLine("Checking to see if notif exists");
							var count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync());

							Console.WriteLine("NOTIF Count : " + count);
							if (count > 0)
							{
								sendFirebaseNotification = false;
								using (var updateCommand = new MySqlCommand(updateNotificationSql, conn))
								{
									updateCommand.Parameters.AddWithValue("@Sender", request.FromUser?.Id ?? 0);
									updateCommand.Parameters.AddWithValue("@Receiver", receiverUser.Id);
									updateCommand.Parameters.AddWithValue("@Content", request.Message);
									updateCommand.Parameters.AddWithValue("@ChatId", request.ChatId);

									await updateCommand.ExecuteNonQueryAsync();
								}
							}
							else
							{
								using (var insertCommand = new MySqlCommand(insertNotificationSql, conn))
								{
									insertCommand.Parameters.AddWithValue("@Sender", request.FromUser?.Id ?? 0);
									insertCommand.Parameters.AddWithValue("@Receiver", receiverUser.Id);
									insertCommand.Parameters.AddWithValue("@Content", request.Message);
									insertCommand.Parameters.AddWithValue("@ChatId", request.ChatId);

									Console.WriteLine($"inserted NOTIF {request.FromUser?.Id ?? 0} {receiverUser.Id} {request.Message} {request.ChatId}");
									await insertCommand.ExecuteNonQueryAsync();
								}
							}
						}
					}
				}
				else if (request.Message != null)
				{
					foreach (var receiverUser in request.ToUser)
					{
						if (receiverUser.Id == (request.FromUser?.Id ?? 0))
						{
							continue;
						}

						Console.WriteLine($"Checking for existing generic notifications");

						string checkSql = @"
							SELECT COUNT(*) 
							FROM maxhanna.notifications
							WHERE user_id = @Receiver
								AND from_user_id = @Sender
								AND chat_id IS NULL
								AND file_id IS NULL
								AND story_id IS NULL
								AND comment_id IS NULL
								AND user_profile_id IS NULL
								AND date >= NOW() - INTERVAL 10 MINUTE;";

						string updateNotificationSql = @"
							UPDATE maxhanna.notifications
							SET text = CASE
									WHEN LENGTH(text) <= 250 THEN CONCAT(text, ', ', @Content)
									ELSE text
							END,
							date = NOW()
							WHERE user_id = @Receiver
								AND from_user_id = @Sender
								AND chat_id IS NULL
								AND file_id IS NULL
								AND story_id IS NULL
								AND comment_id IS NULL
								AND user_profile_id IS NULL
								AND date >= NOW() - INTERVAL 10 MINUTE;";

						string insertNotificationSql = @"
							INSERT INTO maxhanna.notifications (user_id, from_user_id, text)
							VALUES (@Receiver, @Sender, @Content);";

						using (var checkCommand = new MySqlCommand(checkSql, conn))
						{
							checkCommand.Parameters.AddWithValue("@Sender", request.FromUser?.Id ?? 0);
							checkCommand.Parameters.AddWithValue("@Receiver", receiverUser.Id);
							checkCommand.Parameters.AddWithValue("@Content", request.Message);

							int count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync());

							Console.WriteLine("NOTIF Count (generic): " + count);

							if (count > 0)
							{
								// Update existing notification
								using (var updateCommand = new MySqlCommand(updateNotificationSql, conn))
								{
									updateCommand.Parameters.AddWithValue("@Sender", request.FromUser?.Id ?? 0);
									updateCommand.Parameters.AddWithValue("@Receiver", receiverUser.Id);
									updateCommand.Parameters.AddWithValue("@Content", request.Message);
									sendFirebaseNotification = false;
									await updateCommand.ExecuteNonQueryAsync();
								}
							}
							else
							{
								// Insert new notification
								using (var insertCommand = new MySqlCommand(insertNotificationSql, conn))
								{
									insertCommand.Parameters.AddWithValue("@Sender", request.FromUser?.Id ?? 0);
									insertCommand.Parameters.AddWithValue("@Receiver", receiverUser.Id);
									insertCommand.Parameters.AddWithValue("@Content", request.Message);

									Console.WriteLine($"Inserted NOTIF {request.FromUser?.Id ?? 0} {receiverUser.Id} {request.Message}");
									await insertCommand.ExecuteNonQueryAsync();
								}
							}
						}
					}
				}
			}

				//Notify with firebase
			if (sendFirebaseNotification)
			{
				SendFirebaseNotifications(request);
			}

			return Ok("Notification(s) Created");
		}

		private async Task SendFirebaseNotifications(NotificationRequest request)
		{
			var tmpMessage = request.Message ?? "Notification from Bughosted.com";
			var usersWithoutAnon = request.ToUser.Where(x => x.Id != 0).ToList();

			foreach (User tmpUser in usersWithoutAnon)
			{
				if (tmpUser.Id == request.FromUser?.Id) continue;

				try
				{
					var message = new Message()
					{
						Notification = new FirebaseAdmin.Messaging.Notification()
						{
							Title = $"{tmpUser.Username}, Notification from {(request.FromUser?.Username ?? "Anonymous")}",
							Body = tmpMessage,
							ImageUrl = "https://www.bughosted.com/assets/logo.jpg"
						},
						Data = new Dictionary<string, string>
						{ 
                { "url", "https://bughosted.com" }
						},
						Topic = "notification" + tmpUser.Id
					};

					string response = await FirebaseMessaging.DefaultInstance.SendAsync(message);
					Console.WriteLine($"Successfully sent message to {tmpUser.Id}: {response}");
				}
				catch (Exception ex)
				{
					_logger.LogError(ex, "An error occurred while sending Firebase notifications.");
				}
			}
		}


		private IActionResult? CanSendNotification(NotificationRequest request)
		{
			if ((request.FileId != null && request.StoryId != null))
			{
				string message = "Both file_id and story_id cannot be provided at the same time.";
				_logger.LogInformation(message);
				return BadRequest(message);
			}
			else if (request.FileId == 0 && request.StoryId == 0)
			{
				string message = "Both FileId and StoryId cannot be zero.";
				_logger.LogInformation(message);
				return BadRequest(message);
			}
			else if (request.ToUser.Length == 1 && request.ToUser[0].Id == 0)
			{
				string message = "Can not send a notification to anonymous.";
				_logger.LogInformation(message);
				return BadRequest(message);
			}
			else if (request.ToUser.Length == 1 && request.ToUser[0].Id == request.FromUser.Id)
			{
				string message = "Can not send a notification to yourself.";
				_logger.LogInformation(message);
				return BadRequest(message);
			}

			return null;
		}
	}
}
