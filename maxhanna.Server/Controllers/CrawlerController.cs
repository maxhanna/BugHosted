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
			request.Url = request.Url?.TrimEnd('/');
			try
			{
				string urlHash = _webCrawler.GetUrlHash(request.Url ?? "");
				using (var connection = new MySqlConnection(connectionString))
                {
                    await connection.OpenAsync();
                    bool hasCommaSeparatedKeywords = (request.Url ?? "").Contains(",");
                    var keywords = request.Url?.Split(',')
                                                                .Select(keyword => "%" + keyword.Trim().ToLower() + "%")
                                                                .ToList();

                    // Define the common search condition
                    bool searchAll = request.Url == "*";
                    string whereCondition = request.ExactMatch.GetValueOrDefault() ? " url_hash = @urlHash "
					: searchAll ? " (failed = 0) " 
					: @$" ( 
							url_hash = @urlHash
							OR MATCH(title, description, author, keywords) AGAINST (@search IN NATURAL LANGUAGE MODE)
							OR url LIKE @search
					)
					AND (failed = 0 OR (failed = 1 AND response_code IS NOT NULL))";


                    // Query to get the paginated results
                    string checkUrlQuery = $@"
						SELECT id, url, title, description, author, keywords, image_url, failed, response_code 
						FROM search_results 
						WHERE {whereCondition} 
						ORDER BY CASE WHEN @searchAll IS TRUE THEN found_date ELSE id END DESC
						LIMIT @pageSize OFFSET @offset;";

                    // Query to get the total count of results
                    string totalCountQuery = $@"
						SELECT COUNT(*) 
						FROM search_results 
						WHERE {whereCondition};";


                    using (var command = new MySqlCommand(checkUrlQuery, connection))
                    {
                        command.Parameters.AddWithValue("@searchAll", searchAll);
                        command.Parameters.AddWithValue("@urlHash", searchAll ? DBNull.Value : (object)urlHash);
                        command.Parameters.AddWithValue("@search", request.Url?.ToLower());

                        command.Parameters.AddWithValue("@pageSize", pageSize);
                        command.Parameters.AddWithValue("@offset", offset);
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
                        countCommand.Parameters.AddWithValue("@searchAll", searchAll);
                        countCommand.Parameters.AddWithValue("@urlHash", searchAll ? DBNull.Value : (object)urlHash); 
                        countCommand.Parameters.AddWithValue("@search", request.Url?.ToLower()); 
                        totalResults = Convert.ToInt32(await countCommand.ExecuteScalarAsync());
                    }
 
                    _ = _log.Db($"Found {results.Count} results before searching manually", null, "CRAWLERCTRL", true);
                    int scrapedResults = 0;
					List<string> urlVariants = GetUrlVariants(request);
                    if (request.Url?.Trim() != "*")
                    {
                        foreach (var urlVariant in urlVariants)
                        {
                            _ = _log.Db($"Manually scraping: " + urlVariant, null, "CRAWLERCTRL", true);
                            var mainMetadata = await _webCrawler.ScrapeUrlData(urlVariant);
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
								_ = _log.Db($"Url Failed: " + urlVariant, null, "CRAWLERCTRL", true);
								_ = _webCrawler.MarkUrlAsFailed(urlVariant);
                            }
                        }
                    }
                    var allResults = results.ToList();

                    allResults = GetOrderedResultsForWeb(request, allResults);

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

        private List<string> GetUrlVariants(CrawlerRequest request)
        {
			List<string> variants = new List<string>();
            string tmpUrl = request.Url?.Trim().Replace(",", "").Replace(" ", "").Replace("'", "") ?? "";
            if (!tmpUrl.StartsWith("http://") && !tmpUrl.StartsWith("https://"))
            {
                tmpUrl = "https://" + tmpUrl;
            }
            if (!_webCrawler.IsValidDomain(tmpUrl))
            {
                Uri.TryCreate(tmpUrl, UriKind.Absolute, out var uri);
                string host = uri?.Host ?? "";
                if (!_webCrawler.HasValidSuffix(host))
                {
					variants.Add(tmpUrl + ".com");
					variants.Add(tmpUrl + ".net");
                }
            }
            else
            {
				variants.Add(tmpUrl);
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
	}
}
