namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class MetaBot
	{
		public string? Name { get; set; }
		public int Id { get; set; }
		public int HeroId { get; set; }
		// Optional: the hero id this encounter is currently targeting/chasing
		public int? TargetHeroId { get; set; }
		public int Type { get; set; }
		public int Hp { get; set; }
		public int Exp { get; set; }
		public int Level { get; set; }
		public bool IsDeployed { get; set; }
		public Vector2? Position { get; set; }
	}
}
