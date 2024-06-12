namespace maxhanna.Server.Controllers.DataContracts
{
    public class FileDataRequest
    {
        public User User { get; set; }
        public FileData FileData { get; set; } 

        public FileDataRequest(User user, FileData fileData)
        {
            User = user;
            FileData = fileData; 
        }
    }
}
