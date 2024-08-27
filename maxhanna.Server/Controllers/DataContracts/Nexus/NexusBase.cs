using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusBase
    {
        public User? User { get; set; }
        public Decimal Gold { get; set; }
        public string? BaseName { get; set; }
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
        public int MarineLevel { get; set; }
        public int GoliathLevel { get; set; }
        public int SiegeTankLevel { get; set; }
        public int ScoutLevel { get; set; }
        public int WraithLevel { get; set; }
        public int BattlecruiserLevel { get; set; }
        public int GlitcherLevel { get; set; }
        public DateTime Conquered { get; set; }
        public DateTime Updated { get; set; }
    }
}
