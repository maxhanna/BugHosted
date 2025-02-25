using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class DeleteFileOrDirectory
	{
		public DeleteFileOrDirectory(User user, FileEntry file)
		{
			this.user = user;
			this.file = file;
		}
		public User user { get; set; }
		public FileEntry file { get; set; }
	}
}
