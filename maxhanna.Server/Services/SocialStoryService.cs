using System.Web;
using System.Xml.Linq;
using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using maxhanna.Server.Controllers.DataContracts.Social;
using MySqlConnector;

/// <summary>
/// Shared story-creation pipeline used by both the SocialController (real user
/// posts) and the NewsService bots (daily news / crypto / meme / music posts).
/// Centralises the story insert, file/topic links, link-metadata scraping,
/// sitemap entry and user event so the bots stop bypassing PostStory and start
/// getting metadata attached like every other social post.
/// </summary>
public class SocialStoryService
{
  private readonly IConfiguration _config;
  private readonly Log _log;
  private readonly WebCrawler _crawler;
  private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
  private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");

  public SocialStoryService(IConfiguration config, Log log, WebCrawler crawler)
  {
    _config = config;
    _log = log;
    _crawler = crawler;
  }

  /// <summary>
  /// Create a story row, link its files + topics, scrape and store link
  /// metadata, append the sitemap entry and record a "story_post" user event.
  /// Returns the new story id (null on failure). story.StoryText must already
  /// be plain text (the controller decrypts before calling).
  /// </summary>
  public async Task<int?> CreateStoryAsync(Story story, int? userId, string? eventText = "posted")
  {
    string storyText = story.StoryText ?? "";
    string visibility = string.IsNullOrEmpty(story.Visibility) ? "public" : story.Visibility;
    int? profileUserId = story.ProfileUserId.HasValue && story.ProfileUserId.Value != 0 ? story.ProfileUserId.Value : (int?)null;
    int? chatId = story.ChatId.HasValue && story.ChatId.Value != 0 ? story.ChatId.Value : (int?)null;

    using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
    await conn.OpenAsync();

    const string insertSql = @"
      INSERT INTO stories (user_id, story_text, profile_user_id, chat_id, city, country, date, visibility)
      VALUES (@userId, @storyText, @profileUserId, @chatId, @city, @country, UTC_TIMESTAMP(), @visibility);
      SELECT LAST_INSERT_ID();";

    int storyId;
    using (var cmd = new MySqlCommand(insertSql, conn))
    {
      cmd.Parameters.AddWithValue("@userId", userId ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@storyText", storyText);
      cmd.Parameters.AddWithValue("@profileUserId", profileUserId ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@chatId", chatId ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@city", story.City ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@country", story.Country ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@visibility", visibility);
      storyId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    // Link attached files.
    if (story.StoryFiles != null)
    {
      foreach (var file in story.StoryFiles)
      {
        using var fileCmd = new MySqlCommand("INSERT INTO story_files (story_id, file_id) VALUES (@storyId, @fileId);", conn);
        fileCmd.Parameters.AddWithValue("@storyId", storyId);
        fileCmd.Parameters.AddWithValue("@fileId", file.Id);
        await fileCmd.ExecuteNonQueryAsync();
      }
    }

    // Link topics.
    if (story.StoryTopics != null)
    {
      foreach (var topic in story.StoryTopics)
      {
        using var topicCmd = new MySqlCommand("INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, @topicId);", conn);
        topicCmd.Parameters.AddWithValue("@storyId", storyId);
        topicCmd.Parameters.AddWithValue("@topicId", topic.Id);
        await topicCmd.ExecuteNonQueryAsync();
      }
    }

    // Link metadata (best-effort — a crawler failure must not drop the story).
    await ScrapeAndInsertMetadataAsync(storyId, storyText, userId);

    await AppendToSitemapAsync(storyId);

    if (userId.HasValue && userId.Value != 0)
    {
      await UserEventController.InsertUserEventWithConnection(userId.Value, "story_post", eventText ?? "posted", storyId, "story", conn);
    }

    return storyId;
  }

  private async Task ScrapeAndInsertMetadataAsync(int storyId, string storyText, int? userId)
  {
    try
    {
      string[]? urls = _crawler.ExtractUrls(storyText);
      if (urls == null || urls.Length == 0) return;
      foreach (var url in urls)
      {
        try
        {
          Metadata? metadata = await _crawler.ScrapeUrlData(url);
          await InsertMetadata(storyId, metadata);
        }
        catch (Exception mex)
        {
          _ = _log.Db("Metadata insert failed for story " + storyId + ": " + mex.Message, userId, "SOCIAL", true);
        }
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db("Metadata scraping failed for story " + storyId + ": " + ex.Message, userId, "SOCIAL", true);
    }
  }

  public async Task<string> InsertMetadata(int storyId, Metadata? metadata)
  {
    if (metadata == null) return "No metadata to insert";
    const string sql = @"INSERT INTO story_metadata (story_id, title, description, image_url, metadata_url) VALUES (@storyId, @title, @description, @imageUrl, @metadataUrl);";
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@storyId", storyId);
      cmd.Parameters.AddWithValue("@title", HttpUtility.HtmlDecode(metadata.Title ?? ""));
      cmd.Parameters.AddWithValue("@description", HttpUtility.HtmlDecode(metadata.Description ?? ""));
      cmd.Parameters.AddWithValue("@imageUrl", metadata.ImageUrl ?? "");
      cmd.Parameters.AddWithValue("@metadataUrl", metadata.Url ?? "");
      await cmd.ExecuteNonQueryAsync();
    }
    catch
    {
      return "Could not insert metadata";
    }
    return "Inserted metadata";
  }

  public async Task<string> DeleteMetadata(int? storyId)
  {
    if (storyId == null) return "Deleted no metadata";
    const string sql = @"DELETE FROM story_metadata WHERE story_id = @StoryId;";
    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@StoryId", storyId.Value);
      await cmd.ExecuteNonQueryAsync();
    }
    catch
    {
      return "Could not delete metadata";
    }
    return "Deleted metadata";
  }

  public async Task AppendToSitemapAsync(int targetId)
  {
    string storyUrl = $"https://bughosted.com/Social/{targetId}";
    string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

    await _sitemapLock.WaitAsync();
    try
    {
      XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
      XDocument sitemap;

      if (System.IO.File.Exists(_sitemapPath))
      {
        sitemap = XDocument.Load(_sitemapPath);
        var existingUrl = sitemap.Descendants(ns + "loc")
                                 .FirstOrDefault(x => x.Value == storyUrl);
        if (existingUrl != null && existingUrl.Parent != null)
        {
          existingUrl.Parent.Element(ns + "lastmod")?.SetValue(lastMod);
          sitemap.Save(_sitemapPath);
          return;
        }
      }
      else
      {
        sitemap = new XDocument(new XElement(ns + "urlset"));
      }

      XElement newUrlElement = new XElement(ns + "url",
          new XElement(ns + "loc", storyUrl),
          new XElement(ns + "lastmod", lastMod),
          new XElement(ns + "changefreq", "daily"),
          new XElement(ns + "priority", "0.8")
      );
      sitemap.Root?.Add(newUrlElement);
      sitemap.Save(_sitemapPath);
    }
    finally
    {
      _sitemapLock.Release();
    }
  }

  public async Task RemoveFromSitemapAsync(int targetId)
  {
    string targetUrl = $"https://bughosted.com/Social/{targetId}";
    await _sitemapLock.WaitAsync();
    try
    {
      if (System.IO.File.Exists(_sitemapPath))
      {
        XDocument sitemap = XDocument.Load(_sitemapPath);
        XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
        var targetElement = sitemap.Descendants(ns + "url")
            .FirstOrDefault(x => x.Element(ns + "loc")?.Value == targetUrl);
        if (targetElement != null)
        {
          targetElement.Remove();
          sitemap.Save(_sitemapPath);
          _ = _log.Db($"Removed {targetUrl} from sitemap!", null, "SOCIAL", true);
        }
      }
    }
    finally
    {
      _sitemapLock.Release();
    }
  }
}
