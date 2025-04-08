using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class GetStoryRequest
	{
		public int UserId { get; set; }
		public int? ProfileUserId { get; set; }
		public int? StoryId { get; set; }
	}
}
