using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaHero
    {
        public User? User { get; set; } 
        public string? Name { get; set; }
        public int Id { get; set; }
        public int CoordsX { get; set; }
        public int CoordsY { get; set; } 
        public int Speed { get; set; } 
        public int Map { get; set; } 
    }
}
