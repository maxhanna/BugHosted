using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusEngagementRequest
    {
        public NexusEngagementRequest(User user, NexusBase? originNexus, NexusBase? destinationNexus, UnitStats[] unitList, int distanceTimeInSeconds)
        {
            this.User = user;
            this.OriginNexus = originNexus;
            this.DestinationNexus = destinationNexus;
            this.UnitList = unitList;
            this.DistanceTimeInSeconds = distanceTimeInSeconds;
        }
        public User User { get; set; }
        public NexusBase? OriginNexus { get; set; }
        public NexusBase? DestinationNexus { get; set; }
        public UnitStats[] UnitList { get; set; }
        public int DistanceTimeInSeconds { get; set; }
    }
}
