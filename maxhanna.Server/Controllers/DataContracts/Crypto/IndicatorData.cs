public class IndicatorData
{
	public required string FromCoin { get; set; }
	public required string ToCoin { get; set; }
	public Boolean TwoHundredDayMA { get; set; }
	public Decimal RSI14Day { get; set; }
	public Boolean VWAP24Hour { get; set; }
	public Decimal VWAP24HourValue { get; set; }
}