namespace maxhanna.Server.Controllers.DataContracts.Bones
{
	public class RemovePartyMemberRequest
	{
		public int HeroId { get; set; }
		public int MemberHeroId { get; set; }
		public int? UserId { get; set; }
	}
}
