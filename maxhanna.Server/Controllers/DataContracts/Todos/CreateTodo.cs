using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class CreateTodo
	{
		public CreateTodo(User user, Todo todo)
		{
			this.user = user;
			this.todo = todo;
		}
		public User user { get; set; }
		public Todo todo { get; set; }
	}
}
