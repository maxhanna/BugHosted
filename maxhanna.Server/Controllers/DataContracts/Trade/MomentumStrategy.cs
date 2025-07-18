public class MomentumStrategy
{
	public int UserId { get; set; }
	public required string FromCurrency { get; set; }
	public required string ToCurrency { get; set; }
	public decimal CoinPriceUsdc { get; set; }
	public decimal BestCoinPriceUsdc { get; set; }
	public decimal StartingCoinPriceUsdc { get; set; }
	public int? MatchingTradeId { get; set; }
	public required string Strategy { get; set; }
	public DateTime? Timestamp { get; set; }
}