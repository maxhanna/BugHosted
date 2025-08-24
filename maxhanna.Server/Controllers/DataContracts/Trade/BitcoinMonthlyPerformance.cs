public class CoinMonthlyPerformance
{
	public int Id { get; set; }
	public int Year { get; set; }
	public int Month { get; set; }
	public decimal? StartPriceUSD { get; set; }
	public decimal? EndPriceUSD { get; set; }
	public decimal? StartMarketCapUSD { get; set; }
	public decimal? EndMarketCapUSD { get; set; }
	public decimal? PriceChangePercentage { get; set; }
	public decimal? MarketCapChangePercentage { get; set; }
	public DateTime LastUpdated { get; set; }

	// Optional: Add a formatted month name property for display
	public string MonthName => new DateTime(Year, Month, 1).ToString("MMMM");

	// Optional: Add a formatted year-month key (e.g., "2023-01")
	public string YearMonth => $"{Year}-{Month.ToString().PadLeft(2, '0')}";
}