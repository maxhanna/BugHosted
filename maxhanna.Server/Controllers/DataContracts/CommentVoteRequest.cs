namespace maxhanna.Server.Controllers.DataContracts
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
