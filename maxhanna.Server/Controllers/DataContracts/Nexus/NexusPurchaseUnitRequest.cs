namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusPurchaseUnitRequest
	{
		public NexusPurchaseUnitRequest(int userId, NexusBase nexus, int unitId, int purchaseAmount)
		{
			this.UserId = userId;
			this.Nexus = nexus;
			this.UnitId = unitId;
			this.PurchaseAmount = purchaseAmount;
		}
		public int UserId { get; set; }
		public NexusBase Nexus { get; set; }
		public int UnitId { get; set; }
		public int PurchaseAmount { get; set; }
	}
}
