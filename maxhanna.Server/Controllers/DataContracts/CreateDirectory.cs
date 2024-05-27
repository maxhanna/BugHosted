namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateDirectory
    {
        public CreateDirectory(User user, string directory, bool isPublic)
        {
            this.user = user;
            this.directory = directory;
            this.isPublic = isPublic;
        }
        public User user { get; set; }
        public string directory { get; set; }
        public bool isPublic { get; set; }
    }
}
