namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UserThemeRequest
	{
		public int UserId { get; set; }
		public required UserTheme Theme { get; set; }
	}  
}
