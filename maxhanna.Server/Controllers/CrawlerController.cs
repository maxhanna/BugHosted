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
			//request.Url = request.Url?.ToLower()?.TrimEnd('/');
			request.Url = request.Url?.ToLower();
			try
			{
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();
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
					string whereCondition = string.Empty;

					if (siteOnly && !string.IsNullOrEmpty(siteDomain))
					{
						// Domain-restricted search: only return results under the specified domain
						var normalizedSite = NormalizeBaseDomain(siteDomain.ToLower());
						whereCondition = @$"(
								LOWER(url) LIKE CONCAT('https://', @siteDomain, '%')
								OR LOWER(url) LIKE CONCAT('http://', @siteDomain, '%')
								OR LOWER(url) LIKE CONCAT(@siteDomain, '%')
								OR LOWER(url) IN (
									CONCAT('https://', @siteDomain),
									CONCAT('https://', @siteDomain, '/'),
									CONCAT('http://', @siteDomain),
									CONCAT('http://', @siteDomain, '/'),
									CONCAT(@siteDomain),
									CONCAT(@siteDomain, '/')
								)
							)";

						if (!string.IsNullOrWhiteSpace(siteKeywords))
						{
							// add keyword filtering (natural language mode and string LIKE fallback)
							whereCondition = @$"({whereCondition}) AND (
								MATCH(title, description, author, keywords) AGAINST (@siteKeywords IN NATURAL LANGUAGE MODE)
								OR LOWER(title) LIKE @siteKeywordsLike
								OR LOWER(description) LIKE @siteKeywordsLike
								OR LOWER(url) LIKE @siteKeywordsLike
							)";
						}

						whereCondition += " AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL))";
					}
					else
					{
						whereCondition = request.ExactMatch.GetValueOrDefault()
						? " url_hash = @urlHash "
						: searchAll
							? " 1=1 "
							: @$" (
								url_hash = @urlHash
								OR url_hash = @urlHashWithSlash
								OR url_hash = @urlHashWithoutSlash 
								OR LOWER(url) LIKE @urlWithSlash
								OR LOWER(url) LIKE @urlWithoutSlash
								OR MATCH(title, description, author, keywords) AGAINST (@search IN NATURAL LANGUAGE MODE)
								OR LOWER(url) LIKE @search
								OR LOWER(url) LIKE @searchWithSlash
								OR LOWER(url) LIKE @searchWithoutSlash
								OR LOWER(url) LIKE @searchWithWildcard
								OR LOWER(url) IN (
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
								OR LOWER(url) LIKE CONCAT('https://', @baseDomain, '%')
								OR LOWER(url) LIKE CONCAT('https://www.', @baseDomain, '%')
								OR LOWER(url) LIKE CONCAT('http://', @baseDomain, '%')
								OR LOWER(url) LIKE CONCAT('http://www.', @baseDomain, '%')
								OR LOWER(url) LIKE CONCAT(@baseDomain, '%')
								OR (LOWER(url) LIKE CONCAT('%', @baseDomain, '%') AND @searchIsDomain = 1) 
							)
							AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL))";
					}

					// Simplified ORDER BY for searchAll
					string orderByClause = searchAll
						? "ORDER BY found_date DESC"
						: @"ORDER BY
							CASE
								WHEN url_hash = @urlHash THEN 0
								WHEN url_hash = @urlHashWithSlash THEN 1
								WHEN url_hash = @urlHashWithoutSlash  THEN 2
								WHEN LOWER(url) = @search THEN 3
								WHEN LOWER(url) = @searchWithSlash THEN 4
								WHEN LOWER(url) = @searchWithoutSlash THEN 5
								WHEN MATCH(title) AGAINST (@search IN BOOLEAN MODE) THEN 6
								WHEN MATCH(description) AGAINST (@search IN BOOLEAN MODE) THEN 7
								WHEN MATCH(keywords) AGAINST (@search IN BOOLEAN MODE) THEN 8
								WHEN LOWER(title) LIKE @searchLike THEN 9
								WHEN LOWER(url) LIKE @searchLike THEN 10
								WHEN LOWER(description) LIKE @searchLike THEN 11
								WHEN LOWER(keywords) LIKE @searchLike THEN 12
								ELSE 13
							END,
							id DESC";

					string checkUrlQuery = $@"
						SELECT id, url, title, description, author, keywords, image_url, failed, response_code  
						FROM search_results 
						WHERE {whereCondition} 
						{orderByClause}
						LIMIT @pageSize OFFSET @offset;";

					// Query to get the total count of results
					string totalCountQuery = $@"
						SELECT COUNT(*) 
						FROM search_results 
						WHERE {whereCondition};";


					using (var command = new MySqlCommand(checkUrlQuery, connection))
					{
						AddParametersToCrawlerQuery(request, pageSize, offset, searchAll, command, siteDomain, siteKeywords);
						using (var reader = await command.ExecuteReaderAsync())
						{
							while (reader.Read())
							{
								results.Add(new Metadata
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
						}
					}

					// Get total count
					using (var countCommand = new MySqlCommand(totalCountQuery, connection))
					{
						AddParametersToCrawlerQuery(request, pageSize, offset, searchAll, countCommand, siteDomain, siteKeywords);
						totalResults = Convert.ToInt32(await countCommand.ExecuteScalarAsync());
					}

					_ = _log.Db($"Found {results.Count} results before searching manually", null, "CRAWLERCTRL", true);

					int scrapedResults = 0;
					if (request.SkipScrape == null || request.SkipScrape == false)
					{
						List<string> urlVariants = GetUrlVariants(request);
						if (request.Url?.Trim() != "*")
						{
							foreach (var urlVariant in urlVariants)
							{
								_ = _log.Db($"Manually scraping: " + urlVariant, null, "CRAWLERCTRL", true);
								// Wait up to 5 seconds for the synchronous scrape to return for interactive user searches.
								// If it doesn't complete within the window, proceed and schedule background indexing.
								var scrapeTask = _webCrawler.ScrapeUrlData(urlVariant);
								var completed = await Task.WhenAny(scrapeTask, Task.Delay(TimeSpan.FromSeconds(5)));
								Metadata? mainMetadata = null;
								if (completed == scrapeTask)
								{
									mainMetadata = await scrapeTask; // already completed
								}

								if (mainMetadata != null)
								{
									scrapedResults++;
									mainMetadata.Url = new Uri(new Uri(urlVariant), mainMetadata.Url).ToString().TrimEnd('/');
									_ = _log.Db($"Added: " + mainMetadata.Url + " to search results.", null, "CRAWLERCTRL", true);
									results.Add(mainMetadata);
									if (mainMetadata.HttpStatus == null && !_webCrawler.IsMetadataCompletelyEmpty(mainMetadata))
									{
										_ = _webCrawler.SaveSearchResult(mainMetadata.Url, mainMetadata);
									}
								}
								else
								{
									_ = _log.Db($"Scrape timed out or failed for: " + urlVariant, null, "CRAWLERCTRL", true);
									//_ = _webCrawler.MarkUrlAsFailed(urlVariant);
								}

								// Schedule background indexing for this URL without awaiting — fire-and-forget
								try
								{
									_ = _webCrawler.StartScrapingAsync(urlVariant);
								}
								catch (Exception ex)
								{
									_ = _log.Db($"Failed to start background indexing for {urlVariant}: {ex.Message}", null, "CRAWLERCTRL", true);
								}
							}
						}
					}

					var allResults = results.ToList();

					allResults = GetOrderedResultsForWeb(request, allResults);
					allResults = await AddFavouriteCountsAsync(allResults);


					// Return the results along with the total count for pagination
					return Ok(new { Results = allResults, TotalResults = totalResults + scrapedResults });
				}
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
					return StatusCode(500, "An error occurred while processing the URL." + ex.Message);
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


		private async Task<List<Metadata>?> AddFavouriteCountsAsync(List<Metadata> searchResults)
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

				string query = $@"
					SELECT f.url, COUNT(DISTINCT fs.user_id) AS favourite_count
					FROM favourites f
					JOIN favourites_selected fs ON fs.favourite_id = f.id
					WHERE f.url IN ({inClause})
					GROUP BY f.url;
				";

				using (var command = new MySqlCommand(query, connection))
				{
					for (int i = 0; i < urls.Count; i++)
					{
						command.Parameters.AddWithValue($"@url{i}", urls[i]);
					}

					using (var reader = await command.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							string url = reader.GetString("url").Trim().ToLower();
							int count = reader.GetInt32("favourite_count");
							favouriteCounts[url] = count;
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
			}

			return searchResults;
		}
	}
} 