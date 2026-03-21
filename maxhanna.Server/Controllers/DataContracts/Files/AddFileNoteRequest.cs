namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class AddFileNoteRequest
	{
		public int UserId { get; set; }
		public int FileId { get; set; }
		public string? Note { get; set; }
	}
}
