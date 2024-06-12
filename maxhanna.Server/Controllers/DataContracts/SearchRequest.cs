namespace maxhanna.Server.Controllers.DataContracts
{
    public class SearchRequest
    {
        public SearchRequest(User user, string? keywords)
        {
            Keywords = keywords;
            User = user;
        }
        public string? Keywords { get; set; }
        public User? User { get; set; }
    }
}
