namespace maxhanna.Server.Controllers.DataContracts.Notepad
{
    public class NotepadEntry
    {
        public NotepadEntry(int id, string note, DateTime date, string? ownership)
        {
            this.id = id;
            this.note = note;
            this.date = date;
            this.ownership = ownership;
        }
        public int id { get; set; }
        public string note { get; set; }
        public DateTime date { get; set; }
        public string? ownership { get; set; }
    }
}
