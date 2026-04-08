namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class IpApiResponse
    {
        public string? Query { get; set; }  // This is the IP
        public string? City { get; set; }
        public string? Country { get; set; }
    }
}