namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class MetaHero
    {
        public string? Name { get; set; }
        public int Id { get; set; }
        public Vector2 Position { get; set; } = new Vector2(0, 0);
        public List<MetaBot>? Metabots { get; set; }
        public int Speed { get; set; }
        public string Map { get; set; } = "";
        public string Color { get; set; } = "";
        public int? Mask { get; set; } = null;
        public int Level { get; set; } = 1;
    }
}
