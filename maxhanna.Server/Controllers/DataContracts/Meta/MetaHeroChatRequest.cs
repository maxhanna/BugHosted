using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaHeroChatRequest
    {
        public MetaHero Hero { get; set; } 
        public string? Content { get; set; } 
    }
}
