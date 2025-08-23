namespace maxhanna.Server.Controllers.DataContracts.Notification
{
	public class DeleteNotificationRequest
	{
		public DeleteNotificationRequest(int userId, int[]? notificationIds)
		{
			this.UserId = userId;
			this.NotificationIds = notificationIds;
		}
		public int UserId { get; set; }
		public int[]? NotificationIds { get; set; }
	}
}
