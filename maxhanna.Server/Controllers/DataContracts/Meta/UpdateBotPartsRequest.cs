namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class UpdateBotPartsRequest
	{
		public required MetaHero Hero { get; set; }
		public MetaBotPart[]? Parts { get; set; }
	}
}
