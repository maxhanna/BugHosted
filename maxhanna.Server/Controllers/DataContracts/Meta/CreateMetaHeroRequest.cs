using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class CreateMetaHeroRequest
	{
		public User? User { get; set; }
		public string? Name { get; set; }
	}
}
