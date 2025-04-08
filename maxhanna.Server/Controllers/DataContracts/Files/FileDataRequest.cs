using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class FileDataRequest
	{
		public int UserId { get; set; }
		public FileData FileData { get; set; }

		public FileDataRequest(int userId, FileData fileData)
		{
			UserId = userId;
			FileData = fileData;
		}
	}
}
