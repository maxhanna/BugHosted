using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusBaseNameRequest
	{
		public NexusBaseNameRequest(User user, NexusBase nexus, string baseName)
		{
			this.User = user;
			this.Nexus = nexus;
			this.BaseName = baseName;
		}
		public User User { get; set; }
		public NexusBase Nexus { get; set; }
		public string BaseName { get; set; }
	}
}
