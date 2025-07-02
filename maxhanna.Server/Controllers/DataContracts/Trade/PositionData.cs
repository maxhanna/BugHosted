public class PositionData
{
	public string? Symbol { get; set; }
	public string? Side { get; set; }
	public decimal Size { get; set; }
	public decimal Price { get; set; }
	public decimal UnrealizedPnl { get; set; }
	public bool HasStopLoss { get; set; }
	public decimal? StopPrice { get; set; }
}