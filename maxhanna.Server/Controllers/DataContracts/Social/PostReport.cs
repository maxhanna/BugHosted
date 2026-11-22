namespace maxhanna.Server.Controllers.DataContracts.Social
{
  /// <summary>A reader reporting a post to the moderators of its topic.</summary>
  public class ReportPostRequest
  {
    public int StoryId { get; set; }
    public int ReporterId { get; set; }
    /// <summary>Short reason key, e.g. "spam", "harassment", "off-topic".</summary>
    public string? Reason { get; set; }
    /// <summary>Optional free-text note for the moderator queue.</summary>
    public string? Details { get; set; }
  }

  public class PostReportItem
  {
    public int Id { get; set; }
    public int StoryId { get; set; }
    public int AuthorId { get; set; }
    public string? AuthorName { get; set; }
    public int ReporterId { get; set; }
    public string? ReporterName { get; set; }
    public string? TopicName { get; set; }
    public string? Excerpt { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string Status { get; set; } = "open";
    public string CreatedAt { get; set; } = string.Empty;
  }

  public class GetPostReportsRequest
  {
    public int CallerUserId { get; set; }
    /// <summary>"open", "resolved" or null/empty for everything.</summary>
    public string? Status { get; set; }
  }

  public class ResolvePostReportRequest
  {
    public int CallerUserId { get; set; }
    public int ReportId { get; set; }
    /// <summary>"upheld" keeps the karma penalty, "dismissed" lifts it.</summary>
    public string Status { get; set; } = "upheld";
  }
}
