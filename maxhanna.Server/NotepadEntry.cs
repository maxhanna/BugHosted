namespace maxhanna.Server
{
    public class NotepadEntry
    {
        public NotepadEntry(int id, string note, DateTime date)
        {
            this.id = id;
            this.note = note;
            this.date = date;
        }
        public int id { get; set; }
        public string note { get; set; }
        public DateTime date { get; set; }
    }
}
