namespace maxhanna.Server.Controllers.DataContracts.Calendar
{
	public class CalendarNotificationSent
	{
		public CalendarNotificationSent(string? calendarText, DateTime? calendarDate, DateTime? notificationSent)
		{
			CalendarText = calendarText;
			CalendarDate = calendarDate;
			NotificationSent = notificationSent;
		}
		public string? CalendarText { get; set; }
		public DateTime? CalendarDate { get; set; }
		public DateTime? NotificationSent { get; set; }
	}
}
