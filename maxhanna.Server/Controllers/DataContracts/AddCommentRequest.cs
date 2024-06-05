namespace maxhanna.Server.Controllers.DataContracts
{
    public class AddCommentRequest
    {
        public User? User { get; set; }
        public int StoryId { get; set; }
        public string? Comment { get; set; }
    }
}
