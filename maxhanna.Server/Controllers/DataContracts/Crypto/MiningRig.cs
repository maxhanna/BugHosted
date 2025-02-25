namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
	public class MiningRig
	{
		public string? rigId { get; set; }
		public string? rigName { get; set; }
		public string? minerStatus { get; set; }
		public float unpaidAmount { get; set; }
		public float speedRejected { get; set; }
		public float localProfitability { get; set; }
		public float actualProfitability { get; set; }
		public List<MiningRigDevice>? devices { get; set; }
	}
}
