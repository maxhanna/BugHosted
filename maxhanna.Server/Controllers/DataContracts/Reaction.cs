namespace maxhanna.Server.Controllers.DataContracts
{
    public class Reaction
    { 
        public int Id { get; set; }
        public User? User { get; set; }
        public int? CommentId { get; set; }
        public int? StoryId { get; set; }
        public int? FileId { get; set; }
        public int? MessageId { get; set; }
        public DateTime? Timestamp { get; set; }
        public string? Type { get; set; }
    }
}
