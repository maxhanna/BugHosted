namespace maxhanna.Server.Controllers.DataContracts.Crypto
{ 
	public class GraphRangeRequest
	{
		public DateTime? From { get; set; }
		public double? HourRange { get; set; }
		public string? Currency { get; set; }
	}
}
