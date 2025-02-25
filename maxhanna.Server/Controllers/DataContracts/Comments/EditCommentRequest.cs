using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
	public class EditCommentRequest
	{
		public EditCommentRequest(User? user, int commentId, string text)
		{
			User = user;
			CommentId = commentId;
			Text = text;
		}
		public User? User { get; set; }
		public int CommentId { get; set; }
		public string Text { get; set; }
	}
}
