using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Calendar
{
    public class EditCalendarEntry
    {
        public EditCalendarEntry(int userId, CalendarEntry calendarEntry)
        {
            this.userId = userId;
            this.calendarEntry = calendarEntry;
        }

        public int userId { get; set; }
        public CalendarEntry calendarEntry { get; set; }
    }
}
