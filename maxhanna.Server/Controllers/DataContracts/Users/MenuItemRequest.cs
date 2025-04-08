namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class MenuItemRequest
	{
		public int UserId { get; set; }
		public string[]? Titles { get; set; }
	}
}
