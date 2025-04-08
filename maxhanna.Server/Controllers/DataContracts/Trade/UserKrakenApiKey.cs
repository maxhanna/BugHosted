namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UserKrakenApiKey
	{
		public int Id { get; set; }
		public int UserId { get; set; }
		public string? ApiKey { get; set; }
		public string? PrivateKey { get; set; } 
	}

}
