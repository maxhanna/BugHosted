namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class CryptoCalendarEventResponse
	{
		public string? EventId { get; set; }
		public string? Title { get; set; }
		public string? CoinSymbol { get; set; }
		public string? CoinName { get; set; }
		public DateTime EventDate { get; set; }
		public DateTime CreatedDate { get; set; }
		public string? Source { get; set; }
		public string? Description { get; set; }
		public bool IsHot { get; set; }
		public string? ProofUrl { get; set; }
	}
}
