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

					string sql;
					using (var command = new MySqlCommand())
					{
						command.Connection = connection;

						if (req.NotificationIds != null && req.NotificationIds.Length > 0)
						{
							// Build IN clause dynamically
							var paramNames = req.NotificationIds
								.Select((id, index) => $"@id{index}")
								.ToArray();

							sql = $@"DELETE FROM maxhanna.notifications
                             WHERE user_id = @UserId AND id IN ({string.Join(",", paramNames)})";

							command.CommandText = sql;
							command.Parameters.AddWithValue("@UserId", req.UserId);

							for (int i = 0; i < req.NotificationIds.Length; i++)
							{
								command.Parameters.AddWithValue($"@id{i}", req.NotificationIds[i]);
							}
						}
						else
						{
							// Delete all notifications for user
							sql = @"DELETE FROM maxhanna.notifications WHERE user_id = @UserId";
							command.CommandText = sql;
							command.Parameters.AddWithValue("@UserId", req.UserId);
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
			return Ok(req.NotificationIds != null ? "Notifications deleted." : "All notifications deleted.");
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
			if (canSendRes != null)
			{
				string errorMessage = canSendRes switch
				{
					BadRequestObjectResult badRequest => badRequest.Value?.ToString() ?? "Bad request",
					ObjectResult objectResult => objectResult.Value?.ToString() ?? "Error occurred",
					_ => canSendRes.ToString()
				} ?? "Unknown error";
				_ = _log.Db($"Cant send notification : " + errorMessage, request.FromUserId, "NOTIFICATION", outputToConsole: true);
				return canSendRes;
			}

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

			// Normalize any 0 identifiers to null to prevent FK violations (client sometimes sends 0)
			NormalizeRequestIds(request);

			bool notificationProcessed = false;
			bool sendFirebaseNotification = false;
			request.Message = RemoveQuotedBlocks(request.Message);

			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var conn = new MySqlConnection(connectionString))
			{
				await conn.OpenAsync();
				await UpdateLastSeen(conn, request);
				await ResolveParentCommentAsync(conn, request);

				if (await TryResolveStoryNotification(conn, request))
				{
					notificationProcessed = true;
					sendFirebaseNotification = true;
				}
				else if (await TryResolveFileNotification(conn, request))
				{
					notificationProcessed = true;
					sendFirebaseNotification = true;
				}
				else if (await TryResolveCommentNotification(conn, request))
				{
					notificationProcessed = true;
					sendFirebaseNotification = true;
				}
				else if (await TryResolveProfileNotification(conn, request))
				{
					notificationProcessed = true;
					sendFirebaseNotification = true;
				}
				else if (await TryResolveChatNotification(conn, request))
				{
					notificationProcessed = true;
					sendFirebaseNotification = await ShouldSendFirebaseNotificationForChat(conn, request);
				}
				else if (await TryResolveGenericMessageNotification(conn, request))
				{
					notificationProcessed = true;
					sendFirebaseNotification = true;
				}
			}

			if (sendFirebaseNotification)
			{
				_ = SendFirebaseNotifications(request);
			}

			return notificationProcessed
				? Ok("Notification(s) Created")
				: Ok("No notifications created");
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
            SELECT 
                (SELECT COUNT(*) 
                 FROM maxhanna.user_prevent_notification 
                 WHERE user_id = @RecipientId 
                 AND from_user_id = @SenderId
                 LIMIT 1) AS is_blocked,
                (SELECT COUNT(*) 
                 FROM maxhanna.notifications 
                 WHERE user_id = @RecipientId 
                 AND from_user_id = @SenderId 
                 AND date > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND)
                 LIMIT 1) AS recently_notified";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@RecipientId", recipientId);
				cmd.Parameters.AddWithValue("@SenderId", senderId);

				using var reader = await cmd.ExecuteReaderAsync();
				if (await reader.ReadAsync())
				{
					long isBlocked = reader.GetInt64(0);
					long recentlyNotified = reader.GetInt64(1);

					// Return false if either blocked OR recently notified
					return isBlocked == 0 && recentlyNotified == 0;
				}

				return true; // Default to allowing if no records found
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
				if (!reader.IsDBNull(reader.GetOrdinal("file_id")))
				{
					request.FileId = reader.GetInt32("file_id");
				}
 
				if (!reader.IsDBNull(reader.GetOrdinal("story_id")))
				{
					request.StoryId = reader.GetInt32("story_id");
				}
			}
			return true;
		}
		private async Task<bool> TryResolveStoryNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.StoryId == null || request.CommentId != null) return false;

			try
			{
				// 1. Get story owner and notify them (if different from commenter)

				if (await ShouldNotifyStoryOwner(conn, request.StoryId.Value, request.FromUserId))
				{
					int? ownerId = await GetStoryOwnerId(conn, request.StoryId.Value, request.FromUserId);
					if (ownerId != null)
					{
						await NotifyStoryOwner(conn, request, ownerId.Value); 
						if (request.ToUserIds != null)
						{
							request.ToUserIds = request.ToUserIds.Where(id => id != ownerId.Value).ToArray();
						}
					} 
				}

				// 2. Notify any remaining mentioned users
				if (request.ToUserIds != null && request.ToUserIds.Any())
				{
					await NotifyMentionedUsers(conn, request);
				}

				return true;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in TryResolveStoryNotification: {ex.Message}", outputToConsole: true);
				return false;
			}
		}

		private async Task<bool> ShouldNotifyStoryOwner(MySqlConnection conn, int storyId, int fromUserId)
		{
			string sql = "SELECT user_id FROM maxhanna.stories WHERE id = @storyId AND user_id != @fromUserId";
			using (var cmd = new MySqlCommand(sql, conn))
			{
				cmd.Parameters.AddWithValue("@storyId", storyId);
				cmd.Parameters.AddWithValue("@fromUserId", fromUserId);
				return (await cmd.ExecuteScalarAsync()) != null;
			}
		}

		private async Task<int?> GetStoryOwnerId(MySqlConnection conn, long storyId, long fromUserId)
		{
			const string sql = @"
				SELECT user_id 
				FROM maxhanna.stories 
				WHERE id = @storyId AND user_id != @fromUserId";

			using (var cmd = new MySqlCommand(sql, conn))
			{
				cmd.Parameters.AddWithValue("@storyId", storyId);
				cmd.Parameters.AddWithValue("@fromUserId", fromUserId);
				var result = await cmd.ExecuteScalarAsync();
				return result != null ? (int)result : null;
			}
		}

		private async Task NotifyStoryOwner(MySqlConnection conn, NotificationRequest request, long ownerId)
		{
			string sql = @"
				INSERT INTO maxhanna.notifications 
					(user_id, from_user_id, story_id, text, date";

			// Add user_profile_id to columns if it exists
			if (request.UserProfileId.HasValue)
			{
				sql += ", user_profile_id";
			}

			sql += @") 
				VALUES 
					(@userId, @fromUserId, @storyId, @message, UTC_TIMESTAMP()";

			// Add user_profile_id parameter if it exists
			if (request.UserProfileId.HasValue)
			{
				sql += ", @userProfileId";
			}

			sql += ")";

			using (var cmd = new MySqlCommand(sql, conn))
			{
				cmd.Parameters.AddWithValue("@userId", ownerId);
				cmd.Parameters.AddWithValue("@fromUserId", request.FromUserId);
				cmd.Parameters.AddWithValue("@storyId", request.StoryId);
				cmd.Parameters.AddWithValue("@message", request.Message);

				// Add parameter only if UserProfileId has value
				if (request.UserProfileId.HasValue)
				{
					cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId.Value);
				}
				//Console.WriteLine($"Inserting story notification for userId: {ownerId}, fromUserId: {request.FromUserId}, storyId: {request.StoryId}, message: {request.Message}");
				await cmd.ExecuteNonQueryAsync();
			}
		}

		private async Task NotifyMentionedUsers(MySqlConnection conn, NotificationRequest request)
		{
			// Only notify users who are not the sender and haven't blocked notifications
			var preliminaryRecipients = request.ToUserIds
				.Where(id => id != request.FromUserId)
				.Distinct()
				.ToList();

			// Then check async permissions
			var validRecipients = new List<int>();
			foreach (var userId in preliminaryRecipients)
			{
				if (await CanUserNotifyAsync(request.FromUserId, userId))
				{
					validRecipients.Add(userId);
				}
			}

			foreach (var userId in validRecipients)
			{
				string sql = @"
					INSERT INTO maxhanna.notifications 
						(user_id, from_user_id, story_id, text, date";

				// Add user_profile_id to columns if it exists
				if (request.UserProfileId.HasValue)
				{
					sql += ", user_profile_id";
				}

				sql += @") 
					VALUES 
						(@userId, @fromUserId, @storyId, @message, UTC_TIMESTAMP()";

				// Add user_profile_id parameter if it exists
				if (request.UserProfileId.HasValue)
				{
					sql += ", @userProfileId";
				}

				sql += ")";

				using (var cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@userId", userId);
					cmd.Parameters.AddWithValue("@fromUserId", request.FromUserId);
					cmd.Parameters.AddWithValue("@storyId", request.StoryId);
					cmd.Parameters.AddWithValue("@message", request.Message);

					// Add parameter only if UserProfileId has value
					if (request.UserProfileId.HasValue)
					{
						cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId.Value);
					}
					//Console.WriteLine($"Inserting story notification for userId: {userId}, fromUserId: {request.FromUserId}, storyId: {request.StoryId}, message: {request.Message}");

					await cmd.ExecuteNonQueryAsync();
				}
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

			try
			{
				// 1. Resolve file owner explicitly so we can safely skip if missing (prevents NULL insert)
				int? ownerId = null;
				using (var ownerCmd = new MySqlCommand("SELECT user_id FROM maxhanna.file_uploads WHERE id = @file_id LIMIT 1;", conn))
				{
					ownerCmd.Parameters.AddWithValue("@file_id", request.FileId);
					var result = await ownerCmd.ExecuteScalarAsync();
					if (result != null && result != DBNull.Value)
					{
						ownerId = Convert.ToInt32(result);
					}
				}

				if (ownerId == null)
				{
					_ = _log.Db($"Skipping file notification - file not found or owner missing for file_id {request.FileId}.", request.FromUserId, "NOTIFICATION", true);
					return false; // Can't notify without a target owner
				}

				// 2. Notify file owner (but not if they are the sender)
				if (ownerId != request.FromUserId)
				{
					// Optional: respect user block / rate limits
					if (await CanUserNotifyAsync(request.FromUserId, ownerId.Value))
					{
						string insertOwnerSql = @"INSERT INTO maxhanna.notifications (user_id, from_user_id, file_id, text, date, user_profile_id)
							VALUES (@owner_id, @from_user_id, @file_id, @comment, UTC_TIMESTAMP(), @userProfileId);";
						using (var ownerInsert = new MySqlCommand(insertOwnerSql, conn))
						{
							ownerInsert.Parameters.AddWithValue("@owner_id", ownerId.Value);
							ownerInsert.Parameters.AddWithValue("@from_user_id", request.FromUserId);
							ownerInsert.Parameters.AddWithValue("@file_id", request.FileId);
							ownerInsert.Parameters.AddWithValue("@comment", request.Message);
							ownerInsert.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
							await ownerInsert.ExecuteNonQueryAsync();
						}
					}
				}

				// 3. Notify distinct previous commenters (exclude sender & owner & avoid duplicates)
				string insertCommentersSql = @"INSERT INTO maxhanna.notifications (user_id, from_user_id, file_id, text, date, user_profile_id)
					SELECT DISTINCT c.user_id, @from_user_id, @file_id, @comment, UTC_TIMESTAMP(), @userProfileId
					FROM maxhanna.comments c
					WHERE c.file_id = @file_id
						AND c.user_id <> @from_user_id
						AND c.user_id <> @owner_id
						AND NOT EXISTS (
							SELECT 1 FROM maxhanna.notifications n
							WHERE n.user_id = c.user_id
								AND n.file_id = @file_id
								AND n.from_user_id = @from_user_id
								AND n.text = @comment
						);";

				using (var commentersInsert = new MySqlCommand(insertCommentersSql, conn))
				{
					commentersInsert.Parameters.AddWithValue("@from_user_id", request.FromUserId);
					commentersInsert.Parameters.AddWithValue("@file_id", request.FileId);
					commentersInsert.Parameters.AddWithValue("@comment", request.Message);
					commentersInsert.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
					commentersInsert.Parameters.AddWithValue("@owner_id", ownerId.Value);
					await commentersInsert.ExecuteNonQueryAsync();
				}

				return true;
			}
			catch (MySqlException sqlEx)
			{
				_ = _log.Db($"Error creating file notification (file_id={request.FileId}): {sqlEx.Message}", request.FromUserId, "NOTIFICATION", true);
				return false;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Unexpected error creating file notification (file_id={request.FileId}): {ex.Message}", request.FromUserId, "NOTIFICATION", true);
				return false;
			}
		}

		private async Task<bool> TryResolveCommentNotification(MySqlConnection conn, NotificationRequest request)
		{
            if (request.CommentId == null || request.CommentId <= 0) return false;

			bool hasStory = request.StoryId.HasValue && request.StoryId > 0;
			bool hasFile = request.FileId.HasValue && request.FileId > 0;

			// Track all user IDs to notify
			var userIdsToNotify = new HashSet<int>();

			_ = _log.Db($"Creating comment notification for userId: {request.FromUserId} with commentId: {request.CommentId}, storyId: {request.StoryId}, fileId: {request.FileId}.", request.FromUserId, "NOTIFICATION", true);

			// 1. Get the original comment author
			string getOriginalAuthorSql = @"
        SELECT user_id 
        FROM maxhanna.comments 
        WHERE id = @comment_id 
        AND user_id != @user_id";

			using (var cmd = new MySqlCommand(getOriginalAuthorSql, conn))
			{
				cmd.Parameters.AddWithValue("@user_id", request.FromUserId);
				cmd.Parameters.AddWithValue("@comment_id", request.CommentId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						int userId = reader.GetInt32("user_id");
						userIdsToNotify.Add(userId);
					}
				}
			}

			// 2. Get the parent comment author (if this is a reply)
			string getParentAuthorSql = @"
        SELECT c.user_id 
        FROM maxhanna.comments current
        JOIN maxhanna.comments c ON current.comment_id = c.id
        WHERE current.id = @comment_id 
        AND c.user_id != @user_id";

			using (var cmd = new MySqlCommand(getParentAuthorSql, conn))
			{
				cmd.Parameters.AddWithValue("@user_id", request.FromUserId);
				cmd.Parameters.AddWithValue("@comment_id", request.CommentId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						int userId = reader.GetInt32("user_id");
						userIdsToNotify.Add(userId);
					}
				}
			}

			// 3. Add mentioned users (excluding FromUserId and already notified users)
			if (request.ToUserIds != null && request.ToUserIds.Any(id => id != request.FromUserId))
			{
				var mentionedUsers = request.ToUserIds
					.Where(id => id != request.FromUserId)
					.ToList();
				userIdsToNotify.UnionWith(mentionedUsers);
			}

			// 4. Insert notifications for all unique users
			if (userIdsToNotify.Any())
			{
				string userIds = string.Join(",", userIdsToNotify);

				string insertNotificationsSql = $@"
            INSERT INTO maxhanna.notifications 
                (user_id, from_user_id, comment_id, text, date, user_profile_id{(hasFile ? ", file_id" : "")}{(hasStory ? ", story_id" : "")})
            SELECT 
                id, @user_id, @comment_id, @comment, UTC_TIMESTAMP(), @userProfileId{(hasFile ? ", @file_id" : "")}{(hasStory ? ", @story_id" : "")}
            FROM maxhanna.users
            WHERE id IN ({userIds})
            AND NOT EXISTS (
                SELECT 1 FROM maxhanna.notifications 
                WHERE user_id = users.id 
                AND comment_id = @comment_id
            )";
 
				using (var cmd = new MySqlCommand(insertNotificationsSql, conn))
				{
					cmd.Parameters.AddWithValue("@user_id", request.FromUserId);
					cmd.Parameters.AddWithValue("@comment", request.Message);
					cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
					cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
					if (hasFile) cmd.Parameters.AddWithValue("@file_id", request.FileId);
					if (hasStory) cmd.Parameters.AddWithValue("@story_id", request.StoryId);

					await cmd.ExecuteNonQueryAsync();
				}
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
			if (request.ChatId == null)
			{
				return false;
			}

			foreach (var receiverUserId in request.ToUserIds)
			{
				if (receiverUserId == request.FromUserId) continue;

				// Check if a recent notification exists
				string checkSql = @"
					SELECT COUNT(*) 
					FROM maxhanna.notifications
					WHERE user_id = @Receiver
						AND chat_id = @ChatId
						AND chat_id IS NOT NULL
						AND date >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE;";

				using (var checkCommand = new MySqlCommand(checkSql, conn))
				{
					checkCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
					checkCommand.Parameters.AddWithValue("@ChatId", request.ChatId);
					var count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync());

					if (count == 0) // Only insert if no recent notification exists
					{
						string insertSql = @"
							INSERT INTO maxhanna.notifications
								(user_id, from_user_id, chat_id, text, date)
							VALUES
								(@Receiver, @Sender, @ChatId, @Content, UTC_TIMESTAMP());";

						using (var insertCommand = new MySqlCommand(insertSql, conn))
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
			return true; // Successfully processed
		}
		private async Task<bool> TryResolveGenericMessageNotification(MySqlConnection conn, NotificationRequest request)
		{
			if (request.Message == null) return false;

			bool sendFirebaseNotification = true;
			bool isBugWarsAttack = request.Message.StartsWith("BugWars attack incoming on");
			bool isNewChatMessage = request.Message.StartsWith("New chat message!");

			foreach (var receiverUserId in request.ToUserIds)
			{
				if (receiverUserId == request.FromUserId)
				{
					continue;
				}

				try
				{
					string checkSql = @"
                SELECT id, text 
                FROM maxhanna.notifications
                WHERE user_id = @Receiver
                    AND from_user_id = @Sender
                    AND chat_id IS NULL
                    AND file_id IS NULL
                    AND story_id IS NULL
                    AND comment_id IS NULL
                    AND user_profile_id IS NULL
                    AND date >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE
                LIMIT 1;";

					string updateNotificationSql = @"
                UPDATE maxhanna.notifications
                SET text = @Content,
                    date = UTC_TIMESTAMP()
                WHERE id = @NotificationId;";

					string insertNotificationSql = @"
                INSERT INTO maxhanna.notifications 
                    (user_id, from_user_id, text, date)
                VALUES 
                    (@Receiver, @Sender, @Content, UTC_TIMESTAMP());";

					using (var checkCommand = new MySqlCommand(checkSql, conn))
					{
						checkCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
						checkCommand.Parameters.AddWithValue("@Receiver", receiverUserId);

						using (var reader = await checkCommand.ExecuteReaderAsync())
						{
							string newContent = request.Message;
							int? existingId = null;

							if (await reader.ReadAsync())
							{
								existingId = reader.GetInt32("id");
								string existingText = reader.GetString("text");

								if (isBugWarsAttack)
								{
									if (existingText.StartsWith("BugWars:"))
									{
										var match = Regex.Match(existingText, @"BugWars: (\d+) Attacks incoming!");
										newContent = match.Success && int.TryParse(match.Groups[1].Value, out int currentCount)
											? $"BugWars: {currentCount + 1} Attacks incoming!"
											: "BugWars: 2 Attacks incoming!";
									}
									else if (existingText.StartsWith("BugWars attack incoming on"))
									{
										newContent = "BugWars: 2 Attacks incoming!";
									}
									sendFirebaseNotification = false;
								}
								else if (isNewChatMessage)
								{
									if (existingText.StartsWith("New chat messages ("))
									{
										var match = Regex.Match(existingText, @"New chat messages \((\d+)\)");
										newContent = match.Success && int.TryParse(match.Groups[1].Value, out int currentCount)
											? $"New chat messages ({currentCount + 1})"
											: $"New chat messages (2)";
									}
									else if (existingText.StartsWith("New chat message!"))
									{
										newContent = "New chat messages (2)";
									}
									else if (existingText.Contains("New chat message!"))
									{
										// Count existing chat messages in the concatenated string
										int count = existingText.Split(new[] { "New chat message!" }, StringSplitOptions.None).Length;
										newContent = $"New chat messages ({count + 1})";
									}
									sendFirebaseNotification = false;
								}
								else
								{
									// Normal message concatenation (for other message types)
									newContent = existingText.Length <= 250
										? $"{existingText}, {request.Message}"
										: existingText;
								}
							}

							await reader.CloseAsync();

							try
							{
								if (existingId.HasValue)
								{
									using (var updateCommand = new MySqlCommand(updateNotificationSql, conn))
									{
										updateCommand.Parameters.AddWithValue("@NotificationId", existingId.Value);
										updateCommand.Parameters.AddWithValue("@Content", newContent);
										await updateCommand.ExecuteNonQueryAsync();
									}
								}
								else
								{
									using (var insertCommand = new MySqlCommand(insertNotificationSql, conn))
									{
										insertCommand.Parameters.AddWithValue("@Sender", request.FromUserId);
										insertCommand.Parameters.AddWithValue("@Receiver", receiverUserId);
										insertCommand.Parameters.AddWithValue("@Content",
											isBugWarsAttack ? request.Message :
											isNewChatMessage ? request.Message :
											newContent);
										await insertCommand.ExecuteNonQueryAsync();
									}
								}
							}
							catch (MySqlException updateInsertEx)
							{
								_ = _log.Db($"Error processing notification for user {receiverUserId}: {updateInsertEx.Message}",
										   null, "NOTIFICATION", true);
								continue;
							}
						}
					}
				}
				catch (MySqlException sqlEx)
				{
					_ = _log.Db($"Database error processing notification: {sqlEx.Message}",
							   null, "NOTIFICATION", true);
					continue;
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Unexpected error processing notification: {ex.Message}",
							   null, "NOTIFICATION", true);
					continue;
				}
			}

			return sendFirebaseNotification;
		}
		private async Task<bool> ShouldSendFirebaseNotificationForChat(MySqlConnection conn, NotificationRequest request)
		{ 
			foreach (var receiverUserId in request.ToUserIds)
			{
				if (receiverUserId == request.FromUserId) continue;

				string checkSql = @"
					SELECT COUNT(*) 
					FROM maxhanna.notifications
					WHERE user_id = @Receiver 
						AND chat_id IS NOT NULL
						AND date >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE;";

				using (var checkCommand = new MySqlCommand(checkSql, conn))
				{
					checkCommand.Parameters.AddWithValue("@Receiver", receiverUserId); 
					var count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync());

					if (count <= 1)
					{
						return true; // Send Firebase notification if no recent notification exists
					}
				}
			}
			return false; // Don't send Firebase notification if all recipients have recent notifications
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
					//Console.WriteLine($"Successfully sent message: {response} to user {tmpUserId} with topic: {message.Topic}.");
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

		private void NormalizeRequestIds(NotificationRequest request)
		{
			// Convert any zero values to null so they are treated as absent
			if (request.FileId.HasValue && request.FileId.Value <= 0) request.FileId = null;
			if (request.StoryId.HasValue && request.StoryId.Value <= 0) request.StoryId = null;
			if (request.CommentId.HasValue && request.CommentId.Value <= 0) request.CommentId = null;
			if (request.ChatId.HasValue && request.ChatId.Value <= 0) request.ChatId = null;
			if (request.UserProfileId.HasValue && request.UserProfileId.Value <= 0) request.UserProfileId = null;

			// Remove any 0 recipients
			request.ToUserIds = request.ToUserIds.Where(id => id > 0).ToArray();

			_ = _log.Db($"Normalized IDs -> FileId:{request.FileId?.ToString() ?? "null"} StoryId:{request.StoryId?.ToString() ?? "null"} CommentId:{request.CommentId?.ToString() ?? "null"} ChatId:{request.ChatId?.ToString() ?? "null"} UserProfileId:{request.UserProfileId?.ToString() ?? "null"}", request.FromUserId, "NOTIFICATION");
		}
	}
}
