using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class EditTodo
	{
		public EditTodo(int id, string content, string? url, int? fileId)
		{
			this.id = id;
			this.content = content;
			this.url = url;
			this.fileId = fileId;
		}
		public int id { get; set; }
		public string content { get; set; }
		public string? url { get; set; }
		public int? fileId { get; set; }
	}
}
