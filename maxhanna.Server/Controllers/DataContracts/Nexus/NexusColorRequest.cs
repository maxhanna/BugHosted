using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusColorRequest
	{
		public NexusColorRequest(User user, string? color)
		{
			this.User = user;
			this.Color = color;
		}
		public User User { get; set; }
		public string? Color { get; set; }
	}
}
