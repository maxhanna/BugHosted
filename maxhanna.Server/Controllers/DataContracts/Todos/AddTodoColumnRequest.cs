namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class AddTodoColumnRequest
	{
		public AddTodoColumnRequest(int UserId, string Column)
		{
			this.UserId = UserId;
			this.Column = Column;
		}
		public int UserId { get; set; }
		public String Column { get; set; }
	}
}
