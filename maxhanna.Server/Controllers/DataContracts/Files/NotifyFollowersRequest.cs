namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class NotifyFollowersRequest
	{
		public NotifyFollowersRequest(int userId, int fileId, int? fileCount)
		{
			UserId = userId;
			FileId = fileId;
			FileCount = fileCount ?? 1;
		}
		public int UserId { get; set; }
		public int FileId { get; set; }
		public int? FileCount { get; set; } = 1;
	}
}
