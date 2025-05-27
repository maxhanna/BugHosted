using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Chat
{
	public class MessageHistoryRequest
	{
		public int? ChatId { get; set; }
		public int UserId { get; set; }
		public int[]? ReceiverIds { get; set; }
		public int? PageSize { get; set; }
		public int? PageNumber { get; set; }
	}

	public class ChatMessage
	{
		public int Id { get; set; }
		public int ChatId { get; set; }
		public string? Seen { get; set; }
		public User? Sender { get; set; }
		public User[]? Receiver { get; set; }
		public string? Content { get; set; }
		public DateTime Timestamp { get; set; }
		public List<Reaction>? Reactions { get; set; }
		public List<FileEntry> Files { get; set; } = new List<FileEntry>();
		public DateTime? EditDate { get; set; }
	}
}
