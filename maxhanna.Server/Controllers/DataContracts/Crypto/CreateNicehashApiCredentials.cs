using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class CreateNicehashApiCredentials
	{
		public CreateNicehashApiCredentials(int userId, NicehashApiKeys keys)
		{
			this.userId = userId;
			this.keys = keys;
		}
		public int userId { get; set; }
		public NicehashApiKeys keys { get; set; }
	}
}
