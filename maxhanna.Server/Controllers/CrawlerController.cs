using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Crawler;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Linq.Expressions;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CrawlerController : ControllerBase
	{
		private readonly ILogger<CrawlerController> _logger;
		private readonly IConfiguration _config;

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

			try
			{
				string urlHash = GetUrlHash(request.Url);
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					string checkUrlQuery = @"
                SELECT id, url, title, description, author, keywords, image_url, failed 
                FROM search_results 
                WHERE (@searchAll IS TRUE OR url_hash = @urlHash 
											OR LOWER(url) LIKE @search
											OR LOWER(title) LIKE @search
											OR LOWER(author) LIKE @search
											OR LOWER(keywords) LIKE @search 
											OR LOWER(image_url) LIKE @search 
											OR LOWER(description) LIKE @search);";
					bool searchAll = request.Url == "*"; 
					using (var command = new MySqlCommand(checkUrlQuery, connection))
					{
						command.Parameters.AddWithValue("@searchAll", searchAll);
						command.Parameters.AddWithValue("@urlHash", searchAll ? DBNull.Value : (object)urlHash);
						command.Parameters.AddWithValue("@search", searchAll ? DBNull.Value : "%" + request.Url.ToLower() + "%");

						using (var reader = await command.ExecuteReaderAsync())
						{
							while (reader.Read())
							{
								bool failed = reader.GetBoolean("failed");
								if (!failed)
								{
									var result = new Metadata
									{
										Id = reader.GetInt32("id"),  // Assuming Id is not nullable, so we keep it as is
										Url = reader.IsDBNull(reader.GetOrdinal("url")) ? null : reader.GetString("url"),
										Title = reader.IsDBNull(reader.GetOrdinal("title")) ? null : reader.GetString("title"),
										Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description"),
										ImageUrl = reader.IsDBNull(reader.GetOrdinal("image_url")) ? null : reader.GetString("image_url"),
										Author = reader.IsDBNull(reader.GetOrdinal("author")) ? null : reader.GetString("author"),
										Keywords = reader.IsDBNull(reader.GetOrdinal("keywords")) ? null : reader.GetString("keywords")
									};
									results.Add(result);
								}
							}
						}
					}

					Console.WriteLine($"Found {results.Count} results before searching manually");
					
					// Scrape both http:// and https:// versions if the URL is missing the protocol
					var urlVariants = new List<string>();
					if (request.Url.StartsWith("http://") || request.Url.StartsWith("https://"))
					{
						urlVariants.Add(request.Url); // If URL already has a protocol, scrape it
					}
					else
					{
						urlVariants.Add("http://" + request.Url); // Add HTTP version
						urlVariants.Add("https://" + request.Url); // Add HTTPS version
					}

					// Scrape both versions and collect successful results
					var scrapedResults = new List<Metadata>();
					foreach (var urlVariant in urlVariants)
					{
						try
						{
							CrawlSitemap(urlVariant);
							var scrapedData = await ScrapeUrlData(urlVariant);
							if (scrapedData != null && scrapedData.Count > 0)
							{
								foreach (var data in scrapedData)
								{
									Console.WriteLine("Found scraped data and now inserting in db : " + urlVariant);
									scrapedResults.Add(data);
									InsertScrapedData(data.Url, data);
								}
							}
						}
						catch (Exception innerEx)
						{
							Console.WriteLine("Error scraping data: " + urlVariant + ". Error: " + innerEx.Message);
							InsertFailureRecord(urlVariant);
						} 
					}
					Console.WriteLine($"Found {scrapedResults.Count} scrapedResults");
					var allResults = results.Concat(scrapedResults)
							.GroupBy(r => r.Url)
							.Select(g => g.First())
							.OrderByDescending(r => CalculateRelevanceScore(r, request.Url))
							.ToList(); 

					if (allResults.Count == 0)
					{
						await InsertFailureRecord(request.Url);
					}

					return Ok(allResults);
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing the URL.");
				if (results.Count > 0)
				{
					results = results.GroupBy(r => r.Url)
							.Select(g => g.First())
							.OrderByDescending(r => CalculateRelevanceScore(r, request.Url))
							.ToList();
					return Ok(results);
				}
				else
				{
					InsertFailureRecord(request.Url);
					return StatusCode(500, "An error occurred while processing the URL.");
				}
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


		private async Task InsertFailureRecord(string url)
		{
			Console.WriteLine("Inserting failure record : " + url);
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();

				string failureQuery = @"
            INSERT INTO search_results (url, failed, found_date, last_crawled)
            VALUES (@url, TRUE, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE 
                failed = TRUE, 
								last_crawled = UTC_TIMESTAMP();";

				using (var command = new MySqlCommand(failureQuery, connection))
				{
					command.Parameters.AddWithValue("@url", url); 

					await command.ExecuteNonQueryAsync();
				}
			}
		}


		private async Task InsertScrapedData(string url, Metadata scrapedData)
		{
			Console.WriteLine("Inserting scraped data for " +  scrapedData.Url);
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

		private async Task<List<Metadata>> ScrapeUrlData(string url, int depth = 1)
		{
			Console.WriteLine("scraping : " + url); 

			List<Metadata> metaList = new List<Metadata>();
			var httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true });
			httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
			httpClient.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
			httpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.5");
			httpClient.DefaultRequestHeaders.Connection.ParseAdd("keep-alive");
			var response = await httpClient.GetAsync(url);

			// Handle non-successful responses
			if (!response.IsSuccessStatusCode)
			{
				Console.WriteLine($"Failed to fetch {url}. Status: {response.StatusCode}");
				InsertFailureRecord(url);
				return metaList;
			}

			var html = await response.Content.ReadAsStringAsync();
			var htmlDocument = new HtmlDocument();
			htmlDocument.LoadHtml(html);

			var metadata = new Metadata();

			// Extract title from <title> tag
			var titleNode = htmlDocument.DocumentNode.SelectSingleNode("//title");
			if (titleNode != null)
			{
				metadata.Title = titleNode.InnerText.Trim();
			}

			// Extract description from <meta name="description">
			var metaDescriptionNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='description']");
			if (metaDescriptionNode != null)
			{
				metadata.Description = metaDescriptionNode.GetAttributeValue("content", "").Trim();
			}

			// Extract Open Graph (OG) description
			var ogDescriptionNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:description']");
			if (ogDescriptionNode != null && metadata.Description == null)
			{
				metadata.Description = ogDescriptionNode.GetAttributeValue("content", "").Trim();
			}

			// Extract Open Graph (OG) title
			var ogTitleNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:title']");
			if (ogTitleNode != null)
			{
				metadata.Title = ogTitleNode.GetAttributeValue("content", "").Trim();
			}

			// Extract keywords
			var metaKeywordsNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='keywords']");
			if (metaKeywordsNode != null)
			{
				metadata.Keywords = metaKeywordsNode.GetAttributeValue("content", "").Trim();
			}

			// Extract Open Graph (OG) image
			var metaImageNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:image']");
			if (metaImageNode != null)
			{
				metadata.ImageUrl = metaImageNode.GetAttributeValue("content", "").Trim();
			}

			// Extract OG URL
			var ogUrlNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:url']");
			if (ogUrlNode != null)
			{
				metadata.Url = ogUrlNode.GetAttributeValue("content", "").Trim();
			}
			else
			{
				metadata.Url = url; // Fallback to the input URL if OG URL is not available
			}

			// Extract Author
			var metaAuthorNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='author']");
			if (metaAuthorNode != null)
			{
				metadata.Author = metaAuthorNode.GetAttributeValue("content", "").Trim();
			}

			// Extract all links and recursively scrape them
			var linkNodes = htmlDocument.DocumentNode.SelectNodes("//a[@href]");
			metaList.Add(metadata); 
			Console.WriteLine("added " + metadata.Url + " to list of scraped data");
			if (depth <= 0)
			{
				Console.WriteLine("preventing further recursion after " + url);
				return metaList;
			}
			if (linkNodes != null)
			{
				foreach (var linkNode in linkNodes)
				{
					var href = linkNode.GetAttributeValue("href", "").Trim();
					if (string.IsNullOrEmpty(href) || href.StartsWith("#") || href.StartsWith("mailto:"))
					{
						continue; // Skip empty, anchor, and mailto links
					}

					// Convert relative links to absolute
					var absoluteUrl = new Uri(new Uri(url), href).ToString();

					// Recursively scrape found links (reduce depth by 1)
					Task.Run(async () =>
					{
						try
						{
							var childMetadata = await ScrapeUrlData(absoluteUrl, depth - 1);
							if (childMetadata != null && childMetadata.Count > 0)
							{
								foreach (var cMeta in childMetadata)
								{
									string fullUrl = new Uri(new Uri(absoluteUrl), cMeta.Url).ToString(); 
									InsertScrapedData(fullUrl, cMeta);
								}
							}
						} catch (Exception innerEx) {
							Console.WriteLine("Error scraping data: " + absoluteUrl + ". Error: " + innerEx.Message);
							InsertFailureRecord(absoluteUrl);
						} 
					});
				}
			}
			
			return metaList;
		}
		private int CalculateRelevanceScore(Metadata result, string searchTerm)
		{
			int score = 0;
			string search = searchTerm.ToLower();

			if (result.Url?.ToLower().Contains(search) == true) score += 100;
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
				var httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true }); 
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
			var httpClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true });

			// Fetch the sitemap XML
			var response = await httpClient.GetAsync(sitemapUrl);
			if (!response.IsSuccessStatusCode)
			{
				Console.WriteLine($"Failed to fetch sitemap from {sitemapUrl}");
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
				Console.WriteLine($"Error processing sitemap: {ex.Message}");
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
			Console.WriteLine("checking if domain is valid : " + domain);
			// Ensure there are no multiple TLDs (e.g., "imprioc.com.com")
			if (Regex.IsMatch(domain, @"\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$"))
			{
				return false;
			}

			// Ensure no double dots ".." exist in the domain
			if (domain.Contains(".."))
			{
				return false;
			}

			// Ensure the domain only contains valid characters
			if (!Regex.IsMatch(domain, @"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"))
			{
				return false;
			}

			return true;
		}
		private async Task<List<Metadata>> GetWebsiteMetadata(string domain)
		{
			try
			{
				List<Metadata>? scraped = await ScrapeUrlData(domain);

				if (scraped == null)
				{
					Console.WriteLine($"Failed to fetch {domain}");
					await InsertFailureRecord(domain);
					return null;
				}

				return scraped;
			}
			catch (Exception ex)
			{
				Console.WriteLine($"Failed to fetch {domain}");
				await InsertFailureRecord(domain);
				return null;
			}
		}
		private async Task CrawlSitemap(string domain)
		{
			string? sitemapUrl = await FindSitemapUrl(domain);

			if (sitemapUrl == null)
			{
				Console.WriteLine($"No sitemap found for {domain}");
				return;
			}

			Console.WriteLine($"Found sitemap index at {sitemapUrl}");

			try
			{
				// Fetch the sitemap index and parse it
				string sitemapIndexXml = await GetSitemapXml(sitemapUrl);

				// Extract individual sitemap URLs from the sitemap index
				var sitemapUrls = ExtractSitemapUrlsFromIndex(sitemapIndexXml);

				if (sitemapUrls.Count == 0)
				{
					Console.WriteLine("No sitemaps found in the sitemap index.");
					return;
				}

				Console.WriteLine($"Found {sitemapUrls.Count} sitemaps to process.");

				// Process each individual sitemap
				foreach (var sitemap in sitemapUrls)
				{
					Console.WriteLine($"Processing sitemap: {sitemap}");

					var urls = await GetUrlsFromSitemap(sitemap);
					if (urls.Count == 0)
					{
						Console.WriteLine($"No URLs found in sitemap {sitemap}");
					}
					else
					{
						Console.WriteLine($"Got {urls.Count} URLs from sitemap {sitemap}");
					}

					foreach (var url in urls)
					{
						Console.WriteLine($"Checking URL {url} from {sitemap}");

						// Process each URL (fetch metadata or index it)
						var metadata = await GetWebsiteMetadata(url);
						if (metadata != null)
						{
							foreach (var cMeta in metadata)
							{
								Console.WriteLine($"Saving url {cMeta.Url} from sitemap {sitemap}");
								await InsertScrapedData(cMeta.Url, cMeta);
							}
						}
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
					Console.WriteLine("Sitemap index XML is empty or null.");
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
	}
}
