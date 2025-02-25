using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class StoryVoteRequest
	{
		public User User { get; set; }
		public int StoryId { get; set; }
		public bool Upvote { get; set; }
		public bool Downvote { get; set; }

		public StoryVoteRequest(User user, int storyId, bool upvote, bool downvote)
		{
			User = user;
			StoryId = storyId;
			Upvote = upvote;
			Downvote = downvote;
		}
	}
}
