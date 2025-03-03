using maxhanna.Server.Controllers.DataContracts.Files;

namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class Trophy
	{
		public int Id { get; set; }
		public string? Name { get; set; }
		public FileEntry? File { get; set; }
	}
}
