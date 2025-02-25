using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class MiningStatusUpdate
	{
		public MiningStatusUpdate(User user, string requestedAction)
		{
			this.user = user;
			this.requestedAction = requestedAction;
		}
		public User user { get; set; }
		public string requestedAction { get; set; }
	}
}
