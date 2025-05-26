namespace maxhanna.Server.Controllers.DataContracts.Top
{
	public class UserVoteRequest
	{
		public int UserId { get; set; }
		public int[] EntryIds { get; set; } = [];

		public UserVoteRequest()
		{
		}

		public UserVoteRequest(int userId, int[] entryIds)
		{
			UserId = userId;
			EntryIds = entryIds ?? [];
		}
	}
}