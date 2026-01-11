
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

        bool searchAll = request.Url == "*";

        // Build UNION-based SQL that lets MySQL pick the best index per branch
        BuildUnionSql(request, searchAll, siteOnly, siteDomain, siteKeywords,
                      out string resultsSql, out string countSql);

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
        var countTask = ExecuteScalarAsync(connectionString!, countSql, paramizer, ct);

        await Task.WhenAll(resultsTask, countTask);

        results = resultsTask.Result;
        totalResults = Convert.ToInt32(countTask.Result ?? 0);

        _ = _log.Db($"Found {results.Count} results before merging quick scrape", null, "CRAWLERCTRL", true);

        // Small grace to incorporate scraped results if they are almost done (no noticeable wait)
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


    /// <summary>
    /// Builds UNION-based SQL that is index-friendly per branch.
    /// Branches (non-site):
    ///   0) exact url equals (UNIQUE(url))
    ///   1) domain prefix (left-anchored LIKE on url)
    ///   2) FULLTEXT
    /// Site-specific uses domain branches, plus optional FT within site.
    /// </summary>
    private void BuildUnionSql(
        CrawlerRequest request,
        bool searchAll,
        bool siteOnly,
        string? siteDomain,
        string? siteKeywords,
        out string resultsSql,
        out string countSql)
    {
      if (searchAll)
      {
        resultsSql = @"
            SELECT id, url, title, description, author, keywords, image_url, response_code
            FROM search_results
            WHERE failed = 0 OR (failed = 1 AND response_code IS NOT NULL)
            ORDER BY found_date DESC
            LIMIT @pageSize OFFSET @offset;";

        countSql = @"
            SELECT COUNT(*)
            FROM search_results
            WHERE failed = 0 OR (failed = 1 AND response_code IS NOT NULL);";
        return;
      }

      // If ExactMatch: just do the equality branch (fast UNIQUE(url) probe)
      if (request.ExactMatch.GetValueOrDefault())
      {
        resultsSql = @"
            SELECT id, url, title, description, author, keywords, image_url, response_code
            FROM search_results
            WHERE url IN (@httpsUrl, @httpsUrlWithSlash, @httpUrl, @httpUrlWithSlash)
              AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL))
            ORDER BY id DESC
            LIMIT @pageSize OFFSET @offset;";

        countSql = @"
            SELECT COUNT(*)
            FROM search_results
            WHERE url IN (@httpsUrl, @httpsUrlWithSlash, @httpUrl, @httpUrlWithSlash)
              AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL));";
        return;
      }

      // site:domain
      if (siteOnly && !string.IsNullOrEmpty(siteDomain))
      {
        // If siteKeywords present, include FT branch; otherwise only domain prefix branch
        bool withFt = !string.IsNullOrWhiteSpace(siteKeywords);

        resultsSql = $@"
            SELECT id, url, title, description, author, keywords, image_url, response_code
            FROM (
                -- 0) domain matches (prefix/equality)
                SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
                       0 AS `rnk`, NULL AS `ft_score`
                FROM search_results sr
                WHERE (
                       sr.url LIKE CONCAT('https://', @siteDomain, '%')
                    OR sr.url LIKE CONCAT('http://',  @siteDomain, '%')
                    OR sr.url LIKE CONCAT(@siteDomain, '%')
                    OR sr.url IN (
                          CONCAT('https://', @siteDomain),
                          CONCAT('https://', @siteDomain, '/'),
                          CONCAT('http://',  @siteDomain),
                          CONCAT('http://',  @siteDomain, '/'),
                          CONCAT(@siteDomain),
                          CONCAT(@siteDomain, '/')
                      )
                )
                  AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))
                {(withFt ? "UNION ALL" : string.Empty)}
                {(withFt ? @"
                -- 1) fulltext within site
                SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
                       1 AS `rnk`,
                       MATCH(sr.title, sr.description, sr.author, sr.keywords) AGAINST (@siteKeywords IN NATURAL LANGUAGE MODE) AS `ft_score`
                FROM search_results sr
                WHERE (
                       sr.url LIKE CONCAT('https://', @siteDomain, '%')
                    OR sr.url LIKE CONCAT('http://',  @siteDomain, '%')
                    OR sr.url LIKE CONCAT(@siteDomain, '%')
                    OR sr.url IN (
                          CONCAT('https://', @siteDomain),
                          CONCAT('https://', @siteDomain, '/'),
                          CONCAT('http://',  @siteDomain),
                          CONCAT('http://',  @siteDomain, '/'),
                          CONCAT(@siteDomain),
                          CONCAT(@siteDomain, '/')
                      )
                )
                  AND @siteKeywords IS NOT NULL
                  AND @siteKeywords <> ''
                  AND MATCH(sr.title, sr.description, sr.author, sr.keywords) AGAINST (@siteKeywords IN NATURAL LANGUAGE MODE)
                  AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))" : string.Empty)}
            ) AS u
            ORDER BY u.`rnk` ASC, u.`ft_score` DESC, u.id DESC
            LIMIT @pageSize OFFSET @offset;";

        countSql = $@"
            SELECT COUNT(DISTINCT id) AS total
            FROM (
                SELECT sr.id
                FROM search_results sr
                WHERE (
                       sr.url LIKE CONCAT('https://', @siteDomain, '%')
                    OR sr.url LIKE CONCAT('http://',  @siteDomain, '%')
                    OR sr.url LIKE CONCAT(@siteDomain, '%')
                    OR sr.url IN (
                          CONCAT('https://', @siteDomain),
                          CONCAT('https://', @siteDomain, '/'),
                          CONCAT('http://',  @siteDomain),
                          CONCAT('http://',  @siteDomain, '/'),
                          CONCAT(@siteDomain),
                          CONCAT(@siteDomain, '/')
                      )
                )
                  AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))
                {(withFt ? "UNION ALL" : string.Empty)}
                {(withFt ? @"
                SELECT sr.id
                FROM search_results sr
                WHERE (
                       sr.url LIKE CONCAT('https://', @siteDomain, '%')
                    OR sr.url LIKE CONCAT('http://',  @siteDomain, '%')
                    OR sr.url LIKE CONCAT(@siteDomain, '%')
                    OR sr.url IN (
                          CONCAT('https://', @siteDomain),
                          CONCAT('https://', @siteDomain, '/'),
                          CONCAT('http://',  @siteDomain),
                          CONCAT('http://',  @siteDomain, '/'),
                          CONCAT(@siteDomain),
                          CONCAT(@siteDomain, '/')
                      )
                )
                  AND @siteKeywords IS NOT NULL
                  AND @siteKeywords <> ''
                  AND MATCH(sr.title, sr.description, sr.author, sr.keywords) AGAINST (@siteKeywords IN NATURAL LANGUAGE MODE)
                  AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))" : string.Empty)}
            ) AS c;";
        return;
      }

      // Generic (non-site): union of exact equals, domain prefix, and fulltext
      resultsSql = @"
        SELECT id, url, title, description, author, keywords, image_url, response_code
        FROM (
            -- 0) exact url equals (covers http/https, with/without trailing slash)
            SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
                   0 AS `rnk`, NULL AS `ft_score`
            FROM search_results sr
            WHERE sr.url IN (@httpsUrl, @httpsUrlWithSlash, @httpUrl, @httpUrlWithSlash)
              AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))

            UNION ALL

            -- 1) domain prefix (left-anchored LIKE)
            SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
                   1 AS `rnk`, NULL AS `ft_score`
            FROM search_results sr
            WHERE (
                   sr.url LIKE CONCAT('https://',     @baseDomain, '%')
                OR sr.url LIKE CONCAT('https://www.', @baseDomain, '%')
                OR sr.url LIKE CONCAT('http://',      @baseDomain, '%')
                OR sr.url LIKE CONCAT('http://www.',  @baseDomain, '%')
                OR sr.url LIKE CONCAT(@baseDomain, '%')
                OR sr.url IN (
                      CONCAT('https://',     @baseDomain),
                      CONCAT('https://',     @baseDomain, '/'),
                      CONCAT('https://www.', @baseDomain),
                      CONCAT('https://www.', @baseDomain, '/'),
                      CONCAT('http://',      @baseDomain),
                      CONCAT('http://',      @baseDomain, '/'),
                      CONCAT('http://www.',  @baseDomain),
                      CONCAT('http://www.',  @baseDomain, '/'),
                      CONCAT(@baseDomain),
                      CONCAT(@baseDomain, '/')
                  )
            )
              AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))

            UNION ALL

            -- 2) fulltext on metadata
            SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
                   2 AS `rnk`,
                   MATCH(sr.title, sr.description, sr.author, sr.keywords) AGAINST (@search IN NATURAL LANGUAGE MODE) AS `ft_score`
            FROM search_results sr
            WHERE @search IS NOT NULL
              AND @search <> ''
              AND MATCH(sr.title, sr.description, sr.author, sr.keywords) AGAINST (@search IN NATURAL LANGUAGE MODE)
              AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))
        ) AS u
        ORDER BY u.`rnk` ASC, u.`ft_score` DESC, u.id DESC
        LIMIT @pageSize OFFSET @offset;";

      countSql = @"
        SELECT COUNT(DISTINCT id) AS total
        FROM (
            SELECT sr.id
            FROM search_results sr
            WHERE sr.url IN (@httpsUrl, @httpsUrlWithSlash, @httpUrl, @httpUrlWithSlash)
              AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))

            UNION ALL

            SELECT sr.id
            FROM search_results sr
            WHERE (
                   sr.url LIKE CONCAT('https://',     @baseDomain, '%')
                OR sr.url LIKE CONCAT('https://www.', @baseDomain, '%')
                OR sr.url LIKE CONCAT('http://',      @baseDomain, '%')
                OR sr.url LIKE CONCAT('http://www.',  @baseDomain, '%')
                OR sr.url LIKE CONCAT(@baseDomain, '%')
                OR sr.url IN (
                      CONCAT('https://',     @baseDomain),
                      CONCAT('https://',     @baseDomain, '/'),
                      CONCAT('https://www.', @baseDomain),
                      CONCAT('https://www.', @baseDomain, '/'),
                      CONCAT('http://',      @baseDomain),
                      CONCAT('http://',      @baseDomain, '/'),
                      CONCAT('http://www.',  @baseDomain),
                      CONCAT('http://www.',  @baseDomain, '/'),
                      CONCAT(@baseDomain),
                      CONCAT(@baseDomain, '/')
                  )
            )
              AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))

            UNION ALL

            SELECT sr.id
            FROM search_results sr
            WHERE @search IS NOT NULL
              AND @search <> ''
              AND MATCH(sr.title, sr.description, sr.author, sr.keywords) AGAINST (@search IN NATURAL LANGUAGE MODE)
              AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))
        ) AS c;";
    }


    private void AddParametersToCrawlerQuery(
        CrawlerRequest request,
        int pageSize,
        int offset,
        bool searchAll,
        MySqlCommand command,
        string? siteDomain = null,
        string? siteKeywords = null)
    {
      command.Parameters.AddWithValue("@searchAll", searchAll);

      // Core search text and domain
      var raw = (request.Url ?? string.Empty).Trim().ToLower();
      command.Parameters.AddWithValue("@search", raw);
      string baseDomain = NormalizeBaseDomain(raw);
      command.Parameters.AddWithValue("@baseDomain", baseDomain);

      // Paging
      command.Parameters.AddWithValue("@pageSize", pageSize);
      command.Parameters.AddWithValue("@offset", offset);

      // Absolute URL candidates for equality (UNIQUE(url) lookups)
      // Build both https:// and http:// forms + with/without trailing slash
      // If 'raw' already has a scheme, we still compute both schemes for robustness
      string rawNoSlash = raw.TrimEnd('/');
      string https = rawNoSlash.StartsWith("http://") || rawNoSlash.StartsWith("https://")
          ? (rawNoSlash.StartsWith("https://") ? rawNoSlash : "https://" + rawNoSlash.Substring(rawNoSlash.IndexOf("://") + 3))
          : "https://" + rawNoSlash;
      string http = rawNoSlash.StartsWith("http://") || rawNoSlash.StartsWith("https://")
          ? (rawNoSlash.StartsWith("http://") ? rawNoSlash : "http://" + rawNoSlash.Substring(rawNoSlash.IndexOf("://") + 3))
          : "http://" + rawNoSlash;

      string httpsWithSlash = https.EndsWith("/") ? https : (https + "/");
      string httpWithSlash = http.EndsWith("/") ? http : (http + "/");

      command.Parameters.AddWithValue("@httpsUrl", https);
      command.Parameters.AddWithValue("@httpsUrlWithSlash", httpsWithSlash);
      command.Parameters.AddWithValue("@httpUrl", http);
      command.Parameters.AddWithValue("@httpUrlWithSlash", httpWithSlash);

      // Optional user id for favourite checks (used later)
      if (request.UserId != null)
        command.Parameters.AddWithValue("@UserId", request.UserId.Value);
      else
        command.Parameters.AddWithValue("@UserId", 0);

      // optional site:domain parameters
      if (!string.IsNullOrWhiteSpace(siteDomain))
        command.Parameters.AddWithValue("@siteDomain", NormalizeBaseDomain(siteDomain.ToLower()));
      else
        command.Parameters.AddWithValue("@siteDomain", DBNull.Value);

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