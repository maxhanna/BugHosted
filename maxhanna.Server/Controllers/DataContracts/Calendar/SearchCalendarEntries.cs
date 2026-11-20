namespace maxhanna.Server.Controllers.DataContracts.Calendar
{
	public class SearchCalendarEntries
	{
		public int UserId { get; set; }
		public string? Query { get; set; }
		public string? Type { get; set; }
		public DateTime? FromDate { get; set; }
		public DateTime? ToDate { get; set; }
	}
}