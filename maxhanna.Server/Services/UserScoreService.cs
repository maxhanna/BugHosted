using maxhanna.Server.Controllers.DataContracts.Social;
using MySqlConnector;

namespace maxhanna.Server.Services
{
  /// <summary>
  /// Pre-computed social karma and level per user.
  ///
  /// The Social sidebar used to derive karma with four correlated COUNT
  /// subqueries on every single request. This service keeps the score in
  /// `maxhanna.user_scores`, one row per user, baked from the activity tables:
  ///   posts            = stories authored
  ///   comments         = comments on stories
  ///   reactionsReceived= reactions other people left on the user's posts/comments
  ///   reactionsGiven   = reactions the user left on other people's posts/comments
  ///   reportsReceived  = open or upheld post reports against the user's posts
  ///   karma            = 5·posts + 2·comments + 1·reactionsReceived + 1·reactionsGiven
  ///   karma_penalty    = 5·reportsReceived (reports never touch the level)
  ///   level            = highest maxhanna.social_levels whose posts_required <= posts
  ///
  /// Rows are written on demand: a single user's row is re-baked after every
  /// event that can change it — a new post, comment or reaction, a deleted
  /// reaction, or a report being filed or reviewed — and a user with no row yet
  /// is baked inline the first time their stats are read. Reads are then a
  /// primary-key join instead of four scans. Nothing runs at start-up; the
  /// existing rows are filled by the backfill script.
  /// </summary>
  public static class UserScoreService
  {
    private const int PostKarma = 5;
    private const int CommentKarma = 2;
    private const int ReactionReceivedKarma = 1;
    private const int ReactionGivenKarma = 1;
    private const int ReportPenalty = 5;

    /// <summary>
    /// The level ladder, in order. Levels are driven by post count alone, which
    /// is why a reported post costs karma but never a level. maxhanna.social_levels
    /// holds the same ladder in SQL so the bake can pick a level without a C#
    /// round trip; that table is filled by hand, not by this service.
    /// </summary>
    public static readonly (int Posts, string Title)[] Levels = new[]
    {
      (0, "Lurker"),
      (1, "Newcomer"),
      (5, "Regular"),
      (15, "Contributor"),
      (30, "Storyteller"),
      (60, "Local Legend"),
      (120, "Luminary"),
      (250, "Icon"),
      (500, "Mythic"),
      (1000, "Legend")
    };

    /// <summary>Bakes one user's stored score from the activity tables.</summary>
    private static string BakeSql => $@"
      INSERT INTO maxhanna.user_scores
        (user_id, posts, comments, reactions_received, reactions_given, reports_received, karma, karma_penalty, level)
      SELECT
        u.id,
        COALESCE(p.cnt, 0),
        COALESCE(c.cnt, 0),
        COALESCE(sr.cnt, 0) + COALESCE(cr.cnt, 0),
        COALESCE(rg.cnt, 0),
        COALESCE(rp.cnt, 0),
        COALESCE(p.cnt, 0) * {PostKarma}
          + COALESCE(c.cnt, 0) * {CommentKarma}
          + COALESCE(sr.cnt, 0) * {ReactionReceivedKarma}
          + COALESCE(cr.cnt, 0) * {ReactionReceivedKarma}
          + COALESCE(rg.cnt, 0) * {ReactionGivenKarma},
        COALESCE(rp.cnt, 0) * {ReportPenalty},
        COALESCE((SELECT MAX(sl.level) FROM maxhanna.social_levels sl
          WHERE sl.posts_required <= COALESCE(p.cnt, 0)), 1)
      FROM maxhanna.users u
      LEFT JOIN (
        SELECT s.user_id, COUNT(*) AS cnt FROM maxhanna.stories s GROUP BY s.user_id
      ) p ON p.user_id = u.id
      LEFT JOIN (
        SELECT c.user_id, COUNT(*) AS cnt FROM maxhanna.comments c
        WHERE c.story_id IS NOT NULL GROUP BY c.user_id
      ) c ON c.user_id = u.id
      LEFT JOIN (
        SELECT s.user_id, COUNT(*) AS cnt
        FROM maxhanna.reactions r
        JOIN maxhanna.stories s ON s.id = r.story_id
        WHERE s.user_id <> r.user_id
        GROUP BY s.user_id
      ) sr ON sr.user_id = u.id
      LEFT JOIN (
        SELECT c.user_id, COUNT(*) AS cnt
        FROM maxhanna.reactions r
        JOIN maxhanna.comments c ON c.id = r.comment_id
        WHERE c.user_id <> r.user_id
        GROUP BY c.user_id
      ) cr ON cr.user_id = u.id
      LEFT JOIN (
        SELECT r.user_id, COUNT(*) AS cnt
        FROM maxhanna.reactions r
        LEFT JOIN maxhanna.stories s ON s.id = r.story_id
        LEFT JOIN maxhanna.comments c ON c.id = r.comment_id
        WHERE (s.id IS NOT NULL AND s.user_id <> r.user_id)
           OR (c.id IS NOT NULL AND c.user_id <> r.user_id)
        GROUP BY r.user_id
      ) rg ON rg.user_id = u.id
      LEFT JOIN (
        SELECT s.user_id, COUNT(*) AS cnt
        FROM maxhanna.post_reports pr
        JOIN maxhanna.stories s ON s.id = pr.story_id
        WHERE pr.status IN ('open', 'upheld')
        GROUP BY s.user_id
      ) rp ON rp.user_id = u.id
      WHERE u.id = @userId
      ON DUPLICATE KEY UPDATE
        posts = VALUES(posts),
        comments = VALUES(comments),
        reactions_received = VALUES(reactions_received),
        reactions_given = VALUES(reactions_given),
        reports_received = VALUES(reports_received),
        karma = VALUES(karma),
        karma_penalty = VALUES(karma_penalty),
        level = VALUES(level);";

    /// <summary>
    /// Re-bakes one user's row. Every write path that can change an activity
    /// total calls this, so the stored score is never more than one event old.
    /// </summary>
    public static async Task RecomputeUserAsync(MySqlConnection conn, int userId, Log? log = null)
    {
      if (userId <= 0) return;
      try
      {
        using var cmd = new MySqlCommand(BakeSql, conn);
        cmd.Parameters.AddWithValue("@userId", userId);
        await cmd.ExecuteNonQueryAsync();
      }
      catch (Exception ex)
      {
        if (log != null) _ = log.Db("Social score update failed: " + ex.Message, userId, "SOCIAL", true);
      }
    }

    /// <summary>Re-bakes the author of a story after its activity changed.</summary>
    public static async Task RecomputeStoryAuthorAsync(MySqlConnection conn, int storyId, Log? log = null)
    {
      if (storyId <= 0) return;
      using var cmd = new MySqlCommand("SELECT user_id FROM maxhanna.stories WHERE id = @id LIMIT 1;", conn);
      cmd.Parameters.AddWithValue("@id", storyId);
      var author = await cmd.ExecuteScalarAsync();
      if (author == null || author == DBNull.Value) return;
      await RecomputeUserAsync(conn, Convert.ToInt32(author), log);
    }

    /// <summary>Re-bakes the author of a comment after its activity changed.</summary>
    public static async Task RecomputeCommentAuthorAsync(MySqlConnection conn, int commentId, Log? log = null)
    {
      if (commentId <= 0) return;
      using var cmd = new MySqlCommand("SELECT user_id FROM maxhanna.comments WHERE id = @id LIMIT 1;", conn);
      cmd.Parameters.AddWithValue("@id", commentId);
      var author = await cmd.ExecuteScalarAsync();
      if (author == null || author == DBNull.Value) return;
      await RecomputeUserAsync(conn, Convert.ToInt32(author), log);
    }

    /// <summary>
    /// Fills in level progress for the sidebar/profile payload from the same
    /// ladder the bake uses, so the UI never disagrees with the stored level.
    /// </summary>
    public static void ApplyLevel(SocialSidebarUserStats stats)
    {
      int levelIndex = 0;
      for (int i = 0; i < Levels.Length; i++)
      {
        if (stats.PostCount >= Levels[i].Posts) levelIndex = i;
      }

      stats.Level = levelIndex + 1;
      stats.LevelTitle = Levels[levelIndex].Title;
      if (levelIndex + 1 < Levels.Length)
      {
        int floor = Levels[levelIndex].Posts;
        int ceiling = Levels[levelIndex + 1].Posts;
        stats.NextLevelTitle = Levels[levelIndex + 1].Title;
        stats.NextLevelPosts = ceiling;
        stats.PostsToNextLevel = Math.Max(0, ceiling - stats.PostCount);
        stats.LevelProgress = ceiling > floor
          ? Math.Clamp((int)Math.Round((stats.PostCount - floor) * 100.0 / (ceiling - floor)), 0, 100)
          : 100;
      }
      else
      {
        stats.NextLevelTitle = null;
        stats.NextLevelPosts = null;
        stats.PostsToNextLevel = 0;
        stats.LevelProgress = 100;
      }
    }
  }
}
