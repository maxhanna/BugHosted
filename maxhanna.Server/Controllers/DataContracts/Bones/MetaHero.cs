using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class MetaHero
	{
		// attack speed in milliseconds
		[JsonPropertyName("attackSpeed")]
		public int AttackSpeed { get; set; } = 400;

		[JsonPropertyName("hp")]
		public int Hp { get; set; } = 100;

		[JsonPropertyName("userId")]
		public int? UserId { get; set; } = null;

		public string? Name { get; set; }
		public string? Type { get; set; }
		public int Id { get; set; }
		public Vector2 Position { get; set; } = new Vector2(0, 0); 
		public int Speed { get; set; }
		public int Level { get; set; }
		public int Exp { get; set; }

		// Basic stats stored per hero
		// Legacy stats removed: use AttackDmg, CritRate, CritDmg, Health, Regen instead.

		// New stats for revamped system
		[JsonPropertyName("attackDmg")]
		public int AttackDmg { get; set; } = 1;

		// attack speed already present as AttackSpeed (ms)

		[JsonPropertyName("critRate")]
		public double CritRate { get; set; } = 0.0; // fraction 0.0 - 1.0

		[JsonPropertyName("critDmg")]
		public double CritDmg { get; set; } = 2.0; // multiplier (e.g., 2.0 = 200%)

		[JsonPropertyName("health")]
		public int Health { get; set; } = 100;

		[JsonPropertyName("regen")]
		public double Regen { get; set; } = 0.0; // health per second

		[JsonPropertyName("mana")]
		public int Mana { get; set; } = 0;
		public string Map { get; set; } = "";
		public string Color { get; set; } = "";
		public int? Mask { get; set; } = null;
		public DateTime? Updated { get; set; } = null;
		public DateTime? Created { get; set; } = null;
	}
}
