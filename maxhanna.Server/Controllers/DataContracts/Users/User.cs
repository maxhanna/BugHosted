
using maxhanna.Server.Controllers.DataContracts.Files;

namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class User
	{
		public int? Id { get; set; } // leave nullable because users need to be able to login without IDs
		public string? Username { get; set; }
		public string? Pass { get; set; }
		public DateTime? Created { get; set; }
		public DateTime? LastSeen { get; set; }
		public FileEntry? DisplayPictureFile { get; set; }
		public FileEntry? ProfileBackgroundPictureFile { get; set; }
		public UserAbout? About { get; set; }
		public User() { }
		public User(int id, string username, string? pass, FileEntry? displayPictureFile, FileEntry? profileBackgroundPictureFile,
		 UserAbout? about, DateTime? created, DateTime? lastSeen)
		{
			Id = id;
			Username = username;
			Pass = pass;
			DisplayPictureFile = displayPictureFile;
			ProfileBackgroundPictureFile = profileBackgroundPictureFile;
			About = about;
			Created = created;
			LastSeen = lastSeen;
		}
		public User(int id, string username, string? pass, FileEntry? displayPictureFile,
		 UserAbout? about, DateTime? created, DateTime? lastSeen)
		{
			Id = id;
			Username = username;
			Pass = pass;
			DisplayPictureFile = displayPictureFile;
			About = about;
			Created = created;
			LastSeen = lastSeen;
		}
		public User(int id, string username, FileEntry? displayPictureFile)
		{
			Id = id;
			Username = username;
			DisplayPictureFile = displayPictureFile;
		}
		public User(int id, string username, FileEntry? displayPictureFile, FileEntry? backgroundPictureFile)
		{
			Id = id;
			Username = username;
			DisplayPictureFile = displayPictureFile;
			ProfileBackgroundPictureFile = backgroundPictureFile;
		}
		public User(int id, string username)
		{
			Id = id;
			Username = username;
		}
		public User(int id)
		{
			Id = id;
			Username = "Anonymous";
		}
	}
}
