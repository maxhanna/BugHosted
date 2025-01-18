using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
    public class SubscribeToNotificationRequest
	{
        public SubscribeToNotificationRequest(User user, string token, string topic)
        {
            this.User = user;
            this.Token = token;
            this.Topic = topic;
        }
        public User User { get; set; }
        public string Token { get; set; }
        public string Topic { get; set; }
    }
}
