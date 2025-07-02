public class KrakenTrade
{
	public string? TradeId { get; set; }        // Trade transaction ID
	public string? OrderId { get; set; }       // Order ID that this trade belongs to
	public string? Pair { get; set; }          // Asset pair (e.g., "XBTUSDC")
	public string? Type { get; set; }          // "buy" or "sell"
	public decimal Price { get; set; }        // Price in quote currency
	public decimal Volume { get; set; }       // Volume in base currency
	public float Fee { get; set; }          // Fee amount in quote currency
	public decimal Cost { get; set; }         // Total cost (price * volume) in quote currency
	public DateTime Timestamp { get; set; }   // When the trade occurred 
	public string? Margin { get; set; }        // Margin position ID (if margin trade)
	public string? Misc { get; set; }          // Miscellaneous info
	public string? PosTxId { get; set; }       // Position ID (for margin/derivatives)
	public bool? HasDifference { get; set; } //internal for setting fees.
}