namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusUnitUpgrades
	{
		public int Id { get; set; }
		public int CoordsX { get; set; }
		public int CoordsY { get; set; }
		public int UnitIdUpgraded { get; set; }
		public DateTime Timestamp { get; set; }

		public NexusUnitUpgrades()
		{
		}

		public NexusUnitUpgrades(int id, int coordsX, int coordsY, int unitIdUpgraded, DateTime timestamp)
		{
			Id = id;
			CoordsX = coordsX;
			CoordsY = coordsY;
			UnitIdUpgraded = unitIdUpgraded;
			Timestamp = timestamp;
		}
	}

}
