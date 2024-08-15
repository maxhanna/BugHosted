using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusMassPurchaseRequest
    {
        public NexusMassPurchaseRequest(User user, String upgrade)
        {
            this.User = user;
            this.Upgrade = upgrade;
        }
        public User User { get; set; }
        public String Upgrade { get; set; }
    }
}
