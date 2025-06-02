namespace maxhanna.Server.Controllers.DataContracts.Todos
{

	public class LeaveSharedColumnRequest
	{
		public int UserId { get; set; }       // The user who wants to leave
		public int OwnerId { get; set; }      // The owner of the column
		public string? ColumnName { get; set; } // The column name
	}
}
