namespace maxhanna.Server.Controllers.DataContracts
{
    public class DisplayPictureRequest
    {
        public User User { get; set; }
        public int FileId { get; set; } 

        public DisplayPictureRequest(User user, int fileId)
        {
            User = user;
            FileId = fileId; 
        }
    }
}
