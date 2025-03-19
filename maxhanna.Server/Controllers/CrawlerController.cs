using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Crawler;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;

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
                WHERE url_hash = @urlHash 
								OR LOWER(title) LIKE @search
								OR LOWER(author) LIKE @search
								OR LOWER(keywords) LIKE @search 
								OR LOWER(image_url) LIKE @search 
								OR LOWER(description) LIKE @search;";

					using (var command = new MySqlCommand(checkUrlQuery, connection))
					{
						command.Parameters.AddWithValue("@urlHash", urlHash);
						command.Parameters.AddWithValue("@search", "%" + request.Url.ToLower() + "%");

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
						var scrapedData = await ScrapeUrlData(urlVariant);
						if (scrapedData != null)
						{
							scrapedResults.Add(scrapedData); // Add to results if scraping is successful
						}
					}
					Console.WriteLine($"Found {scrapedResults.Count} scrapedResults");
					var allResults = results.Concat(scrapedResults)
							.GroupBy(r => r.Url)  
							.Select(g => g.First())
							.OrderByDescending(r => CalculateRelevanceScore(r, request.Url))  
							.ToList();

					foreach (var data in scrapedResults)
					{
						await InsertScrapedData(data.Url, data);
					}

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
				await InsertFailureRecord(request.Url);
				if (results.Count > 0)
				{
					results = results.GroupBy(r => r.Url)
							.Select(g => g.First())
							.OrderByDescending(r => CalculateRelevanceScore(r, request.Url))
							.ToList();
					return Ok(results);
				} else
				{ 
					return StatusCode(500, "An error occurred while processing the URL.");
				}
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
            INSERT INTO search_results (url, failed, found_date)
            VALUES (@url, TRUE, UTC_TIMESTAMP())
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
                last_crawled = UTC_TIMESTAMP();";

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

		private async Task<Metadata?> ScrapeUrlData(string url, int depth = 1)
		{
			if (depth <= 0) return null; // Prevent infinite recursion

			var httpClient = new HttpClient();
			var response = await httpClient.GetAsync(url);

			// Handle non-successful responses
			if (!response.IsSuccessStatusCode)
			{
				return null;
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
					var childMetadata = await ScrapeUrlData(absoluteUrl, depth - 1);
					if (childMetadata != null)
					{
						InsertScrapedData(childMetadata.Url, childMetadata); 
					} else
					{
						Console.WriteLine("no scraped data");
					}
				}
			}
 
			return metadata;
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

	}
}
