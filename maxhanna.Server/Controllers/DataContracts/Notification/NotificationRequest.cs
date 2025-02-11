using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
    public class NotificationRequest
	{
        public NotificationRequest(User FromUser, User[] ToUser, string Message, int? StoryId, int? CommentId, int? FileId, int? ChatId, int? UserProfileId)
        {
            this.FromUser = FromUser;
            this.ToUser = ToUser; 
            this.Message = Message; 
            this.FileId = FileId; 
            this.CommentId = CommentId; 
            this.UserProfileId = UserProfileId; 
            this.ChatId = ChatId; 
            this.StoryId = StoryId; 
        }
        public User FromUser { get; set; }
        public User[] ToUser { get; set; } 
        public string Message { get; set; } 
        public int? StoryId { get; set; } 
        public int? CommentId { get; set; } 
        public int? FileId { get; set; } 
        public int? ChatId { get; set; } 
        public int? UserProfileId { get; set; } 
    }
}
