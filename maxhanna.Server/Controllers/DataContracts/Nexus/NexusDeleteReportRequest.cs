namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusDeleteReportRequest
	{
		public NexusDeleteReportRequest(int userId, int[]? battleIds)
		{
			this.UserId = userId;
			this.BattleIds = battleIds;
		}
		public int UserId { get; set; }
		public int[]? BattleIds { get; set; }
	}
}
