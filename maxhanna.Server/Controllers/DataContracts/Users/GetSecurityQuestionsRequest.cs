namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class GetSecurityQuestionsRequest
    {
        public int UserId { get; set; }
        public string? Username { get; set; }
    }
}