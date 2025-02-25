namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class UnitUpgradeStats
	{
		public int UnitLevel { get; set; }
		public decimal DamageMultiplier { get; set; }
		public int Duration { get; set; }

		public UnitUpgradeStats()
		{
		}

		public UnitUpgradeStats(int unitLevel, decimal damageMultiplier, int duration)
		{
			UnitLevel = unitLevel;
			DamageMultiplier = damageMultiplier;
			Duration = duration;
		}
	}
}