using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusAttackSent
    { 
        public int Id { get; set; }
        public int OriginCoordsX { get; set; }
        public int OriginCoordsY { get; set; }
        public User? OriginUser { get; set; }
        public int DestinationCoordsX { get; set; }
        public int DestinationCoordsY { get; set; }
        public User? DestinationUser { get; set; }
        public int? MarineTotal { get; set; }
        public int? GoliathTotal { get; set; }
        public int? SiegeTankTotal { get; set; }
        public int? ScoutTotal { get; set; }
        public int? WraithTotal { get; set; }
        public int? BattlecruiserTotal { get; set; }
        public int? GlitcherTotal { get; set; }
        public int Duration { get; set; }
        public DateTime Timestamp{ get; set; }
        public bool? Arrived { get; set; }
    }
}