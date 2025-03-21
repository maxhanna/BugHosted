using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
	public class CommentRequest
	{
		public CommentRequest(User? user, int? fileId, int? storyId, int? commentId, int? userProfileId, List<FileEntry>? selectedFiles, string comment, string? city, string? country, string? ip)
		{
			User = user;
			StoryId = storyId;
			FileId = fileId;
			CommentId = commentId;
			UserProfileId = userProfileId;
			Comment = comment;
			SelectedFiles = selectedFiles;
			Country = country;
			City = city;
			Ip = ip;
		}
		public User? User { get; set; }
		public int? FileId { get; set; }
		public int? StoryId { get; set; }
		public int? CommentId { get; set; }
		public int? UserProfileId { get; set; }
		public string? City { get; set; }
		public string? Country { get; set; }
		public string? Ip { get; set; }
		public string Comment { get; set; }
		public List<FileEntry>? SelectedFiles { get; set; }
	}
}
