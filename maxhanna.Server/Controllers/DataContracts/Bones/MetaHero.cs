namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class MetaHero
	{
		// attack speed in milliseconds
		public int AttackSpeed { get; set; } = 400;

		public string? Name { get; set; }
		public int Id { get; set; }
		public Vector2 Position { get; set; } = new Vector2(0, 0); 
		public int Speed { get; set; }
		public int Level { get; set; }
		public int Exp { get; set; }
		public string Map { get; set; } = "";
		public string Color { get; set; } = "";
		public int? Mask { get; set; } = null;
		public DateTime? Updated { get; set; } = null;
		public DateTime? Created { get; set; } = null;
	}
}
