namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class NotifyFollowersRequest
	{
		public NotifyFollowersRequest(int userId, string userName, int fileId, int? fileCount)
		{
			UserId = userId;
			UserName = userName;
			FileId = fileId;
			FileCount = fileCount ?? 1;
		}
		public int UserId { get; set; }
		public string UserName { get; set; }
		public int FileId { get; set; }
		public int? FileCount { get; set; } = 1;
	}
}
