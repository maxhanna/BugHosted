using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class UserCurrencyUpdateRequest
	{
		public UserCurrencyUpdateRequest(int UserId, string Currency)
		{
			this.UserId = UserId;
			this.Currency = Currency;
		}
		public int UserId { get; set; }
		public string Currency { get; set; }
	}
}
