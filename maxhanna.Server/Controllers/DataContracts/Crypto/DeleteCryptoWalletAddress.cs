using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class DeleteCryptoWalletAddress
	{
		public User? User { get; set; }
		public string? Address { get; set; }
	}
}
