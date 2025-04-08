using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notepad
{
	public class CreateNote
	{
		public CreateNote(int userId, string note)
		{
			this.userId = userId;
			this.note = note;
		}
		public int userId { get; set; }
		public string note { get; set; }
	}
}
