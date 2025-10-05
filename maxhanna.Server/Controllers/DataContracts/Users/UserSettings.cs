namespace maxhanna.Server.Controllers.DataContracts.Users
{ 
	public class UserSettings
	{
		public int UserId { get; set; }
		public bool NsfwEnabled { get; set; }
		public bool GhostReadEnabled { get; set; }
		public string? Compactness { get; set; }

		public string? ShowPostsFrom { get; set; }
		public bool? NotificationsEnabled { get; set; }

		// Last character name used during character creation
		public string? LastCharacterName { get; set; }
	}

}
