using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class UpdateHeroStatsRequest
	{
		public int HeroId { get; set; }
		// Allow fractional stat values (e.g., critRate, regen) so use double? as value type
		public Dictionary<string, double?>? Stats { get; set; }
		public int? UserId { get; set; }
	}
}
