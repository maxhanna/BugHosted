using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
	public class StopNotificationsRequest
	{
		public StopNotificationsRequest(int FromUserId, int UserId)
		{
			this.FromUserId = FromUserId;
			this.UserId = UserId; 
		}
		public int FromUserId { get; set; }
		public int UserId { get; set; } 
	}
}
