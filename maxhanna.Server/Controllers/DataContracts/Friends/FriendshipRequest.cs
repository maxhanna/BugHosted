namespace maxhanna.Server.Controllers.DataContracts.Friends
{
	public class FriendshipRequest
	{
		public int? SenderId { get; set; }
		public int? ReceiverId { get; set; }
		public int? RequestId { get; set; }
	}
}