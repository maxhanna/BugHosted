namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class PendingWall
    {
        public int x { get; set; }
        public int y { get; set; }
    }

    public class FetchGameDataRequest
    {
        public MetaHero? hero { get; set; }
        public List<PendingWall>? pendingWalls { get; set; }
    }
}
