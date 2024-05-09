namespace maxhanna.Server.Controllers.DataContracts
{
    public class CalendarEntry
    {
        public CalendarEntry(int? id, string? type, string? note, DateTime? date)
        {
            Id = id;
            Type = type;
            Note = note;
            Date = date;
        }
        public int? Id { get; set; }
        public string? Type { get; set; }
        public string? Note { get; set; }
        public DateTime? Date { get; set; }
    }
}