namespace maxhanna.Server.Controllers.DataContracts
{
    public class FriendshipRequest
    {
        public User? Sender { get; set; }
        public User? Receiver { get; set; }
    }
}