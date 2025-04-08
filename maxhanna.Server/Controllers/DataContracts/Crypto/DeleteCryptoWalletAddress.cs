using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class DeleteCryptoWalletAddress
	{
		public int UserId { get; set; }
		public string? Address { get; set; }
	}
}
