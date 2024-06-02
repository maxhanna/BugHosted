namespace maxhanna.Server.Controllers.DataContracts
{
    public class FileComment
    {
        public int Id { get; set; }
        public int FileId { get; set; }
        public int UserId { get; set; }
        public string? Username { get; set; }
        public string? CommentText { get; set; }
        public int Upvotes { get; set; }
        public int Downvotes { get; set; }
    }
}
