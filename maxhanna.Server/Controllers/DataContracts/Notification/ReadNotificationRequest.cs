namespace maxhanna.Server.Controllers.DataContracts.Notification
{
	public class ReadNotificationRequest
	{
		public ReadNotificationRequest(int userId, int[]? notificationIds)
		{
			this.UserId = userId;
			this.NotificationIds = notificationIds;
		}
		public int UserId { get; set; }
		public int[]? NotificationIds { get; set; }
	}
}
