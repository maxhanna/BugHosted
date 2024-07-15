using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class CommentVoteRequest
    {
        public User User { get; set; }
        public int CommentId { get; set; }
        public bool Upvote { get; set; }
        public bool Downvote { get; set; }

        public CommentVoteRequest(User user, int commentId, bool upvote, bool downvote)
        {
            User = user;
            CommentId = commentId;
            Upvote = upvote;
            Downvote = downvote;
        }
    }
}
