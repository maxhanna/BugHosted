namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class DeleteFileNoteRequest
	{
		public int UserId { get; set; }
		public int FileId { get; set; }
		public int TargetUserId { get; set; }
	}
}
