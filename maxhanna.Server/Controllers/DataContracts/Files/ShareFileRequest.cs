using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
    public class ShareFileRequest
    {
        public ShareFileRequest(User user1, User user2)
        {
            User1 = user1;
            User2 = user2;
        }
        public User User1 { get; set; }
        public User User2 { get; set; }
    }
}
