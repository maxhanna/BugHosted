public class ProfitData
{
	public required string PeriodType { get; set; } // "daily", "weekly", or "monthly"
	public DateTime? PeriodStart { get; set; }
	public DateTime? PeriodEnd { get; set; }
	public decimal StartUsdc { get; set; }
	public decimal StartBtc { get; set; }
	public decimal StartBtcPriceUsdc { get; set; }
	public decimal EndUsdc { get; set; }
	public decimal EndBtc { get; set; }
	public decimal EndBtcPriceUsdc { get; set; }
	public decimal ProfitUsdc { get; set; }
	public decimal CumulativeProfitUsdc { get; set; }
	public decimal AbsoluteProfitUsdc { get; set; }
}
