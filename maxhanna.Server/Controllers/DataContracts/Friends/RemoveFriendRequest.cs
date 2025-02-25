using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Friends
{
	public class RemoveFriendRequest
	{
		public User? User { get; set; }
		public User? Friend { get; set; }
	}
}