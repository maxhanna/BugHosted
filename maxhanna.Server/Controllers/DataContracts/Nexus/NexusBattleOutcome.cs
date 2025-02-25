using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{

	public class NexusBattleOutcome
	{
		public int BattleId { get; set; }
		public User? OriginUser { get; set; }
		public int OriginCoordsX { get; set; }
		public int OriginCoordsY { get; set; }
		public User? DestinationUser { get; set; }
		public int DestinationCoordsX { get; set; }
		public int DestinationCoordsY { get; set; }
		public DateTime Timestamp { get; set; }
		public Dictionary<string, int?>? AttackingUnits { get; set; }
		public Dictionary<string, int?>? DefendingUnits { get; set; }
		public Dictionary<string, int?>? AttackingLosses { get; set; }
		public Dictionary<string, int?>? DefendingLosses { get; set; }
		public Dictionary<string, int?>? DefenderBuildingLevels { get; set; }
		public Dictionary<string, int?>? DefenderUnitsNotInVillage { get; set; }
		public Decimal? DefenderGold { get; set; }
		public Decimal DefenderGoldStolen { get; set; }
	}
}