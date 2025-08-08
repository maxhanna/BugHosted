namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class GetWalletDataRequest
	{
		public required int UserId { get; set; }
		public required string WalletAddress { get; set; }
		public required string Currency { get; set; }
	}
}
