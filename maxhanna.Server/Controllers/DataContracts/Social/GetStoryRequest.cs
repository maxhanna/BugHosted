using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class GetStoryRequest
	{
		public User? User { get; set; }
		public int? ProfileUserId { get; set; }
	}
}
