using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using MySqlConnector;
using Newtonsoft.Json;
using System;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Xml;

public class WebCrawler
{
	private readonly HttpClient _httpClient = new HttpClient();
	private readonly IConfiguration _config;
	private const string Chars = "abcdefghijklmnopqrstuvwxyz"; 
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
		List<string> nextDomains = await GenerateNextUrl();
		foreach (string domain in nextDomains)
		{ 
			await CrawlSitemap(domain);

			List<Metadata> metadata = await GetWebsiteMetadata(domain);
			if (metadata != null)
			{
				foreach (var cMeta in metadata)
				{
					if (cMeta.Url != null)
					{ 
						await SaveSearchResult(cMeta.Url, cMeta);
					}
				}
			}
		} 
	}

	private async Task<List<string>> GenerateNextUrl()
	{
		string? lastDomain = await LoadLastGeneratedDomain(); 
		string nextDomain = string.IsNullOrEmpty(lastDomain) ? "a.com" : GetNextDomain(lastDomain); 
		// Generate both http:// and https:// versions
		string httpVersion = "http://" + nextDomain;
		string httpsVersion = "https://" + nextDomain;

		List<string> results = new List<string>();
		results.Add(httpsVersion);
		results.Add(httpVersion);

 		return results; // Or use httpsVersion depending on your preference
	}

	private string GetNextDomain(string lastDomain)
	{
		string namePart;
		string suffix;
		int maxAttempts = 100; // Limit recursive calls
		int attemptCount = 0;

		// Remove any existing protocol (http:// or https://) if present
		lastDomain = lastDomain.ToLower().Replace("http://", "").Replace("https://", "");

		// Split the domain into name and suffix
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

		// Loop to find a valid domain instead of infinite recursion
		while (attemptCount < maxAttempts)
		{
			// Generate the next domain name
			StringBuilder newDomain = new StringBuilder(namePart);
			int i = newDomain.Length - 1;

			while (i >= 0)
			{
				int index = Chars.IndexOf(newDomain[i]);
				if (index < Chars.Length - 1)
				{
					newDomain[i] = Chars[index + 1];
					string nextDomain = newDomain.ToString() + "." + DomainSuffixes[suffixIndex];

					// Validate before returning
					if (IsValidDomain(nextDomain))
					{
						return nextDomain; // Return domain without protocol for further processing
					}
				}
				else
				{
					newDomain[i] = Chars[0];
					i--;
				}
			}

			// Cycle through suffixes if needed
			suffixIndex = (suffixIndex + 1) % DomainSuffixes.Count;
			attemptCount++;
		}

		// Fallback if nothing valid was found
		return "fallback.com"; // Replace with a safe default
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
		Console.WriteLine("Successfully crawled: " + domain);
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

	private async Task<List<Metadata>> ScrapeUrlData(string url, int depth = 1)
	{ 
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
			MarkUrlAsFailed(url);
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
		if (depth <= 0)
		{ 
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
				var childMetadata = await ScrapeUrlData(absoluteUrl, depth - 1);
				if (childMetadata != null)
				{
					foreach (var cMetadata in childMetadata)
					{
						if (cMetadata.Url != url)
						{ 
							SaveSearchResult(cMetadata.Url, cMetadata);
						}
					} 
				} else
				{
					MarkUrlAsFailed(absoluteUrl); 
				}
			}
		} 

		return metaList;
	}


	private async Task<List<Metadata>> GetWebsiteMetadata(string domain)
	{
		try
		{
			List<Metadata>? scraped = await ScrapeUrlData(domain);

			if (scraped == null)
			{ 
				await MarkUrlAsFailed(domain);
				return null;
			}

			return scraped;
		}
		catch (Exception ex)
		{ 
			await MarkUrlAsFailed(domain);
			return null;
		}
	}
	private bool IsValidDomain(string domain)
	{
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
	private async Task<string?> FindSitemapUrl(string domain)
	{
		// Standard sitemap locations
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
				return url;  // Return the first found sitemap URL
			}
		}
		return null;  // Return null if no sitemap is found
	}

	private async Task<bool> UrlExists(string url)
	{
		try
		{
			var response = await _httpClient.GetAsync(url);
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

		// Fetch the sitemap XML
		var response = await _httpClient.GetAsync(sitemapUrl);
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

			Console.WriteLine($"Found {sitemapUrls.Count} sitemaps to process.");

			// Process each individual sitemap
			foreach (var sitemap in sitemapUrls)
			{  
				var urls = await GetUrlsFromSitemap(sitemap);
				 
				foreach (var url in urls)
				{  
					// Process each URL (fetch metadata or index it)
					var metadata = await GetWebsiteMetadata(url);
					if (metadata != null)
					{
						foreach (var cMeta in metadata)
						{ 
							if (cMeta.Url != null)
							{
								await SaveSearchResult(cMeta.Url, cMeta); 
							}
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