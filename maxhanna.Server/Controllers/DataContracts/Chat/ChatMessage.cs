using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Chat
{
    public class MessageHistoryRequest
    {
        public User? user1 { get; set; }
        public User? user2 { get; set; }
        public int? PageSize { get; set; }
        public int? PageNumber { get; set; }
    }

    public class Message
    {
        public int Id { get; set; }
        public User? Sender { get; set; }
        public User? Receiver { get; set; }
        public string? Content { get; set; }
        public DateTime Timestamp { get; set; }
        public List<Reaction>? Reactions { get; set; }
        public List<FileEntry> Files { get; set; } = new List<FileEntry>();
    }
}
