public class TradeConfiguration
{
	public int UserId { get; set; }
	public string? Strategy { get; set; } = string.Empty;
	public string? FromCoin { get; set; } = string.Empty;
	public string? ToCoin { get; set; } = string.Empty;
	public decimal? MaximumFromBalance { get; set; } 
	public decimal? MinimumFromTradeAmount { get; set; }
	public decimal? MaximumToTradeAmount { get; set; }
	public decimal? TradeThreshold { get; set; }  
	public decimal? ReserveSellPercentage { get; set; }
	public decimal? CoinReserveUSDCValue { get; set; }
	public int? MaxTradeTypeOccurances { get; set; }
	public int? VolumeSpikeMaxTradeOccurance { get; set; }
	public decimal? TradeStopLoss { get; set; }
	public decimal? TradeStopLossPercentage { get; set; }
	public DateTime? Updated { get; set; }
}
