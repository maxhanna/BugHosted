namespace maxhanna.Server.Controllers.DataContracts
{
	public class PartyMemberDto
	{
		public int HeroId { get; set; }
		public string? Name { get; set; }
		public string? Color { get; set; }
		public string Type { get; set; } = "knight"; // schema NOT NULL default 'knight'
		public int Level { get; set; }
		public int Hp { get; set; }
		public string? Map { get; set; }
		public int Exp { get; set; }
	}
}