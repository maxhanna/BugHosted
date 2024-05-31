namespace maxhanna.Server.Controllers.DataContracts
{
    public class Todo
    {
        public Todo(int id, string todo, string type, string? url, DateTime? date, string? ownership)
        {
            this.id = id;
            this.todo = todo;
            this.type = type;
            this.url = url;
            this.date = date;
            this.ownership = ownership;
        }
        public int id { get; set; }
        public string todo { get; set; }
        public string type { get; set; }
        public string? url { get; set; }
        public DateTime? date { get; set; }
        public string? ownership { get; set; }
    }
}
