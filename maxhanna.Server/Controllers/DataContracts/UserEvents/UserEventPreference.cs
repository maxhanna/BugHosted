using System.ComponentModel.DataAnnotations;

namespace maxhanna.Server.Controllers.DataContracts.UserEvents
{
    public class UserEventPreference
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string? EventType { get; set; }
        public bool IsEnabled { get; set; }
    }
}