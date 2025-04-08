using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class CreateTodo
	{
		public CreateTodo(int userId, Todo todo)
		{
			this.userId = userId;
			this.todo = todo;
		}
		public int userId { get; set; }
		public Todo todo { get; set; }
	}
}
