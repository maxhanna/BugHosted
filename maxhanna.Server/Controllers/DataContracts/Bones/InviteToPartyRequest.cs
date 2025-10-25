namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class InviteToPartyRequest
	{
		public int HeroId { get; set; }
		public int TargetHeroId { get; set; }
		public int? UserId { get; set; }
	}
}
