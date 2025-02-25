using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Array
{
	public class GraveyardHero
	{
		public User? Hero { get; set; }
		public User? Killer { get; set; }
		public DateTime Timestamp { get; set; }
	}
}