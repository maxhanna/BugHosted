namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class UserAbout
    {
        public int UserId { get; set; }
        public string? Description { get; set; }
        public DateTime? Birthday { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
    }
}
