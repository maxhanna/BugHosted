using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class FileEntry
	{
		public int Id { get; set; }
		public FileData? FileData { get; set; }
		public string? FileName { get; set; }
		public string? GivenFileName { get; set; }
		public string? Description { get; set; }
		public string? Directory { get; set; }
		public string? Visibility { get; set; }
		public string? SharedWith { get; set; }
		public User? User { get; set; }
		public int LastUpdatedUserId { get; set; }
		public User? LastUpdatedBy { get; set; }
		public bool IsFolder { get; set; }
		public List<FileComment>? FileComments { get; set; }
		public DateTime Date { get; set; }
		public DateTime? LastUpdated { get; set; }
		public string? FileType { get; set; }
		public int FileSize { get; set; }
		public int? Height { get; set; }
		public int? Width { get; set; }
		public int? Duration { get; set; }
		public List<Reaction>? Reactions { get; set; }
		public List<Topic>? Topics { get; set; }
		public DateTime? LastAccess { get; set; }

		public FileEntry() { }
		public FileEntry(int id)
		{
			Id = id;
		}
	}
}
