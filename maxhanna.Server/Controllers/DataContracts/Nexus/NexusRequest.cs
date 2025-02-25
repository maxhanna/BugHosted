using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusRequest
	{
		public NexusRequest(User user, NexusBase? nexus)
		{
			this.User = user;
			this.Nexus = nexus;
		}
		public User User { get; set; }
		public NexusBase? Nexus { get; set; }
	}
}
