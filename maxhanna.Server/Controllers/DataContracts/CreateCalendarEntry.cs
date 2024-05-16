namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateCalendarEntry
    {
        public CreateCalendarEntry(User user, CalendarEntry calendarEntry)
        {
            this.user = user;
            this.calendarEntry = calendarEntry;
        }
        public User user { get; set; }
        public CalendarEntry calendarEntry { get; set; }
    }
}
