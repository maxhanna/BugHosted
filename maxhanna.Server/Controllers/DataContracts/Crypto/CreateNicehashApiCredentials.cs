using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class CreateNicehashApiCredentials
    {
        public CreateNicehashApiCredentials(User user, NicehashApiKeys keys)
        {
            this.user = user;
            this.keys = keys;
        }
        public User user { get; set; }
        public NicehashApiKeys keys { get; set; }
    }
}
