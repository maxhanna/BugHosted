namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class BattleReportRequest
	{
		public required int UserId { get; set; }
		public NexusBase? TargetBase { get; set; }
		public int? TargetUserId { get; set; }
		public int PageNumber { get; set; }
		public int PageSize { get; set; }
	}
}
