namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusUnitsPurchased
    { 
        public int CoordsX { get; set; }
        public int CoordsY { get; set; }
        public int UnitIdPurchased { get; set; }
        public int QuantityPurchased { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
