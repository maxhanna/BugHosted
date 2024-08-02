using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusResearchRequest
    {
        public NexusResearchRequest(User user, NexusBase nexusBase, UnitStats unit)
        {
            this.User = user;
            this.NexusBase = nexusBase;
            this.Unit = unit;
        }
        public User User { get; set; }
        public NexusBase NexusBase { get; set; }
        public UnitStats Unit { get; set; }
    }
}
