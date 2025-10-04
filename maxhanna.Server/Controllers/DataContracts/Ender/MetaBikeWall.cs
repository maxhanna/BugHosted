namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class MetaBikeWall
    {
        public int Id { get; set; }
        public int HeroId { get; set; }
        public string Map { get; set; } = "";
        public int X { get; set; }
        public int Y { get; set; }
    }
}