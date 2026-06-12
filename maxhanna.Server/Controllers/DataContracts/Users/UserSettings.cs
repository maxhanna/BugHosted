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
        public bool ShowHiddenFiles { get; set; }
        public bool ShowFavouritesOnly { get; set; }
        public bool MuteSounds { get; set; }
        public bool AllowEnderInactivityNotifications { get; set; } = true;
        public int? DigcraftFovDistance { get; set; }
        public int? DigcraftViewDistance { get; set; }
        public bool MuteMusicEnder { get; set; }
        public bool MuteSfxEnder { get; set; }
        public bool MuteMusicEmulator { get; set; }
        public bool MuteMusicBones { get; set; }
        public bool MuteSfxBones { get; set; }
        public bool CalendarNotificationsEnabled { get; set; } = true;
        public bool DisplayProfileLocation { get; set; }
        public int? PageSize { get; set; }
    }
}