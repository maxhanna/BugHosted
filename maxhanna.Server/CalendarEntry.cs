namespace maxhanna.Server
{
    public class CalendarEntry
    {
        public CalendarEntry(int? id, string? type, string? note, DateTime? date)
        {
            this.Id = id;
            this.Type = type;
            this.Note = note;
            this.Date = date;
        }
        public int? Id { get; set; }
        public string? Type { get; set; }
        public string? Note { get; set; }
        public DateTime? Date { get; set; }
    }
}