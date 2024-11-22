namespace maxhanna.Server.Controllers.DataContracts.Topics
{
	public class TopicRank
	{
		public int TopicId { get; set; }
		public required string TopicName { get; set; }
		public int StoryCount { get; set; }
	}
}
