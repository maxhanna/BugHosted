using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusDeleteReportRequest
	{
		public NexusDeleteReportRequest(User user, int[]? battleIds)
		{
			this.User = user;
			this.BattleIds = battleIds;
		}
		public User User { get; set; }
		public int[]? BattleIds { get; set; }
	}
}
