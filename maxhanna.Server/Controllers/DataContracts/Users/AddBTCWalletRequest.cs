namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class AddBTCWalletRequest
	{
		public User? User { get; set; }
		public string[]? Wallets { get; set; }
	}
}
