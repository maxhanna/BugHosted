using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class AddTodoColumnRequest
	{
		public AddTodoColumnRequest(User User, string Column)
		{
			this.User = User;
			this.Column = Column;
		}
		public User User { get; set; }
		public String Column { get; set; }
	}
}
