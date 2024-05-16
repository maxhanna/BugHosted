namespace maxhanna.Server.Controllers.DataContracts
{
    public class CalendarEntry
    {
        public CalendarEntry(int? id, string? type, string? note, DateTime? date, string ownership)
        {
            Id = id;
            Type = type;
            Note = note;
            Date = date;
            Ownership = ownership;
        }
        public int? Id { get; set; }
        public string? Type { get; set; }
        public string? Note { get; set; }
        public DateTime? Date { get; set; }
        public string Ownership { get; set; }
    }
}