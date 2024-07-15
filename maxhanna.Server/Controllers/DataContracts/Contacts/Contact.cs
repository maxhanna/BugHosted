using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Contacts
{
    public class Contact
    {
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? Phone { get; set; }
        public DateTime? Birthday { get; set; }
        public string? Notes { get; set; }
        public string? Email { get; set; }
        public User? User { get; set; }
    }
}
