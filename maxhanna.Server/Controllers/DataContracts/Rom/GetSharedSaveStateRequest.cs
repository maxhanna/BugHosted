namespace maxhanna.Server.Controllers.DataContracts
{
    public class GetSharedSaveStateRequest
    {
        public int SharerUserId { get; set; }
        public int TargetUserId { get; set; }
        public string RomName { get; set; } = "";
        public string? Core { get; set; }
    }
}
