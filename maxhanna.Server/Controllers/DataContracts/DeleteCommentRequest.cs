namespace maxhanna.Server.Controllers.DataContracts
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
