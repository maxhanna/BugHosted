using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaBot
    { 
        public string? Name { get; set; }
        public int Id { get; set; }
        public Vector2 Position { get; set; } = new Vector2(0,0);  
        public int Type { get; set; }
    }
}
