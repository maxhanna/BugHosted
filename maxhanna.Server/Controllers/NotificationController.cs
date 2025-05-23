using FirebaseAdmin.Messaging;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Notification;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Wordler;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.RegularExpressions;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class NotificationController : ControllerBase
	{
		private Log _log;
		private readonly IConfiguration _config;

		public NotificationController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost(Name = "GetNotifications")]
		public async Task<IActionResult> GetNotifications([FromBody] int userId)
		{
			List<UserNotification> notifications = new List<UserNotification>();
			//_ = _log.Db("Retrieving notifications for userId : " + userId, userId, "NOTIFICATION", true);
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

						command.Parameters.AddWithValue("@UserId", userId);

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
							_ = _log.Db("Error retrieving notifications. " + ex.Message, userId, "NOTIFICATION", true);
							return StatusCode(500, "An error occurred while retrieving the notifications.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching the notifications. " + ex.Message, userId, "NOTIFICATION", true);
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
						command.Parameters.AddWithValue("@UserId", req.UserId);
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
				_ = _log.Db("An error occurred while deleting the notifications. " + ex.Message, req.UserId, "NOTIFICATION", true);
				return StatusCode(500, "An error occurred while deleting the notifications.");
			}
			return Ok(req.NotificationId != null ? "Notification deleted." : "All notifications deleted.");
		}


		[HttpPost("/Notification/Read", Name = "ReadNotifications")]
		public async Task<IActionResult> ReadNotifications([FromBody] ReadNotificationRequest req)
		{
			List<UserNotification> notifications = new List<UserNotification>();
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					string sql = "UPDATE maxhanna.notifications SET is_read = 1 WHERE user_id = @UserId";

					List<MySqlParameter> parameters = new List<MySqlParameter> {
							new MySqlParameter("@UserId", req.UserId)
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
				_ = _log.Db("An error occurred while deleting the notifications. " + ex.Message, req.UserId, "NOTIFICATION", true);
				return StatusCode(500, "An error occurred while deleting the notifications.");
			}

			return Ok(req.NotificationIds != null ? "Notification changed." : "All notifications changed.");
		}


		[HttpPost("/Notification/UnRead", Name = "UnReadNotifications")]
		public async Task<IActionResult> UnReadNotifications([FromBody] ReadNotificationRequest req)
		{
			List<UserNotification> notifications = new List<UserNotification>();
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					string sql = "UPDATE maxhanna.notifications SET is_read = 0 WHERE user_id = @UserId";

					List<MySqlParameter> parameters = new List<MySqlParameter> {
							new MySqlParameter("@UserId", req.UserId)
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
				_ = _log.Db("An error occurred while deleting the notifications. " + ex.Message, req.UserId, "NOTIFICATION", true);
				return StatusCode(500, "An error occurred while deleting the notifications.");
			}

			return Ok(req.NotificationIds != null ? "Notification changed." : "All notifications changed.");
		}



		[HttpPost("/Notification/Subscribe", Name = "SubscribeToNotifications")]
		public async Task<IActionResult> SubscribeToNotifications([FromBody] SubscribeToNotificationRequest req)
		{
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

				_ = _log.Db($"Successfully subscribed to topic {req.Topic}: {response.SuccessCount} success(es), {response.FailureCount} failure(s). Token Used : {req.Token}", req.UserId, "NOTIFICATION");

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
				_ = _log.Db("An error occurred while subscribing to notifications. " + ex.Message, req.UserId, "NOTIFICATION", true);
				return StatusCode(500, "An error occurred while subscribing to notifications.");
			}
		}

		[HttpPost("/Notification/CreateNotifications", Name = "CreateNotifications")]
		public async Task<IActionResult> CreateNotifications([FromBody] NotificationRequest request)
		{
			IActionResult? canSendRes = CanSendNotification(request);
			if (canSendRes != null) { return canSendRes; }


			var validRecipients = new List<int>();
			foreach (var recipientId in request.ToUserIds)
			{
				if (await CanUserNotifyAsync(request.FromUserId, recipientId))
				{
					validRecipients.Add(recipientId);
				}
				else
				{
					_ = _log.Db($"Skipping notification to {recipientId} - notifications blocked", request.FromUserId, "NOTIFICATION", outputToConsole: true);
				}
			}

			// If no valid recipients remain, return early
			if (!validRecipients.Any())
			{
				_ = _log.Db($"Skipping notification - no valid recipients to notify.", request.FromUserId, "NOTIFICATION", outputToConsole: true);
				return Ok("No valid recipients - notifications blocked");
			}

			// Replace with filtered list
			request.ToUserIds = validRecipients.ToArray();

			//Console.WriteLine("Creating notifications for userId : " + request.FromUserId);
			bool sendFirebaseNotification = true;
			request.Message = RemoveQuotedBlocks(request.Message);

			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var conn = new MySqlConnection(connectionString))
			{
				await conn.OpenAsync();
				await UpdateLastSeen(conn, request);
				await ResolveParentCommentAsync(conn, request);
				if (await TryResolveStoryNotification(conn, request))
				{
					sendFirebaseNotification = true;
				}
				if (await TryResolveFileNotification(conn, request))
				{
					sendFirebaseNotification = true;
				}
				if (await TryResolveCommentNotification(conn, request))
				{
					sendFirebaseNotification = true;
				}
				if (await TryResolveProfileNotification(conn, request))
				{
					sendFirebaseNotification = true;
				}
				if (await TryResolveChatNotification(conn, request))
				{
					sendFirebaseNotification = true;
				}
				if (!sendFirebaseNotification && request.Message != null)
				{
					if (await TryResolveGenericMessageNotification(conn, request))
					{
						sendFirebaseNotification = true;
					}
				}
			}
			if (sendFirebaseNotification)
			{
				_ = SendFirebaseNotifications(request);
			}

			return Ok("Notification(s) Created");
		}

		[HttpPost("/Notification/StopNotifications", Name = "StopNotifications")]
		public async Task<IActionResult> StopNotifications([FromBody] StopNotificationsRequest request)
		{
			//_ = _log.Db($"POST /Chat/SendMessage from user: {request.Sender?.Id} to chatId: {request.ChatId} with {request.Files?.Count ?? 0} # of files", request.Sender?.Id, "CHAT");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();


				string sql = "INSERT INTO maxhanna.user_prevent_notification (user_id, from_user_id, timestamp) VALUES (@UserId, @FromId, UTC_TIMESTAMP())";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", request.UserId);
				cmd.Parameters.AddWithValue("@FromId", request.FromUserId);

				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				return Ok(rowsAffected);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request for StopNotifications. " + ex.Message, request.UserId, "CHAT");
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}


		[HttpPost("/Notification/AllowNotifications", Name = "AllowNotifications")]
		public async Task<IActionResult> AllowNotifications([FromBody] StopNotificationsRequest request)
		{
			//_ = _log.Db($"POST /Chat/SendMessage from user: {request.Sender?.Id} to chatId: {request.ChatId} with {request.Files?.Count ?? 0} # of files", request.Sender?.Id, "CHAT");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();


				string sql = "DELETE FROM maxhanna.user_prevent_notification WHERE user_id = @UserId AND from_user_id = @FromUserId LIMIT 1;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", request.UserId);
				cmd.Parameters.AddWithValue("@FromUserId", request.FromUserId);

				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				return Ok(rowsAffected);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request for AllowNotifications. " + ex.Message, request.UserId, "CHAT");
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/Notification/GetStoppedNotifications")]
		public async Task<IActionResult> GetStoppedNotifications([FromBody] int userId)
		{
			//_ = _log.Db("Fetching stopped notifications: " + userId, userId, "NOTIFICATION", true);

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql = @"
					SELECT from_user_id 
					FROM maxhanna.user_prevent_notification 
					WHERE user_id = @UserId
					ORDER BY timestamp DESC";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", userId);

				using var reader = await cmd.ExecuteReaderAsync();

				List<int> mutedUserIds = new List<int>();
				while (await reader.ReadAsync())
				{
					mutedUserIds.Add(reader.GetInt32("from_user_id"));
				}

				return Ok(mutedUserIds);
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error fetching stopped notifications: " + ex.Message, userId, "NOTIFICATION", true);
				return StatusCode(500, "Error fetching muted users");
			}
			finally
			{
				conn.Close();
			}
		}
		public async Task<bool> CanUserNotifyAsync(int senderId, int recipientId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"
					SELECT COUNT(*) 
					FROM maxhanna.user_prevent_notification 
					WHERE user_id = @RecipientId 
					AND from_user_id = @SenderId
					LIMIT 1";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@RecipientId", recipientId);
				cmd.Parameters.AddWithValue("@SenderId", senderId);

				long? count = (long?)await cmd.ExecuteScalarAsync();
				return count == 0; // Returns true if no blocking record exists (can notify)
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error checking notification permission: {ex.Message}", recipientId, "NOTIFICATION");
				return true; // Default to allowing notifications if there's an error
			}
			finally
			{
				await conn.CloseAsync();
			}
		}
		private async Task<bool> ResolveParentCommentAsync(MySqlConnection conn, NotificationRequest request)
		{
			if (request.CommentId == null) return false;

			string query = "SELECT file_id, story_id FROM maxhanna.comments WHERE id = @comment_id LIMIT 1;";
			using var cmd = new MySqlCommand(query, conn);
			cmd.Parameters.AddWithValue("@comment_id", request.CommentId);

			using var reader = await cmd.ExecuteReaderAsync();
			if (await reader.ReadAsync())
			{
				request.FileId = reader["file_id"] as int?;
				request.StoryId = reader["story_id"] as int?;
			}
			return true;
		}
		private async Task<bool> TryResolveStoryNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.StoryId == null)
			{
				//_ = _log.Db("StoryId is null.", request.FromUserId, "NOTIFICATION", true);
				return false;
			}
			if (request.ToUserIds == null || !request.ToUserIds.Any())
			{
				_ = _log.Db("No valid ToUserIds provided.", request.FromUserId, "NOTIFICATION", false);
				return false;
			}

			_ = _log.Db($"TryResolveStoryNotification: StoryId={request.StoryId}, ToUserIds={string.Join(",", request.ToUserIds)}, FromUserId={request.FromUserId}, Message={request.Message}, UserProfileId={request.UserProfileId}", request.FromUserId, "NOTIFICATION", false);

			try
			{
				// Verify story exists
				string checkStorySql = "SELECT COUNT(*) FROM maxhanna.stories WHERE id = @storyId";
				using (var checkCmd = new MySqlCommand(checkStorySql, conn))
				{
					checkCmd.Parameters.AddWithValue("@storyId", request.StoryId);
					long? count = (long?)await checkCmd.ExecuteScalarAsync();
					if (count == 0)
					{
						_ = _log.Db($"Story {request.StoryId} does not exist.", request.FromUserId, "NOTIFICATION", true);
						return false;
					}
				}

				// Collect unique recipient user IDs
				HashSet<int> recipientUserIds = new HashSet<int>(request.ToUserIds.Where(id => id != request.FromUserId));

				// Get story owner and commenters in a single query to avoid duplicates
				string recipientsSql = @"
					SELECT user_id FROM maxhanna.stories WHERE id = @storyId AND user_id != @fromUserId
					UNION
					SELECT DISTINCT user_id FROM maxhanna.comments WHERE story_id = @storyId AND user_id != @fromUserId";
				using (var recipientsCmd = new MySqlCommand(recipientsSql, conn))
				{ 
					recipientsCmd.Parameters.AddWithValue("@storyId", request.StoryId);
					recipientsCmd.Parameters.AddWithValue("@fromUserId", request.FromUserId);
					using (var reader = await recipientsCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							recipientUserIds.Add(reader.GetInt32("user_id"));
						}
					}
				}

				_ = _log.Db($"Unique recipient user IDs: {string.Join(",", recipientUserIds)}", request.FromUserId, "NOTIFICATION", false);

				if (!recipientUserIds.Any())
				{
					_ = _log.Db("No unique recipients found after deduplication.", request.FromUserId, "NOTIFICATION", false);
					return false;
				}

				// First query: Notify story owner and commenters
				string firstQuerySql = @"
					INSERT INTO maxhanna.notifications (user_id, from_user_id, story_id, text, date, user_profile_id)
					SELECT DISTINCT user_id, @from_user_id, @story_id, @comment, UTC_TIMESTAMP(), @user_profile_id
					FROM (
						SELECT user_id FROM maxhanna.stories WHERE id = @story_id AND user_id != @from_user_id
						UNION
						SELECT user_id FROM maxhanna.comments WHERE story_id = @story_id AND user_id != @from_user_id
					) AS recipients
					WHERE user_id IN ({0});";

				int firstQueryRowsAffected = 0;
				HashSet<int> notifiedUserIds = new HashSet<int>();
				if (recipientUserIds.Any())
				{
					var placeholders = string.Join(",", recipientUserIds.Select((_, i) => $"@user_id{i}"));
					firstQuerySql = string.Format(firstQuerySql, placeholders);
					using (var firstCmd = new MySqlCommand(firstQuerySql, conn))
					{
						firstCmd.Parameters.AddWithValue("@from_user_id", request.FromUserId);
						firstCmd.Parameters.AddWithValue("@comment", request.Message ?? (object)DBNull.Value);
						firstCmd.Parameters.AddWithValue("@story_id", request.StoryId);
						firstCmd.Parameters.AddWithValue("@user_profile_id", request.UserProfileId ?? (object)DBNull.Value);
						for (int i = 0; i < recipientUserIds.Count; i++)
						{
							firstCmd.Parameters.AddWithValue($"@user_id{i}", recipientUserIds.ElementAt(i));
						}

						// Log parameters for debugging
						_ = _log.Db($"First query parameters: from_user_id={request.FromUserId}, story_id={request.StoryId}, user_ids={string.Join(",", recipientUserIds)}", request.FromUserId, "NOTIFICATION", false);

						try
						{
							firstQueryRowsAffected = await firstCmd.ExecuteNonQueryAsync();
							_ = _log.Db($"First query inserted {firstQueryRowsAffected} notifications for story {request.StoryId}", request.FromUserId, "NOTIFICATION", false);

							// Track notified users
							string notifiedSql = @"
								SELECT DISTINCT user_id
								FROM maxhanna.notifications
								WHERE story_id = @story_id AND from_user_id = @from_user_id
								AND date >= UTC_TIMESTAMP() - INTERVAL 1 SECOND";
							using (var notifiedCmd = new MySqlCommand(notifiedSql, conn))
							{
								notifiedCmd.Parameters.AddWithValue("@story_id", request.StoryId);
								notifiedCmd.Parameters.AddWithValue("@from_user_id", request.FromUserId);
								using (var reader = await notifiedCmd.ExecuteReaderAsync())
								{
									while (await reader.ReadAsync())
									{
										notifiedUserIds.Add(reader.GetInt32("user_id"));
									}
								}
							}
							_ = _log.Db($"Notified user IDs after first query: {string.Join(",", notifiedUserIds)}", request.FromUserId, "NOTIFICATION", false);
						}
						catch (Exception ex)
						{
							_ = _log.Db($"First query failed: {ex.Message}", request.FromUserId, "NOTIFICATION", true);
							return false; // Fail fast if the first query fails
						}
					}
				}

				// Second query: Notify remaining mentioned users (ToUserIds) not yet notified
				string secondQuerySql = @"
					INSERT INTO maxhanna.notifications (user_id, from_user_id, story_id, text, date, user_profile_id)
					VALUES (@to_user_id, @from_user_id, @story_id, @comment, UTC_TIMESTAMP(), @user_profile_id);";

				int secondQueryRowsAffected = 0;
				foreach (var toUserId in request.ToUserIds.Distinct().Where(id => id != request.FromUserId && !notifiedUserIds.Contains(id)))
				{
					using (var secondCmd = new MySqlCommand(secondQuerySql, conn))
					{
						secondCmd.Parameters.AddWithValue("@to_user_id", toUserId);
						secondCmd.Parameters.AddWithValue("@from_user_id", request.FromUserId);
						secondCmd.Parameters.AddWithValue("@comment", request.Message ?? (object)DBNull.Value);
						secondCmd.Parameters.AddWithValue("@story_id", request.StoryId);
						secondCmd.Parameters.AddWithValue("@user_profile_id", request.UserProfileId ?? (object)DBNull.Value);

						try
						{
							int rowsAffected = await secondCmd.ExecuteNonQueryAsync();
							secondQueryRowsAffected += rowsAffected;
							_ = _log.Db($"Second query inserted {rowsAffected} notifications for user {toUserId}, story {request.StoryId}", request.FromUserId, "NOTIFICATION", false);
							notifiedUserIds.Add(toUserId); // Track notified user
						}
						catch (Exception ex)
						{
							_ = _log.Db($"Second query failed for user {toUserId}: {ex.Message}", request.FromUserId, "NOTIFICATION", true);
							continue; // Continue with next user
						}
					}
				}

				// Return true only if at least one notification was inserted
				bool notificationsSent = firstQueryRowsAffected > 0 || secondQueryRowsAffected > 0;
				_ = _log.Db($"Notifications sent for story {request.StoryId}: {notificationsSent}", request.FromUserId, "NOTIFICATION", false);
				return notificationsSent;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in TryResolveStoryNotification: {ex.Message}", request.FromUserId, "NOTIFICATION", true);
				return false;
			}
		}
		private async Task UpdateLastSeen(MySqlConnection conn, NotificationRequest request)
		{
			string notificationSql = $@"
						UPDATE maxhanna.users 
						SET last_seen = UTC_TIMESTAMP() 
						WHERE id = @UserId;";

			using (var cmd = new MySqlCommand(notificationSql, conn))
			{
				cmd.Parameters.AddWithValue("@UserId", request.FromUserId);
				await cmd.ExecuteNonQueryAsync();
			}
		}
		private async Task<bool> TryResolveFileNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.FileId == null) return false; 
			string notificationSql = $@"
					INSERT INTO maxhanna.notifications (user_id, from_user_id, file_id, text, date, user_profile_id)
					VALUES ((SELECT user_id FROM maxhanna.file_uploads WHERE id = @file_id), @user_id, @file_id, @comment, UTC_TIMESTAMP(), @userProfileId);

					INSERT INTO maxhanna.notifications (user_id, from_user_id, file_id, text)
					SELECT DISTINCT user_id, @user_id, @file_id, @comment
					FROM maxhanna.comments
					WHERE file_id = @file_id AND user_id <> @user_id";

			using (var cmd = new MySqlCommand(notificationSql, conn))
			{
				cmd.Parameters.AddWithValue("@user_id", request.FromUserId);
				cmd.Parameters.AddWithValue("@comment", request.Message);
				cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@file_id", request.FileId);
				await cmd.ExecuteNonQueryAsync();
			}
			return true;
		}

		private async Task<bool> TryResolveCommentNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.CommentId == null) return false; 
			bool hasStory = request.StoryId != null;
			bool hasFile = request.FileId != null;

			string notificationSql = $@"
					INSERT INTO maxhanna.notifications (user_id, from_user_id, comment_id, text, date, user_profile_id{(hasFile ? ", file_id" : "")}{(hasStory ? ", story_id" : "")})
					VALUES ((SELECT user_id FROM maxhanna.comments WHERE id = @comment_id LIMIT 1), @user_id, @comment_id, @comment, UTC_TIMESTAMP(), @userProfileId{(hasFile ? ", @file_id" : "")}{(hasStory ? ", @story_id" : "")});

					INSERT INTO maxhanna.notifications (user_id, from_user_id, comment_id, text{(hasFile ? ", file_id" : "")}{(hasStory ? ", story_id" : "")})
					SELECT DISTINCT user_id, @user_id, @comment_id, @comment{(hasFile ? ", @file_id" : "")}{(hasStory ? ", @story_id" : "")}
					FROM maxhanna.comments
					WHERE id = @comment_id AND user_id <> @user_id";

			using (var cmd = new MySqlCommand(notificationSql, conn))
			{
				cmd.Parameters.AddWithValue("@user_id", request.FromUserId);
				cmd.Parameters.AddWithValue("@comment", request.Message);
				cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
				if (hasFile)
				{
					cmd.Parameters.AddWithValue("@file_id", request.FileId);
				}
				if (hasStory)
				{
					cmd.Parameters.AddWithValue("@story_id", request.StoryId);
				}
				await cmd.ExecuteNonQueryAsync();
			}
			return true;
		}

		private async Task<bool> TryResolveProfileNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.UserProfileId == null) return false; 
			string notificationSql = $@"
						INSERT INTO maxhanna.notifications (user_id, from_user_id, user_profile_id, story_id, text, date)
						VALUES (@to_user, @from_user, @user_profile_id, @story_id, @comment, UTC_TIMESTAMP());";
			using (var cmd = new MySqlCommand(notificationSql, conn))
			{
				cmd.Parameters.AddWithValue("@to_user", request.ToUserIds.FirstOrDefault());
				cmd.Parameters.AddWithValue("@from_user", request.FromUserId);
				cmd.Parameters.AddWithValue("@user_profile_id", request.UserProfileId ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@story_id", request.StoryId ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@comment", request.Message);
				await cmd.ExecuteNonQueryAsync();
			}
			return true;
		}
		private async Task<bool> TryResolveChatNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.ChatId == null) return false;
			bool sendFirebaseNotification = true; 
			foreach (var receiverUserId in request.ToUserIds)
			{
				if (receiverUserId == request.FromUserId)
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

				  
				string insertNotificationSql = @"
							INSERT INTO maxhanna.notifications
								(user_id, from_user_id, chat_id, text, date)
							VALUES
								(@Receiver, @Sender, @ChatId, @Content, UTC_TIMESTAMP());";

				using (var checkCommand = new MySqlCommand(checkSql, conn))
				{
					checkCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
					checkCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
					checkCommand.Parameters.AddWithValue("@ChatId", request.ChatId);
					checkCommand.Parameters.AddWithValue("@Content", request.Message); 
					var count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()); 
					if (count > 0)
					{
						sendFirebaseNotification = false; 
					}
					else
					{
						using (var insertCommand = new MySqlCommand(insertNotificationSql, conn))
						{
							insertCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
							insertCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
							insertCommand.Parameters.AddWithValue("@Content", request.Message);
							insertCommand.Parameters.AddWithValue("@ChatId", request.ChatId); 
							await insertCommand.ExecuteNonQueryAsync();
						}
					}
				}
			}
			return sendFirebaseNotification;
		}

		private async Task<bool> TryResolveGenericMessageNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.Message == null) return false;
			bool sendFirebaseNotification = true;
			foreach (var receiverUserId in request.ToUserIds)
			{
				if (receiverUserId == request.FromUserId)
				{
					continue;
				} 

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
							INSERT INTO maxhanna.notifications (user_id, from_user_id, text, user_profile_id)
							VALUES (@Receiver, @Sender, @Content, @UserProfileId);";

				using (var checkCommand = new MySqlCommand(checkSql, conn))
				{
					checkCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
					checkCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
					checkCommand.Parameters.AddWithValue("@Content", request.Message);
					checkCommand.Parameters.AddWithValue("@UserProfileId", request.UserProfileId ?? (object)DBNull.Value);

					int count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()); 
					if (count > 0)
					{
						// Update existing notification
						using (var updateCommand = new MySqlCommand(updateNotificationSql, conn))
						{
							updateCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
							updateCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
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
							insertCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
							insertCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
							insertCommand.Parameters.AddWithValue("@Content", request.Message); 
							await insertCommand.ExecuteNonQueryAsync();
						}
					}
				}
			}

			return sendFirebaseNotification;
		}
		private async Task SendFirebaseNotifications(NotificationRequest request)
		{
			var tmpMessage = request.Message ?? "Notification from Bughosted.com";
			var usersWithoutAnon = request.ToUserIds.Where(x => x != 0).ToList();

			foreach (int tmpUserId in usersWithoutAnon)
			{
				if (tmpUserId == request.FromUserId || tmpUserId == 29 || tmpUserId == 0 || !await CanUserNotifyAsync(request.FromUserId, tmpUserId)) continue; //dont send to yourself or to test users

				try
				{
					var message = new Message()
					{
						Notification = new FirebaseAdmin.Messaging.Notification()
						{
							Title = $"Bughosted.com",
							Body = tmpMessage,
							ImageUrl = "https://www.bughosted.com/assets/logo.jpg"
						},
						Data = new Dictionary<string, string>
						{
								{ "url", "https://bughosted.com" }
						},
						Topic = "notification" + tmpUserId
					};

					string response = await FirebaseMessaging.DefaultInstance.SendAsync(message);
					Console.WriteLine($"Successfully sent message: {response} to user {tmpUserId} with topic: {message.Topic}.");
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while sending Firebase notifications. " + ex.Message, null, "NOTIFICATION", true);
				}
			}
		}
		
		private static string RemoveQuotedBlocks(string message)
		{
			string pattern = @"\[Quoting[^\]]*?\]:.*?(?=(\[Quoting|\z))";
			var regex = new Regex(pattern, RegexOptions.Singleline | RegexOptions.Compiled);

			// Keep removing until no more [Quoting...] blocks are found
			while (regex.IsMatch(message))
			{
				message = regex.Replace(message, "").Trim();
			}

			return message;
		}
		private IActionResult? CanSendNotification(NotificationRequest request)
		{
			if ((request.FileId != null && request.StoryId != null))
			{
				string message = "Both file_id and story_id cannot be provided at the same time.";
				return BadRequest(message);
			}
			else if (request.FileId == 0 && request.StoryId == 0)
			{
				string message = "Both FileId and StoryId cannot be zero.";
				return BadRequest(message);
			}
			else if (request.ToUserIds.Length == 1 && request.ToUserIds[0] == 0)
			{
				string message = "Can not send a notification to anonymous.";
				return BadRequest(message);
			}
			else if (request.ToUserIds.Length == 1 && request.ToUserIds[0] == request.FromUserId)
			{
				string message = "Can not send a notification to yourself.";
				return BadRequest(message);
			}

			return null;
		}
	}
}
