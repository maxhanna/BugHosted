namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusBase
    {
        public int UserId { get; set; }
        public int Gold { get; set; }
        public int CoordsX { get; set; }
        public int CoordsY { get; set; }
        public int NexusLevel { get; set; }
        public int MineLevel { get; set; }
        public int SupplyDepotLevel { get; set; }
        public int FactoryLevel { get; set; }
        public int StarportLevel { get; set; }
        public DateTime Conquered { get; set; }
    }
}
