using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Topics
{
	public class TopicRequest
	{
		public User User { get; set; }
		public Topic Topic { get; set; }
		public TopicRequest(User user, Topic topic)
		{
			User = user;
			Topic = topic;
		}
	}
}
