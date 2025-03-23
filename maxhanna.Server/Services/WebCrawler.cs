using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using MySqlConnector;
using Newtonsoft.Json;
using System;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;

public class WebCrawler
{
	private readonly HttpClient _httpClient = new HttpClient();
	private readonly IConfiguration _config;
	private const string Chars = "abcdefghijklmnopqrstuvwxyz123456789";
	private static readonly List<string> DomainSuffixes = new List<string>
	{
			"com", "io", "net", "ca", "qc.ca", "org", "gov", "edu", "co", "biz", "info", "us", "tv", "me", "co.uk",
			"de", "fr", "es", "jp", "cn", "in", "br", "it", "ru", "au", "pl", "se", "nl", "ch", "at", "no", "fi", "dk",
			"be", "cz", "gr", "hu", "sg", "za", "kr", "mx", "kr", "ua", "sa", "ae", "cl", "ar", "tr", "pt", "ro", "kr",
			"tw", "my", "ph", "vn", "id", "lk", "pk", "ng", "ke", "eg", "gh", "dz", "bd", "do", "hn", "uy", "pe", "cr",
			"jm", "bz", "pa", "gt", "sv", "bo", "py", "ec", "tt", "jm", "ws", "pm", "mu", "tk", "cy", "ba", "hr", "mk",
			"rs", "bg", "md", "lt", "lv", "ee", "is", "me", "mk", "ks", "lb"
	};


	private readonly TimeSpan _requestInterval = TimeSpan.FromSeconds(10); 
	private DateTime _lastRequestTime = DateTime.MinValue;
	private static SemaphoreSlim scrapeSemaphore = new SemaphoreSlim(1, 1); 
	private List<string> urlsToScrapeQueue = new List<string>();
	private HashSet<string> _visitedUrls = new HashSet<string>();
	private Queue<string> delayedUrlsQueue = new Queue<string>();
	private static bool isProcessing = false;

	public WebCrawler(IConfiguration config)
	{
		_config = config;
	}

	public async Task FetchWebsiteMetadata()
	{
		List<string> nextDomains = await GenerateNextUrl();

		foreach (string domain in nextDomains)
		{
			StartScrapingAsync(domain);
		}

		// Once the list is built, scrape URLs from the list 1 by 1
		await ScrapeUrlsSequentially(); 
	}

	private async Task<List<string>> GenerateNextUrl()
	{
		string? lastDomain = await LoadLastGeneratedDomain(1, true);
		string nextDomain = string.IsNullOrEmpty(lastDomain) ? "a.com" : GetNextDomain(lastDomain);
		nextDomain = nextDomain.ToLower().Replace("http://", "").Replace("https://", "");

		string httpVersion = "http://" + nextDomain;
		string httpsVersion = "https://" + nextDomain;

		return new List<string> { httpsVersion, httpVersion };
	}

	private string GetNextDomain(string lastDomain)
	{  
		// Remove protocol (http:// or https://)
		lastDomain = lastDomain.ToLower().Replace("http://", "").Replace("https://", "");

		// Remove everything after the first "/"
		int slashIndex = lastDomain.IndexOf('/');
		if (slashIndex != -1)
		{
			lastDomain = lastDomain.Substring(0, slashIndex);
		}

		// Extract name and suffix
		string namePart;
		string suffix;

		if (lastDomain.Contains('.'))
		{
			namePart = lastDomain.Substring(0, lastDomain.IndexOf('.'));
			suffix = lastDomain.Substring(lastDomain.LastIndexOf('.') + 1);
		}
		else
		{
			namePart = lastDomain;
			suffix = "com";
		}

		int suffixIndex = DomainSuffixes.IndexOf(suffix);
		if (suffixIndex == -1) suffixIndex = 0;

		// Trim excessive continuous characters (max 3 in a row)
		namePart = TrimExcessiveRepeats(namePart);

		// Generate next domain name
		return IncrementNamePart(namePart) + "." + suffix;
	}

	private string TrimExcessiveRepeats(string namePart)
	{
		// Loop through the name and remove excessive repeats
		StringBuilder result = new StringBuilder();
		char lastChar = '\0';
		int repeatCount = 0;

		foreach (char c in namePart)
		{
			if (c == lastChar)
			{
				repeatCount++;
				if (repeatCount >= 3)
				{
					continue;  // Skip if repeating character exceeds limit
				}
			}
			else
			{
				repeatCount = 1;  // Reset repeat count for different character
			}

			result.Append(c);
			lastChar = c;
		}

		return result.ToString();
	}

	private string IncrementNamePart(string namePart)
	{
		// Check if the name part ends with a number
		string baseName = namePart;
		string numericSuffix = "";

		// Find numeric suffix (if any)
		var match = Regex.Match(namePart, @"(\d+)$");
		if (match.Success)
		{
			baseName = namePart.Substring(0, namePart.Length - match.Value.Length);
			numericSuffix = match.Value;
		}

		// If there is a numeric suffix, increment it
		if (!string.IsNullOrEmpty(numericSuffix))
		{
			int number = int.Parse(numericSuffix);
			number++;  // Increment the number
			return baseName + number.ToString();
		}
		else
		{
			// No numeric suffix, just increment alphabetically
			return IncrementAlphabetically(baseName);
		}
	}

	private string IncrementAlphabetically(string baseName)
	{
		StringBuilder newName = new StringBuilder(baseName);
		int i = newName.Length - 1;

		while (i >= 0)
		{
			int index = Chars.IndexOf(newName[i]);

			if (index < Chars.Length - 1)
			{
				newName[i] = Chars[index + 1];  // Increment character
				return newName.ToString();
			}
			else
			{
				newName[i] = Chars[0];  // Reset character
				i--;
			}
		}

		// If all characters wrapped, add a new letter
		newName.Append(Chars[0]);
		return newName.ToString();
	}
	private async Task<string?> LoadLastGeneratedDomain(int index = 1, bool randomize = false)
	{
		string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
		using (var connection = new MySqlConnection(connectionString))
		{
			await connection.OpenAsync();

			string query;
			if (randomize)
			{
				query = "SELECT url FROM search_results WHERE last_crawled < UTC_TIMESTAMP() - INTERVAL 2 DAY ORDER BY RAND() LIMIT 1;";
			}
			else
			{
				query = "SELECT url FROM search_results ORDER BY id DESC LIMIT 1 OFFSET @Index;";
			}

			using (var command = new MySqlCommand(query, connection))
			{
				if (!randomize)
				{
					command.Parameters.AddWithValue("@Index", index - 1);
				}

				var result = await command.ExecuteScalarAsync();
				return result?.ToString();
			}
		}
	}
	private async Task<string?> GetFreshCrawledDomains(string url)
	{
		string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
		using (var connection = new MySqlConnection(connectionString))
		{
			await connection.OpenAsync();
			var urlHash = GetUrlHash(url);
			string query = @"
            SELECT url 
            FROM search_results 
            WHERE url_hash = @UrlHash 
            AND last_crawled >= UTC_TIMESTAMP() - INTERVAL 5 DAY 
            LIMIT 1;";

			using (var command = new MySqlCommand(query, connection))
			{
				command.Parameters.AddWithValue("@UrlHash", urlHash);

				var result = await command.ExecuteScalarAsync();
				return result?.ToString();
			}
		}
	}
	private async Task SaveSearchResult(string domain, Metadata metadata)
	{ 
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
	private async Task MarkUrlAsFailed(string url, int? responseCode = null)
	{
		Console.WriteLine("Marking as failed: " + url); 
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
	private string NormalizeUrl(string url)
	{
		Uri uri;
		// Attempt to create a Uri object to parse the URL
		if (Uri.TryCreate(url, UriKind.Absolute, out uri))
		{
			// Fix common issues like "ww." being in place of "www."
			string fixedUrl = uri.Host.StartsWith("ww.") ? uri.ToString().Replace("ww.", "www.") : uri.ToString();

			// Ensure the URL has a valid scheme (e.g., "http" or "https")
			if (!fixedUrl.StartsWith("http://") && !fixedUrl.StartsWith("https://"))
			{
				fixedUrl = "http://" + fixedUrl;
			}

			return fixedUrl;
		}
		else
		{
			// If the URL is malformed, return an empty string or the original URL
			return string.Empty;
		}
	}
	private async Task<Metadata?> ScrapeUrlData(string url)
	{
		var metadata = new Metadata(); 
		url = NormalizeUrl(url);
		if (!IsValidDomain(url)) 
		{
			Console.WriteLine("Invalid URL, skip scrape : " + url);
			return null;
		}
		try
		{
			var httpClient = new HttpClient(new HttpClientHandler
			{
				ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
				AllowAutoRedirect = true
			});
			httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
			httpClient.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
			httpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.5");
			httpClient.DefaultRequestHeaders.Connection.ParseAdd("keep-alive");
			var response = await httpClient.GetAsync(url);

			// Handle non-successful responses
			if (!response.IsSuccessStatusCode)
			{
				MarkUrlAsFailed(url, (int)response.StatusCode);
				return null;
			}


			var html = await response.Content.ReadAsStringAsync();
			var htmlDocument = new HtmlDocument();
			htmlDocument.LoadHtml(html);


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
					var absoluteUrl = new Uri(new Uri(url), href).ToString();
					StartScrapingAsync(absoluteUrl); 
				}
			}
		}
		catch (Exception ex)
		{
			MarkUrlAsFailed(url);
			return null;
		}

		return metadata;
	}

	private bool IsValidDomain(string domain)
	{
		if (domain.ToLower().Contains("javascript:"))
		{
			Console.WriteLine("invalid domain, javascript in the link: " + domain);
			return false;
		}
		if (domain.ToLower().Contains("tel:"))
		{
			Console.WriteLine("invalid domain, javascript in the link: " + domain);
			return false;
		}
		// Ensure there are no multiple TLDs (e.g., "imprioc.com.com")
		if (Regex.IsMatch(domain, @"\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$"))
		{
			Console.WriteLine("invalid domain, multiple TLDs: " + domain);
			return false;
		}

		// Ensure no double dots ".." exist in the domain
		if (domain.Contains(".."))
		{
			Console.WriteLine("invalid domain, multiple ..: " + domain); 
			return false;
		}

		Uri uri;
		if (Uri.TryCreate(domain, UriKind.Absolute, out uri))
		{
			string tdomain = uri.Host; // Extract the domain (e.g., "sedr.com")

			// Ensure the domain only contains valid characters
			if (!Regex.IsMatch(tdomain, @"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"))
			{
				Console.WriteLine("Invalid domain, domain contains invalid characters: " + tdomain);
				return false;
			} 
		}
		else
		{
			Console.WriteLine("Invalid URL format.");
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
	  
	private async Task CrawlSitemap(string domain)
	{
		string? sitemapUrl = await FindSitemapUrl(domain);
		string sitemapIndexXml = await GetSitemapXml(sitemapUrl);
		// Extract individual sitemap URLs from the sitemap index
		var sitemapUrls = ExtractSitemapUrlsFromSitemap(sitemapIndexXml);
		if (sitemapUrls != null)
		{
			foreach (var url in sitemapUrls)
			{
				StartScrapingAsync(url);
			}
		}
	}
	public async Task StartScrapingAsync(string initialUrl)
	{
		if (_visitedUrls.Add(initialUrl) && !urlsToScrapeQueue.Contains(initialUrl) && urlsToScrapeQueue.Count < 10000)
		{
			if (delayedUrlsQueue.Count < 50000)
			{
				delayedUrlsQueue.Enqueue(initialUrl);
				if (delayedUrlsQueue.Count == 1)
				{
					await ProcessDelayedUrlsQueueAsync();
				}
			}
		} 
	}

	private async Task ProcessDelayedUrlsQueueAsync()
	{
		if (isProcessing)
			return;
		isProcessing = true;

		while (delayedUrlsQueue.Count > 0)
		{
			string urlToProcess = delayedUrlsQueue.Dequeue(); 
			await Task.Delay(5000);

			string? existingUrl = await GetFreshCrawledDomains(urlToProcess);
			if (string.IsNullOrEmpty(existingUrl))
			{
				Console.WriteLine($"(Crawler:{urlsToScrapeQueue.Count})Enqueued: " +
						$"{urlToProcess.Substring(0, Math.Min(urlToProcess.Length, 25))}" +
						$"{(urlToProcess.Length > 35 ? "..." + urlToProcess[^10..] : "")}");
				urlsToScrapeQueue.Add(urlToProcess);
				_ = ScrapeUrlsSequentially();
			}
			else
			{
				Console.WriteLine($"(Crawler:{urlsToScrapeQueue.Count})Skipping: " +
						$"{urlToProcess.Substring(0, Math.Min(urlToProcess.Length, 25))}" +
						$"{(urlToProcess.Length > 35 ? "..." + urlToProcess[^10..] : "")}");
			}
		}
		isProcessing = false;
		ClearVisitedUrls();  // Clear visited URLs after all delayed URLs are processed
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


	private async Task ScrapeUrlsSequentially()
	{
		if (scrapeSemaphore.CurrentCount > 0)
		{
			await scrapeSemaphore.WaitAsync();
			try
			{
				while (urlsToScrapeQueue.Count > 0)
				{
					string url = GetRandomUrlFromList(urlsToScrapeQueue); 
					if (DateTime.Now - _lastRequestTime < _requestInterval)
					{
						await Task.Delay(_requestInterval - (DateTime.Now - _lastRequestTime));
					}

					_lastRequestTime = DateTime.Now;

					Console.WriteLine($"(Crawler:{urlsToScrapeQueue.Count()})Scraping: " + url);
					Metadata? metaData = await ScrapeUrlData(url);
					if (metaData != null)
					{
						await SaveSearchResult(url, metaData);
						CrawlSitemap(url);
					}
				}
			}
			finally
			{
				scrapeSemaphore.Release();  // Ensure the semaphore is always released, even if an exception occurs
			}
		}
	}

	private List<string> ExtractSitemapUrlsFromSitemap(string sitemapIndexXml)
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
	private string GetUrlHash(string url)
	{
		using (var sha256 = SHA256.Create())
		{
			byte[] hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(url));
			return BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
		}
	}
	public void ClearVisitedUrls()
	{
		if (_visitedUrls.Count >= 10000)
		{ 
			_visitedUrls = new HashSet<string>(_visitedUrls.Take(5000).ToList()); 
		}
	}
}