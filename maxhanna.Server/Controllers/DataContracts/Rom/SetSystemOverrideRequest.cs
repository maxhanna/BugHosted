namespace maxhanna.Server.Controllers.DataContracts
{
    public class SetSystemOverrideRequest
    {
        public int FileId { get; set; }
        public string SystemCore { get; set; } = string.Empty;
    }
}