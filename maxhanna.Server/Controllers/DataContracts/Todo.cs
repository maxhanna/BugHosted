namespace maxhanna.Server.Controllers.DataContracts
{
    public class VoteRequest
    {
        public VoteRequest(User user, int fileId)
        {
            FileId = fileId;
            User = user;
        }
        public int FileId { get; set; }
        public User User { get; set; }
    }
}
