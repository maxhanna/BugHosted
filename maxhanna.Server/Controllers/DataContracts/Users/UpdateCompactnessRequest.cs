namespace maxhanna.Server.Controllers.DataContracts.Users
{
	public class UpdateCompactnessRequest
	{
		public int UserId { get; set; }
		public ShowPostsFrom ShowPostsFrom { get; set; }

		public UpdateCompactnessRequest(int userId, ShowPostsFrom showPostsFrom)
		{
			UserId = userId;
			ShowPostsFrom = showPostsFrom;
		}
	}

	
		[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
		public enum ShowPostsFrom
		{
			Subscribed,
			Local,
			Popular,
			All,
			Oldest
		} 
}
