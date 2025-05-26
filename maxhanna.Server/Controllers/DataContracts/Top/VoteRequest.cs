namespace maxhanna.Server.Controllers.DataContracts.Top
{
	public class VoteRequest
	{
		public int EntryId { get; set; }
		public int UserId { get; set; }
		public bool IsUpvote { get; set; }

		public VoteRequest()
		{
		}

		public VoteRequest(int entryId, int userId, bool isUpvote)
		{
			EntryId = entryId;
			UserId = userId;
			IsUpvote = isUpvote;
		}
	}
}