using FirebaseAdmin.Messaging;
using maxhanna.Server.Controllers.DataContracts.Notification;
using MySqlConnector;

namespace maxhanna.Server.Services
{
	public class FirebaseNotificationService
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public FirebaseNotificationService(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		public async Task SendFirebaseNotifications(NotificationRequest request)
		{
			string username = "Anonymous";
			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				string followersSql = @"SELECT username FROM users WHERE id = @senderId LIMIT 1;";
				using (var cmd = new MySqlCommand(followersSql, conn))
				{
					cmd.Parameters.AddWithValue("@senderId", request.FromUserId);
					using (var reader = await cmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							username = reader.GetString("username");
						}
					}
				}
			}

			var tmpMessage = request.Message ?? $"Notification from {username} at Bughosted.com";
			tmpMessage = tmpMessage.Replace(request.FromUserId.ToString(), username);
			var usersWithoutAnon = request.ToUserIds.Where(x => x != 0).ToList();

			foreach (int tmpUserId in usersWithoutAnon)
			{
				if (tmpUserId == request.FromUserId || tmpUserId == 29 || tmpUserId == 0 || !await CanUserNotifyAsync(request.FromUserId, tmpUserId)) continue;

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

					await FirebaseMessaging.DefaultInstance.SendAsync(message);
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while sending Firebase notifications. " + ex.Message, null, "NOTIFICATION", true);
				}
			}
		}

		public async Task SendFirebaseNotification(int userId, string passedMessage)
		{
			var tmpMessage = passedMessage ?? "Notification from Bughosted.com";
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
					Topic = "notification" + userId
				};

				await FirebaseMessaging.DefaultInstance.SendAsync(message);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while sending Firebase notifications. " + ex.Message, null, "NOTIFICATION", true);
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
					int isBlocked = reader.GetInt32("is_blocked");
					int recentlyNotified = reader.GetInt32("recently_notified");
					return isBlocked == 0 && recentlyNotified == 0;
				}
				return true;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in CanUserNotifyAsync: {ex.Message}", senderId, "NOTIFICATION");
				return true;
			}
			finally
			{
				await conn.CloseAsync();
			}
		}
	}
}
