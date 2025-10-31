using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class CreateMetaHeroRequest
	{
		public int UserId { get; set; }
		public string? Name { get; set; }
		public string? Type { get; set; }
	}
}
