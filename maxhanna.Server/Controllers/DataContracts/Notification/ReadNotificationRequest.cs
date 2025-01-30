using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
    public class ReadNotificationRequest
    {
        public ReadNotificationRequest(User user, int[]? notificationIds)
        {
            this.User = user;
            this.NotificationIds = notificationIds;
        }
        public User User { get; set; }
        public int[]? NotificationIds { get; set; }
    }
}
