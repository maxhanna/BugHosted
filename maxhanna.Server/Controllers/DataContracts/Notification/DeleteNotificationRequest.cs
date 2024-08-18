using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
    public class DeleteNotificationRequest
    {
        public DeleteNotificationRequest(User user, int? notificationId)
        {
            this.User = user;
            this.NotificationId= notificationId;
        }
        public User User { get; set; }
        public int? NotificationId { get; set; }
    }
}
