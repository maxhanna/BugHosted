namespace maxhanna.Server.Controllers.DataContracts.Users
{ 
	public class UserSettings
	{
		public int UserId { get; set; }
		public bool NsfwEnabled { get; set; }
		public bool GhostReadEnabled { get; set; }
	}

}
