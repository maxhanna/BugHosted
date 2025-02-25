namespace maxhanna.Server.Controllers.DataContracts.Nexus
{

	public class NexusBattleOutcomeReports
	{
		public required List<NexusBattleOutcome> BattleOutcomes { get; set; }
		public int CurrentPage { get; set; }
		public int PageSize { get; set; }
		public int TotalReports { get; set; }
	}
}