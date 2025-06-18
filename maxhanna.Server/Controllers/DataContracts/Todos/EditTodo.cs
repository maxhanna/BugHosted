using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class EditTodo
	{
		public EditTodo(int id, string content)
		{
			this.id = id;
			this.content = content;
		}
		public int id { get; set; }
		public string content { get; set; }
	}
}
