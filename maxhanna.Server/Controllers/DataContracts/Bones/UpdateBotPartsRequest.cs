namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class UpdateBotPartsRequest
	{
		public required int HeroId { get; set; }
		public MetaBotPart[]? Parts { get; set; }
	}
}
