namespace maxhanna.Server.Controllers.DataContracts.Wordler
{
    public class WordlerGuess
    {
        public User? User { get; set; }
        public int AttemptNumber { get; set; }
        public string? Guess { get; set; }
        public int Difficulty { get; set; }
        public DateTime? Date { get; set; }
    }
}
