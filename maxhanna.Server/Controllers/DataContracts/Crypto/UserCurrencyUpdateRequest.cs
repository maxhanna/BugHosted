using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class UserCurrencyUpdateRequest
	{
        public UserCurrencyUpdateRequest(User User, string Currency)
        {
            this.User = User;
            this.Currency = Currency;
        }
        public User User { get; set; }
        public string Currency { get; set; }
    }
}
