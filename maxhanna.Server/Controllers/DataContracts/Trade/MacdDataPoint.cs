public class MacdDataPoint
{
	public DateTime Timestamp { get; set; }
	public decimal? MacdLine { get; set; }
	public decimal? SignalLine { get; set; }
	public decimal? Histogram { get; set; }
	public decimal? Price { get; set; }
}