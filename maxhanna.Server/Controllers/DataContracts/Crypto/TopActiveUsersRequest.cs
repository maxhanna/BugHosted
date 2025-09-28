namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class TopActiveUsersRequest
    {
        public string? Strategy { get; set; }
        public System.DateTime? From { get; set; }
        public System.DateTime? To { get; set; }
        public int Limit { get; set; } = 50;
    }
}
