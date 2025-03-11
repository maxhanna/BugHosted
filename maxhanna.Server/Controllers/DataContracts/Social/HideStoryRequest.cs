namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class HideStoryRequest
	{
		public HideStoryRequest(int UserId, int StoryId)
		{
			this.UserId = UserId;
			this.StoryId = StoryId;
		}
		public int UserId { get; set; }
		public int StoryId { get; set; }
	}
}
