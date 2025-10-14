namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class WallsAroundHeroRequest
    {
        public MetaHero? Hero { get; set; }
        public int RadiusSeconds { get; set; }
    }
}
