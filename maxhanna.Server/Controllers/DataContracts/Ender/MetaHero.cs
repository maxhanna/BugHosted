namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class MetaHero
    {
        public string? Name { get; set; }
        public int Id { get; set; }
        public int UserId { get; set; }
        public Vector2 Position { get; set; } = new Vector2(0, 0);
        public int Speed { get; set; }
        public string Color { get; set; } = "";
        public int? Mask { get; set; } = null;
        public int Level { get; set; } = 1;
        public int Kills { get; set; } = 0;
        // Server-calculated seconds since hero creation (used by client to set/reset in-game timer)
        public int TimeOnLevelSeconds { get; set; } = 0;
        // Creation timestamp from DB
        public DateTime? Created { get; set; }
    }
}
