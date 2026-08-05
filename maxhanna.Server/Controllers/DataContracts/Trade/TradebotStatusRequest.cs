
public class TradebotStatusRequest
{
	public required int UserId { get; set; }
	public required string Coin { get; set; }
	public string? Strategy { get; set; }
	public double? Hours { get; set; }
	public int? Page { get; set; }
	public int? PageSize { get; set; }
	public string? Search { get; set; }
	public long? MatchingTradeId { get; set; }
	public bool HasMatchingTrade { get; set; }
	public DateTime? FromDate { get; set; }
	public DateTime? ToDate { get; set; }
	public double? SpentMin { get; set; }
	public double? SpentMax { get; set; }
	public double? ReceivedMin { get; set; }
	public double? ReceivedMax { get; set; }
	public bool HasPrice { get; set; }
	public bool ExportAll { get; set; }
}
