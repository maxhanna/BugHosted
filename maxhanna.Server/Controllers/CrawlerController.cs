using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Crawler;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Data;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CrawlerController : ControllerBase
	{
		private readonly ILogger<CrawlerController> _logger;
		private readonly IConfiguration _config;
		private readonly HttpClient _httpClient = new HttpClient();

		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);
		private static readonly TimeSpan _requestDelay = TimeSpan.FromSeconds(10);
		private HashSet<string> _visitedUrls = new HashSet<string>();
		private List<string> _urlsToScrapeQueue = new List<string>();
		private List<string> delayedUrlsQueue = new List<string>();
		private static bool isProcessing = false;

		public CrawlerController(ILogger<CrawlerController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
			_httpClient = new HttpClient(new HttpClientHandler
			{
				ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
				AllowAutoRedirect = true
			});
			_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
			_httpClient.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
			_httpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.5");
			_httpClient.DefaultRequestHeaders.Connection.ParseAdd("keep-alive");
		}

		[HttpPost("/Crawler/SearchUrl", Name = "SearchUrl")]
		public async Task<IActionResult> SearchUrl([FromBody] CrawlerRequest request)
		{
			_logger.LogInformation($"POST /Crawler/SearchUrl for URL: {request.Url}");

			var results = new List<Metadata>();
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			int pageNumber = request.CurrentPage;
			int pageSize = request.PageSize;
			int offset = (pageNumber - 1) * pageSize;
			int totalResults = 0;

			try
			{
				string urlHash = GetUrlHash(request.Url);
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();
					bool hasCommaSeparatedKeywords = request.Url.Contains(",");
					var keywords = request.Url.Split(',')
																.Select(keyword => "%" + keyword.Trim().ToLower() + "%")
																.ToList();

					// Define the common search condition
					bool searchAll = (request.Url == "*");
					string whereCondition = searchAll ? " (failed = 0 OR (failed = 1 AND response_code IS NOT NULL)) " : @$"
					( 
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
						command.Parameters.AddWithValue("@search",  request.Url.ToLower() );
						 
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

					 
						countCommand.Parameters.AddWithValue("@search",   request.Url.ToLower()  );
						 

						totalResults = Convert.ToInt32(await countCommand.ExecuteScalarAsync());
					}

					var urlVariants = new List<string>();
					Console.WriteLine($"Found {results.Count} results before searching manually");
					int scrapedResults = 0; 
					bool skipScrape = false;
					string tmpUrl = request.Url.Trim().Replace(",", "").Replace(" ", "").Replace("'", "");
					string buildUrlCom = "";
					string buildUrlNet = "";
					if (!IsValidDomain(request.Url))
					{
						if (!request.Url.StartsWith("http://") && !request.Url.StartsWith("https://"))
						{
							string builtUrl = tmpUrl;
							bool addedCom = false;
							bool addedNet = false;
							if (!tmpUrl.Contains(".com"))
							{
								buildUrlCom = builtUrl + ".com"; 
								if (pageNumber != 1)
								{
									skipScrape = true;
								}
								addedCom = true;
							}
							if (!tmpUrl.Contains(".net"))
							{
								buildUrlNet = builtUrl + ".net"; 
								if (pageNumber != 1)
								{
									skipScrape = true;
								}
								addedNet = true;
							}
							if (!addedCom || !addedNet)
							{
								urlVariants.Add(builtUrl);
							}
						}
					}
					if (request.Url.Trim() != "*" && !skipScrape)
					{ 
						if (tmpUrl.StartsWith("http://") || tmpUrl.StartsWith("https://"))
						{
							urlVariants.Add(tmpUrl);
						}
						else 
						{
							if (!string.IsNullOrEmpty(buildUrlCom) || !string.IsNullOrEmpty(buildUrlNet))
							{
								if (!string.IsNullOrEmpty(buildUrlCom))
								{
									urlVariants.Add("http://" + buildUrlCom);
									urlVariants.Add("https://" + buildUrlCom);
								}
								if (!string.IsNullOrEmpty(buildUrlNet))
								{
									urlVariants.Add("http://" + buildUrlNet);
									urlVariants.Add("https://" + buildUrlNet);
								}
							} else if (IsValidDomain("https://" + tmpUrl))
							{
								urlVariants.Add("http://" + tmpUrl);
								urlVariants.Add("https://" + tmpUrl);
							} 
						} 
						// Await these sequentially before launching async tasks
						foreach (var urlVariant in urlVariants)
						{
							try
							{
								Console.WriteLine($"Manually scraping: " + urlVariant);
								var mainMetadata = await ScrapeUrlData(urlVariant);
								if (mainMetadata?.Count > 0)
								{
									foreach (var cMeta in mainMetadata)
									{
										scrapedResults++;
										cMeta.Url = new Uri(new Uri(urlVariant), cMeta.Url).ToString().TrimEnd('/');
										results.Add(cMeta);
										_ = InsertScrapedData(cMeta.Url, cMeta);
									}
								} else
								{
									_ = InsertFailureRecord(urlVariant); 
								}
							}
							catch (Exception innerEx)
							{
								if (innerEx.InnerException is AuthenticationException authEx)
								{
									_ = InsertFailureRecord(urlVariant, 495);
									var tmpmetadata = new Metadata
									{
										Url = urlVariant,
										HttpStatus = 495,
									};
								}
								else
								{
									_ = InsertFailureRecord(urlVariant, null);
								}
							}
						}
					}
					_ = ProcessDelayedUrlsQueueAsync();
					var allResults = results.ToList();

					if (request.Url.Trim() != "*")
					{
						allResults = allResults
										.GroupBy(r => r.Url)
										.Select(g => g.First())
										.OrderByDescending(r => CalculateRelevanceScore(r, request.Url))
										.ToList();
					}

					if (allResults.Count == 0 && IsValidDomain(request.Url))
					{
						await InsertFailureRecord(request.Url, null);
					}
					// Return the results along with the total count for pagination
					return Ok(new { Results = allResults, TotalResults = totalResults + scrapedResults });
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing the URL.");
				if (results.Count > 0)
				{
					results = results
									.GroupBy(r => r.Url)
									.Select(g => g.First())
									.OrderByDescending(r => CalculateRelevanceScore(r, request.Url))
									.ToList();
					return Ok(new { Results = results, TotalResults = totalResults });
				}
				else
				{
					InsertFailureRecord(request.Url, null);
					return StatusCode(500, "An error occurred while processing the URL.");
				}
			}
		}

		[HttpPost("/Crawler/IndexLinks", Name = "IndexLinks")]
		public async void IndexLinks([FromBody] string url)
		{
			_logger.LogInformation($"POST /Crawler/IndexLinks");
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
				await StartScrapingAsync(urlVariant);
			}
		}


		[HttpPost("/Crawler/IndexCount", Name = "IndexCount")]
		public async Task<IActionResult> IndexCount()
		{
			_logger.LogInformation($"POST /Crawler/IndexCount");

			var results = new List<Metadata>();
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			try
			{
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					string checkUrlQuery = @"SELECT count(*) as count FROM search_results;";

					using (var command = new MySqlCommand(checkUrlQuery, connection))
					{

						using (var reader = await command.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								return Ok(reader.GetInt32("count"));
							}
						}
					}

					return Ok(0);
				}
			}
			catch (Exception ex)
			{
				return Ok(0);
			}
		}
		private async Task InsertFailureRecord(string url, int? responseCode = null)
		{
			//Console.WriteLine($"Failure record: {url}, Response Code: {responseCode}");

			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();

				string failureQuery = @"
        INSERT INTO search_results (url, failed, response_code, found_date, last_crawled)
        VALUES (@url, TRUE, @responseCode, UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE 
            failed = TRUE, 
            response_code = @responseCode,
            last_crawled = UTC_TIMESTAMP();";

				using (var command = new MySqlCommand(failureQuery, connection))
				{
					command.Parameters.AddWithValue("@url", url.ToLower());
					command.Parameters.AddWithValue("@responseCode", (object?)responseCode ?? DBNull.Value);

					await command.ExecuteNonQueryAsync();
				}
			}
		}

		[HttpGet("/Crawler/GetStorageStats", Name = "GetStorageStats")]
		public async Task<IActionResult> GetStorageStats()
		{
			_logger.LogInformation("GET /StorageStats");

			string sql = @"
        SELECT 
            -- Calculate average row size in bytes
            (
                AVG(LENGTH(url)) +
                AVG(LENGTH(IFNULL(title, ''))) +
                AVG(LENGTH(IFNULL(description, ''))) +
                AVG(LENGTH(IFNULL(author, ''))) +
                AVG(LENGTH(IFNULL(keywords, ''))) +
                AVG(LENGTH(IFNULL(image_url, ''))) +
                4 + -- id (int)
                8 + -- found_date (timestamp)
                8 + -- last_crawled (timestamp)
                64 + -- url_hash (char(64))
                1 + -- failed (tinyint)
                4 + -- response_code (int)
                20  -- overhead for row structure
            ) AS avg_row_size_bytes,
            
            -- Convert to MB
            (
                AVG(LENGTH(url)) +
                AVG(LENGTH(IFNULL(title, ''))) +
                AVG(LENGTH(IFNULL(description, ''))) +
                AVG(LENGTH(IFNULL(author, ''))) +
                AVG(LENGTH(IFNULL(keywords, ''))) +
                AVG(LENGTH(IFNULL(image_url, ''))) +
                4 + 8 + 8 + 64 + 1 + 4 + 20
            ) / (1024 * 1024) AS avg_row_size_mb,
            
            -- Get total row count
            COUNT(*) AS total_rows,
            
            -- Get date range
            MIN(found_date) AS earliest_date,
            MAX(found_date) AS latest_date,
            
            -- Calculate days of data
            TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date)) AS days_of_data,
            
            -- Calculate rows per day (avoiding division by zero)
            CASE 
                WHEN TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date)) = 0 THEN COUNT(*)
                ELSE COUNT(*) / TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date))
            END AS avg_rows_per_day,
            
            -- Calculate estimated monthly usage in MB (projecting from daily average)
            CASE 
                WHEN TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date)) = 0 THEN 
                    COUNT(*) * (
                        AVG(LENGTH(url)) +
                        AVG(LENGTH(IFNULL(title, ''))) +
                        AVG(LENGTH(IFNULL(description, ''))) +
                        AVG(LENGTH(IFNULL(author, ''))) +
                        AVG(LENGTH(IFNULL(keywords, ''))) +
                        AVG(LENGTH(IFNULL(image_url, ''))) +
                        4 + 8 + 8 + 64 + 1 + 4 + 20
                    ) / (1024 * 1024)
                ELSE 
                    (COUNT(*) / TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date))) * 30 * 
                    (
                        AVG(LENGTH(url)) +
                        AVG(LENGTH(IFNULL(title, ''))) +
                        AVG(LENGTH(IFNULL(description, ''))) +
                        AVG(LENGTH(IFNULL(author, ''))) +
                        AVG(LENGTH(IFNULL(keywords, ''))) +
                        AVG(LENGTH(IFNULL(image_url, ''))) +
                        4 + 8 + 8 + 64 + 1 + 4 + 20
                    ) / (1024 * 1024)
            END AS projected_monthly_usage_mb
        FROM 
            search_results";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							if (await rdr.ReadAsync())
							{
								var stats = new
								{
									AvgRowSizeBytes = rdr.IsDBNull("avg_row_size_bytes") ? 0 : rdr.GetDecimal("avg_row_size_bytes"),
									AvgRowSizeMB = rdr.IsDBNull("avg_row_size_mb") ? 0 : rdr.GetDecimal("avg_row_size_mb"),
									TotalRows = rdr.IsDBNull("total_rows") ? 0 : rdr.GetInt32("total_rows"),
									EarliestDate = rdr.IsDBNull("earliest_date") ? DateTime.MinValue : rdr.GetDateTime("earliest_date"),
									LatestDate = rdr.IsDBNull("latest_date") ? DateTime.MinValue : rdr.GetDateTime("latest_date"),
									DaysOfData = rdr.IsDBNull("days_of_data") ? 0 : rdr.GetInt32("days_of_data"),
									AvgRowsPerDay = rdr.IsDBNull("avg_rows_per_day") ? 0 : rdr.GetDecimal("avg_rows_per_day"),
									ProjectedMonthlyUsageMB = rdr.IsDBNull("projected_monthly_usage_mb") ? 0 : rdr.GetDecimal("projected_monthly_usage_mb")
								};

								return Ok(stats);
							}
							else
							{
								return NotFound("No storage statistics available");
							}
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching storage statistics.");
				return StatusCode(500, "An error occurred while fetching storage statistics.");
			}
		}
		private async Task InsertScrapedData(string url, Metadata scrapedData)
		{
			try
			{
				string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					string insertOrUpdateQuery = @"
            INSERT INTO search_results (url, title, description, author, keywords, image_url, found_date)
            VALUES (@url, @title, @description, @author, @keywords, @imageUrl, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                description = VALUES(description),
                author = VALUES(author),
                keywords = VALUES(keywords),
                image_url = VALUES(image_url), 
                last_crawled = UTC_TIMESTAMP(),
								response_code = NULL,
								failed = FALSE;";

					using (var command = new MySqlCommand(insertOrUpdateQuery, connection))
					{
						command.Parameters.AddWithValue("@url", url.ToLower());
						command.Parameters.AddWithValue("@title", scrapedData.Title ?? "");
						command.Parameters.AddWithValue("@description", scrapedData.Description ?? "");
						command.Parameters.AddWithValue("@imageUrl", scrapedData.ImageUrl ?? "");
						command.Parameters.AddWithValue("@author", scrapedData.Author ?? "");
						command.Parameters.AddWithValue("@keywords", scrapedData.Keywords ?? "");

						await command.ExecuteNonQueryAsync();
					}
				}
			}
			catch (Exception ex)
			{
				Console.WriteLine("Exception writing url to db: " + ex.Message);
			}
		}

		// Helper method to generate a hash for the URL (used for unique identification)
		private string GetUrlHash(string url)
		{
			using (var sha256 = SHA256.Create())
			{
				byte[] hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(url));
				return BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
			}
		}

		public async Task<List<Metadata>> ScrapeUrlData(string url)
		{
			List<Metadata> metaList = new List<Metadata>();
			try
			{
				using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
				var response = await _httpClient.GetAsync(url, cts.Token);

				if (!response.IsSuccessStatusCode)
				{
					_ = InsertFailureRecord(url, (int)response.StatusCode);
					var tmpmetadata = new Metadata
					{
						Url = url,
						HttpStatus = (int)response.StatusCode,
					};
					metaList.Add(tmpmetadata);
					return metaList;
				}

				var html = await response.Content.ReadAsStringAsync();
				if (html.Length > 5_000_000)
				{
					//	Console.WriteLine("Ctrl Exception: HTML document too large to parse.");
					return metaList;
				}
				if (html.Count(c => c == '<') > 10_000)
				{
					//		Console.WriteLine("Ctrl Exception: Potentially malformed or deeply nested HTML.");
					return metaList;
				}
				var htmlDocument = new HtmlDocument
				{
					OptionMaxNestedChildNodes = 100
				};
				htmlDocument.OptionCheckSyntax = true;
				htmlDocument.LoadHtml(html);

				Uri baseUri = new Uri(url);
				string? faviconUrl = htmlDocument.DocumentNode.SelectSingleNode("//link[@rel='icon' or @rel='shortcut icon']")?
					.GetAttributeValue("href", "").Trim();

				string? ogImageUrl = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:image']")
						?.GetAttributeValue("content", "").Trim();

				string? imageUrl = !string.IsNullOrEmpty(faviconUrl) ? faviconUrl : ogImageUrl;
				if (!string.IsNullOrEmpty(imageUrl) && !imageUrl.StartsWith("http"))
				{
					imageUrl = new Uri(baseUri, imageUrl).ToString();
				}

				var metadata = new Metadata
				{
					Title = htmlDocument.DocumentNode.SelectSingleNode("//title")?.InnerText.Trim(),
					Description = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='description']")?.GetAttributeValue("content", "").Trim(),
					Keywords = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='keywords']")?.GetAttributeValue("content", "").Trim(),
					ImageUrl = imageUrl,
					Url = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:url']")?.GetAttributeValue("content", url).Trim(),
					Author = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='author']")?.GetAttributeValue("content", "").Trim()
				};

				metaList.Add(metadata);
				EnqueueLinks(url, htmlDocument);
			}
			catch (StackOverflowException ex)
			{
				//		Console.WriteLine("Stack Overflow Error on URL: " + url);
				_ = InsertFailureRecord(url, 500);
				return metaList;
			}
			catch (Exception ex)
			{
				_ = InsertFailureRecord(url, 500);
				//	Console.WriteLine("Ctrl: Error scraping data :" + ex.Message);
			}
			return metaList;
		}

		private void EnqueueLinks(string baseUrl, HtmlDocument htmlDocument)
		{
			var linkNodes = htmlDocument.DocumentNode.SelectNodes("//a[@href]");
			if (linkNodes == null) return;

			foreach (var linkNode in linkNodes)
			{
				var href = linkNode.GetAttributeValue("href", "").Trim();
				if (string.IsNullOrEmpty(href) || href.StartsWith("#") || href.StartsWith("mailto:"))
				{
					continue;
				}

				var absoluteUrl = new Uri(new Uri(baseUrl), href).ToString();

				_ = StartScrapingAsync(absoluteUrl);
			}
		}
		public async Task StartScrapingAsync(string initialUrl)
		{
			if (delayedUrlsQueue.Count < 10000 && IsValidDomain(initialUrl))
			{
				if (_visitedUrls.Add(initialUrl) && !_urlsToScrapeQueue.Contains(initialUrl) && IsValidDomain(initialUrl))
				{
					
						delayedUrlsQueue.Add(initialUrl);
						//Console.WriteLine($"(Ctrl:{delayedUrlsQueue.Count})Enqueued({_urlsToScrapeQueue.Count}): " + ShortenUrl(initialUrl));

						await ProcessDelayedUrlsQueueAsync();
					 
				}
			}
		}

		private async Task ProcessDelayedUrlsQueueAsync()
		{
			//Console.WriteLine("Ctrl: Starting delayed URL processing...");

			if (_semaphore.CurrentCount > 0)
			{
				while (delayedUrlsQueue.Count > 0)
				{
					string urlToProcess = GetRandomUrlFromList(delayedUrlsQueue);
					await Task.Delay(5000);

					string? existingUrl = await GetFreshCrawledDomains(urlToProcess);
					if (string.IsNullOrEmpty(existingUrl))
					{
						_urlsToScrapeQueue.Add(urlToProcess);

						_ = StartScrapingAsyncWorker();

					} else
					{
						Console.WriteLine("Ctrl: Skipping URL, already processed: " + urlToProcess);
					}
				}
				ClearVisitedUrls();
			}
		}

		public async Task StartScrapingAsyncWorker()
		{
			if (isProcessing) return;
			isProcessing = true;
			while (_urlsToScrapeQueue.Count() > 0)
			{
				string? url = GetRandomUrlFromList(_urlsToScrapeQueue);
				if (!string.IsNullOrEmpty(url))
				{
					await _semaphore.WaitAsync();
					try
					{
						Console.WriteLine($"(Ctrl:{delayedUrlsQueue.Count()}#{_urlsToScrapeQueue.Count()})Scraping: {ShortenUrl(url)}");
						_ = CrawlSitemap(url);
						var childMetadata = await ScrapeUrlData(url);
						if (childMetadata != null && childMetadata.Count > 0)
						{
							foreach (var cMeta in childMetadata)
							{
								await InsertScrapedData(url, cMeta);
							}
						}
					}
					catch (Exception ex)
					{
						//Console.WriteLine($"Exception scraping {url}: " + ex.Message);
						await InsertFailureRecord(url, null);
					}
					finally
					{
						_semaphore.Release();
					}
				}
				// Ensure exactly 10 second between requests
				await Task.Delay(_requestDelay);
			}
			isProcessing = false;
		}

		private int CalculateRelevanceScore(Metadata result, string searchTerm)
		{
			int score = 20;
			string search = searchTerm.ToLower();
			if (Uri.TryCreate(result.Url, UriKind.Absolute, out Uri? url))
			{
				string domain = url.Host.ToLower();

				// Check if it's an exact match for the domain (no path or query params)
				bool isTopLevelDomain = url.AbsolutePath == "/" || string.IsNullOrEmpty(url.AbsolutePath.Trim('/'));

				if (domain.Contains(search))
				{
					score += isTopLevelDomain ? 250 : 150; // Top-level gets 250, others 150
				}
				var pathSegments = url.AbsolutePath.Split('/').Where(segment => !string.IsNullOrEmpty(segment)).ToList();

				// Subtract points based on the number of segments (fewer segments, higher score)
				int segmentPenalty = pathSegments.Count > 1 ? (pathSegments.Count - 1) * 5 : 0; // 5 points per extra segment
				score -= segmentPenalty;
			}
			if (result.Url?.ToLower().Contains(search) == true) score += 75;
			if (result.Title?.ToLower().Contains(search) == true) score += 50;
			if (result.Description?.ToLower().Contains(search) == true) score += 30;
			if (result.Author?.ToLower().Contains(search) == true) score += 20;
			if (result.Keywords?.ToLower().Contains(search) == true) score += 20;
			if (result.ImageUrl?.ToLower().Contains(search) == true) score += 5;

			return score;
		}
		private async Task<string?> FindSitemapUrl(string domain)
		{
			domain = domain.TrimEnd('/');
			string[] possibleSitemapUrls = {
				$"{domain}/sitemap.xml",
				$"{domain}/sitemap_index.xml"
		};

			// Check each possible URL for a sitemap
			foreach (var url in possibleSitemapUrls)
			{
				if (await UrlExists(url))
				{
					return url;
				}
			}
			return null;
		}

		private async Task<bool> UrlExists(string url)
		{
			try
			{
				using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
				var response = await _httpClient.GetAsync(url, cts.Token);
				return response.IsSuccessStatusCode;
			}
			catch
			{
				return false;  // Return false if there's an error
			}
		}
		private async Task<List<string>> GetUrlsFromSitemap(string sitemapUrl)
		{
			var urls = new List<string>();
			try
			{
				using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
				var response = await _httpClient.GetAsync(sitemapUrl, cts.Token);
				if (!response.IsSuccessStatusCode)
				{
					return urls;
				}

				var xml = await response.Content.ReadAsStringAsync();

				var xmlDoc = new XmlDocument();
				xmlDoc.LoadXml(xml);

				// Detect XML namespace
				var xmlns = xmlDoc.DocumentElement?.NamespaceURI;
				XmlNamespaceManager nsManager = new XmlNamespaceManager(xmlDoc.NameTable);
				if (!string.IsNullOrEmpty(xmlns))
				{
					nsManager.AddNamespace("s", xmlns);  // Add detected namespace
				}

				// Use XPath with the correct namespace
				XmlNodeList urlNodes = xmlDoc.SelectNodes("//s:url", nsManager);
				foreach (XmlNode node in urlNodes)
				{
					XmlNode locNode = node.SelectSingleNode("s:loc", nsManager);
					if (locNode != null)
					{
						string url = locNode.InnerText.Trim();
						if (IsValidDomain(url))
						{
							urls.Add(url);
						}
					}

					// Handle media-specific tags
					AddMediaUrls(node, "s:video/s:loc", urls, nsManager);
					AddMediaUrls(node, "s:image/s:loc", urls, nsManager);
				}

				// Handle raw URL list if it's not an XML sitemap
				if (string.IsNullOrEmpty(xmlns) && !xmlDoc.DocumentElement.Name.Equals("urlset", StringComparison.OrdinalIgnoreCase))
				{
					var rawUrls = xml.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
					foreach (var rawUrl in rawUrls)
					{
						var trimmedUrl = rawUrl.Trim();
						if (Uri.IsWellFormedUriString(trimmedUrl, UriKind.Absolute))
						{
							urls.Add(trimmedUrl);
						}
					}
				}
			}
			catch (Exception ex)
			{
				//Console.WriteLine($"Error processing sitemap: {ex.Message}");
			}

			return urls;
		}

		private void AddMediaUrls(XmlNode node, string tagName, List<string> urls, XmlNamespaceManager nsManager)
		{
			try
			{
				XmlNodeList mediaNodes = node.SelectNodes(tagName, nsManager);
				if (mediaNodes != null)
				{
					foreach (XmlNode mediaNode in mediaNodes)
					{
						var mediaUrl = mediaNode.InnerText.Trim();
						if (IsValidDomain(mediaUrl))
						{
							urls.Add(mediaUrl);
						}
					}
				}
			}
			catch (Exception ex)
			{
				//Console.WriteLine($"Error processing media URLs: {ex.Message}");
			}
		}
		private async Task<string?> GetFreshCrawledDomains(string? url)
		{
			if (string.IsNullOrEmpty(url)) return null;
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();
				var urlHash = GetUrlHash(url.ToLower());
				string query = @"
            SELECT url 
            FROM search_results 
            WHERE url_hash = @UrlHash 
            AND last_crawled >= UTC_TIMESTAMP() - INTERVAL 5 DAY 
            LIMIT 1;";

				using (var command = new MySqlCommand(query, connection))
				{
					command.Parameters.AddWithValue("@UrlHash", urlHash);
					//Console.WriteLine($"Ctrl: checking if {url} was crawled: " + urlHash);
					var result = await command.ExecuteScalarAsync();

					if (result == null || result == DBNull.Value)
						return null;

					return result.ToString();
				}
			}
		}

		private bool IsValidDomain(string domain)
		{
			if (!string.IsNullOrEmpty(domain))
			{
				// Ensure there are no multiple TLDs (e.g., "imprioc.com.com")
				if (Regex.IsMatch(domain, @"\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$"))
				{
					//	Console.WriteLine("invalid domain, multiple TLDs : " + domain);
					return false;
				}

				if (domain.ToLower().Contains("tel:"))
				{
					//	Console.WriteLine("invalid domain, tel in the link: " + domain);
					return false;
				}

				// Ensure no double dots ".." exist in the domain
				if (domain.Contains(".."))
				{
					//	Console.WriteLine("invalid domain, too many periods: " + domain);
					return false;
				}

				if (!domain.Contains("."))
				{
					//	Console.WriteLine("invalid domain, not enough periods: " + domain);
					return false;
				}

				return true;
			}
			else
			{
				return false;
			}
		}

		private async Task CrawlSitemap(string domain)
		{
			string? sitemapUrl = await FindSitemapUrl(domain);

			if (sitemapUrl == null)
			{
				return;
			}

			try
			{
				// Fetch the sitemap index and parse it
				string sitemapIndexXml = await GetSitemapXml(sitemapUrl);

				// Extract individual sitemap URLs from the sitemap index
				var sitemapUrls = ExtractSitemapUrlsFromIndex(sitemapIndexXml);

				if (sitemapUrls.Count == 0)
				{
					return;
				}

				// Process each individual sitemap
				foreach (var sitemap in sitemapUrls)
				{
					var urls = await GetUrlsFromSitemap(sitemap);
					foreach (var url in urls)
					{
						_ = StartScrapingAsync(url);
					}
				}
			}
			catch (Exception ex)
			{
				//	Console.WriteLine($"Error while crawling sitemap index {sitemapUrl}: {ex.Message}");
			}
		}
		private async Task<string> GetSitemapXml(string sitemapUrl)
		{
			try
			{
				using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
				HttpResponseMessage response = await _httpClient.GetAsync(sitemapUrl, cts.Token);

				// Ensure successful response
				response.EnsureSuccessStatusCode();

				// Read the response content as a string
				string xmlContent = await response.Content.ReadAsStringAsync();
				return xmlContent;
			}
			catch (HttpRequestException ex)
			{
				//Console.WriteLine($"HTTP request failed for {sitemapUrl}: {ex.Message}");
				if (ex.InnerException is System.Net.Sockets.SocketException socketEx)
				{
					//	Console.WriteLine($"DNS resolution failed for {sitemapUrl}: {socketEx.Message}");
				}
				else
				{
					//	Console.WriteLine($"Inner Exception: {ex.InnerException?.Message}");
				}

				return string.Empty;
			}
			catch (Exception ex)
			{
				//Console.WriteLine($"Error fetching sitemap XML from {sitemapUrl}: {ex.Message}");
				return string.Empty; // Return empty if failed
			}
		}

		private List<string> ExtractSitemapUrlsFromIndex(string sitemapIndexXml)
		{
			var sitemapUrls = new List<string>();

			try
			{
				if (string.IsNullOrWhiteSpace(sitemapIndexXml))
				{
					return sitemapUrls;
				}

				// Check if the content is XML (i.e., if it has <sitemapindex> tag)
				if (sitemapIndexXml.Contains("<sitemapindex"))
				{
					// Handle XML-based sitemap index
					var xmlDoc = new XmlDocument();
					xmlDoc.LoadXml(sitemapIndexXml);

					// Search for all <loc> tags inside <sitemap> tags
					XmlNodeList locNodes = xmlDoc.GetElementsByTagName("loc");

					foreach (XmlNode locNode in locNodes)
					{
						// Add the URL, ensuring that it's not empty
						var locUrl = locNode.InnerText.Trim();
						if (!string.IsNullOrWhiteSpace(locUrl))
						{
							sitemapUrls.Add(locUrl);
						}
					}
				}
				else
				{
					var rawUrls = sitemapIndexXml.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
					foreach (var url in rawUrls)
					{
						var trimmedUrl = url.Trim();
						if (Uri.IsWellFormedUriString(trimmedUrl, UriKind.Absolute))
						{
							sitemapUrls.Add(trimmedUrl);
						}
					}
				}
			}
			catch (Exception ex)
			{
				//Console.WriteLine($"Error extracting URLs from sitemap index: {ex.Message}");
			}

			return sitemapUrls;
		}
		public string? GetRandomUrlFromList(List<string> urls)
		{
			if (urls.Count > 0)
			{
				Random rng = new Random();
				int randomIndex = rng.Next(0, urls.Count);
				string randomUrl = urls[randomIndex];
				urls.RemoveAt(randomIndex);
				return randomUrl;
			}

			return null;
		}
		private void ClearVisitedUrls()
		{
			if (_visitedUrls.Count > 10000)
			{
				_visitedUrls = new HashSet<string>(_visitedUrls.Take(5000).ToList());
			}
		}
		string ShortenUrl(string url, int maxLength = 50)
		{
			if (url.Length <= maxLength) return url;

			int firstPartLength = maxLength / 2 - 3;  // Adjust to leave room for "..."
			int lastPartLength = maxLength - firstPartLength - 3;

			return url.Substring(0, firstPartLength) + "..." + url[^lastPartLength..];
		}
	}
}
