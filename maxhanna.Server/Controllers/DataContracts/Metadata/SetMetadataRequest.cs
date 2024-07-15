using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Metadata
{
    public class SetMetadataRequest
    {
        public MetadataDto? Metadata { get; set; }
        public User? User { get; set; }
    }
}
