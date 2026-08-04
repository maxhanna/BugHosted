namespace maxhanna.Server.Controllers.DataContracts.Calendar
{
	public class CalendarEntry
	{
		public CalendarEntry(int? id, string? type, string? note, DateTime? date, string ownership, int? reminder = null)
		{
			Id = id;
			Type = type;
			Note = note;
			Date = date;
			Ownership = ownership;
			Reminder = reminder;
		}
		public int? Id { get; set; }
		public string? Type { get; set; }
		public string? Note { get; set; }
		public DateTime? Date { get; set; }
		public string Ownership { get; set; }
		/// <summary>Minutes before the event to notify the user (null = default).</summary>
		public int? Reminder { get; set; }
	}
}