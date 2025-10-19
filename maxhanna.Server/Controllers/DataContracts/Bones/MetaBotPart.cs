namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class MetaBotPart
	{
		public int Id { get; set; }
		public int? MetabotId { get; set; }
		public int HeroId { get; set; }
		public int Type { get; set; }
		public string? PartName { get; set; }
		public Skill? Skill { get; set; }
		public int DamageMod { get; set; }
		public DateTime Created { get; set; }
	}

	public class Skill
	{
		public string Name { get; set; }
		public int Type { get; set; }
		public Skill(string name, int type)
		{
			this.Name = name;
			this.Type = type;
		}
	}
}
