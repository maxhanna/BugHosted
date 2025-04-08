using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
	public class DeleteCommentRequest
	{
		public DeleteCommentRequest(int userId, int commentId)
		{
			UserId = userId;
			CommentId = commentId;
		}
		public int UserId { get; set; }
		public int CommentId { get; set; }
	}
}
