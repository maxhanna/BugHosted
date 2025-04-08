using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class DeleteFileOrDirectory
	{
		public DeleteFileOrDirectory(int userId, FileEntry file)
		{
			this.userId = userId;
			this.file = file;
		}
		public int userId { get; set; }
		public FileEntry file { get; set; }
	}
}
