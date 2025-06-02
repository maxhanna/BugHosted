namespace maxhanna.Server.Controllers.DataContracts.Todos
{
	public class ShareTodoColumnRequest
	{
		public ShareTodoColumnRequest(int UserId, int ToUserId, string Column)
		{
			this.UserId = UserId;
			this.ToUserId = ToUserId;
			this.Column = Column;
		}
		public int UserId { get; set; }
		public int ToUserId { get; set; }
		public String Column { get; set; }
	}
}
