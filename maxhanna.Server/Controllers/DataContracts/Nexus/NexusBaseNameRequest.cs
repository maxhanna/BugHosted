using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusBaseNameRequest
	{
		public NexusBaseNameRequest(NexusBase nexus, string baseName)
		{ 
			this.Nexus = nexus;
			this.BaseName = baseName;
		} 
		public NexusBase Nexus { get; set; }
		public string BaseName { get; set; }
	}
}
