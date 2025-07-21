public class TradeRecord
{
	public int id { get; set; }
	public int user_id { get; set; }
	public required string from_currency { get; set; }
	public required string to_currency { get; set; }
	public string? strategy { get; set; }
	public float value { get; set; }
	public DateTime timestamp { get; set; }
	public float? coin_price_cad { get; set; }
	public float? coin_price_usdc { get; set; }
	public float trade_value_cad { get; set; }
	public float trade_value_usdc { get; set; }
	public float fees { get; set; }
	public int? matching_trade_id { get; set; }
	public bool is_reserved { get; set; }
}