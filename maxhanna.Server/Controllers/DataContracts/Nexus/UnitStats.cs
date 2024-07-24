namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class UnitStats
    {
        public int Id { get; set; }
        public int UnitId { get; set; }
        public string? UnitType { get; set; }
        public int UnitLevel { get; set; }
        public int Duration { get; set; }
        public int Cost { get; set; }
        public int Supply { get; set; }
        public Decimal Speed { get; set; } 
        public int FactoryLevel { get; set; }
        public int EngineeringBayLevel { get; set; }
        public int StarportLevel { get; set; }
        public int AirDamage { get; set; }
        public int GroundDamage { get; set; }
        public int BuildingDamage { get; set; }
        public int? SentValue { get; set; }

    }
}
