using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaBot
    { 
        public string? Name { get; set; }
        public int Id { get; set; } 
        public int HeroId { get; set; } 
        public int Type { get; set; }
        public int Hp { get; set; }
        public int Exp { get; set; }
        public int Level { get; set; } 
    }
}
