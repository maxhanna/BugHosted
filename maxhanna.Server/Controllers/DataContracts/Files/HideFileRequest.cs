namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class HideFileRequest
	{
		public HideFileRequest(int UserId, int FileId)
		{
			this.UserId = UserId;
			this.FileId = FileId;
		}
		public int UserId { get; set; }
		public int FileId { get; set; }
	}
}
