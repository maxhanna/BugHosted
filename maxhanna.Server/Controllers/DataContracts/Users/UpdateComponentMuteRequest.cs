namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class UpdateComponentMuteRequest
    {
        public int UserId { get; set; }
        public string Component { get; set; } = ""; // "ender" | "emulator" | "bones"
        public bool IsMusic { get; set; } // true => music, false => sfx
        public bool IsAllowed { get; set; } // true => allowed (unmuted), false => muted

        public UpdateComponentMuteRequest() { }
    }
}
