public class IndicatorData
{
	public required string FromCoin { get; set; }
	public required string ToCoin { get; set; }
	public Boolean TwoHundredDayMA { get; set; }
	public Decimal TwoHundredDayMAValue { get; set; }
	public Boolean FourteenDayMA { get; set; }
	public Decimal FourteenDayMAValue { get; set; } 
	public Boolean TwentyOneDayMA { get; set; }
	public Decimal TwentyOneDayMAValue { get; set; }
	public Decimal RSI14Day { get; set; }
	public Boolean VWAP24Hour { get; set; }
	public Decimal VWAP24HourValue { get; set; }
	public Boolean RetracementFromHigh { get; set; }
	public Decimal RetracementFromHighValue { get; set; }
	public Boolean MACDHistogram { get; set; }
	public Decimal MACDLineValue { get; set; }
	public Decimal MACDSignalValue { get; set; }
}