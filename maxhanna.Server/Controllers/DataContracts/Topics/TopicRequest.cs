namespace maxhanna.Server.Controllers.DataContracts.Topics
{
	public class TopicRequest
	{
		public int? UserId { get; set; }
		public Topic? Topic { get; set; }
		public TopicRequest(int? userId, Topic? topic)
		{
			UserId = userId;
			Topic = topic;
		}
	}
}
