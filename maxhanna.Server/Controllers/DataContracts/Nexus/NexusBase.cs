namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusBase
    {
        public int UserId { get; set; }
        public Decimal Gold { get; set; }
        public int Supply { get; set; }
        public int CoordsX { get; set; }
        public int CoordsY { get; set; }
        public int CommandCenterLevel { get; set; }
        public int MinesLevel { get; set; }
        public int SupplyDepotLevel { get; set; }
        public int WarehouseLevel { get; set; }
        public int EngineeringBayLevel { get; set; }
        public int FactoryLevel { get; set; }
        public int StarportLevel { get; set; }
        public DateTime Conquered { get; set; }
        public DateTime Updated { get; set; }
    }
}
