namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusBaseUpgrades
    {
        public int UserId { get; set; }
        public int CoordsX { get; set; }
        public int CoordsY { get; set; }
        public DateTime? CommandCenterUpgraded { get; set; }
        public DateTime? MinesUpgraded { get; set; }
        public DateTime? SupplyDepotUpgraded { get; set; }
        public DateTime? FactoryUpgraded { get; set; }
        public DateTime? StarportUpgraded { get; set; }
    }
}
