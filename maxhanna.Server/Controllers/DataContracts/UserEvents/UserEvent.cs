namespace maxhanna.Server.Controllers.DataContracts.UserEvents
{
    public class UserEvent
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string? Username { get; set; }
        public string EventType { get; set; }
        public string EventText { get; set; }
        public int? ReferenceId { get; set; }
        public string? ReferenceType { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
