using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaHero
    {
        public User? User { get; set; } 
        public string? Name { get; set; }
        public int Id { get; set; }
        public Vector2 Position { get; set; } = new Vector2(0,0);
        public int Speed { get; set; } 
        public int Map { get; set; } 
    }
}
