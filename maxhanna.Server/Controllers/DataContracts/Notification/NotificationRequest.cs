using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
    public class NotificationRequest
	{
        public NotificationRequest(User FromUser, User[] ToUser, string Message)
        {
            this.FromUser = FromUser;
            this.ToUser = ToUser; 
            this.Message = Message; 
        }
        public User FromUser { get; set; }
        public User[] ToUser { get; set; } 
        public string Message { get; set; } 
    }
}
