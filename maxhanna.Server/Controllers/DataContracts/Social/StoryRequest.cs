namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class StoryRequest
	{
		public StoryRequest(Story story, int? userId)
		{
			this.userId = userId;
			this.story = story;
		}
		public int? userId { get; set; }
		public Story story { get; set; }
	}
}
