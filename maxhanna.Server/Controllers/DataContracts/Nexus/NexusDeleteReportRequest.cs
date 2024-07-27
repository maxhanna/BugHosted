using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusDeleteReportRequest
    {
        public NexusDeleteReportRequest(User user, int battleId)
        {
            this.User = user;
            this.BattleId = battleId;
        }
        public User User { get; set; }
        public int BattleId { get; set; }
    }
}
