namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusResearchRequest
	{
		public NexusResearchRequest(NexusBase nexusBase, UnitStats unit)
		{ 
			this.NexusBase = nexusBase;
			this.Unit = unit;
		} 
		public NexusBase NexusBase { get; set; }
		public UnitStats Unit { get; set; }
	}
}
