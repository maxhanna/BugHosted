
public class GetTradesForPageRequest
{
	public int UserId { get; set; }
	public int PageNumber { get; set; }
	public int TradesPerPage { get; set; }
	public required string Coin { get; set; }
	public required string Strategy { get; set; }
}
