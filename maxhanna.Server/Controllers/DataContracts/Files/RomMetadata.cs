
namespace maxhanna.Server.Controllers.DataContracts.Files
{
  public class RomMetadata
  {
    public int? IgdbGameId { get; set; }
    public string? IgdbName { get; set; }
    public string? Summary { get; set; }

    /// <summary>
    /// Keep this as long? if your DB stores IGDB first_release_date as unix seconds.
    /// If you store DATETIME instead, change to DateTime?.
    /// </summary>
    public long? FirstReleaseDateUnix { get; set; }
    public DateTime? FirstReleaseDate {get; set; } // This is for convenience so you don't have to convert from unix seconds on the client.

    public double? TotalRating { get; set; }
    public int? TotalRatingCount { get; set; }

    public string? CoverUrl { get; set; }

    // Keep as string because the DB column is JSON or text and you may send raw JSON down.
    public string? ScreenshotsJson { get; set; }
    public string? ArtworksJson { get; set; }
    public string? VideosJson { get; set; }
    public string? PlatformsJson { get; set; }
    public string? GenresJson { get; set; }
    public int? ResetVotes { get; set; }
  }
}
