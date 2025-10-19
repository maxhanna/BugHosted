namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class SellBotPartsRequest
	{
		public int HeroId { get; set; }
		public int[]? PartIds { get; set; }
	}
}
