using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
    public class BattleReportRequest
    {
        public required User User { get; set; }
        public NexusBase? TargetBase { get; set; }
        public User? TargetUser { get; set; }
        public int PageNumber { get; set; }
        public int PageSize { get; set; }
    }
}
