namespace maxhanna.Server.Controllers.DataContracts
{
    public class WordlerScore
    {
        public int Id { get; set; }
        public User? User { get; set; }
        public int Score { get; set; }
        public int Time { get; set; }
        public DateTime Submitted { get; set; }
        public int Difficulty { get; set; }
    }
}