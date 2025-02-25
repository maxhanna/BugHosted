namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class DirectoryResults
	{
		public int TotalCount { get; set; }
		public string? CurrentDirectory { get; set; }
		public int Page { get; set; }
		public int PageSize { get; set; }
		public List<FileEntry>? Data { get; set; }
	}
}
