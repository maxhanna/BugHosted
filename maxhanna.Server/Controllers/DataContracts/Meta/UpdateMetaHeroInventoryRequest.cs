namespace maxhanna.Server.Controllers.DataContracts.Meta
{
	public class UpdateMetaHeroInventoryRequest
	{
		public required MetaHero Hero { get; set; }
		public required string Name { get; set; }
		public required string Image { get; set; }
		public required string Category { get; set; }
	}
}
