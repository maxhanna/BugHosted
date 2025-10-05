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
    // Client supplies the highest wall Id it already knows so server can return only newer walls (delta)
    public int? lastKnownWallId { get; set; }
    }
}
