public class CoinMarketCap
{
	public string? CoinId { get; set; }
	public string? Symbol { get; set; }
	public string? Name { get; set; }
	public decimal MarketCapUSD { get; set; }
	public decimal MarketCapCAD { get; set; }
	public decimal PriceUSD { get; set; }
	public decimal PriceCAD { get; set; }
	public decimal PriceChangePercentage24h { get; set; }
	public decimal InflowChange24h { get; set; }
	public DateTime RecordedAt { get; set; }
}