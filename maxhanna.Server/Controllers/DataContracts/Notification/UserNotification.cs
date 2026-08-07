using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Wordler
{
	public class UserNotification
	{
		public int Id { get; set; }
		public User? User { get; set; }
		public User? FromUser { get; set; }
		public int? FileId { get; set; }
		public int? StoryId { get; set; }
		public int? ChatId { get; set; }
		public int? CommentId { get; set; }
		public int? UserProfileId { get; set; }
		public string? Text { get; set; }
		public DateTime? Date { get; set; }
		public Boolean? IsRead { get; set; }
		// Deep-link route payload (e.g. "myappeals" opens the moderator panel's My Appeals tab).
		public string? Route { get; set; }
	}
}
