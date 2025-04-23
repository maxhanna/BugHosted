public class TradeConfiguration
{
	public int UserId { get; set; }
	public string? FromCoin { get; set; } = string.Empty;
	public string? ToCoin { get; set; } = string.Empty;
	public decimal? MaximumFromTradeAmount { get; set; }
	public decimal? MinimumFromTradeAmount { get; set; }
	public decimal? MaximumToTradeAmount { get; set; }
	public decimal? TradeThreshold { get; set; }
	public decimal? MaximumTradeBalanceRatio { get; set; }
	public decimal? ValueTradePercentage { get; set; }
	public decimal? FromPriceDiscrepencyStopPercentage { get; set; }
	public decimal? InitialMinimumFromAmountToStart { get; set; }
	public decimal? MinimumFromReserves { get; set; }
	public decimal? MinimumToReserves { get; set; }
	public int? MaxTradeTypeOccurances { get; set; }
	public DateTime? Updated { get; set; }
}
