using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Calendar
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
