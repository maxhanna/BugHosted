using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class UpdateFileVisibilityRequest
	{
		public int UserId { get; set; }
		public int FileId { get; set; }
		public bool IsVisible { get; set; }

		public UpdateFileVisibilityRequest(int UserId, int FileId, bool IsVisible)
		{
			this.UserId = UserId;
			this.FileId = FileId;
			this.IsVisible = IsVisible;
		}
	}
}
