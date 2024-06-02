namespace maxhanna.Server.Controllers.DataContracts
{
    public class StoryComment
    {
        public int Id { get; set; }
        public int StoryId { get; set; }
        public int UserId { get; set; }
        public string? Username { get; set; }
        public string? Text { get; set; }
        public int Upvotes { get; set; }
        public int Downvotes { get; set; }
    }
}
