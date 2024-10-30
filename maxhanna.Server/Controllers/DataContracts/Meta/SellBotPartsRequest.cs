using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class SellBotPartsRequest
	{
		public int HeroId { get; set; }
		public int[]? PartIds { get; set; }
	}
}
