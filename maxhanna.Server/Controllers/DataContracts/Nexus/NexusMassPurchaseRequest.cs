namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusMassPurchaseRequest
	{
		public NexusMassPurchaseRequest(int userId, String upgrade)
		{
			this.UserId = userId;
			this.Upgrade = upgrade;
		}
		public int UserId { get; set; }
		public String Upgrade { get; set; }
	}
}
