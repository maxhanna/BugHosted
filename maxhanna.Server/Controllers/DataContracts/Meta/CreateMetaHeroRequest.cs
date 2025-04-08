using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class CreateMetaHeroRequest
	{
		public int UserId { get; set; }
		public string? Name { get; set; }
	}
}
