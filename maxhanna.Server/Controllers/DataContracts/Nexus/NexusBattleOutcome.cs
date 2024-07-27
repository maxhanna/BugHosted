namespace maxhanna.Server.Controllers.DataContracts.Nexus
{

    public class NexusBattleOutcome
    {
        public int BattleId { get; set; }
        public int? OriginUserId { get; set; }
        public int OriginCoordsX { get; set; }
        public int OriginCoordsY { get; set; }
        public int? DestinationUserId { get; set; }
        public int DestinationCoordsX { get; set; }
        public int DestinationCoordsY { get; set; }
        public DateTime Timestamp { get; set; }
        public Dictionary<string, int?> AttackingUnits { get; set; }
        public Dictionary<string, int?> DefendingUnits { get; set; }
        public Dictionary<string, int?> AttackingLosses { get; set; }
        public Dictionary<string, int?> DefendingLosses { get; set; }
    }
}