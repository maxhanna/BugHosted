using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Crawler;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml; 

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CrawlerController : ControllerBase
	{
		private readonly ILogger<CrawlerController> _logger;
		private readonly IConfiguration _config;

		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);
		private static readonly List<string> _urlQueue = new List<string>();
		private static readonly HashSet<string> _visitedUrls = new HashSet<string>();
		private static readonly TimeSpan _requestDelay = TimeSpan.FromSeconds(10); 

		public CrawlerController(ILogger<CrawlerController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
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

					// Define the common search condition
					string whereCondition = @"
                (@searchAll IS TRUE OR url_hash = @urlHash 
                OR LOWER(url) LIKE @search
                OR LOWER(title) LIKE @search
                OR LOWER(author) LIKE @search
                OR LOWER(keywords) LIKE @search 
                OR LOWER(image_url) LIKE @search 
                OR LOWER(description) LIKE @search)
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

					bool searchAll = (request.Url == "*");
					using (var command = new MySqlCommand(checkUrlQuery, connection))
					{
						command.Parameters.AddWithValue("@searchAll", searchAll);
						command.Parameters.AddWithValue("@urlHash", searchAll ? DBNull.Value : (object)urlHash);
						command.Parameters.AddWithValue("@search", searchAll ? DBNull.Value : "%" + request.Url.ToLower() + "%");
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
						countCommand.Parameters.AddWithValue("@search", searchAll ? DBNull.Value : "%" + request.Url.ToLower() + "%");

						totalResults = Convert.ToInt32(await countCommand.ExecuteScalarAsync());
					}

					Console.WriteLine($"Found {results.Count} results before searching manually");
					var scrapedResults = new List<Metadata>();

					if (request.Url.Trim() != "*" && IsValidDomain(request.Url))
					{
						var urlVariants = new List<string>();

						if (request.Url.StartsWith("http://") || request.Url.StartsWith("https://"))
						{
							urlVariants.Add(request.Url);
						}
						else
						{
							urlVariants.Add("http://" + request.Url);
							urlVariants.Add("https://" + request.Url);
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
										cMeta.Url = new Uri(new Uri(urlVariant), cMeta.Url).ToString().TrimEnd('/');
										results.Add(cMeta);
										if (cMeta.HttpStatus == null)
										{
											InsertScrapedData(cMeta.Url, cMeta);
										}
									}
								}
							}
							catch (Exception innerEx)
							{
								Console.WriteLine("Error scraping data: " + urlVariant + ". Error: " + innerEx.Message);
								InsertFailureRecord(urlVariant, null);
							}
						}
					}

					var allResults = results.Concat(scrapedResults).ToList();

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
					return Ok(new { Results = allResults, TotalResults = totalResults });
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
							while (reader.Read())
							{
								int count = reader.GetInt32("count");
								return Ok(count);
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
		private async Task InsertFailureRecord(string url, int? responseCode)
		{
			Console.WriteLine($"Failure record: {url}, Response Code: {responseCode}");

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
					command.Parameters.AddWithValue("@url", url);
					command.Parameters.AddWithValue("@responseCode", (object?)responseCode ?? DBNull.Value);

					await command.ExecuteNonQueryAsync();
				}
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
								failed = 0;";

					using (var command = new MySqlCommand(insertOrUpdateQuery, connection))
					{
						command.Parameters.AddWithValue("@url", url);
						command.Parameters.AddWithValue("@title", scrapedData.Title ?? "");
						command.Parameters.AddWithValue("@description", scrapedData.Description ?? "");
						command.Parameters.AddWithValue("@imageUrl", scrapedData.ImageUrl ?? "");
						command.Parameters.AddWithValue("@author", scrapedData.Author ?? "");
						command.Parameters.AddWithValue("@keywords", scrapedData.Keywords ?? "");

						await command.ExecuteNonQueryAsync();
					}
				}
			} catch (Exception ex)
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
			using var httpClient = new HttpClient(new HttpClientHandler
			{
				ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
				AllowAutoRedirect = true
			});

			httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

			var response = await httpClient.GetAsync(url);

			if (!response.IsSuccessStatusCode)
			{ 
				InsertFailureRecord(url, (int)response.StatusCode);
				var tmpmetadata = new Metadata
				{
				 HttpStatus = (int)response.StatusCode,
				};
				metaList.Add(tmpmetadata);
				return metaList;
			}

			var html = await response.Content.ReadAsStringAsync();
			var htmlDocument = new HtmlDocument();
			htmlDocument.LoadHtml(html);

			var metadata = new Metadata
			{
				Title = htmlDocument.DocumentNode.SelectSingleNode("//title")?.InnerText.Trim(),
				Description = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='description']")?.GetAttributeValue("content", "").Trim(),
				Keywords = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='keywords']")?.GetAttributeValue("content", "").Trim(),
				ImageUrl = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:image']")?.GetAttributeValue("content", "").Trim(),
				Url = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:url']")?.GetAttributeValue("content", url).Trim(),
				Author = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='author']")?.GetAttributeValue("content", "").Trim()
			};

			metaList.Add(metadata); 
			EnqueueLinks(url, htmlDocument); 
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

				StartScrapingAsync(absoluteUrl); 
			}
		}
		public async Task StartScrapingAsync(string initialUrl)
		{
			if (_visitedUrls.Add(initialUrl) && !_urlQueue.Contains(initialUrl) && _urlQueue.Count < 10000)
			{
				Console.WriteLine($"(Ctrl:{_urlQueue.Count}) Enqueued for later: " +
						$"{initialUrl.Substring(0, Math.Min(initialUrl.Length, 25))}" +
						$"{(initialUrl.Length > 35 ? "..." + initialUrl[^10..] : "")}"); 
				_urlQueue.Add(initialUrl);
			}
			ClearVisitedUrls();

			// Start the worker only if it's not already running
			if (_semaphore.CurrentCount > 0)
			{
				_ = StartScrapingAsyncWorker(); // Fire-and-forget, runs in background
			}
		}

		public async Task StartScrapingAsyncWorker()
		{
			while (_urlQueue.Count() > 0)
			{
				string url = GetRandomUrlFromList(_urlQueue);
				await _semaphore.WaitAsync();
				try
				{
					Console.WriteLine($"(Ctrl:{_urlQueue.Count()})Scraping: {url}");
					await CrawlSitemap(url);
					var childMetadata = await ScrapeUrlData(url);
					if (childMetadata != null && childMetadata.Count > 0)
					{
						foreach (var cMeta in childMetadata)
						{ 
							await InsertScrapedData(url, cMeta); 
						}
					}
				}
				catch(Exception ex)
				{
					Console.WriteLine("Exception scraping : " + url);
					await InsertFailureRecord(url, null);
				}
				finally
				{
					_semaphore.Release();
				}

				// Ensure exactly 1 second between requests
				await Task.Delay(_requestDelay);
			}
		}
	  
		private int CalculateRelevanceScore(Metadata result, string searchTerm)
		{
			int score = 20;
			string search = searchTerm.ToLower();
			if (Uri.TryCreate(result.Url, UriKind.Absolute, out Uri url))
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
				$"{domain}/sitemap_index.xml",
				$"{domain}/robots.txt"
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
				var httpClient = new HttpClient(new HttpClientHandler
				{
					ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
					AllowAutoRedirect = true
				}); 
				var response = await httpClient.GetAsync(url);
				return response.IsSuccessStatusCode;  // Return true if the URL exists
			}
			catch
			{
				return false;  // Return false if there's an error
			}
		}

		private async Task<List<string>> GetUrlsFromSitemap(string sitemapUrl)
		{
			var urls = new List<string>();
			var httpClient = new HttpClient(new HttpClientHandler
			{
				ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
				AllowAutoRedirect = true
			});

			// Fetch the sitemap XML
			var response = await httpClient.GetAsync(sitemapUrl);
			if (!response.IsSuccessStatusCode)
			{ 
				return urls;
			}

			var xml = await response.Content.ReadAsStringAsync();

			try
			{
				var xmlDoc = new XmlDocument();
				xmlDoc.LoadXml(xml);

				// Check for XML namespaces and handle different cases
				var xmlns = xmlDoc.DocumentElement?.NamespaceURI;

				// Case 1: Look for <url> tags in the sitemap (standard XML sitemap structure)
				var urlNodes = xmlDoc.GetElementsByTagName("url");
				foreach (XmlNode node in urlNodes)
				{
					var locNode = node.SelectSingleNode("loc");
					if (locNode != null)
					{
						string url = locNode.InnerText.Trim();
						if (IsValidDomain(url))  // Validate URL before adding
						{
							urls.Add(url);
						}
					}

					// Case 2: Look for video or image specific tags (e.g., <video:loc>, <image:loc>)
					AddMediaUrls(node, "video:loc", urls);
					AddMediaUrls(node, "image:loc", urls);
				}

				// Case 3: Handle raw URL list (if the sitemap is a plain list of URLs)
				if (string.IsNullOrEmpty(xmlns) && !xmlDoc.DocumentElement.Name.Equals("urlset", StringComparison.OrdinalIgnoreCase))
				{
					// Treat the XML as a raw list of URLs (no <url> tag structure)
					var rawUrls = xml.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries) as string[];
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

		private void AddMediaUrls(XmlNode node, string tagName, List<string> urls)
		{
			var mediaNodes = node.SelectNodes(tagName);
			if (mediaNodes != null)
			{
				foreach (XmlNode mediaNode in mediaNodes)
				{
					var mediaUrl = mediaNode.InnerText.Trim();
					if (IsValidDomain(mediaUrl))  // Validate media URL before adding
					{
						urls.Add(mediaUrl);
					}
				}
			}
		}
		private bool IsValidDomain(string domain)
		{ 
			// Ensure there are no multiple TLDs (e.g., "imprioc.com.com")
			if (Regex.IsMatch(domain, @"\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$"))
			{
				Console.WriteLine("invalid domain, multiple TLDs : " + domain);
				return false;
			}

			if (domain.ToLower().Contains("tel:"))
			{
				Console.WriteLine("invalid domain, tel in the link: " + domain);
				return false;
			}

			// Ensure no double dots ".." exist in the domain
			if (domain.Contains(".."))
			{
				Console.WriteLine("invalid domain, too many periods: " + domain); 
				return false;
			}

			if (!domain.Contains("."))
			{
				Console.WriteLine("invalid domain, not enough periods: " + domain); 
				return false;
			} 

			return true;
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
						StartScrapingAsync(url);
					}
				}
			}
			catch (Exception ex)
			{
				Console.WriteLine($"Error while crawling sitemap index {sitemapUrl}: {ex.Message}");
			}
		}
		private async Task<string> GetSitemapXml(string sitemapUrl)
		{
			using (var httpClient = new HttpClient())
			{
				try
				{
					// Send a GET request to the sitemap URL
					HttpResponseMessage response = await httpClient.GetAsync(sitemapUrl);

					// Ensure successful response
					response.EnsureSuccessStatusCode();

					// Read the response content as a string
					string xmlContent = await response.Content.ReadAsStringAsync();
					return xmlContent;
				}
				catch (Exception ex)
				{
					Console.WriteLine($"Error fetching sitemap XML from {sitemapUrl}: {ex.Message}");
					return string.Empty; // Return empty if failed
				}
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
					// Handle raw URLs (no XML, just plain list of URLs)
					// We assume each line is a valid URL, if it's not empty or whitespace
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
				Console.WriteLine($"Error extracting URLs from sitemap index: {ex.Message}");
			}

			return sitemapUrls;
		}
		public string GetRandomUrlFromList(List<string> urls)
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
				_visitedUrls.Clear();
				_logger.LogInformation("Visited URLs have been cleared.");
			}
		}
	}
}
