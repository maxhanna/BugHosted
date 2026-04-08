namespace maxhanna.Server.Controllers.DataContracts
{
    public class GetEmulatorJSSaveStateRequest
    {
        public int UserId { get; set; }
        public string RomName { get; set; } = string.Empty;
        public string? Core { get; set; } = string.Empty;
    }
}