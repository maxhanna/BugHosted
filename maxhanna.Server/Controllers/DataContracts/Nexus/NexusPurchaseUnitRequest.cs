using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusPurchaseUnitRequest
    {
        public NexusPurchaseUnitRequest(User user, NexusBase nexus, int unitId, int purchaseAmount)
        {
            this.User = user;
            this.Nexus = nexus;
            this.UnitId = unitId;
            this.PurchaseAmount = purchaseAmount;
        }
        public User User { get; set; }
        public NexusBase Nexus { get; set; }
        public int UnitId { get; set; }
        public int PurchaseAmount { get; set; }
    }
}
