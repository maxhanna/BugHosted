namespace maxhanna.Server.Controllers.DataContracts.Viral
{
    public class ViralEvent
    {
        public int Id { get; set; }
        public int ViralId { get; set; }
        public string? EventType { get; set; }
        public string? Map { get; set; }
        public Dictionary<string, string>? Data { get; set; }
        public DateTime Timestamp { get; set; }
    }
}