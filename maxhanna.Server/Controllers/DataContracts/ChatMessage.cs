namespace maxhanna.Server.Controllers.DataContracts
{
    public class MessageHistoryRequest
    {
        public User? user1 {  get; set; }
        public User? user2 { get; set; }
    }

    public class Message
    {
        public int Id { get; set; }
        public User? Sender { get; set; }
        public User? Receiver { get; set; }
        public string? Content { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
