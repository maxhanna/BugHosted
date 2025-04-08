using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Array
{
	public class ArrayCharacterItem
	{
		public int UserId { get; set; }
		public FileEntry File { get; set; }
		public long Level { get; set; }
		public long Experience { get; set; }

		public ArrayCharacterItem(int userId, FileEntry file, long level, long experience)
		{
			UserId = userId;
			File = file;
			Level = level;
			Experience = experience;
		}

	}
}