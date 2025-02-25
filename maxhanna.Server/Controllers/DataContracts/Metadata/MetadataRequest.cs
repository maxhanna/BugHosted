using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Metadata
{
	public class MetadataRequest
	{
		public string[]? Url { get; set; }
		public User? User { get; set; }
	}
}
