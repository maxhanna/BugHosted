using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class StoryRequest
	{
		public StoryRequest(Story story, User? user)
		{
			this.user = user;
			this.story = story;
		}
		public User? user { get; set; }
		public Story story { get; set; }
	}
}
