using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
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
