using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class AddCommentRequest
    {
        public User? User { get; set; }
        public int StoryId { get; set; }
        public string? Comment { get; set; }
    }
}
