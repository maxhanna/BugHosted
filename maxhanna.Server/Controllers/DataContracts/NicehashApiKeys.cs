namespace maxhanna.Server.Controllers.DataContracts
{
    public class NicehashApiKeys
    {
        public int Ownership { get; set; }
        public string? OrgId { get; set; }
        public string? ApiKey { get; set; } 
        public string? ApiSecret { get; set; }
    }
}
