using maxhanna.Server.Controllers.DataContracts.Crawler;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class CrawlerController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly WebCrawler _webCrawler;
    public CrawlerController(Log log, IConfiguration config, WebCrawler webCrawler)
    {
      _log = log;
      _config = config;
      _webCrawler = webCrawler;
    }

    
[HttpPost("/Crawler/SearchUrl", Name = "SearchUrl")]
public async Task<IActionResult> SearchUrl([FromBody] CrawlerRequest request)
{
    var results = new List<Metadata>();
    string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
    int pageNumber = request.CurrentPage;
    int pageSize = request.PageSize;
    int offset = (pageNumber - 1) * pageSize;
    int totalResults = 0;

    request.Url = request.Url?.ToLower();

    // ✅ Local timeout: cancel everything if > 30s
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
    var ct = cts.Token;

    try
    {
        bool hasCommaSeparatedKeywords = (request.Url ?? "").Contains(",");
        var keywords = request.Url?.Split(',')
                                   .Select(keyword => "%" + keyword.Trim().ToLower() + "%")
                                   .ToList();

        // Detect site:domain keywords pattern (e.g. "site:example.com robots")
        string? siteDomain = null;
        string? siteKeywords = null;
        bool siteOnly = false;
        if (!string.IsNullOrWhiteSpace(request.Url) && request.Url.Trim().StartsWith("site:"))
        {
            var remainder = request.Url.Trim().Substring(5).Trim();
            if (!string.IsNullOrEmpty(remainder))
            {
                var firstSpace = remainder.IndexOf(' ');
                if (firstSpace > 0)
                {
                    siteDomain = remainder.Substring(0, firstSpace).Trim();
                    siteKeywords = remainder.Substring(firstSpace + 1).Trim();
                }
                else
                {
                    siteDomain = remainder.Trim();
                    siteKeywords = null;
                }
                siteOnly = true;
            }
        }

        // Define the common search condition
        bool searchAll = request.Url == "*";
        string whereCondition;

        if (siteOnly && !string.IsNullOrEmpty(siteDomain))
        {
            var normalizedSite = NormalizeBaseDomain(siteDomain.ToLower());
            whereCondition = @$"(
                    url LIKE CONCAT('https://', @siteDomain, '%')
                OR  url LIKE CONCAT('http://',  @siteDomain, '%')
                OR  url LIKE CONCAT(@siteDomain, '%')
                OR  url IN (
                        CONCAT('https://', @siteDomain),
                        CONCAT('https://', @siteDomain, '/'),
                        CONCAT('http://',  @siteDomain),
                        CONCAT('http://',  @siteDomain, '/'),
                        CONCAT(@siteDomain),
                        CONCAT(@siteDomain, '/')
                    )
            )";

            if (!string.IsNullOrWhiteSpace(siteKeywords))
            {
                whereCondition = @$"({whereCondition}) AND (
                        MATCH(title, description, author, keywords) AGAINST (@siteKeywords IN NATURAL LANGUAGE MODE)
                    OR  title LIKE @siteKeywordsLike
                    OR  description LIKE @siteKeywordsLike
                    OR  url LIKE @siteKeywordsLike
                )";
            }

            whereCondition += " AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL))";
        }
        else
        {
            whereCondition = request.ExactMatch.GetValueOrDefault()
                ? " url_hash = @urlHash "
                : searchAll
                    ? " failed = 0 OR (failed = 1 AND response_code IS NOT NULL) "
                    : @$" (
                            url_hash = @urlHash
                        OR  url_hash = @urlHashWithSlash
                        OR  url_hash = @urlHashWithoutSlash 
                        OR  url LIKE @urlWithSlash
                        OR  url LIKE @urlWithoutSlash
                        OR  MATCH(title, description, author, keywords) AGAINST (@search IN NATURAL LANGUAGE MODE)
                        OR  url LIKE @search
                        OR  url LIKE @searchWithSlash
                        OR  url LIKE @searchWithoutSlash
                        OR  url LIKE @searchWithWildcard
                        OR  url IN (
                                CONCAT('https://', @baseDomain),
                                CONCAT('https://', @baseDomain, '/'),
                                CONCAT('https://www.', @baseDomain),
                                CONCAT('https://www.', @baseDomain, '/'),
                                CONCAT('http://', @baseDomain),
                                CONCAT('http://', @baseDomain, '/'),
                                CONCAT('http://www.', @baseDomain),
                                CONCAT('http://www.', @baseDomain, '/'),
                                CONCAT(@baseDomain),
                                CONCAT(@baseDomain, '/')
                            ) 
                        OR  url LIKE CONCAT('https://',     @baseDomain, '%')
                        OR  url LIKE CONCAT('https://www.', @baseDomain, '%')
                        OR  url LIKE CONCAT('http://',      @baseDomain, '%')
                        OR  url LIKE CONCAT('http://www.',  @baseDomain, '%')
                        OR  url LIKE CONCAT(@baseDomain, '%')
                    )
                    AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL))";
        }

        string orderByClause = searchAll
            ? "ORDER BY found_date DESC"
            : @"ORDER BY
                    CASE
                        WHEN url_hash = @urlHash            THEN 0
                        WHEN url_hash = @urlHashWithSlash   THEN 1
                        WHEN url_hash = @urlHashWithoutSlash THEN 2
                        WHEN url = @search                  THEN 3
                        WHEN url = @searchWithSlash         THEN 4
                        WHEN url = @searchWithoutSlash      THEN 5
                        WHEN MATCH(title)       AGAINST (@search IN BOOLEAN MODE) THEN 6
                        WHEN MATCH(description) AGAINST (@search IN BOOLEAN MODE) THEN 7
                        WHEN MATCH(keywords)    AGAINST (@search IN BOOLEAN MODE) THEN 8
                        WHEN title       LIKE @searchLike THEN 9
                        WHEN url         LIKE @searchLike THEN 10
                        WHEN description LIKE @searchLike THEN 11
                        WHEN keywords    LIKE @searchLike THEN 12
                        ELSE 13
                    END,
                    id DESC";

        string resultsSql = $@"
            SELECT id, url, title, description, author, keywords, image_url, failed, response_code
            FROM search_results
            WHERE {whereCondition}
            {orderByClause}
            LIMIT @pageSize OFFSET @offset;";

        string countSql = $@"
            SELECT COUNT(*)
            FROM search_results
            WHERE {whereCondition};";

        // Build paramizer once so we reuse consistent params in both commands
        Action<MySqlCommand> paramizer = (cmd) =>
        {
            AddParametersToCrawlerQuery(request, pageSize, offset, searchAll, cmd, siteDomain, siteKeywords);
        };

        // 🔁 Kick off quick scrape in parallel (best effort)
        Task<List<Metadata>> quickScrapeTask = Task.FromResult(new List<Metadata>());
        bool shouldScrape = (request.SkipScrape != true) && (request.Url?.Trim() != "*");
        List<string> urlVariants = new();
        if (shouldScrape)
        {
            urlVariants = GetUrlVariants(request);
            quickScrapeTask = ScrapeQuickAsync(urlVariants, TimeSpan.FromSeconds(5), ct);
        }

        // ⚙️ Run results and count concurrently (two separate connections)
        var resultsTask = ExecuteResultsAsync(connectionString!, resultsSql, paramizer, ct);
        var countTask   = ExecuteScalarAsync(connectionString!, countSql, paramizer, ct);

        await Task.WhenAll(resultsTask, countTask);

        results = resultsTask.Result;
        totalResults = Convert.ToInt32(countTask.Result ?? 0);

        _ = _log.Db($"Found {results.Count} results before merging quick scrape", null, "CRAWLERCTRL", true);

        // Merge scraped results **only if the quick scrape already finished** (no extra waiting)
        int scrapedResults = 0;
        if (shouldScrape)
        {
            await Task.WhenAny(quickScrapeTask, Task.Delay(250, ct));  
            if (quickScrapeTask.IsCompletedSuccessfully)
            {
              var scraped = quickScrapeTask.Result;
              if (scraped?.Count > 0)
              {
                  results.AddRange(scraped);
                  scrapedResults = scraped.Count;
              }
            } 
        }

        // Post-process
        var allResults = GetOrderedResultsForWeb(request, results);
        allResults = await AddFavouriteCountsAsync(allResults, request.UserId);

        return Ok(new { Results = allResults, TotalResults = totalResults + scrapedResults });
    }
    catch (OperationCanceledException oce)
    {
        var pd = new ProblemDetails
        {
            Status = StatusCodes.Status408RequestTimeout,
            Title = "Search timed out",
            Detail = "The search took too long and was canceled. Try narrowing your query or reducing page size."
        };
        _ = _log.Db($"SearchUrl timeout: {oce.Message}", null, "CRAWLERCTRL", true);
        return StatusCode(pd.Status.Value, pd);
    }
    catch (MySqlException dbex) when (dbex.Message.Contains("Timeout", StringComparison.OrdinalIgnoreCase))
    {
        var pd = new ProblemDetails
        {
            Status = StatusCodes.Status504GatewayTimeout,
            Title = "Database timeout",
            Detail = "The database did not respond in time for this query. Please refine your search."
        };
        _ = _log.Db($"SearchUrl DB timeout: {dbex.Message}", null, "CRAWLERCTRL", true);
        return StatusCode(pd.Status.Value, pd);
    }
    catch (Exception ex)
    {
        if (results.Count > 0)
        {
            results = GetOrderedResultsForWeb(request, results);
            return Ok(new { Results = results, TotalResults = totalResults });
        }
        else
        { 
            var pd = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Search failed",
                Detail = ex.Message
            };
            _ = _log.Db($"SearchUrl error: {ex.Message}", null, "CRAWLERCTRL", true);
            return StatusCode(pd.Status.Value, pd); 
        }
    }
}


    private void AddParametersToCrawlerQuery(CrawlerRequest request, int pageSize, int offset, bool searchAll, MySqlCommand command, string? siteDomain = null, string? siteKeywords = null)
    {
      command.Parameters.AddWithValue("@searchAll", searchAll);
      command.Parameters.AddWithValue("@urlHash", searchAll ? DBNull.Value : _webCrawler.GetUrlHash(request.Url ?? ""));
      command.Parameters.AddWithValue("@urlHashWithSlash", searchAll ? DBNull.Value : _webCrawler.GetUrlHash(request.Url?.TrimEnd('/') + '/' ?? ""));
      command.Parameters.AddWithValue("@urlHashWithoutSlash", searchAll ? DBNull.Value : _webCrawler.GetUrlHash(request.Url?.TrimEnd('/') ?? ""));

      command.Parameters.AddWithValue("@urlWithSlash", searchAll ? DBNull.Value : request.Url?.TrimEnd('/') + '/' ?? "");
      command.Parameters.AddWithValue("@urlWithoutSlash", searchAll ? DBNull.Value : request.Url?.TrimEnd('/') ?? "");

      command.Parameters.AddWithValue("@search", request.Url?.ToLower());
      string baseDomain = NormalizeBaseDomain(request.Url?.ToLower() ?? "");
      command.Parameters.AddWithValue("@baseDomain", baseDomain);
      command.Parameters.AddWithValue("@searchLike", $"%{request.Url?.ToLower()}%");
      command.Parameters.AddWithValue("@pageSize", pageSize);
      command.Parameters.AddWithValue("@offset", offset);
      command.Parameters.AddWithValue("@searchWithSlash", $"%{request.Url?.ToLower()}/%");
      command.Parameters.AddWithValue("@searchWithoutSlash", $"%{request.Url?.ToLower().TrimEnd('/')}%");
      command.Parameters.AddWithValue("@searchWithWildcard", $"%{request.Url?.ToLower()}%");
      command.Parameters.AddWithValue("@searchIsDomain",
        Uri.CheckHostName(request.Url?.Replace("https://", "").Replace("http://", "").Split('/')[0]) != UriHostNameType.Unknown);

      // optional user id for favourite checks
      if (request.UserId != null)
      {
        command.Parameters.AddWithValue("@UserId", request.UserId.Value);
      }
      else
      {
        command.Parameters.AddWithValue("@UserId", 0);
      }

      // optional site:domain parameters
      if (!string.IsNullOrWhiteSpace(siteDomain))
      {
        command.Parameters.AddWithValue("@siteDomain", siteDomain.ToLower());
      }
      else
      {
        command.Parameters.AddWithValue("@siteDomain", DBNull.Value);
      }

      if (!string.IsNullOrWhiteSpace(siteKeywords))
      {
        command.Parameters.AddWithValue("@siteKeywords", siteKeywords);
        command.Parameters.AddWithValue("@siteKeywordsLike", $"%{siteKeywords.ToLower()}%");
      }
      else
      {
        command.Parameters.AddWithValue("@siteKeywords", DBNull.Value);
        command.Parameters.AddWithValue("@siteKeywordsLike", DBNull.Value);
      }
    }

    private string NormalizeBaseDomain(string url)
    {
      try
      {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
          Uri.TryCreate("https://" + url, UriKind.Absolute, out uri))
        {
          return uri.Host.StartsWith("www.")
            ? uri.Host.Substring(4)
            : uri.Host;
        }

        // Fallback for non-URL strings
        return url.Replace("https://", "").Replace("http://", "").Split('/')[0];
      }
      catch
      {
        return url;
      }
    }
    private List<string> GetUrlVariants(CrawlerRequest request)
    {
      List<string> variants = new List<string>();
      string tmpUrl = request.Url?.Trim().Replace(",", "").Replace(" ", "").Replace("'", "") ?? "";

      // Ensure the base URL has no protocol
      if (tmpUrl.StartsWith("http://") || tmpUrl.StartsWith("https://"))
      {
        tmpUrl = tmpUrl.Replace("http://", "").Replace("https://", "");
      }

      // Create base URLs with both protocols
      string httpsUrl = "https://" + tmpUrl;
      string httpUrl = "http://" + tmpUrl;

      if (!_webCrawler.IsValidDomain(httpsUrl))
      {
        Uri.TryCreate(httpsUrl, UriKind.Absolute, out var uri);
        string host = uri?.Host ?? "";
        if (!_webCrawler.HasValidSuffix(host))
        {
          // Add both HTTPS and HTTP variants with .com and .net
          variants.Add(httpsUrl + ".com");
          variants.Add(httpUrl + ".com");
          variants.Add(httpsUrl + ".net");
          variants.Add(httpUrl + ".net");
        }
      }
      else
      {
        // Add both HTTPS and HTTP variants
        variants.Add(httpsUrl);
        variants.Add(httpUrl);
      }

      return variants;
    }
    private List<Metadata> GetOrderedResultsForWeb(CrawlerRequest request, List<Metadata> allResults)
    {
      // Normalize: prefer https over http
      var httpsUrls = new HashSet<string>(
        allResults
          .Where(r => r.Url != null && r.Url.StartsWith("https://"))
          .Select(r => r.Url!.Replace("https://", ""))
      );

      allResults = allResults
        .Where(r =>
        {
          if (r.Url == null) return false;
          if (r.Url.StartsWith("http://"))
          {
            var withoutScheme = r.Url.Replace("http://", "");
            return !httpsUrls.Contains(withoutScheme);
          }
          return true;
        })
        .ToList();

      // Deduplicate by URL and sort by relevance
      allResults = allResults
        .GroupBy(r => r.Url)
        .Select(g => g.First())
        .OrderByDescending(r => _webCrawler.CalculateRelevanceScore(r, request.Url ?? ""))
        .ToList();

      return allResults;
    }


    [HttpPost("/Crawler/IndexLinks", Name = "IndexLinks")]
    public async void IndexLinks([FromBody] string url)
    {
      _ = _log.Db($"Indexing {url}", null, "CRAWLERCTRL", true);

      try
      {
        await Task.Delay(10000);
        var urlVariants = new List<string>();

        if (url.StartsWith("http://") || url.StartsWith("https://"))
        {
          urlVariants.Add(url);
        }
        else
        {
          urlVariants.Add("http://" + url);
          urlVariants.Add("https://" + url);
        }

        // Await these sequentially before launching async tasks
        foreach (var urlVariant in urlVariants)
        {
          await _webCrawler.StartScrapingAsync(urlVariant);
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Exception while indexing {url}: " + ex.Message, null, "CRAWLERCTRL", true);

      } 
    }

    [HttpPost("/Crawler/IndexCount", Name = "IndexCount")]
    public async Task<IActionResult> IndexCount()
    {
      int count = await _webCrawler.GetIndexCount();
      return Ok(count);
    }

    [HttpGet("/Crawler/GetStorageStats", Name = "GetStorageStats")]
    public async Task<IActionResult> GetStorageStats()
    {
      var stats = await _webCrawler.GetStorageStats();
      if (stats != null)
      {
        return Ok(stats);
      }
      else
      {
        return NotFound("No storage statistics available");
      }
    }

    [HttpGet("/Crawler/SearchYoutube", Name = "SearchYoutube")]
    public async Task<IActionResult> SearchYoutube([FromQuery] string keyword)
    {
      if (string.IsNullOrWhiteSpace(keyword))
        return BadRequest("Keyword is required");

      var apiKey = _config.GetValue<string>("Youtube:ApiKey");
      if (string.IsNullOrEmpty(apiKey))
        return StatusCode(500, "YouTube API key not configured");

      var searchResults = await SearchYoutubeVideosAsync(keyword, apiKey);
      if (searchResults == null || searchResults.Count == 0)
        return NotFound("No YouTube videos found");

      return Ok(searchResults);
    }

    [HttpPost("/Crawler/GetFavouritedByUrl", Name = "GetFavouritedByUrl")]
    public async Task<IActionResult> GetFavouritedByUrl([FromBody] string url)
    {
      var users = new List<maxhanna.Server.Controllers.DataContracts.Users.User>();
      if (string.IsNullOrWhiteSpace(url)) return BadRequest("Url required");
      string connectionString = _config.GetValue<string?>("ConnectionStrings:maxhanna") ?? string.Empty;
      try
      {
        using (var connection = new MySqlConnection(connectionString))
        {
          await connection.OpenAsync();
          string sql = @"
					SELECT fs.user_id AS userId, u.username, udp.file_id AS displayPictureFileId, udp.tag_background_file_id AS backgroundPictureFileId
					FROM favourites_selected fs
					JOIN favourites f ON fs.favourite_id = f.id
					LEFT JOIN users u ON fs.user_id = u.id
					LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
					WHERE f.url = @url;";

          using (var cmd = new MySqlCommand(sql, connection))
          {
            cmd.Parameters.AddWithValue("@url", url.Trim());
            using (var reader = await cmd.ExecuteReaderAsync())
            {
              while (await reader.ReadAsync())
              {
                var u = new maxhanna.Server.Controllers.DataContracts.Users.User();
                u.Id = reader.IsDBNull("userId") ? (int?)null : reader.GetInt32("userId");
                u.Username = reader.IsDBNull("username") ? null : reader.GetString("username");
                var dpId = reader.IsDBNull("displayPictureFileId") ? (int?)null : reader.GetInt32("displayPictureFileId");
                if (dpId.HasValue && dpId.Value != 0)
                {
                  u.DisplayPictureFile = new maxhanna.Server.Controllers.DataContracts.Files.FileEntry { Id = dpId.Value };
                }
                users.Add(u);
              }
            }
          }
        }
        return Ok(users);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in GetFavouritedByUrl: {ex.Message}", null, "CRAWLERCTRL", true);
        return StatusCode(500, "An error occurred while fetching favourited-by data");
      }
    }
    private async Task<List<YoutubeVideo>> SearchYoutubeVideosAsync(string keyword, string apiKey)
    {
      var videos = new List<YoutubeVideo>();
      var httpClient = new HttpClient();

      string requestUrl = $"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q={Uri.EscapeDataString(keyword)}&key={apiKey}";

      var response = await httpClient.GetAsync(requestUrl);
      if (!response.IsSuccessStatusCode)
        return videos;

      var content = await response.Content.ReadAsStringAsync();

      using var doc = System.Text.Json.JsonDocument.Parse(content);
      if (doc.RootElement.TryGetProperty("items", out System.Text.Json.JsonElement items))
      {
        foreach (var item in items.EnumerateArray())
        {
          if (!item.TryGetProperty("id", out var idElem) ||
            !idElem.TryGetProperty("videoId", out var videoIdElem)) continue;

          var snippet = item.GetProperty("snippet");

          videos.Add(new YoutubeVideo
          {
            VideoId = videoIdElem.GetString() ?? "",
            Title = snippet.GetProperty("title").GetString() ?? "",
            Description = snippet.GetProperty("description").GetString() ?? "",
            ThumbnailUrl = snippet.GetProperty("thumbnails").GetProperty("default").GetProperty("url").GetString() ?? ""
          });
        }
      }

      return videos;
    }


    private async Task<List<Metadata>?> AddFavouriteCountsAsync(List<Metadata> searchResults, int? userId = null)
    {
      if (searchResults == null || searchResults.Count == 0)
        return searchResults;

      var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

      // Collect all URLs
      var urls = searchResults
        .Select(r => r.Url?.Trim().ToLower())
        .Where(url => !string.IsNullOrEmpty(url))
        .Distinct()
        .ToList();

      // Build a dictionary to map url -> favourite count
      var favouriteCounts = new Dictionary<string, int>();

      // Prepare container for urls favourited by the requesting user
      var userFavourites = new HashSet<string>();

      using (var connection = new MySqlConnection(connectionString))
      {
        await connection.OpenAsync();

        // Build parameterized IN clause
        var parameters = new List<string>();
        for (int i = 0; i < urls.Count; i++)
        {
          parameters.Add($"@url{i}");
        }
        string inClause = string.Join(",", parameters);

        // Combined query: favourite count and whether the requesting user favoured each url
        string query = $@"
					SELECT f.url,
						   COUNT(DISTINCT fs.user_id) AS favourite_count,
						   SUM(CASE WHEN fs.user_id = @UserId THEN 1 ELSE 0 END) AS is_user_favourite_count
					FROM favourites f
					JOIN favourites_selected fs ON fs.favourite_id = f.id
					WHERE f.url IN ({inClause})
					GROUP BY f.url;
				";

        using (var command = new MySqlCommand(query, connection))
        {
          command.Parameters.AddWithValue("@UserId", userId ?? 0);
          for (int i = 0; i < urls.Count; i++)
          {
            command.Parameters.AddWithValue($"@url{i}", urls[i]);
          }

          using (var reader = await command.ExecuteReaderAsync())
          {
            while (await reader.ReadAsync())
            {
              string url = reader.GetString("url").Trim().ToLower();
              int count = reader.IsDBNull(reader.GetOrdinal("favourite_count")) ? 0 : reader.GetInt32("favourite_count");
              int isUserCount = reader.IsDBNull(reader.GetOrdinal("is_user_favourite_count")) ? 0 : reader.GetInt32("is_user_favourite_count");
              favouriteCounts[url] = count;
              if (isUserCount > 0)
              {
                userFavourites.Add(url);
              }
            }
          }
        }
      }

      // Inject favourite counts into original results
      foreach (var result in searchResults)
      {
        var normalizedUrl = result.Url?.Trim().ToLower();
        if (normalizedUrl != null && favouriteCounts.ContainsKey(normalizedUrl))
        {
          result.FavouriteCount = favouriteCounts[normalizedUrl];
        }
        if (normalizedUrl != null && userId != null && userId > 0)
        {
          result.IsUserFavourite = userFavourites.Contains(normalizedUrl);
        }
      }

      return searchResults;
    }

    
private async Task<List<Metadata>> ExecuteResultsAsync(
    string connectionString, string sql, Action<MySqlCommand> paramizer, CancellationToken ct)
{
    var list = new List<Metadata>();
    await using var conn = new MySqlConnection(connectionString);
    await conn.OpenAsync(ct);
    await using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 30 };
    paramizer(cmd);

    await using var reader = await cmd.ExecuteReaderAsync(ct);
    while (await reader.ReadAsync(ct))
    {
        list.Add(new Metadata
        {
            Url = reader.IsDBNull(reader.GetOrdinal("url")) ? null : reader.GetString("url"),
            Title = reader.IsDBNull(reader.GetOrdinal("title")) ? null : reader.GetString("title"),
            Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description"),
            ImageUrl = reader.IsDBNull(reader.GetOrdinal("image_url")) ? null : reader.GetString("image_url"),
            Author = reader.IsDBNull(reader.GetOrdinal("author")) ? null : reader.GetString("author"),
            Keywords = reader.IsDBNull(reader.GetOrdinal("keywords")) ? null : reader.GetString("keywords"),
            HttpStatus = reader.IsDBNull(reader.GetOrdinal("response_code")) ? null : reader.GetInt32("response_code"),
        });
    }
    return list;
}

private async Task<object?> ExecuteScalarAsync(
    string connectionString, string sql, Action<MySqlCommand> paramizer, CancellationToken ct)
{
    await using var conn = new MySqlConnection(connectionString);
    await conn.OpenAsync(ct);
    await using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 15 };
    paramizer(cmd);
    return await cmd.ExecuteScalarAsync(ct);
}

private async Task<List<Metadata>> ScrapeQuickAsync(IEnumerable<string> variants, TimeSpan perVariantBudget, CancellationToken ct)
{
    var scrapeTasks = variants.Select(async v =>
    {
        try
        {
            // Kick off background indexing regardless
            _ = _webCrawler.StartScrapingAsync(v);

            // Try to get metadata quickly for interactive UX
            var scrapeTask = _webCrawler.ScrapeUrlData(v);
            var completed = await Task.WhenAny(scrapeTask, Task.Delay(perVariantBudget, ct));
            if (completed == scrapeTask)
            {
                var m = await scrapeTask; // completed
                if (m != null && !_webCrawler.IsMetadataCompletelyEmpty(m))
                {
                    // Normalize URL relative to the variant
                    m.Url = new Uri(new Uri(v), m.Url).ToString().TrimEnd('/');
                    return m;
                }
            }
        }
        catch (Exception ex)
        {
            _ = _log.Db($"Quick scrape failed for {v}: {ex.Message}", null, "CRAWLERCTRL", true);
        }
        return null;
    });

    var results = await Task.WhenAll(scrapeTasks);
    return results.Where(m => m != null).Cast<Metadata>().ToList();
} 
  }
}