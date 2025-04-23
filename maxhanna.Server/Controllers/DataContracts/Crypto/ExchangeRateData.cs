namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class ExchangeRateData
	{
		public string? Base { get; set; }
		public Dictionary<string, decimal>? Rates { get; set; }
	}
}
