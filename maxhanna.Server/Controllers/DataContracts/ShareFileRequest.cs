namespace maxhanna.Server.Controllers.DataContracts
{
    public class ShareFileRequest
    {
        public ShareFileRequest(User user1, User user2)
        {
            this.User1 = user1;
            this.User2 = user2;
        }
        public User User1 { get; set; }
        public User User2 { get; set; }
    }
}
