namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class ActiveGamer
    {
        public int UserId { get; set; }
        public string? Username { get; set; }
        public string? Game { get; set; }
        public DateTime? LastActivityUtc { get; set; }
    }
}
