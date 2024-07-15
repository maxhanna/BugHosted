using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
    public class FileComment
    {
        public int Id { get; set; }
        public int? FileId { get; set; }
        public int? StoryId { get; set; }
        public User? User { get; set; }
        public string? CommentText { get; set; }
        public DateTime Date { get; set; }
        public List<FileEntry>? CommentFiles { get; set; } = new List<FileEntry>();
        public List<Reaction>? Reactions { get; set; }
    }
}
