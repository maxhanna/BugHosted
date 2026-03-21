using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class FileNote
	{
		public User? User { get; set; }
		public string? Note { get; set; }

		public FileNote() { }
		public FileNote(User? user, string? note)
		{
			User = user;
			Note = note;
		}
	}
}
