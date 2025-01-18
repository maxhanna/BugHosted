using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
    public class NotificationRequest
	{
        public NotificationRequest(User FromUser, User[] ToUser)
        {
            this.FromUser = FromUser;
            this.ToUser = ToUser; 
        }
        public User FromUser { get; set; }
        public User[] ToUser { get; set; } 
    }
}
