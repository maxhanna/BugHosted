using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class DeleteCommentRequest
    {
        public DeleteCommentRequest(User? user, int commentId)
        {
            User = user;
            CommentId = commentId;
        }
        public User? User { get; set; }
        public int CommentId { get; set; }
    }
}
