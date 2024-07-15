
using maxhanna.Server.Controllers.DataContracts.Files;

namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class User
    {
        public int Id { get; set; }
        public string? Username { get; set; }
        public string? Pass { get; set; }
        public FileEntry? DisplayPictureFile { get; set; }
        public UserAbout? About { get; set; }
        public User() { }
        public User(int id, string username, string? pass, FileEntry? displayPictureFile, UserAbout? about)
        {
            Id = id;
            Username = username;
            Pass = pass;
            DisplayPictureFile = displayPictureFile;
            About = about;
        }
        public User(int id, string username)
        {
            Id = id;
            Username = username;
        }
    }
}
