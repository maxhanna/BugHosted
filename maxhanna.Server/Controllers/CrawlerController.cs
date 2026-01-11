
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
    private static readonly HashSet<string> Stopwords = new(StringComparer.OrdinalIgnoreCase)
    {
      // Very common English stopwords; add more as needed or localize.
      "a","an","and","are","as","at","be","but","by","for","from","has","he","in",
      "is","it","its","of","on","or","our","she","that","the","their","there","they",
      "this","to","was","were","will","with","you","your"
    };

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

        // 🔎 Wikipedia fallback: only if NO URL was found AND the query is a keyword.
        // "No URL found" here means no results from DB + quick scrape.
        if ((allResults == null || allResults.Count == 0) && IsKeywordQuery(request.Url))
        {
          try
          {
            _ = _log.Db($"Scraping Wikipedia for: {request.Url!.Trim()}.", null, "CRAWLERCTRL", true);
            // Link to the controller-level 30s token, but give Wikipedia a tight 3s budget
            using var wikiCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            wikiCts.CancelAfter(TimeSpan.FromSeconds(8));

            var wiki = await TryFindWikipediaUrlAsync(request.Url!.Trim(), wikiCts.Token);
            if (wiki != null)
            {
              var wikiOnly = new List<Metadata> { wiki };
              if (wiki.Url != null)
              {
                await _webCrawler.SaveSearchResult(wiki.Url, wiki);
              }
              // Keep your normalization pipeline consistent
              wikiOnly = GetOrderedResultsForWeb(request, wikiOnly);
              wikiOnly = await AddFavouriteCountsAsync(wikiOnly, request.UserId);
              _ = _log.Db($"Scraping Wikipedia found results. Including results in search.", null, "CRAWLERCTRL", true);

              return Ok(new { Results = wikiOnly, TotalResults = 1 });
            }
          }
          catch (Exception e)
          {
            _ = _log.Db($"Failed to scrape Wikipedia for keyword: {e.Message}", null, "CRAWLERCTRL", true);
          }
        }
        else if (allResults != null && allResults.Count > 0)
        {
          // If this is a keyword query, prefetch Wikipedia in the background even if we already have results.
          // Skip if a Wikipedia URL already exists in these results.
          bool hasWikipedia = allResults.Any(r =>
            r.Url?.Contains("wikipedia.org/wiki/", StringComparison.OrdinalIgnoreCase) == true);

          if (IsKeywordQuery(request.Url) && !hasWikipedia)
          {
            _ = PrefetchWikipediaAsync(request.Url!.Trim());
          }
        }

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
    ///   2) FULLTEXT (BOOLEAN MODE on title/description/author/keywords/url)
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
          -- 1) fulltext within site (BOOLEAN MODE) — includes URL in MATCH
          SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
                 1 AS `rnk`,
                 MATCH(sr.title, sr.description, sr.author, sr.keywords, sr.url)
                   AGAINST (@siteBoolean IN BOOLEAN MODE) AS `ft_score`
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
            AND @siteBoolean IS NOT NULL
            AND MATCH(sr.title, sr.description, sr.author, sr.keywords, sr.url)
                  AGAINST (@siteBoolean IN BOOLEAN MODE)
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
            AND @siteBoolean IS NOT NULL
            AND MATCH(sr.title, sr.description, sr.author, sr.keywords, sr.url)
                  AGAINST (@siteBoolean IN BOOLEAN MODE)
            AND (sr.failed = 0 OR (sr.failed = 1 AND sr.response_code IS NOT NULL))" : string.Empty)}
      ) AS c;";
        return;
      }

      // Generic (non-site): union of exact equals, domain prefix, and fulltext (now includes URL)
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
        
        -- 2) fulltext on metadata + URL (BOOLEAN MODE, require significant terms)
        SELECT sr.id, sr.url, sr.title, sr.description, sr.author, sr.keywords, sr.image_url, sr.response_code,
               2 AS `rnk`,
               MATCH(sr.title, sr.description, sr.author, sr.keywords, sr.url)
                 AGAINST (@searchBoolean IN BOOLEAN MODE) AS `ft_score`
        FROM search_results sr
        WHERE @searchBoolean IS NOT NULL
          AND MATCH(sr.title, sr.description, sr.author, sr.keywords, sr.url)
                AGAINST (@searchBoolean IN BOOLEAN MODE)
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

        -- FT in COUNT mirrors BOOLEAN MODE usage (includes URL)
        SELECT sr.id
        FROM search_results sr
        WHERE @searchBoolean IS NOT NULL
          AND MATCH(sr.title, sr.description, sr.author, sr.keywords, sr.url)
                AGAINST (@searchBoolean IN BOOLEAN MODE)
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

      var compact = BuildCompact(raw);
      command.Parameters.AddWithValue("@searchCompact", compact);
      command.Parameters.AddWithValue("@searchCompactLike", "%" + compact + "%");

      // NEW: boolean-mode search query
      var searchBoolean = BuildBooleanQuery(raw);
      command.Parameters.AddWithValue("@searchBoolean",
          string.IsNullOrWhiteSpace(searchBoolean) ? (object)DBNull.Value : searchBoolean);

      string baseDomain = NormalizeBaseDomain(raw);
      command.Parameters.AddWithValue("@baseDomain", baseDomain);

      // Paging
      command.Parameters.AddWithValue("@pageSize", pageSize);
      command.Parameters.AddWithValue("@offset", offset);

      // Absolute URL candidates (existing code)
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

      // Optional user id
      if (request.UserId != null)
        command.Parameters.AddWithValue("@UserId", request.UserId.Value);
      else
        command.Parameters.AddWithValue("@UserId", 0);

      // site:domain params
      if (!string.IsNullOrWhiteSpace(siteDomain))
        command.Parameters.AddWithValue("@siteDomain", NormalizeBaseDomain(siteDomain.ToLower()));
      else
        command.Parameters.AddWithValue("@siteDomain", DBNull.Value);

      if (!string.IsNullOrWhiteSpace(siteKeywords))
      {
        command.Parameters.AddWithValue("@siteKeywords", siteKeywords);

        // NEW: boolean-mode site query
        var siteBoolean = BuildBooleanQuery(siteKeywords);
        command.Parameters.AddWithValue("@siteBoolean",
            string.IsNullOrWhiteSpace(siteBoolean) ? (object)DBNull.Value : siteBoolean);

        command.Parameters.AddWithValue("@siteKeywordsLike", $"%{siteKeywords.ToLower()}%");
      }
      else
      {
        command.Parameters.AddWithValue("@siteKeywords", DBNull.Value);
        command.Parameters.AddWithValue("@siteBoolean", DBNull.Value);
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

    private async Task<Metadata?> TryFindWikipediaUrlAsync(string keyword, CancellationToken ct)
    {
      try
      {
        using var http = new HttpClient
        {
          Timeout = TimeSpan.FromSeconds(6) // Keep this fast
        };


        http.DefaultRequestHeaders.UserAgent.ParseAdd(
          "maxhanna-crawler/1.0 (+https://bughosted.com; max@maxhanna.com)");


        // Step 1: Use MediaWiki search to find the best title
        string searchUrl =
          $"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={Uri.EscapeDataString(keyword)}&format=json&utf8=1&srlimit=1";
        using var sresp = await http.GetAsync(searchUrl, ct);
        if (!sresp.IsSuccessStatusCode) return null;

        var sjson = await sresp.Content.ReadAsStringAsync(ct);
        using var sdoc = System.Text.Json.JsonDocument.Parse(sjson);
        if (!(sdoc.RootElement.TryGetProperty("query", out var q) &&
              q.TryGetProperty("search", out var arr) &&
              arr.ValueKind == System.Text.Json.JsonValueKind.Array &&
              arr.GetArrayLength() > 0))
        {
          return null;
        }

        var title = arr[0].GetProperty("title").GetString();
        if (string.IsNullOrWhiteSpace(title)) return null;

        // Canonical page URL
        string canonicalUrl = $"https://en.wikipedia.org/wiki/{Uri.EscapeDataString(title!.Replace(' ', '_'))}";

        // Step 2: Try to enrich with the REST summary (best effort)
        try
        {
          string summaryUrl =
            $"https://en.wikipedia.org/api/rest_v1/page/summary/{Uri.EscapeDataString(title!.Replace(' ', '_'))}";
          using var resp = await http.GetAsync(summaryUrl, ct);
          if (resp.IsSuccessStatusCode)
          {
            var json = await resp.Content.ReadAsStringAsync(ct);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;

            string? pageTitle = root.TryGetProperty("title", out var t) ? t.GetString() : title;
            string? extract = root.TryGetProperty("extract", out var ex) ? ex.GetString() : null;
            string? shortDesc = root.TryGetProperty("description", out var d) ? d.GetString() : null;
            string? pageUrl =
                root.TryGetProperty("content_urls", out var cu)
             && cu.TryGetProperty("desktop", out var desk)
             && desk.TryGetProperty("page", out var p)
                  ? p.GetString()
                  : canonicalUrl;
            string? thumb = null;
            if (root.TryGetProperty("thumbnail", out var thumbEl) &&
                thumbEl.TryGetProperty("source", out var src))
            {
              thumb = src.GetString();
            }

            var description = !string.IsNullOrEmpty(shortDesc) && !string.IsNullOrEmpty(extract)
              ? $"{shortDesc}. {extract}"
              : (extract ?? shortDesc ?? "");

            return new Metadata
            {
              Url = pageUrl,
              Title = pageTitle ?? title,
              Description = description,
              ImageUrl = thumb,
              Author = "Wikipedia",
              Keywords = keyword
            };
          }
        }
        catch
        {
          _ = _log.Db("Summary enrichment failed. Falling back to minimal metadata.", null, "CRAWLERCTRL", true);
        }

        // Fallback: minimal metadata with URL when summary isn’t available
        return new Metadata
        {
          Url = canonicalUrl,
          Title = title,
          Description = null,
          ImageUrl = null,
          Author = "Wikipedia",
          Keywords = keyword
        };
      }
      catch
      {
        return null; // best effort
      }
    }


/// <summary>
/// Build a MySQL BOOLEAN MODE query from free text:
/// - Keeps quoted phrases together (e.g., "banana bread").
/// - Removes stopwords and tokens shorter than 3 chars.
/// - Escapes MySQL boolean operators from user input.
/// - Requires each remaining term with '+'.
/// - Adds '*' to the last token of each clause for prefix matching.
/// - Appends a compact concatenation token (e.g., +bananabread*) for multi-word inputs to catch
///   concatenations in URLs or text.
/// Returns null if nothing usable remains.
/// </summary>
private static string? BuildBooleanQuery(string? text)
{
  if (string.IsNullOrWhiteSpace(text))
    return null;

  // 1) Tokenize while preserving quoted phrases
  //    Examples:
  //    - input:  banana bread           -> ["banana", "bread"]
  //    - input: "banana bread" recipe   -> ["banana bread", "recipe"]  (phrase kept)
  var parts = new List<string>();
  foreach (System.Text.RegularExpressions.Match m in
           System.Text.RegularExpressions.Regex.Matches(
             text, "\"([^\"]+)\"|([A-Za-z0-9]+)", System.Text.RegularExpressions.RegexOptions.Multiline))
  {
    var phrase = m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value;
    if (!string.IsNullOrWhiteSpace(phrase))
      parts.Add(phrase);
  }

  if (parts.Count == 0)
    return null;

  // 2) Normalize, split phrases into tokens for compact tracking,
  //    but keep original phrases to build boolean segments.
  //    We will produce two kinds of segments:
  //    - tokens: "+banana +bread*"
  //    - phrases: "+\"banana bread\"*"
  var booleanSegments = new List<string>();
  var tokenAccumulator = new List<string>();  // for compact creation across multi-word unquoted input
 
  foreach (var rawPart in parts)
  {
    var isQuoted = rawPart.Contains(' ') && !string.IsNullOrWhiteSpace(rawPart); 

    // Split the part into tokens to filter stopwords/short tokens
    var tokens = System.Text.RegularExpressions.Regex
      .Matches(rawPart.ToLowerInvariant(), @"[a-z0-9]+")
      .Select(t => t.Value)
      .Where(tok => tok.Length >= 3 && !Stopwords.Contains(tok))
      .ToList();

    if (tokens.Count == 0)
      continue;

    if (isQuoted)
    {
      // Build a phrase segment if meaningful tokens remain
      var phraseValue = string.Join(" ", tokens);

      // Escape double quotes inside phrase, though our tokenizer shouldn’t capture quotes within quotes.
      phraseValue = phraseValue.Replace("\"", "\\\"");

      // Require the phrase; add trailing '*' for prefix on the last word of the phrase.
      // MySQL BOOLEAN MODE treats '*' at the end of a term for prefix; inside quotes it applies to the last token.
      booleanSegments.Add($"+\"{phraseValue}\"*");
      tokenAccumulator.AddRange(tokens);
    }
    else
    {
      // Single token(s) segment: require each token, add '*' only to the last one for UX.
      for (int i = 0; i < tokens.Count; i++)
      {
        var tok = EscapeBooleanToken(tokens[i]);
        bool isLast = i == tokens.Count - 1;
        booleanSegments.Add(isLast ? $"+{tok}*" : $"+{tok}");
      }
      tokenAccumulator.AddRange(tokens); 
    }
  }

  if (booleanSegments.Count == 0)
    return null;

  // 3) Add compact concatenation for multi-token inputs so "banana bread" also matches "bananabread"
  //    Only if there are at least 2 tokens across the whole input after filtering.
  var uniqueTokens = tokenAccumulator.Distinct().ToList();
  if (uniqueTokens.Count >= 2)
  {
    var compact = string.Concat(uniqueTokens);
    // Don’t add if it already exists in the boolean list as a token w/ wildcard
    // (rare, but keeps the output clean).
    var compactTerm = "+" + compact + "*";
    if (!booleanSegments.Contains(compactTerm))
      booleanSegments.Add(compactTerm);
  }

  // 4) Join
  var booleanQuery = string.Join(" ", booleanSegments);
  return string.IsNullOrWhiteSpace(booleanQuery) ? null : booleanQuery;
}

/// <summary>
/// Escapes/cleans a token so it won't be interpreted as a MySQL boolean operator.
/// MySQL boolean operators include: + - @ ~ < > ( ) " * and space.
/// We also strip stray operators users might type.
/// </summary>
private static string EscapeBooleanToken(string token)
{
  if (string.IsNullOrEmpty(token)) return token;

  // Remove/escape boolean special chars if present in token (defensive).
  // Our tokenization uses [a-z0-9]+ so this is an extra guard.
  var cleaned = token.Replace("\"", "")
                     .Replace("+", "")
                     .Replace("-", "")
                     .Replace("@", "")
                     .Replace("~", "")
                     .Replace("<", "")
                     .Replace(">", "")
                     .Replace("(", "")
                     .Replace(")", "")
                     .Replace("*", "");

  return cleaned;
}



    // Heuristic: treat input as keyword if it doesn’t look like a URL/domain.
    private static bool IsKeywordQuery(string? input)
    {
      if (string.IsNullOrWhiteSpace(input)) return false;
      var s = input.Trim();

      if (s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
          s.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        return false;

      if (s.StartsWith("site:", StringComparison.OrdinalIgnoreCase))
        return false;

      if (!s.Contains(' ') && s.Contains('.') && !s.EndsWith("."))
        return false;

      return true;
    }


    private Task PrefetchWikipediaAsync(string keyword)
    {
      return Task.Run(async () =>
      {
        try
        {
          _ = _log.Db($"Wikipedia prefetch queued for: {keyword}.", null, "CRAWLERCTRL", true);
          using var prefetchCts = new CancellationTokenSource(TimeSpan.FromSeconds(12));
          var wiki = await TryFindWikipediaUrlAsync(keyword, prefetchCts.Token);
          if (!string.IsNullOrWhiteSpace(wiki?.Url))
          {
            // Index asynchronously so next searches show the card
            await _webCrawler.StartScrapingAsync(wiki.Url);
          }
        }
        catch (Exception ex)
        {
          _ = _log.Db($"Wikipedia prefetch failed for '{keyword}': {ex.Message}", null, "CRAWLERCTRL", true);
        }
      });
    }

    private static string BuildCompact(string? text)
    {
      if (string.IsNullOrWhiteSpace(text)) return string.Empty;
      var sb = new System.Text.StringBuilder(text.Length);
      foreach (var ch in text.ToLowerInvariant())
        if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) sb.Append(ch);
      return sb.ToString();
    }

  }
}