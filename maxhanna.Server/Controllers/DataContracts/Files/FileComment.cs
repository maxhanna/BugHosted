using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Social; // For Poll

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class FileComment
	{
		public int Id { get; set; }
		public int? FileId { get; set; }
		public int? StoryId { get; set; }
		public int? CommentId { get; set; }
		public int? UserProfileId { get; set; }
		public string? City { get; set; }
		public string? Country { get; set; }
		public string? Ip { get; set; }
		public User? User { get; set; }
		public string? CommentText { get; set; }
		public DateTime Date { get; set; }
		public List<FileEntry>? CommentFiles { get; set; } = new List<FileEntry>();
		public List<FileComment>? Comments { get; set; } = new List<FileComment>();
		public List<Reaction>? Reactions { get; set; }
		// New: Polls associated with this comment (if the comment contains a poll markup or votes)
		public List<Poll>? Polls { get; set; }
	}
}
