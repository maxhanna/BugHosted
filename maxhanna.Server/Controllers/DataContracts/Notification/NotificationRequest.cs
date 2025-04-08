using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notification
{
	public class NotificationRequest
	{
		public NotificationRequest(int FromUserId, int[] ToUserIds, string Message, int? StoryId, int? CommentId, int? FileId, int? ChatId, int? UserProfileId)
		{
			this.FromUserId = FromUserId;
			this.ToUserIds = ToUserIds;
			this.Message = Message;
			this.FileId = FileId;
			this.CommentId = CommentId;
			this.UserProfileId = UserProfileId;
			this.ChatId = ChatId;
			this.StoryId = StoryId;
		}
		public int FromUserId { get; set; }
		public int[] ToUserIds { get; set; }
		public string Message { get; set; }
		public int? StoryId { get; set; }
		public int? CommentId { get; set; }
		public int? FileId { get; set; }
		public int? ChatId { get; set; }
		public int? UserProfileId { get; set; }
	}
}
