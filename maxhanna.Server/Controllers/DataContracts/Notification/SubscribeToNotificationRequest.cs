using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
	public class SubscribeToNotificationRequest
	{
		public SubscribeToNotificationRequest(int userId, string token, string topic)
		{
			this.UserId = userId;
			this.Token = token;
			this.Topic = topic;
		}
		public int UserId { get; set; }
		public string Token { get; set; }
		public string Topic { get; set; }
	}
}
