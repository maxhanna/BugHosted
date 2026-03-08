
namespace maxhanna.Server.Controllers.DataContracts.Files
{
  public class RomMetadata
  {
    public int? IgdbGameId { get; set; }
    public string? IgdbName { get; set; }
    public string? Summary { get; set; } 
    public long? FirstReleaseDateUnix { get; set; }
    public DateTime? FirstReleaseDate {get; set; } // This is for convenience so you don't have to convert from unix seconds on the client.

    public double? TotalRating { get; set; }
    public int? TotalRatingCount { get; set; }

    public string? CoverUrl { get; set; } 
    public string? ScreenshotsJson { get; set; }
    public string? ArtworksJson { get; set; }
    public string? VideosJson { get; set; }
    public string? PlatformsJson { get; set; }
    public string? GenresJson { get; set; }
    public int? ResetVotes { get; set; }
    public string? ActualSystem { get; set; }
  }
}
