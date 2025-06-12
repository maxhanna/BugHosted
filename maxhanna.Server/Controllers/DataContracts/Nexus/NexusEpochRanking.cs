namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusEpochRanking
	{
		public int EpochId { get; set; }
		public int UserId { get; set; }
		public string? Username { get; set; }
		public int BaseCount { get; set; }
		public int TotalBuildingUpgrades { get; set; }
		public int TotalUnitUpgrades { get; set; }
		public int TotalUnits { get; set; }
		public int TotalUnitPurchases { get; set; }
		public decimal TotalGold { get; set; }
		public int TotalSupply { get; set; }
		public int AttacksSent { get; set; }
		public int DefencesSent { get; set; }
		public int BattlesWon { get; set; }
		public int BattlesLost { get; set; }
		public decimal GoldStolen { get; set; }
		public int Rank { get; set; }
		public DateTime Timestamp { get; set; }
	}
}