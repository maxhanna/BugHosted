namespace maxhanna.Server.Controllers.DataContracts.Marbles
{
    /// <summary>
    /// A single Marbles high-score entry. Only single-player (vs Computer)
    /// games are recorded; the score is the total number of marbles cleared.
    /// </summary>
    public class MarblesScore
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string? Username { get; set; }
        public int Score { get; set; }
        public int Difficulty { get; set; } // 0 easy, 1 medium, 2 hard
        public int DurationSeconds { get; set; }
        public DateTime Submitted { get; set; }
    }
}
