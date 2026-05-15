namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UserWithLocation
	{
		public User User { get; set; } = new();
		public string? City { get; set; }
		public string? Country { get; set; }
	}
}
