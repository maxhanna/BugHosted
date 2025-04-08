using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
	public class EditCommentRequest
	{
		public EditCommentRequest(int userId, int commentId, string text)
		{
			UserId = userId;
			CommentId = commentId;
			Text = text;
		}
		public int UserId { get; set; }
		public int CommentId { get; set; }
		public string Text { get; set; }
	}
}
