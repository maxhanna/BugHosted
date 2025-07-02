public class MacdDataPoint
{
	public DateTime Timestamp { get; set; }
	public double? MacdLine { get; set; }
	public double? SignalLine { get; set; }
	public double? Histogram { get; set; }
	public double? Price { get; set; }
}