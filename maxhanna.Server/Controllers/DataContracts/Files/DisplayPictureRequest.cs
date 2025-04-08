using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class DisplayPictureRequest
	{
		public int UserId { get; set; }
		public int FileId { get; set; }

		public DisplayPictureRequest(int userId, int fileId)
		{
			UserId = userId;
			FileId = fileId;
		}
	}
}
