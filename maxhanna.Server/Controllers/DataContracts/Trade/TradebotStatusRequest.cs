
public class TradebotStatusRequest
{
	public required int UserId { get; set; }
	public required string Coin { get; set; }
	public string? Strategy { get; set; }
}
