using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaChat
    {
        public MetaHero? Hero { get; set; } 
        public string? Content { get; set; }
        public DateTime Timestamp { get; set; } 
    }
}
