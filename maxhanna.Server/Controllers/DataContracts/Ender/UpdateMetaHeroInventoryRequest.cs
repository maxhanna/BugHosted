namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class UpdateMetaHeroInventoryRequest
    {
        public int HeroId { get; set; }
        public string? Name { get; set; }
        public string? Image { get; set; }
        public string? Category { get; set; }
    }
}
