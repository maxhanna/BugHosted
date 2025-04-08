namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class UpdateBotPartsRequest
	{
		public required int HeroId { get; set; }
		public MetaBotPart[]? Parts { get; set; }
	}
}
