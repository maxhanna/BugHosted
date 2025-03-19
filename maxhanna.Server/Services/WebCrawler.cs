using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using MySqlConnector;
using Newtonsoft.Json;
using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

public class WebCrawler
{
	private readonly HttpClient _httpClient = new HttpClient();
	private readonly IConfiguration _config;
	private const string Chars = "abcdefghijklmnopqrstuvwxyz";
	private bool _isHttpsDone = false;
	private static readonly List<string> DomainSuffixes = new List<string>
	{
			"com", "io", "net", "ca", "qc.ca", "org", "gov", "edu", "co", "biz", "info", "us", "tv", "me", "co.uk",
			"de", "fr", "es", "jp", "cn", "in", "br", "it", "ru", "au", "pl", "se", "nl", "ch", "at", "no", "fi", "dk",
			"be", "cz", "gr", "hu", "sg", "za", "kr", "mx", "kr", "ua", "sa", "ae", "cl", "ar", "tr", "pt", "ro", "kr",
			"tw", "my", "ph", "vn", "id", "lk", "pk", "ng", "ke", "eg", "gh", "dz", "bd", "do", "hn", "uy", "pe", "cr",
			"jm", "bz", "pa", "gt", "sv", "bo", "py", "ec", "tt", "jm", "ws", "pm", "mu", "tk", "cy", "ba", "hr", "mk",
			"rs", "bg", "md", "lt", "lv", "ee", "is", "me", "mk", "ks", "lb"
	};
	public WebCrawler(IConfiguration config)
	{
		_config = config;
	}

	public async Task FetchWebsiteMetadata()
	{
		string nextDomain = await GenerateNextUrl();
		Console.WriteLine($"Fetching metadata for: {nextDomain}");

		Metadata metadata = await GetWebsiteMetadata(nextDomain);
		if (metadata != null)
		{
			await SaveSearchResult(nextDomain, metadata); 
		}
	}

	private async Task<string> GenerateNextUrl()
	{
		string? lastDomain = await LoadLastGeneratedDomain();
		Console.WriteLine($"Last generated domain: {lastDomain}");

		string nextDomain = string.IsNullOrEmpty(lastDomain) ? "a.com" : GetNextDomain(lastDomain);
		Console.WriteLine($"Next domain: {nextDomain}");

		return nextDomain;
	}
	private string GetNextDomain(string lastDomain)
	{
		string namePart;
		string suffix;

		// Remove any existing protocol (http:// or https://) if present
		lastDomain = lastDomain.ToLower().Replace("http://", "");
		lastDomain = lastDomain.ToLower().Replace("https://", "");

		// Now, split the domain into name and suffix
		if (lastDomain.Contains('.'))
		{
			namePart = lastDomain.Substring(0, lastDomain.LastIndexOf('.'));
			suffix = lastDomain.Substring(lastDomain.LastIndexOf('.') + 1);
		}
		else
		{
			namePart = lastDomain;
			suffix = DomainSuffixes[0]; // Start with the first domain suffix, e.g., "com"
		}

		int suffixIndex = DomainSuffixes.IndexOf(suffix);
		if (suffixIndex == -1)
		{
			suffixIndex = 0; // If the suffix is not found, start from "com"
		}

		// Now cycle through all suffixes
		StringBuilder newDomain = new StringBuilder(namePart);
		int i = newDomain.Length - 1;

		while (i >= 0)
		{
			int index = Chars.IndexOf(newDomain[i]);
			if (index < Chars.Length - 1)
			{
				newDomain[i] = Chars[index + 1];
				string nextDomain = newDomain.ToString() + "." + DomainSuffixes[suffixIndex];

				// Apply the protocol only once at the start
				if (!_isHttpsDone)
				{
					return "http://" + nextDomain; // Ensure only http:// is used here
				}

				return "https://" + nextDomain; // Ensure only https:// is used here
			}
			else
			{
				newDomain[i] = Chars[0];
				i--;
			}
		}

		// After all http:// domains are processed, start returning https:// versions
		suffixIndex = (suffixIndex + 1) % DomainSuffixes.Count;
		string finalDomain = newDomain.ToString() + "." + DomainSuffixes[suffixIndex];

		// Only apply the protocol once at the start
		if (!_isHttpsDone)
		{
			return "http://" + finalDomain; // Start with HTTP
		}

		return "https://" + finalDomain; // Switch to HTTPS once HTTP is done
	}


	private async Task<string?> LoadLastGeneratedDomain()
	{
		string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
		using (var connection = new MySqlConnection(connectionString))
		{
			await connection.OpenAsync();
			string query = "SELECT url FROM search_results ORDER BY found_date DESC LIMIT 1;";
			using (var command = new MySqlCommand(query, connection))
			{
				var result = await command.ExecuteScalarAsync();
				return result?.ToString();
			}
		}
	}
	private async Task SaveSearchResult(string domain, Metadata metadata)
	{
		Console.WriteLine("saving results for " + domain);
		string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
		using (var connection = new MySqlConnection(connectionString))
		{
			await connection.OpenAsync();
			string insertQuery = @"  
						INSERT INTO search_results (url, title, description, author, keywords, image_url, found_date, last_crawled)
            VALUES (@url, @title, @description, @author, @keywords, @imageUrl, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                description = VALUES(description),
                author = VALUES(author),
                keywords = VALUES(keywords),
                image_url = VALUES(image_url), 
                found_date = UTC_TIMESTAMP(), 
                last_crawled = UTC_TIMESTAMP();";
			using (var insertCommand = new MySqlCommand(insertQuery, connection))
			{
				insertCommand.Parameters.AddWithValue("@url", domain);
				insertCommand.Parameters.AddWithValue("@title", metadata.Title ?? "");
				insertCommand.Parameters.AddWithValue("@description", metadata.Description);
				insertCommand.Parameters.AddWithValue("@author", metadata.Author);
				insertCommand.Parameters.AddWithValue("@keywords", metadata.Keywords);
				insertCommand.Parameters.AddWithValue("@imageUrl", metadata.ImageUrl); 
				await insertCommand.ExecuteNonQueryAsync();
			}
		}
	}
	private async Task MarkUrlAsFailed(string url)
	{
		Console.WriteLine("Marking as failed: " + url);
		string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

		using (var connection = new MySqlConnection(connectionString))
		{
			await connection.OpenAsync();

			string query = @"
            INSERT INTO search_results (url, failed, last_crawled, found_date)
            VALUES (@url, TRUE, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE failed = TRUE, last_crawled = UTC_TIMESTAMP(), found_date = UTC_TIMESTAMP();";

			using (var command = new MySqlCommand(query, connection))
			{
				command.Parameters.AddWithValue("@url", url);
				await command.ExecuteNonQueryAsync();
			}
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
					SaveSearchResult(childMetadata.Url, childMetadata);
				}
			}
		} 

		return metadata;
	}

	private async Task<Metadata> GetWebsiteMetadata(string domain)
	{
		try
		{
			Metadata? scraped = await ScrapeUrlData(domain);

			if (scraped == null)
			{
				Console.WriteLine($"Failed to fetch {domain}");
				await MarkUrlAsFailed(domain);
				return null;
			}
			 
			return scraped;
		} 
		catch(Exception ex)
		{ 
			Console.WriteLine($"Failed to fetch {domain}");
			await MarkUrlAsFailed(domain);
			return null;
		}
	} 
}