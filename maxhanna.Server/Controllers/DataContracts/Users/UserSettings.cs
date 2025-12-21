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
		public string? LastCharacterName { get; set; }
		public string? LastCharacterColor { get; set; }
		public bool ShowHiddenFiles { get; set; } // show hidden files setting
		public bool MuteSounds { get; set; } // mute all game sounds (including background music)

		// Per-component music and SFX settings
		public bool MuteMusicEnder { get; set; }
		public bool MuteSfxEnder { get; set; }
		public bool MuteMusicEmulator { get; set; }
		public bool MuteMusicBones { get; set; }
		public bool MuteSfxBones { get; set; }
	}

}
