namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class DailyMiningEarnings
    {
        public DateTime Date { get; set; }
        public List<int>? Algos { get; set; }
        public decimal TotalEarnings { get; set; }
    }
}
