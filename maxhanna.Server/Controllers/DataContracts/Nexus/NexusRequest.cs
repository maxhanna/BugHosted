using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class NexusRequest
    {
        public NexusRequest(User user, NexusBase? nexus)
        {
            this.user = user;
            this.nexus = nexus;
        }
        public User user { get; set; }
        public NexusBase? nexus { get; set; }
    }
}
