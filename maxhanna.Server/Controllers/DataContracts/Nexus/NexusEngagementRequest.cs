namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusEngagementRequest
	{
		public NexusEngagementRequest(NexusBase? originNexus, NexusBase? destinationNexus, UnitStats[] unitList)
		{ 
			this.OriginNexus = originNexus;
			this.DestinationNexus = destinationNexus;
			this.UnitList = unitList;
		} 
		public NexusBase? OriginNexus { get; set; }
		public NexusBase? DestinationNexus { get; set; }
		public UnitStats[] UnitList { get; set; }
	}
}
