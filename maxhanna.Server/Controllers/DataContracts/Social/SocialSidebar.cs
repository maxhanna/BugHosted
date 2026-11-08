namespace maxhanna.Server.Controllers.DataContracts.Social
{
  public class SocialSidebarResponse
  {
    public SocialSidebarUserStats? UserStats { get; set; }
    public List<SocialSidebarThread> PopularThreads { get; set; } = new();
  }

  public class SocialSidebarUserStats
  {
    public int UserId { get; set; }
    public string? Username { get; set; }
    public DateTime? Created { get; set; }
    public int AccountAgeDays { get; set; }
    public int PostCount { get; set; }
    public int CommentCount { get; set; }
    public int ReactionsReceived { get; set; }
    public int Karma { get; set; }
    public int Level { get; set; }
    public string LevelTitle { get; set; } = string.Empty;
    public string? NextLevelTitle { get; set; }
    public int? NextLevelPosts { get; set; }
    public int PostsToNextLevel { get; set; }
    public int LevelProgress { get; set; }
  }

  public class SocialSidebarThread
  {
    public int Id { get; set; }
    public int AuthorId { get; set; }
    public string? Username { get; set; }
    // Encrypted for transit with the author's user id, matching the feed.
    public string? Excerpt { get; set; }
    public DateTime Date { get; set; }
    public int CommentCount { get; set; }
    public int ReactionCount { get; set; }
    public int Engagement { get; set; }
  }
}
