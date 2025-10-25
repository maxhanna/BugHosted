using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class UpdateHeroStatsRequest
	{
		public int HeroId { get; set; }
		public Dictionary<string, int>? Stats { get; set; }
		public int? UserId { get; set; }
	}
}
