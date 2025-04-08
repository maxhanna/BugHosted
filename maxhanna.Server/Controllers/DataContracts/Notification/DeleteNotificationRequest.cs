namespace maxhanna.Server.Controllers.DataContracts.Notification
{
	public class DeleteNotificationRequest
	{
		public DeleteNotificationRequest(int userId, int? notificationId)
		{
			this.UserId = userId;
			this.NotificationId = notificationId;
		}
		public int UserId { get; set; }
		public int? NotificationId { get; set; }
	}
}
