namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class GetCommentsRequest
    {
        public int? FileId { get; set; }
        public int? StoryId { get; set; }
        public int? RecipeId { get; set; }
        public int? UserProfileId { get; set; }
        // The viewer (0 = anonymous). Story comment threads honor the story's
        // visibility with this id, exactly like the feed: the author can load
        // their own non-public posts' threads, followers can load 'following'
        // threads, anonymous viewers only get public ones.
        public int? UserId { get; set; }
    }
}
