
public class GetPageForTradeIdRequest
{
	public int UserId { get; set; }
	public int TradeId { get; set; }
	public required string Coin { get; set; }
	public required string Strategy { get; set; }
	public int TradesPerPage { get; set; }
}
