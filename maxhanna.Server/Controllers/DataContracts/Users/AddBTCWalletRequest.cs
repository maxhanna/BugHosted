namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class AddBTCWalletRequest
	{
		public int UserId { get; set; }
		public string[]? Wallets { get; set; }
	}
}
