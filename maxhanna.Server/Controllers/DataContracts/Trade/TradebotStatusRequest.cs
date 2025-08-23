
public class TradebotStatusRequest
{
	public required int UserId { get; set; }
	public required string Coin { get; set; }
	public string? Strategy { get; set; }
	public int? Hours { get; set; }
	public int? Page { get; set; }
	public int? PageSize { get; set; }
}
