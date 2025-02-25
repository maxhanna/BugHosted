using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusReturnDefenceRequest
	{
		public NexusReturnDefenceRequest(User user, int defenceId)
		{
			this.User = user;
			this.DefenceId = defenceId;

		}
		public User User { get; set; }
		public int DefenceId { get; set; }
	}
}
