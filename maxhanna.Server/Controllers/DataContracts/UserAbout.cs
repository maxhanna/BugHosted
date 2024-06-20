namespace maxhanna.Server.Controllers.DataContracts
{ 
    public class UserAbout
    {
        public int UserId { get; set; }
        public string? Description { get; set; }
        public DateOnly? Birthday { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
    }
}
