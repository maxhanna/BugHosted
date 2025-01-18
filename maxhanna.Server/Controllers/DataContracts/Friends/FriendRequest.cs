using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Friends
{
	public class FriendRequest
	{
		public int Id { get; set; }
		public User? Sender { get; set; }
		public User? Receiver { get; set; }
		public FriendRequestStatus Status { get; set; }
		public DateTime CreatedAt { get; set; }
		public DateTime UpdatedAt { get; set; }
	}

	public enum FriendRequestStatus
	{
		Pending,
		Accepted,
		Rejected,
		Deleted
	}
}