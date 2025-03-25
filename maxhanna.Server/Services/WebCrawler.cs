using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using MySqlConnector;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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
	public async Task FetchWebsiteMetadata()
	{
		try
		{
			List<string> nextDomains = await GenerateNextUrl();

			foreach (string domain in nextDomains)
			{
				StartScrapingAsync(domain);
			}

			// Once the list is built, scrape URLs from the list 1 by 1
			await ScrapeUrlsSequentially();
		}
		catch (HttpRequestException ex)
		{
		//	Console.WriteLine($"Crawler Network issue while scraping : {ex.Message}");
		}
		catch (Exception ex)
		{
		//	Console.WriteLine("Crawler exception : " + ex.Message);
		}
		
	}

	private async Task<List<string>> GenerateNextUrl()
	{
		try
		{ 
			string? lastDomain = await LoadLastGeneratedDomain(1, true);
			string nextDomain = string.IsNullOrEmpty(lastDomain) ? "a.com" : GetNextDomain(lastDomain);
			nextDomain = nextDomain.ToLower().Replace("http://", "").Replace("https://", "");

			string httpVersion = "http://" + nextDomain;
			string httpsVersion = "https://" + nextDomain;

			return new List<string> { httpsVersion, httpVersion };
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
			return new List<string>();
		}
	}

	private string GetNextDomain(string lastDomain)
	{
		try
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
				suffix = "com"; // Default if no dot found
			}

			// Remove non-alphanumeric characters from namePart
			namePart = Regex.Replace(namePart, "[^a-zA-Z0-9]", "");

			// Validate suffix against known TLDs
			if (!DomainSuffixes.Contains(suffix))
			{
				suffix = "com"; // Default to .com if suffix is not valid
			}

			// Ensure namePart is not empty
			if (string.IsNullOrEmpty(namePart))
			{
				namePart = "example"; // Default name part if missing
			}

			// Trim excessive continuous characters (max 3 in a row)
			namePart = TrimExcessiveRepeats(namePart);

			// Generate next domain name
			return IncrementNamePart(namePart) + "." + suffix;
		}
		catch (Exception ex)
		{
			return "example.com"; // Always return a valid domain
		}
	}


	private string TrimExcessiveRepeats(string namePart)
	{
		try
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
		catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception:" + ex.Message);
			return namePart;
		}
	}

	private string IncrementNamePart(string namePart)
	{
		try
		{
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
		catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
			return namePart;
		} 
	}

	private string IncrementAlphabetically(string baseName)
	{
		try
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
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler Exception: " + ex.Message);
			return baseName;
		}
		
	}
	private async Task<string?> LoadLastGeneratedDomain(int index = 1, bool randomize = false)
	{
		try {
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();

				string query;
				if (randomize)
				{
					query = @"SELECT url FROM search_results 
										WHERE last_crawled < UTC_TIMESTAMP() - INTERVAL 2 DAY
										ORDER BY SHA2(CONCAT(url, RAND()), 256) 
										LIMIT 1;";
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
		catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception: " + ex.Message);
			return string.Empty;
		} 
	}
	private async Task<string?> GetFreshCrawledDomains(string url)
	{
		try
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
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
			return string.Empty; 
		}
		
	}
	private async Task SaveSearchResult(string domain, Metadata metadata)
	{ 
		try
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
					insertCommand.Parameters.AddWithValue("@url", domain.ToLower());
					insertCommand.Parameters.AddWithValue("@title", metadata.Title ?? "");
					insertCommand.Parameters.AddWithValue("@description", metadata.Description);
					insertCommand.Parameters.AddWithValue("@author", metadata.Author);
					insertCommand.Parameters.AddWithValue("@keywords", metadata.Keywords);
					insertCommand.Parameters.AddWithValue("@imageUrl", metadata.ImageUrl);
					await insertCommand.ExecuteNonQueryAsync();
				}
			}
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
		} 
	}
	private async Task MarkUrlAsFailed(string url, int? responseCode = null)
	{
		try
		{
			//Console.WriteLine("Marking as failed: " + $"{url.Substring(0, Math.Min(url.Length, 25)) + (url.Length > 35 ? "..." + url[^10..] : "")}");
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
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception: " + ex.Message);
		}
		
	}
	private string NormalizeUrl(string url)
	{
		try
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
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
			return string.Empty;
		}
		
	}
	private async Task<Metadata?> ScrapeUrlData(string url)
	{
		var metadata = new Metadata();
 
		try
		{
			url = NormalizeUrl(url);
			if (!IsValidDomain(url))
			{
				Console.WriteLine("Invalid URL, skip scrape : " + url);
				return null;
			}

			_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
			_httpClient.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
			_httpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.5");
			_httpClient.DefaultRequestHeaders.Connection.ParseAdd("keep-alive");
			var response = await _httpClient.GetAsync(url);

			// Handle non-successful responses
			if (!response.IsSuccessStatusCode)
			{
				_ = MarkUrlAsFailed(url, (int)response.StatusCode);
				return null;
			}


			var html = await response.Content.ReadAsStringAsync();
			if (html.Length > 5_000_000)
			{
				Console.WriteLine("Crawler Exception: HTML document is too large to parse.");
				return null;
			}
			var htmlDocument = new HtmlDocument
			{
				OptionMaxNestedChildNodes = 100
			};
			if (html.Count(c => c == '<') > 10_000) // Check excessive `<` tags
			{
				Console.WriteLine("Crawler Exception: Potentially malformed or deeply nested HTML.");
				return null;
			}
			htmlDocument.OptionCheckSyntax = true;
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
			metadata.ImageUrl = imageUrl;  

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
					_ = StartScrapingAsync(absoluteUrl);
				}
			}
		}
		catch (HttpRequestException ex)
		{
			//Console.WriteLine($"HttpRequestException while scraping {url}: {ex.Message}");

			// Check for DNS resolution issues and network failures
			if (ex.InnerException is System.Net.Sockets.SocketException socketEx)
			{
			//	Console.WriteLine($"Network issue (DNS resolution or connection failure) while scraping {url}: {socketEx.Message}");
			}
			else
			{
			//	Console.WriteLine($"Inner Exception: {ex.InnerException?.Message}");
			}

			_ = MarkUrlAsFailed(url);
			return null;
		}
		catch (StackOverflowException ex)
		{
			Console.WriteLine("Stack Overflow Error on URL: " + url);
			return null;
		}
		catch (Exception ex)
		{
			//Console.WriteLine("Unexpected exception in crawler during scrape: " + ex.Message);
			_ = MarkUrlAsFailed(url);
			return null;
		}
		 
		return metadata;
	}

	private bool IsValidDomain(string domain)
	{
		try
		{
			if (domain.ToLower().Contains("javascript:"))
			{
				//Console.WriteLine("invalid domain, javascript in the link: " + domain);
				return false;
			}
			if (domain.ToLower().Contains("tel:"))
			{
				//Console.WriteLine("invalid domain, javascript in the link: " + domain);
				return false;
			}
			// Ensure there are no multiple TLDs (e.g., "imprioc.com.com")
			if (Regex.IsMatch(domain, @"\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+$"))
			{
				//Console.WriteLine("invalid domain, multiple TLDs: " + domain);
				return false;
			}

			// Ensure no double dots ".." exist in the domain
			if (domain.Contains(".."))
			{
				//Console.WriteLine("invalid domain, multiple ..: " + domain);
				return false;
			}

			Uri uri;
			if (Uri.TryCreate(domain, UriKind.Absolute, out uri))
			{
				string tdomain = uri.Host; // Extract the domain (e.g., "sedr.com")

				// Ensure the domain only contains valid characters
				if (!Regex.IsMatch(tdomain, @"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"))
				{
					//Console.WriteLine("Invalid domain, domain contains invalid characters: " + tdomain);
					return false;
				}
			}
			else
			{
				//Console.WriteLine("Invalid URL format.");
				return false;
			}
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
			return false;
		}
		

		return true;
	}
	private async Task<string?> FindSitemapUrl(string domain)
	{
		try
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
		} catch (Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
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
		catch (Exception ex)
		{
			return false;  // Return false if there's an error
		}
	}
	  
	private async Task CrawlSitemap(string domain)
	{
		try
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
		} catch(Exception ex)
		{
			//Console.WriteLine("Crawler exception: " + ex.ToString());
		}
		
	}
	public async Task StartScrapingAsync(string initialUrl)
	{
		try
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
		} catch(Exception ex)
		{
			//Console.WriteLine("Crawler exception: " + ex.ToString());
		} 
	}

	private async Task ProcessDelayedUrlsQueueAsync()
	{
		try
		{
			if (isProcessing)
				return;
			isProcessing = true;

			while (delayedUrlsQueue.Count > 0)
			{
				string urlToProcess = delayedUrlsQueue.Dequeue();
				await Task.Delay(5000);

				string? existingUrl = await GetFreshCrawledDomains(urlToProcess);
				if (string.IsNullOrEmpty(existingUrl) && IsValidDomain(urlToProcess))
				{
					//Console.WriteLine($"(Crawler:{urlsToScrapeQueue.Count})Enqueued: " +
					//		$"{urlToProcess.Substring(0, Math.Min(urlToProcess.Length, 25))}" +
					//		$"{(urlToProcess.Length > 35 ? "..." + urlToProcess[^10..] : "")}");
					urlsToScrapeQueue.Add(urlToProcess);
					_ = ScrapeUrlsSequentially();
				}
				else
				{
					//Console.WriteLine($"(Crawler:{urlsToScrapeQueue.Count})Skipping: " +
					//		$"{urlToProcess.Substring(0, Math.Min(urlToProcess.Length, 25))}" +
					//		$"{(urlToProcess.Length > 35 ? "..." + urlToProcess[^10..] : "")}");
				}
			}
			isProcessing = false;
			ClearVisitedUrls();  // Clear visited URLs after all delayed URLs are processed
		}
		catch(Exception ex)
		{
			//Console.WriteLine("Crawler exception : " + ex.Message);
		} 
	}
	private async Task<string> GetSitemapXml(string sitemapUrl)
	{ 
		try
		{
			// Send a GET request to the sitemap URL
			HttpResponseMessage response = await _httpClient.GetAsync(sitemapUrl);

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
				//Console.WriteLine($"DNS resolution failed for {sitemapUrl}: {socketEx.Message}");
			}
			else
			{ 
			//	Console.WriteLine($"Inner Exception: {ex.InnerException?.Message}");
			}

			return string.Empty;
		}
		catch (Exception ex)
		{ 
			//Console.WriteLine("Unexpected exception in crawler : " + ex.Message);
			return string.Empty;
		}
		 
	}


	private async Task ScrapeUrlsSequentially()
	{
		try
		{
			if (scrapeSemaphore.CurrentCount > 0)
			{
			await scrapeSemaphore.WaitAsync();
			
				while (urlsToScrapeQueue.Count > 0)
				{
					string url = GetRandomUrlFromList(urlsToScrapeQueue); 
					if (!string.IsNullOrEmpty(url))
					{
						if (DateTime.Now - _lastRequestTime < _requestInterval)
						{
							await Task.Delay(_requestInterval - (DateTime.Now - _lastRequestTime));
						}

						_lastRequestTime = DateTime.Now;

						Console.WriteLine($"(Crawler:{delayedUrlsQueue.Count()})Scraping: " + $"{url.Substring(0, Math.Min(url.Length, 25)) + (url.Length > 35 ? "..." + url[^10..] : "")}");
						Metadata? metaData = await ScrapeUrlData(url);
						if (metaData != null)
						{
							await SaveSearchResult(url, metaData);
							CrawlSitemap(url);
						}
					} 
				}
			}
		}
		catch (HttpRequestException ex)
		{
		//	Console.WriteLine($"HTTP request failed : {ex.Message}");
			if (ex.InnerException is System.Net.Sockets.SocketException socketEx)
			{
			//	Console.WriteLine($"DNS resolution failed : {socketEx.Message}");
			}
			else
			{
		//		Console.WriteLine($"Inner Exception: {ex.InnerException?.Message}");
			}
		}
		catch (Exception ex)
		{
		//	Console.WriteLine("Exception thrown in crawler : " + ex.Message);
		}
		finally
		{
			scrapeSemaphore.Release();  // Ensure the semaphore is always released, even if an exception occurs
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

			var xmlDoc = new XmlDocument();
			xmlDoc.LoadXml(sitemapIndexXml);

			// Create a namespace manager
			XmlNamespaceManager nsManager = new XmlNamespaceManager(xmlDoc.NameTable);
			nsManager.AddNamespace("s", "http://www.sitemaps.org/schemas/sitemap/0.9"); // Namespace from the sitemap

			// Search for <loc> nodes using XPath with the namespace
			XmlNodeList locNodes = xmlDoc.SelectNodes("//s:sitemap/s:loc", nsManager);

			foreach (XmlNode locNode in locNodes)
			{
				var locUrl = locNode.InnerText.Trim();
				if (!string.IsNullOrWhiteSpace(locUrl))
				{
					sitemapUrls.Add(locUrl);
				}
			}
		}
		catch (Exception ex)
		{
			// Console.WriteLine($"Error extracting URLs from sitemap index: {ex.Message}");
		}

		return sitemapUrls;
	}

	public string GetRandomUrlFromList(List<string> urls)
	{
		try
		{ 
			if (urls.Count > 0)
			{
				Random rng = new Random();
				int randomIndex = rng.Next(0, urls.Count);
				string randomUrl = urls[randomIndex];
				urls.RemoveAt(randomIndex);
				return randomUrl;
			}
		} catch (Exception ex)
		{
		//	Console.WriteLine("Crawler Exception: " + ex.Message);
		}

		return null;
	}
	private string GetUrlHash(string url)
	{
		try
		{ 
			using (var sha256 = SHA256.Create())
			{
				byte[] hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(url));
				return BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
			}
		} catch(Exception ex)
		{
		//	Console.WriteLine("Crawler exception : " + ex.Message);
		}
		return "";
	}
	public void ClearVisitedUrls()
	{
		try
		{

			if (_visitedUrls.Count >= 10000)
			{
				_visitedUrls = new HashSet<string>(_visitedUrls.Take(5000).ToList());
			}
		} catch (Exception ex)
		{
		//	Console.WriteLine("Crawler exception : " + ex.Message);
		}
	}  
}