public class MacdDataRequest
{
	public string FromCoin { get; set; } = string.Empty;
	public string ToCoin { get; set; } = string.Empty;
	public int Days { get; set; } = 30;
	public int FastPeriod { get; set; } = 12;
	public int SlowPeriod { get; set; } = 26;
	public int SignalPeriod { get; set; } = 9;
}