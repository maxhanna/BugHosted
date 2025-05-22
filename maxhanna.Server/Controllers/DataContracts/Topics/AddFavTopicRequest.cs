namespace maxhanna.Server.Controllers.DataContracts.Topics
{
	public class AddFavTopicRequest
	{
		public required int UserId { get; set; }
		public required int[] TopicIds { get; set; } 
	}
}
