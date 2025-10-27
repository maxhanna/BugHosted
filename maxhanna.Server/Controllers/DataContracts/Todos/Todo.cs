namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class Todo
	{
		public Todo(int id, string todo, string type, string? url, int? fileId, DateTime? date, int ownership, string? owner_name = null)
		{
			this.id = id;
			this.todo = todo;
			this.type = type;
			this.url = url;
			this.fileId = fileId;
			this.date = date;
			this.ownership = ownership;
			this.owner_name = owner_name;
		}
		public int id { get; set; }
		public string todo { get; set; }
		public string type { get; set; }
		public string? url { get; set; }
		public int? fileId { get; set; }
		public DateTime? date { get; set; }
		public int ownership { get; set; }
		public string? owner_name { get; set; }
	}
}