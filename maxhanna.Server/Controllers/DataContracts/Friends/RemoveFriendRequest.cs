using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Friends
{
	public class RemoveFriendRequest
	{
		public int UserId { get; set; }
		public int FriendId { get; set; }
	}
}