namespace maxhanna.Server.Controllers.DataContracts
{
    public class DeleteFileOrDirectory
    {
        public DeleteFileOrDirectory(User user, string file)
        {
            this.user = user;
            this.file = file;
        }
        public User user { get; set; }
        public string file { get; set; } 
    }
}
