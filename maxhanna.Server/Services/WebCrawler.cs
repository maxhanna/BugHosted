using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using MySqlConnector;
using System;
using System.Data;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions; 
using System.Xml;

public class WebCrawler
{
	private readonly HttpClient _httpClient;
	private readonly IConfiguration _config;
	private const string Chars = "abcdefghijklmnopqrstuvwxyz123456789";
	public static readonly List<string> DomainSuffixes = new List<string>
	{
		// Original Generic TLDs
		"com", "net", "org", "gov", "edu", "mil", "int", 
		
		// Common Generic TLDs
		"biz", "info", "name", "pro", "aero", "coop", "museum", 
		
		// New Generic TLDs (2012+)
		"xyz", "online", "site", "tech", "store", "shop", "blog", "app", "dev", "io",
		"ai", "game", "games", "play", "fun", "cloud", "host", "space", "website",
		"digital", "network", "systems", "media", "social", "club", "life", "world",
		"group", "ltd", "inc", "corp", "llc", "company", "academy", "school",
		"university", "college", "education", "careers", "jobs", "recruitment",
		"health", "medical", "doctor", "hospital", "pharmacy", "fit", "fitness",
		"guru", "expert", "services", "solutions", "support", "center", "guide",
		"directory", "tools", "equipment", "gallery", "photos", "camera", "film",
		"music", "audio", "radio", "tv", "video", "studio", "art", "design",
		"fashion", "style", "beauty", "hair", "skin", "luxury", "jewelry",
		"watch", "cars", "auto", "motorcycles", "boats", "yachts", "aviation",
		"travel", "tours", "vacations", "cruises", "flights", "hotels", "villas",
		"restaurant", "cafe", "bar", "pub", "food", "pizza", "burger", "sushi",
		"coffee", "tea", "wine", "beer", "spirits", "vodka", "whiskey", "cooking",
		"kitchen", "recipes", "farm", "organic", "green", "eco", "solar", "energy",
		"construction", "contractors", "engineering", "architect", "build", "house",
		"estate", "properties", "rentals", "apartments", "villas", "condos",
		"finance", "money", "bank", "capital", "invest", "trading", "forex",
		"crypto", "bitcoin", "ethereum", "blockchain", "exchange", "wallet",
		"insurance", "loans", "credit", "mortgage", "financial", "accountants",
		"legal", "law", "attorney", "lawyer", "justice", "court", "security",
		"protection", "safety", "emergency", "fire", "police", "army", "navy",
		"airforce", "marines", "veterans", "charity", "foundation", "ngo",
		"community", "church", "faith", "bible", "catholic", "christian", "islam",
		"muslim", "jewish", "buddhist", "hindu", "spiritual", "yoga", "meditation",
		"reiki", "healing", "therapy", "counseling", "psychology", "rehab",
		"retirement", "senior", "kids", "toys", "baby", "children", "family",
		"mom", "dad", "parents", "dating", "love", "wedding", "bridal", "events",
		"party", "gifts", "flowers", "cards", "stationery", "books", "library",
		"news", "press", "magazine", "journal", "blog", "forum", "chat", "social",
		"dating", "friends", "meet", "connect", "dating", "personals", "singles",
		"pets", "dog", "cat", "vet", "animal", "horse", "fish", "bird", "reptile",
		"bike", "bicycle", "running", "soccer", "football", "basketball", "golf",
		"tennis", "hockey", "rugby", "cricket", "baseball", "softball", "volleyball",
		"swim", "surf", "ski", "snow", "skate", "board", "fishing", "hunting",
		"camping", "hike", "climb", "adventure", "outdoors", "parks", "garden",
		"land", "property", "realestate", "realtor", "rent", "lease", "forsale",
		"auction", "deals", "discount", "coupons", "vouchers", "free", "cheap",
		"best", "top", "premium", "deluxe", "exclusive", "elite", "prime", "gold",
		"silver", "platinum", "diamond", "vip", "royal", "imperial", "luxury",
		"furniture", "decor", "lighting", "appliances", "electronics", "computer",
		"laptop", "phone", "mobile", "tablet", "watch", "wearables", "gadgets",
		"software", "hardware", "data", "server", "hosting", "domain", "website",
		"email", "mail", "chat", "messenger", "call", "voip", "sms", "text",
		"fax", "print", "copy", "scan", "office", "business", "enterprise",
		"global", "international", "worldwide", "europe", "asia", "africa",
		"america", "australia", "antarctica", "arctic", "atlantic", "pacific",
		"indian", "earth", "planet", "space", "universe", "galaxy", "star",
		"sun", "moon", "mars", "venus", "jupiter", "saturn", "neptune", "pluto",
		"comet", "asteroid", "meteor", "alien", "ufo", "science", "physics",
		"chemistry", "biology", "math", "history", "geography", "philosophy",
		"psychology", "sociology", "anthropology", "archeology", "paleontology",
		"geology", "meteorology", "oceanography", "astronomy", "astrology",
		"technology", "engineering", "architecture", "design", "art", "music",
		"literature", "poetry", "theater", "dance", "opera", "ballet", "cinema",
		"film", "tv", "radio", "podcast", "youtube", "vimeo", "twitch", "tiktok",
		"instagram", "facebook", "twitter", "linkedin", "pinterest", "reddit",
		"discord", "slack", "telegram", "signal", "whatsapp", "wechat", "line",
		"kakao", "viber", "skype", "zoom", "meet", "hangouts", "duo", "teams",
		"office", "google", "amazon", "apple", "microsoft", "ibm", "oracle",
		"intel", "amd", "nvidia", "cisco", "dell", "hp", "lenovo", "asus",
		"acer", "samsung", "lg", "sony", "panasonic", "toshiba", "sharp", "fujitsu",
		"hitachi", "siemens", "bosch", "philips", "ge", "whirlpool", "electrolux",
		"ikea", "nike", "adidas", "puma", "reebok", "underarmour", "newbalance",
		"converse", "vans", "gucci", "prada", "versace", "armani", "dior", "chanel",
		"louisvuitton", "hermes", "burberry", "ralphlauren", "calvinklein", "tommyhilfiger",
		"hugo", "boss", "diesel", "levis", "wrangler", "lee", "guess", "dkny",
		"gap", "oldnavy", "bananarepublic", "zara", "hm", "uniqlo", "forever21",
		"victoriassecret", "sephora", "macys", "nordstrom", "bloomingdales", "neimanmarcus",
		"saks", "barneys", "bergdorfgoodman", "dillards", "kohls", "jcpenney", "target",
		"walmart", "costco", "samclub", "bestbuy", "homedepot", "lowes", "menards",
		"acehardware", "truevalue", "napa", "autozone", "pepboys", "advanceautoparts",
		"oreilly", "carquest", "batteriesplus", "firestone", "goodyear", "bridgestone",
		"michelin", "pirelli", "continental", "dunlop", "yokohama", "toyota", "honda",
		"nissan", "mazda", "subaru", "mitsubishi", "suzuki", "isuzu", "daihatsu",
		"lexus", "infiniti", "acura", "bmw", "mercedes", "audi", "volkswagen", "porsche",
		"opel", "renault", "peugeot", "citroen", "fiat", "alfa", "ferrari", "lamborghini",
		"maserati", "bugatti", "rollsroyce", "bentley", "astonmartin", "jaguar", "landrover",
		"volvo", "saab", "scania", "man", "iveco", "daf", "kenworth", "peterbilt",
		"mack", "freightliner", "westernstar", "international", "ford", "chevrolet", "gmc",
		"cadillac", "buick", "lincoln", "chrysler", "dodge", "jeep", "ram", "tesla",
		"rivian", "lucid", "fisker", "nikola", "workhorse", "lordstown", "canoo",
		"arrival", "bollinger", "faradayfuture", "karma", "sfmotors", "byton", "nio",
		"xpev", "li", "xpeng", "higer", "yutong", "zhongtong", "kinglong", "anhui",
		"shacman", "foton", "jac", "haval", "greatwall", "chery", "geely", "byd",
		"changan", "dongfeng", "saic", "gac", "baic", "brilliance", "jac", "jmc",
		"zotye", "lifan", "haima", "qoros", "lynk", "polestar", "volvo", "scania",
		"man", "iveco", "daf", "kenworth", "peterbilt", "mack", "freightliner",
		"westernstar", "international", "ford", "chevrolet", "gmc", "cadillac",
		"buick", "lincoln", "chrysler", "dodge", "jeep", "ram", "tesla", "rivian",
		"lucid", "fisker", "nikola", "workhorse", "lordstown", "canoo", "arrival",
		"bollinger", "faradayfuture", "karma", "sfmotors", "byton", "nio", "xpev",
		"li", "xpeng", "higer", "yutong", "zhongtong", "kinglong", "anhui", "shacman",
		"foton", "jac", "haval", "greatwall", "chery", "geely", "byd", "changan",
		"dongfeng", "saic", "gac", "baic", "brilliance", "jac", "jmc", "zotye",
		"lifan", "haima", "qoros", "lynk", "polestar",

		// Country Code TLDs (ccTLDs)
		"ac", "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at", "au", "aw", "ax", "az",
		"ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bm", "bn", "bo", "bq", "br", "bs", "bt", "bv", "bw", "by", "bz",
		"ca", "cc", "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm", "cn", "co", "cr", "cu", "cv", "cw", "cx", "cy", "cz",
		"de", "dj", "dk", "dm", "do", "dz",
		"ec", "ee", "eg", "eh", "er", "es", "et", "eu",
		"fi", "fj", "fk", "fm", "fo", "fr",
		"ga", "gb", "gd", "ge", "gf", "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy",
		"hk", "hm", "hn", "hr", "ht", "hu",
		"id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it",
		"je", "jm", "jo", "jp",
		"ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz",
		"la", "lb", "lc", "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly",
		"ma", "mc", "md", "me", "mg", "mh", "mk", "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my", "mz",
		"na", "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz",
		"om",
		"pa", "pe", "pf", "pg", "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py",
		"qa",
		"re", "ro", "rs", "ru", "rw",
		"sa", "sb", "sc", "sd", "se", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so", "sr", "ss", "st", "su", "sv", "sx", "sy", "sz",
		"tc", "td", "tf", "tg", "th", "tj", "tk", "tl", "tm", "tn", "to", "tr", "tt", "tv", "tw", "tz",
		"ua", "ug", "uk", "us", "uy", "uz",
		"va", "vc", "ve", "vg", "vi", "vn", "vu",
		"wf", "ws",
		"ye", "yt",
		"za", "zm", "zw"
	};


	private readonly TimeSpan _requestInterval = TimeSpan.FromSeconds(20);
	private DateTime _lastRequestTime = DateTime.MinValue;
	private static SemaphoreSlim scrapeSemaphore = new SemaphoreSlim(1, 1);
	private readonly SemaphoreSlim _asyncScrapeSemaphore = new SemaphoreSlim(1, 1); // Semaphore to limit to one execution at a time per URL
	private static readonly Random _random = new Random();
	private List<string> urlsToScrapeQueue = new List<string>();
	private HashSet<string> _visitedUrls = new HashSet<string>();
	private Queue<string> delayedUrlsQueue = new Queue<string>();
	private static bool isProcessing = false;
	private static bool isBackgroundScrapeRunning = false;
	private const int _maxRecursionLimit = 10;
	private const int _maxSiteExceedance = 150;
	private readonly Log _log;

	public WebCrawler(IConfiguration config, Log log)
	{
		_config = config;
		_log = log;
		_httpClient = new HttpClient(new HttpClientHandler
		{
			ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
			AllowAutoRedirect = true, 
		});
		_httpClient.Timeout = TimeSpan.FromSeconds(5);
		_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
		_httpClient.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
		_httpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.5");
		_httpClient.DefaultRequestHeaders.Connection.ParseAdd("keep-alive");
	}

	public async Task StartBackgroundScrape()
	{
		// Ensure only one scrape operation runs at a time 
		if (isBackgroundScrapeRunning)
		{
			_ = _log.Db("Scrape operation already in progress", null, "CRAWLER", outputToConsole: true);
			return;
		}
		isBackgroundScrapeRunning = true;
		try
		{
			List<string> nextDomains = new List<string>();
			if (_random.Next(1, 2) == 1)
			{
				nextDomains.AddRange(await GenerateRandomUrls());
				nextDomains.AddRange(await GenerateRandomUrls());
			}
			else {
				nextDomains = await GenerateNextUrl();
			}

			foreach (string domain in nextDomains)
			{
				try
				{
					var tmpDomain = NormalizeUrl(domain);
					//Console.WriteLine("Background scraping : " + tmpDomain);
					await StartScrapingAsync(tmpDomain);
					await Task.Delay(TimeSpan.FromSeconds(10)); // Delay between domains
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error scraping {domain}: {ex.Message}", null, "CRAWLER", true);
					// Continue with next domain even if one fails
				}
			}

			await ScrapeUrlsSequentially();
		}
		catch (HttpRequestException ex)
		{
			_ = _log.Db($"Crawler Network issue while scraping: {ex.Message}", null, "CRAWLER", true);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Exception (StartBackgroundScrape): {ex.Message}", null, "CRAWLER", true);
		}
		finally
		{
			isBackgroundScrapeRunning = false;
		}
	}

	private async Task<List<string>> GenerateRandomUrls()
	{
		List<string> nextDomains = new List<string>();
		string? genWord = await GenerateRandomWord();
		string? genWord2 = null;
		if (_random.Next(1, 3) == 2)
		{
			genWord2 = await GenerateRandomWord();
		}
		int index = _random.Next(DomainSuffixes.Count);
		string genSuffix = "";
		if (_random.Next(1, 3) == 2)
		{
			genSuffix = DomainSuffixes[index];
		} else
		{
			genSuffix = "com";
		}
		if (!string.IsNullOrEmpty(genWord) || !string.IsNullOrEmpty(genWord2))
		{
			nextDomains.Add($"http://{genWord}{genWord2}.{genSuffix}");
			nextDomains.Add($"https://{genWord}{genWord2}.{genSuffix}");
		} 
		return nextDomains;
	}

	private async Task<string?> GenerateRandomWord()
	{
		string sql = @"
			SELECT word FROM wordler_words
			ORDER BY rand()
			LIMIT 1;";
		try
		{
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();
				using (var command = new MySqlCommand(sql, connection))
				{ 

					var result = await command.ExecuteScalarAsync();
					return result?.ToString();
				} 
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (GenerateRandomWord): " + ex.Message, null, "CRAWLER", true);
			return string.Empty;
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
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (GenerateNextUrl): " + ex.Message, null, "CRAWLER", true);
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
		catch (Exception)
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
			_ = _log.Db("Exception (TrimExcessiveRepeats) :" + ex.Message, null, "CRAWLER", true);
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
			_ = _log.Db("Exception (IncrementNamePart): " + ex.Message, null, "CRAWLER", true);
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
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (IncrementAlphabetically): " + ex.Message, null, "CRAWLER", true);
			return baseName;
		}

	}
	private async Task<string?> LoadLastGeneratedDomain(int index = 1, bool randomize = false)
	{
		try
		{
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();

				string query;
				if (randomize)
				{
					query = @"
						SELECT url
						FROM (
								SELECT sr.url, dc.domain_count
								FROM search_results sr
								JOIN (
										SELECT 
												SUBSTRING_INDEX(url, '/', 3) AS domain,
												COUNT(*) AS domain_count
										FROM search_results
										GROUP BY domain
								) dc ON SUBSTRING_INDEX(sr.url, '/', 3) = dc.domain
								WHERE sr.last_crawled < UTC_TIMESTAMP() - INTERVAL 2 DAY
									AND sr.url LIKE 'http%'         
									AND sr.url LIKE '%.%'          
								ORDER BY (SHA2(CONCAT(sr.url, RAND()), 256) + dc.domain_count * 100000)
								LIMIT 1000 OFFSET 100
						) AS sliced
						ORDER BY RAND()
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
			_ = _log.Db("Exception (LoadLastGeneratedDomain): " + ex.Message, null, "CRAWLER", true);
			return string.Empty;
		}
	}
	public async Task<string?> GetFreshCrawledDomains(string url)
	{
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
				//_ = _log.Db($"Crwler: checking if {url} was crawled: " + urlHash, null, "CRAWLER", true);
				var result = await command.ExecuteScalarAsync();

				if (result == null || result == DBNull.Value)
					return null;

				return result.ToString();
			}
		}
	}
	public async Task SaveSearchResult(string domain, Metadata metadata)
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
                last_crawled = UTC_TIMESTAMP(), 
								failed = FALSE,
								response_code = NULL;";
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
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (SaveSearchResult) : " + ex.Message, null, "CRAWLER", true);
		}
	}
	public async Task<Metadata?> MarkUrlAsFailed(string url, int? responseCode = null)
	{
		try
		{
			//_ = _log.Db("Marking as failed: " + $"{url.Substring(0, Math.Min(url.Length, 25)) + (url.Length > 35 ? "..." + url[^10..] : "")}", null, "CRAWLER", true);
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			using (var connection = new MySqlConnection(connectionString))
			{
				await connection.OpenAsync();

				// First, check if the URL exists with data and not failed
				string checkQuery = @"
                SELECT url, title, description, author, keywords, image_url, response_code
                FROM search_results 
                WHERE url = @url 
                AND failed = 0 
                AND (
                    title IS NOT NULL OR 
                    description IS NOT NULL OR 
                    keywords IS NOT NULL OR 
                    image_url IS NOT NULL OR 
                    author IS NOT NULL
                )";

				using (var checkCommand = new MySqlCommand(checkQuery, connection))
				{
					checkCommand.Parameters.AddWithValue("@url", url.ToLower());

					using (var reader = await checkCommand.ExecuteReaderAsync())
					{
						if (reader.HasRows)
						{
							await reader.ReadAsync();
							return new Metadata
							{
								Url = reader.GetString("url"),
								Title = reader.IsDBNull("title") ? null : reader.GetString("title"),
								Description = reader.IsDBNull("description") ? null : reader.GetString("description"),
								Author = reader.IsDBNull("author") ? null : reader.GetString("author"),
								Keywords = reader.IsDBNull("keywords") ? null : reader.GetString("keywords"),
								ImageUrl = reader.IsDBNull("image_url") ? null : reader.GetString("image_url"),
								HttpStatus = reader.IsDBNull("response_code") ? null : reader.GetInt32("response_code")
							};
						}
					}
				}

				// If we got here, either the URL doesn't exist or it's failed/has no data
				string failureQuery = @"
                INSERT INTO search_results (url, failed, response_code, found_date, last_crawled)
                VALUES (@url, TRUE, @responseCode, UTC_TIMESTAMP(), UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE 
                    failed = IF(
                        title IS NOT NULL OR 
                        description IS NOT NULL OR 
                        keywords IS NOT NULL OR 
                        image_url IS NOT NULL OR 
                        author IS NOT NULL,
                        failed,  // Keep existing value if any content exists
                        IF(failed = TRUE, TRUE, VALUES(failed))  // Original logic
                    ), 
                    response_code = IF(
                        title IS NOT NULL OR 
                        description IS NOT NULL OR 
                        keywords IS NOT NULL OR 
                        image_url IS NOT NULL OR 
                        author IS NOT NULL,
                        response_code,  // Keep existing value if any content exists
                        IF(failed = TRUE, @responseCode, response_code)  // Original logic
                    ),
                    last_crawled = UTC_TIMESTAMP()";

				using (var command = new MySqlCommand(failureQuery, connection))
				{
					command.Parameters.AddWithValue("@url", url.ToLower());
					command.Parameters.AddWithValue("@responseCode", (object?)responseCode ?? DBNull.Value);
					await command.ExecuteNonQueryAsync();
				}

				return null;
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Exception (MarkUrlAsFailed) URL: {ShortenUrl(url)}. : " + ex.Message, null, "CRAWLER", false);
			return null;
		}
	}
	private string NormalizeUrl(string? url, string? baseDomain = null)
	{
		if (url == null) return string.Empty;
		try
		{
			// If already an absolute URL
			if (Uri.TryCreate(url, UriKind.Absolute, out Uri? absoluteUri))
			{
				string fixedHost = absoluteUri.Host.StartsWith("ww.") ? absoluteUri.Host.Replace("ww.", "www.") : absoluteUri.Host;

				// Rebuild the full URL with fixed host
				string fixedUrl = absoluteUri.Scheme + "://" + fixedHost + absoluteUri.PathAndQuery;

				// Ensure scheme
				if (!fixedUrl.StartsWith("http://") && !fixedUrl.StartsWith("https://"))
				{
					fixedUrl = "http://" + fixedUrl;
				}

				return fixedUrl;
			}
			// If it's a relative URL and we have a base domain to work with
			else if (!string.IsNullOrEmpty(baseDomain))
			{
				if (!baseDomain.StartsWith("http"))
				{
					baseDomain = "https://" + baseDomain;
				}

				Uri baseUri = new Uri(baseDomain);
				Uri fullUri = new Uri(baseUri, url);

				return fullUri.ToString();
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (NormalizeUrl): " + ex.Message, null, "CRAWLER", true);
		}

		return string.Empty;
	}

	public async Task<Metadata?> ScrapeUrlData(string url)
	{
		var metadata = new Metadata();

		try
		{
			url = NormalizeUrl(url);
			if (!IsValidDomain(url))
			{
				//_ = _log.Db("(ScrapeUrlData) Invalid URL, skip scrape : " + url, null, "CRAWLER", true);
				return null;
			} 
			_httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
			_httpClient.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
			_httpClient.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.5");
			_httpClient.DefaultRequestHeaders.Connection.ParseAdd("keep-alive");
			if (_httpClient == null)
			{
				_ = _log.Db("HttpClient is null.", null, "CRAWLER", true);
				return null;
			}
			var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
			response.EnsureSuccessStatusCode();  
			if (!response.IsSuccessStatusCode)
			{ 
				//_ = _log.Db($"ScrapeUrlData: Invalid response code {response.StatusCode} for URL: {ShortenUrl(url)}", null, "CRAWLER", true);
				return await MarkUrlAsFailed(url, (int)response.StatusCode); 
			}

			const int maxHtmlLength = 400_000;
			string html = await ReadHtmlWithLimit(response);
			html = html.Length > maxHtmlLength ? html.Substring(0, maxHtmlLength) : html;
			int maxTagCount = 10_000;
			int tagCount = html.Count(c => c == '<');
			if (tagCount > maxTagCount)
			{  
				html = html.Substring(0, html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase) + 7);
			}

			var htmlDocument = new HtmlDocument
			{
				OptionMaxNestedChildNodes = 100
			};
			htmlDocument.OptionCheckSyntax = true;
			htmlDocument.LoadHtml(html);
			ExtractMetadataFromHtmlDocument(url, metadata, htmlDocument);

			var linkNodes = htmlDocument.DocumentNode.SelectNodes("//a[@href]");
			int maxLinkNodeCount = _maxRecursionLimit;
			if (linkNodes != null)
			{
				foreach (var linkNode in linkNodes)
				{
					if (maxLinkNodeCount <= 0) { break; }
					maxLinkNodeCount--;
					var href = linkNode.GetAttributeValue("href", "").Trim();
					if (!IsValidDomain(href))
					{
						continue;
					}
					var normalizedUrl = NormalizeUrl(href, url);
					if (!string.IsNullOrEmpty(normalizedUrl))
					{
						_ = StartScrapingAsync(normalizedUrl);
					}
				}
			}
		}
		catch (TaskCanceledException)
		{
			metadata.HttpStatus = 408;
			//_ = _log.Db($"ScrapeUrlData Timeout on URL {ShortenUrl(url)}", null, "CRAWLER", true);
			if (IsMetadataCompletelyEmpty(metadata))
			{
				return await MarkUrlAsFailed(url); 
			}
			else
			{
				return metadata;
			} 
		}
		catch (HttpRequestException ex)
		{
			_ = _log.Db($"ScrapeUrlData HttpRequestException on URL {ShortenUrl(url)}:" + ex.Message, null, "CRAWLER", false);
			if (IsMetadataCompletelyEmpty(metadata))
			{
				return await MarkUrlAsFailed(url); 
			}
			else
			{
				return metadata;
			}
		}
		catch (StackOverflowException)
		{
			metadata.HttpStatus = 500;
			//_ = _log.Db("ScrapeUrlData Stack Overflow Error on URL: " + ShortenUrl(url), null, "CRAWLER", true);
			Metadata? tmpData = await MarkUrlAsFailed(url, 500); 
			return tmpData ?? metadata;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"ScrapeUrlData Exception on URL {ShortenUrl(url)} : " + ex.Message, null, "CRAWLER", false);
			return await MarkUrlAsFailed(url); 
		}

		if (IsMetadataCompletelyEmpty(metadata))
		{
			if (!string.IsNullOrEmpty(metadata.Url?.Trim())) { 
				return await MarkUrlAsFailed(url);
			}
			//_ = _log.Db($"ScrapeUrlData IsMetadataCompletelyEmpty on URL {ShortenUrl(url)}", null, "CRAWLER", true);

			return null;
		} else
		{
			return metadata; 
		}

	}
	public bool IsMetadataCompletelyEmpty(Metadata metadata)
	{
		return string.IsNullOrEmpty(metadata.Title?.Trim()) &&
					 string.IsNullOrEmpty(metadata.Description?.Trim()) &&
					 string.IsNullOrEmpty(metadata.Keywords?.Trim()) &&
					 string.IsNullOrEmpty(metadata.Author?.Trim()) &&
					 string.IsNullOrEmpty(metadata.ImageUrl?.Trim());
	}
	private static void ExtractMetadataFromHtmlDocument(string url, Metadata metadata, HtmlDocument htmlDocument)
	{ 
		// Extract title from <title> tag
		var titleNode = htmlDocument.DocumentNode.SelectSingleNode("//title");
		if (titleNode != null && !string.IsNullOrEmpty(titleNode.InnerText.Trim()))
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
		if (ogTitleNode != null && !string.IsNullOrEmpty(ogTitleNode.GetAttributeValue("content", "")))
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
	}
	public bool IsValidDomain(string domain)
	{
		if (string.IsNullOrWhiteSpace(domain)) return false;

		string url = domain.ToLower().Trim();

		try
		{
			if (url.StartsWith("javascript:") || url.StartsWith("tel:") || url.StartsWith("mailto:"))
			{
			//	LogInvalid("Invalid scheme (javascript, tel, mailto): " + domain);
				return false;
			}

			if (url.Contains(".."))
			{
			//	LogInvalid("Invalid domain: contains double dots: " + domain);
				return false;
			}

			if (!url.StartsWith("http://") && !url.StartsWith("https://"))
			{
				//LogInvalid("Invalid URL: must start with http:// or https://: " + domain);
				return false;
			}

			if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
			{
				//LogInvalid("Invalid URL format: " + domain);
				return false;
			}

			if (uri.HostNameType != UriHostNameType.Dns)
			{
				//LogInvalid("Invalid HostNameType (not DNS): " + domain);
				return false;
			}

			string host = uri.Host;

			// Check for allowed domain characters
			if (!Regex.IsMatch(host, @"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"))
			{
			//	LogInvalid("Invalid characters in domain: " + host);
				return false;
			}

			// Optional: prevent suspicious repetition like "abc.com.com"
			var parts = host.Split('.');
			if (parts.Length >= 3 && parts[^1] == parts[^2])
			{
			//	LogInvalid("Suspicious repeated TLD: " + host);
				return false;
			}

			// Optional: prevent localhost or IPs
			if (host == "localhost" || IPAddress.TryParse(host, out _))
			{
				//LogInvalid("Invalid domain: localhost or IP address: " + host);
				return false;
			} 
			// Check for allowed domain characters
			if (!Regex.IsMatch(host, @"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"))
			{
				//LogInvalid("Invalid characters in domain: " + host);
				return false;
			}

			// Validate the domain suffix
			if (!HasValidSuffix(host))
			{
				//LogInvalid("Invalid domain suffix: " + host);
				return false;
			}

			return true;
		}
		catch (Exception ex)
		{
			LogInvalid("Exception during domain validation: " + ex.Message);
			return false;
		}
	}
	public bool HasValidSuffix(string host)
	{
		// Split host by '.' and compare last part(s) against the list
		var parts = host.ToLower().Split('.');

		for (int i = 1; i <= 2 && i <= parts.Length; i++)
		{
			string suffix = string.Join(".", parts.Skip(parts.Length - i));
			if (DomainSuffixes.Contains(suffix))
			{
				return true;
			}
		}
		return false;
	}

	private void LogInvalid(string message)
	{
		_ = _log.Db(message, null, "CRAWLER", true);
	}

	public async Task<string?> FindSitemapUrl(string domain)
	{
		try
		{
			string[] possibleSitemapUrls = { $"{domain}/sitemap.xml", $"{domain}/sitemap_index.xml" };
			foreach (var url in possibleSitemapUrls)
			{
				if (await UrlExists(url))
				{
					return url;
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (FindSitemapUrl) : " + ex.Message, null, "CRAWLER", true);
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
		catch (TaskCanceledException)
		{
			_ = _log.Db("Request timed out.", null, "CRAWLER", true);
			return false;
		}
		catch
		{
			return false;
		}
	}

	public async Task CrawlSitemap(string domain)
	{
		int sitemapLimit = _maxRecursionLimit;
		try
		{
			string? sitemapUrl = await FindSitemapUrl(domain);
			if (string.IsNullOrEmpty(sitemapUrl)) { return; }

			string sitemapIndexXml = await GetSitemapXml(sitemapUrl);
			// Extract individual sitemap URLs from the sitemap index
			var sitemapUrls = ExtractUrlsFromSitemap(sitemapIndexXml, sitemapLimit);
			if (sitemapUrls != null)
			{
				foreach (var url in sitemapUrls.ToList())
				{
					if (sitemapLimit <= 0) { break; }
					sitemapLimit--;
					string fullUrl = NormalizeUrl(url, domain); 
					if (!(await StartScrapingAsync(fullUrl))) {
						break;
					}
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (CrawlSitemap): " + ex.ToString(), null, "CRAWLER", true);
		} 
	}
	public async Task<bool> StartScrapingAsync(string url)
	{ 
		if (EndExceedence(url))
		{
			return false;
		}

		await _asyncScrapeSemaphore.WaitAsync();
		try
		{ 
			if (_visitedUrls.Add(url) && !urlsToScrapeQueue.Contains(url) && urlsToScrapeQueue.Count < 10000 && IsValidDomain(url))
			{
				if (delayedUrlsQueue.Count < 50000)
				{
					delayedUrlsQueue.Enqueue(url);
					//_ = _log.Db($"(Crawler:{delayedUrlsQueue.Count}#{urlsToScrapeQueue.Count})Delayed: {ShortenUrl(url)}", null, "CRAWLER", true);

					if (delayedUrlsQueue.Count == 1)
					{
						await ProcessDelayedUrlsQueueAsync();
					} 
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (StartScrapingAsync): " + ex.ToString(), null, "CRAWLER", true);
		}
		finally
		{
			_asyncScrapeSemaphore.Release();
		}
		return true;
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
					//_ = _log.Db($"(Crawler:{delayedUrlsQueue.Count}#{urlsToScrapeQueue.Count})Enqueued: {ShortenUrl(urlToProcess)}", null, "CRAWLER", true);
					urlsToScrapeQueue.Add(urlToProcess);
					_ = ScrapeUrlsSequentially();
				}
				else
				{
					//_ = _log.Db($"(Crawler:{urlsToScrapeQueue.Count})Skipping: " +
					//		$"{urlToProcess.Substring(0, Math.Min(urlToProcess.Length, 25))}" +
					//		$"{(urlToProcess.Length > 35 ? "..." + urlToProcess[^10..] : "")}");
				}
			}
			isProcessing = false;
			ClearVisitedUrls();  // Clear visited URLs after all delayed URLs are processed
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (ProcessDelayedUrlsQueueAsync) : " + ex.Message, null, "CRAWLER", true);
		}
	}
	public async Task<string> GetSitemapXml(string sitemapUrl, int maxBufferSize = 500000)
	{
		try
		{
			// Send a GET request to the sitemap URL
			HttpResponseMessage response = await _httpClient.GetAsync(sitemapUrl, HttpCompletionOption.ResponseHeadersRead);

			// Ensure successful response
			response.EnsureSuccessStatusCode();

			// Read the response content as a string
			string xmlContent = await ReadHtmlWithLimit(response, maxBufferSize);
			return xmlContent;
		}
		catch (HttpRequestException)
		{
			return string.Empty;
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception(GetSitemapXml): " + ex.Message, null, "CRAWLER", true);
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

				while (urlsToScrapeQueue.Any())
				{
					string? url = GetRandomUrlFromList(urlsToScrapeQueue);
					url = NormalizeUrl(url);
					if (!string.IsNullOrEmpty(url))
					{
						_lastRequestTime = DateTime.Now;
						Metadata? metaData = null; 
						//_ = _log.Db($"(Crawler:{delayedUrlsQueue.Count()}#{urlsToScrapeQueue.Count()})Scraping: " + $"{ShortenUrl(url)}", null, "CRAWLER", true);
						metaData = await ScrapeUrlData(url);
						if (metaData != null && !IsMetadataCompletelyEmpty(metaData))
						{
							await SaveSearchResult(url, metaData);
							await CrawlSitemap(url);
						}
						else if (metaData != null && IsMetadataCompletelyEmpty(metaData) && !string.IsNullOrEmpty(metaData.Url))
						{
							await MarkUrlAsFailed(metaData.Url);
						}

						if (DateTime.Now - _lastRequestTime < _requestInterval)
						{
							await Task.Delay(_requestInterval - (DateTime.Now - _lastRequestTime));
						}
					}
				}
			}
		}
		catch (HttpRequestException ex)
		{
			_ = _log.Db($"HTTP request failed : {ex.Message}", null, "CRAWLER", true);
			if (ex.InnerException is System.Net.Sockets.SocketException socketEx)
			{
				_ = _log.Db($"DNS resolution failed : {socketEx.Message}", null, "CRAWLER", true);
			}
			else
			{
				//		_ = _log.Db($"Inner Exception: {ex.InnerException?.Message}");
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception (ScrapeUrlsSequentially) : " + ex.Message, null, "CRAWLER", true);
		}
		finally
		{
			scrapeSemaphore.Release();  // Ensure the semaphore is always released, even if an exception occurs
		}
	}
	public List<string> ExtractUrlsFromSitemap(string sitemapIndexXml, int maxUrlCount)
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
					if (maxUrlCount <= 0) { return sitemapUrls; }
					var locUrl = locNode.InnerText.Trim();
					if (!string.IsNullOrWhiteSpace(locUrl))
					{
						sitemapUrls.Add(locUrl);
						maxUrlCount--;
					}
				}
			}
			else
			{
				var rawUrls = sitemapIndexXml.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
				foreach (var url in rawUrls)
				{
					if (maxUrlCount <= 0) { return sitemapUrls; }
					var trimmedUrl = url.Trim();
					if (Uri.IsWellFormedUriString(trimmedUrl, UriKind.Absolute))
					{
						sitemapUrls.Add(trimmedUrl);
						maxUrlCount--;
					}
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Exception (ExtractUrlsFromSitemap): {ex.Message}", null, "CRAWLER", true);
		}

		return sitemapUrls;
	}
	private readonly object _urlLock = new object();
	public string? GetRandomUrlFromList(List<string> urls)
	{
		lock (_urlLock)
		{
			try
			{
				if (urls.Count > 0)
				{ 
					int randomIndex = _random.Next(0, urls.Count);
					string randomUrl = urls[randomIndex];
					urls.RemoveAt(randomIndex);
					return randomUrl;
				}
				return null;
			}
			catch (Exception ex)
			{
				_ = _log.Db("Crawler Exception (GetRandomUrlFromList): " + ex.Message, null, "CRAWLER", true);
				return null;
			}
		}
	}
	public string GetUrlHash(string url)
	{
		try
		{
			using (var sha256 = SHA256.Create())
			{
				byte[] hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(url));
				return BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Crawler exception (GetUrlHash) : " + ex.Message, null, "CRAWLER", true);
		}
		return "";
	}
	public async Task<int> GetIndexCount()
	{
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
							return reader.GetInt32("count");
						}
					}
				}

				return 0;
			}
		}
		catch (Exception)
		{
			return 0;
		}
	}
	public void ClearVisitedUrls()
	{
		try
		{

			if (_visitedUrls.Count >= 10000)
			{
				_visitedUrls = new HashSet<string>(_visitedUrls.Take(5000).ToList());
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Crawler exception (ClearVisitedUrls): " + ex.Message, null, "CRAWLER", true);
		}
	}
	public async Task<object?> GetStorageStats()
	{
		string sql = @"
	SELECT 
		stats.*,
		db_sizes.total_size_mb
	FROM
	(
		SELECT 
			(
				AVG(LENGTH(url)) +
				AVG(LENGTH(IFNULL(title, ''))) +
				AVG(LENGTH(IFNULL(description, ''))) +
				AVG(LENGTH(IFNULL(author, ''))) +
				AVG(LENGTH(IFNULL(keywords, ''))) +
				AVG(LENGTH(IFNULL(image_url, ''))) +
				4 + 8 + 8 + 64 + 1 + 4 + 20
			) AS avg_row_size_bytes,

			(
				AVG(LENGTH(url)) +
				AVG(LENGTH(IFNULL(title, ''))) +
				AVG(LENGTH(IFNULL(description, ''))) +
				AVG(LENGTH(IFNULL(author, ''))) +
				AVG(LENGTH(IFNULL(keywords, ''))) +
				AVG(LENGTH(IFNULL(image_url, ''))) +
				4 + 8 + 8 + 64 + 1 + 4 + 20
			) / (1024 * 1024) AS avg_row_size_mb,

			COUNT(*) AS total_rows,
			MIN(found_date) AS earliest_date,
			MAX(found_date) AS latest_date,

			TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date)) AS days_of_data,

			CASE 
				WHEN TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date)) = 0 THEN COUNT(*)
				ELSE COUNT(*) / TIMESTAMPDIFF(DAY, MIN(found_date), MAX(found_date))
			END AS avg_rows_per_day,

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
		FROM search_results
	) AS stats
	CROSS JOIN
	(
		SELECT 
			ROUND(SUM(data_length + index_length) / (1024 * 1024), 2) AS total_size_mb
		FROM information_schema.TABLES
		WHERE table_schema = 'maxhanna'
	) AS db_sizes";

		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			using var rdr = await cmd.ExecuteReaderAsync();

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
					ProjectedMonthlyUsageMB = rdr.IsDBNull("projected_monthly_usage_mb") ? 0 : rdr.GetDecimal("projected_monthly_usage_mb"),
					TotalDatabaseSizeMB = rdr.IsDBNull("total_size_mb") ? 0 : rdr.GetDecimal("total_size_mb")
				};

				return stats;
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Crawler Exception (GetStorageStats): " + ex.Message, null, "CRAWLER", true);
		}

		return null;
	}


	private bool EndExceedence(string url)
	{ 
		string domain = GetDomain(url);
		int _exceedanceCount = _maxSiteExceedance;
		int count = 0;
		int delayedUrlsCount = delayedUrlsQueue.Where(x => GetDomain(x) == domain).Count();
		foreach (string item in delayedUrlsQueue.Concat(urlsToScrapeQueue))
		{
			if (count >= _maxSiteExceedance) break;
			if (GetDomain(item) == domain) count++;
		}
		if (count >= _exceedanceCount)
		{
			RemoveDomainFromLists(domain);
			return true;
		}
		return false;
	}
	private void RemoveDomainFromLists(string domain)
	{
		var tempQueue = new Queue<string>(delayedUrlsQueue.Where(url => GetDomain(url) != domain));
		delayedUrlsQueue = tempQueue;

		var tempQueue2 = new List<string>(urlsToScrapeQueue.Where(url => GetDomain(url) != domain));
		urlsToScrapeQueue = tempQueue2;
		_ = _log.Db($"Crawler: Domain {domain} exceeded {_maxSiteExceedance} occurrences, removed from all lists.", null, "CRAWLER", true);
	}
	public int CalculateRelevanceScore(Metadata result, string searchTerm)
	{
		int score = 20;
		string search = searchTerm.ToLower().Trim(); // Ensure the search term is properly trimmed
		if (Uri.TryCreate(result.Url, UriKind.Absolute, out Uri? url))
		{
			string domain = url.Host.ToLower();
			string urlWithoutProtocol = url.GetComponents(UriComponents.HostAndPort, UriFormat.UriEscaped).ToLower();
			string searchWithoutProtocol = search.StartsWith("http://") || search.StartsWith("https://")
			 ? search.Substring(search.IndexOf("//") + 2).ToLower()
			 : search.ToLower();

			if (urlWithoutProtocol.Equals(searchWithoutProtocol, StringComparison.OrdinalIgnoreCase))
			{
				score += 500; // Exact match gets top priority
			}
			else if (domain.Equals(search, StringComparison.OrdinalIgnoreCase)) // Exact domain match
			{
				score += 300; // Exact domain match gets a substantial boost
			}
			else if (domain.Contains(search))
			{
				score += url.AbsolutePath == "/" ? 250 : 150; // Top-level domain gets more points
			}

			// Penalize based on path segments (optional: adjust the penalty amount)
			var pathSegments = url.AbsolutePath.Split('/').Where(segment => !string.IsNullOrEmpty(segment)).ToList();
			int segmentPenalty = pathSegments.Count > 1 ? (pathSegments.Count - 1) * 5 : 0;
			score -= segmentPenalty;
		}

		// Add points for other matches in URL, title, description, etc.
		if (result.Url?.ToLower().Contains(search) == true) score += 75;
		if (result.Title?.ToLower().Contains(search) == true) score += 50;
		if (result.Description?.ToLower().Contains(search) == true) score += 30;
		if (result.Author?.ToLower().Contains(search) == true) score += 20;
		if (result.Keywords?.ToLower().Contains(search) == true) score += 20;
		if (result.ImageUrl?.ToLower().Contains(search) == true) score += 5;

		return score;
	}

	private async Task<string> ReadHtmlWithLimit(HttpResponseMessage response, int maxBytes = 400_000)
	{
		using var stream = await response.Content.ReadAsStreamAsync();
		using var reader = new StreamReader(stream);

		var builder = new StringBuilder();
		char[] buffer = new char[4096];
		int totalRead = 0;

		while (!reader.EndOfStream && totalRead < maxBytes)
		{
			int toRead = Math.Min(buffer.Length, maxBytes - totalRead);
			int read = await reader.ReadAsync(buffer, 0, toRead);
			if (read == 0) break;

			builder.Append(buffer, 0, read);
			totalRead += read;
		}

		return builder.ToString();
	}
	public string[] ExtractUrls(string? text)
	{
		if (string.IsNullOrEmpty(text))
		{
			return Array.Empty<string>(); // Return an empty array if the text is null or empty
		}

		// Regular expression to match URLs both inside href="" and standalone links
		string urlPattern = @"(?:href=[""'](https?:\/\/[^\s""']+)[""']|(?<!href=[""'])(https?:\/\/[^\s<]+))";

		// Match URLs in the text
		var matches = System.Text.RegularExpressions.Regex.Matches(text, urlPattern);

		// Convert the MatchCollection to a string array, filtering out empty matches
		return matches.Cast<Match>()
									.Select(m => m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value)
									.Where(url => !string.IsNullOrEmpty(url))
									.ToArray();
	}
	public string ShortenUrl(string url, int maxLength = 50)
	{
		if (url.Length <= maxLength) return url;

		int firstPartLength = maxLength / 2 - 3;  // Adjust to leave room for "..."
		int lastPartLength = maxLength - firstPartLength - 3;

		return url.Substring(0, firstPartLength) + "..." + url[^lastPartLength..];
	}
	private string GetDomain(string url)
	{
		Uri uri = new Uri(url);
		string domain = uri.Scheme + "://" + uri.Host; // This gives you "http://google.com"
		return domain;
	}

}




//	case 200:
//	return 'OK: The request has succeeded.';
//case 301:
//	return 'Moved Permanently: The requested resource has been permanently moved to a new location.';
//case 302:
//	return 'Found: The requested resource is temporarily available at a different URL.';
//case 400:
//	return 'Bad Request: The server could not understand the request due to invalid syntax.';
//case 401:
//	return 'Unauthorized: Authentication is required to access this resource.';
//case 403:
//	return 'Forbidden: You do not have permission to access this resource.';
//case 404:
//	return 'Not Found: The requested resource could not be found.';
//case 405:
//	return 'Method Not Allowed: The HTTP method used is not supported for the requested resource.';
//case 500:
//	return 'Internal Server Error: The server encountered an unexpected condition.';
//case 502:
//	return 'Bad Gateway: Invalid response from an upstream server.';
//case 503:
//	return 'Service Unavailable: The server is temporarily unavailable due to overload or maintenance.';
//case 504:
//	return 'Gateway Timeout: The server did not receive a timely response from an upstream server.';
//default:
//	return 'Unknown status code.';