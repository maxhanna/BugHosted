using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Friends
{
    public class FriendshipRequest
    {
        public User? Sender { get; set; }
        public User? Receiver { get; set; }
    }
}