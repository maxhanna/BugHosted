using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class CreateDirectory
	{
		public CreateDirectory(int userId, string directory, bool isPublic)
		{
			this.userId = userId;
			this.directory = directory;
			this.isPublic = isPublic;
		}
		public int userId { get; set; }
		public string directory { get; set; }
		public bool isPublic { get; set; }
	}
}
