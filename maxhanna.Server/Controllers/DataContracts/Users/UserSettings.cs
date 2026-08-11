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
        public bool WeeklyDigestEnabled { get; set; } = true;
        [Newtonsoft.Json.JsonProperty("followPushEnabled")]
        public bool FollowNotificationsPush { get; set; } = true;

        [Newtonsoft.Json.JsonProperty("followEmailEnabled")]
        public bool FollowNotificationsEmail { get; set; } = false;

        // Whether the search bar on the navigation page (top nav) is visible.
        [Newtonsoft.Json.JsonProperty("showNavSearch")]
        public bool ShowNavSearch { get; set; } = true;

        // IANA timezone id of the user's browser (e.g. "America/New_York").
        // Used by SystemBackgroundService so calendar notifications fire
        // relative to the user's local clock, not the server's.
        [Newtonsoft.Json.JsonProperty("timezone")]
        public string? Timezone { get; set; }

        // Opt-in preference: keep a copy of downloaded ROMs (and save states)
        // in local device storage so the emulator can load them from disk
        // instead of re-downloading from the server.
        [Newtonsoft.Json.JsonProperty("emulatorLocalRomStorage")]
        public bool EmulatorLocalRomStorage { get; set; }

        // Mobile preference: mirror the on-screen control clusters (movement
        // on the right, action buttons on the left) for left-handed play.
        [Newtonsoft.Json.JsonProperty("emulatorLeftHanded")]
        public bool EmulatorLeftHanded { get; set; }
    }
}