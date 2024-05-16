namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateDirectory
    {
        public CreateDirectory(User user, string directory)
        {
            this.user = user;
            this.directory = directory;
        }
        public User user { get; set; }
        public string directory { get; set; } 
    }
}
