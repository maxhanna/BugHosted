using NewsAPI.Constants;
using NewsAPI.Models;
using NewsAPI;
using MySqlConnector;
using System.Linq.Expressions;
using System.Text.RegularExpressions;
using System.Text;

public class NewsService
{
	private readonly HttpClient _httpClient;
	private readonly IConfiguration _config;
	private readonly Log _log;
	private static readonly HashSet<string> Stopwords = new(StringComparer.OrdinalIgnoreCase)
	{
			"the", "and", "a", "an", "of", "to", "in", "for", "on", "with", "at", "by", "from", "up",
			"about", "as", "into", "like", "through", "after", "over", "between", "out", "against",
			"during", "without", "before", "under", "around", "among", "is", "are", "was", "were", "be",
			"has", "had", "have", "it", "this", "that", "these", "those", "you", "i", "he", "she", "they",
			"we", "but", "or", "so", "if", "because", "while", "just", "not", "no", "yes"
	};
	private static readonly HashSet<string> CryptoKeywords = new(StringComparer.OrdinalIgnoreCase)
	{
		"bitcoin", "btc", "ethereum", "eth", "tether", "usdt", "xrp", "bnb", "solana", "sol", "cardano", "ada", "dogecoin", "doge",
	"polkadot", "dot", "litecoin", "ltc", "tron", "trx", "monero", "xmr", "avalanche", "avax", "stellar", "xlm", "vechain", "vet",
	"chainlink", "link", "aptos", "apt", "arbitrum", "arb", "optimism", "op", "render", "rndr", "sui", "algorand", "algo",
	"coinbase", "binance", "kraken", "bitfinex", "gemini", "huobi", "okx", "bitstamp", "kucoin", "crypto.com", "bybit", "mexc",
	"bitmart", "upbit", "bittrex", "probit", "gate.io", "poloniex", "wallet", "cold wallet", "hot wallet", "hardware wallet",
	"metamask", "trust wallet", "private key", "public key", "day trading", "forex", "margin trading", "leverage",
	"long position", "short position", "stop loss", "take profit", "trading bot", "pump and dump", "technical analysis",
	"candlestick", "bullish", "bearish", "market cap", "volume", "liquidity", "blockchain", "ledger", "smart contract",
	"gas fees", "layer 1", "layer 2", "sharding", "rollups", "zk-rollup", "optimistic rollup", "sidechain", "consensus",
	"proof of work", "proof of stake", "pos", "pow", "staking", "validator", "mining", "miner", "hashrate", "hashing",
	"hashpower", "nonce", "node", "fork", "hard fork", "soft fork", "altcoin", "stablecoin", "shitcoin", "memecoin",
	"uniswap", "pancakeswap", "sushiswap", "aave", "compound", "makerdao", "yearn finance", "curve", "balancer", "1inch",
	"polygon", "matic", "fantom", "ftm", "hedera", "hbar", "nft", "non-fungible token", "openSea", "blur", "minting",
	"floor price", "rarity", "digital art", "bored ape", "crypto punk", "metaverse", "sandbox", "decentraland", "web3",
	"virtual land", "play to earn", "p2e", "axie infinity", "gala", "immutable x", "gamefi", "ledger", "trezor", "multisig",
	"2fa", "rugpull", "scam", "exploit", "airdrop", "whitelist", "kyc", "aml", "regulation", "sec", "defi", "dapp", "dao",
	"downtime", "bridge", "cross-chain", "audit", "hack", "vulnerability", "digital currency", "token", "coin", "exchange",
	"fiat", "inflation", "interest rates", "macro", "fed", "federal reserve", "treasury", "gold", "silver", "etf", "spot etf",
	"securities", "futures", "derivatives", "yield", "treasury bonds", "cryptocurrency", "crypto", "money"
	};
	int newsServiceAccountNo = 308;
	private DateTime lastNewsDataTimestamp;

	public NewsService(IConfiguration config, Log log)
	{
		_config = config;
		_log = log;
		_httpClient = new HttpClient(new HttpClientHandler
		{
			ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
			AllowAutoRedirect = true,
		});
	}
	public async Task<ArticlesResult?> GetTopHeadlines()
	{
		try
		{
			var newsApiClient = new NewsApiClient("f782cf1b4d3349dd86ef8d9ac53d0440");
			var articlesResponse = new ArticlesResult();

			articlesResponse = newsApiClient.GetTopHeadlines(new TopHeadlinesRequest
			{
				Language = Languages.EN
			});

			if (articlesResponse.Status == Statuses.Ok)
			{
				return articlesResponse;
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception GetTopHeadlines: " + ex.Message, null, "NEWSSERVICE", true);
			return null;
		}
		return null;
	}

	public async Task<bool> GetAndSaveTopQuarterHourlyHeadlines()
	{
		int articlesToTake = 20;
		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// Check if any news have been saved in the past 15 minutes
			string checkSql = "SELECT COUNT(*) FROM news_headlines WHERE saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE);";
			using (var checkCmd = new MySqlCommand(checkSql, conn))
			{
				var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
				if (count > 0)
				{
					//await _log.Db("Skipped saving headlines — already saved in the 15 minutes", null, "NEWSSERVICE", false);
					return false;
				}
			}

			var articlesResult = await GetTopHeadlines();

			if (articlesResult?.Status != Statuses.Ok || articlesResult.Articles == null)
			{
				await _log.Db("Failed to fetch top headlines", null, "NEWSSERVICE", true);
				return false;
			}

			var top20 = articlesResult.Articles.Take(articlesToTake).ToList();

			using var transaction = await conn.BeginTransactionAsync();

			foreach (var article in top20)
			{
				string sql = @"
					INSERT IGNORE INTO news_headlines (title, description, url, published_at, saved_at, url_to_image, content, author)
					VALUES (@title, @description, @url, @published_at, UTC_TIMESTAMP(), @url_to_image, @content, @author);";

				using var cmd = new MySqlCommand(sql, conn, transaction);
				cmd.Parameters.AddWithValue("@title", article.Title ?? "");
				cmd.Parameters.AddWithValue("@description", article.Description ?? "");
				cmd.Parameters.AddWithValue("@url", article.Url ?? "");
				cmd.Parameters.AddWithValue("@published_at", article.PublishedAt ?? DateTime.UtcNow);
				cmd.Parameters.AddWithValue("@url_to_image", article.UrlToImage ?? "");
				cmd.Parameters.AddWithValue("@content", article.Content ?? "");
				cmd.Parameters.AddWithValue("@author", article.Author ?? "");

				await cmd.ExecuteNonQueryAsync();
			}

			await transaction.CommitAsync();

		//	await _log.Db($"Successfully saved top {articlesToTake} news headlines", null, "NEWSSERVICE", true);
			return true;
		}
		catch (Exception ex)
		{
			await _log.Db("Exception in GetAndSaveTopHeadlines: " + ex.Message, null, "NEWSSERVICE", true);
			return false;
		}
	}

	public async Task<ArticlesResult> GetTopHeadlinesFromDb()
	{
		var result = new ArticlesResult
		{
			Status = Statuses.Ok,
			Articles = new List<Article>()
		};

		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			string sql = @"
				SELECT DISTINCT title, description, url, published_at, url_to_image, author, content, saved_at
				FROM news_headlines
				WHERE saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)
				ORDER BY saved_at DESC
				LIMIT 50;";

			using var cmd = new MySqlCommand(sql, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				result.Articles.Add(new Article
				{
					Title = reader["title"]?.ToString(),
					Description = reader["description"]?.ToString(),
					Url = reader["url"]?.ToString(),
					PublishedAt = reader["published_at"] as DateTime?,
					Source = new Source
					{
						Id = "local-db",
						Name = "SavedHeadline"
					},
					Author = reader["author"]?.ToString(),
					Content = reader["content"]?.ToString(),
					UrlToImage = reader["url_to_image"]?.ToString(),
				});
			}

			result.TotalResults = result.Articles.Count;
		}
		catch (Exception ex)
		{
			await _log.Db("Exception in GetTopHeadlinesFromDb: " + ex.Message, null, "NEWSSERVICE", true);
			result.Status = Statuses.Error;
			result.Error = new Error
			{
				Code = NewsAPI.Constants.ErrorCodes.UnexpectedError,
				Message = ex.Message
			};
		}

		return result;
	}
	public async Task CreateDailyNewsStoryAsync()
	{
		try
		{
			int numberOfArticles = await GetNewsCountInLast24HoursAsync();
			if (numberOfArticles < 50)
			{
				//await _log.Db("Not enough articles saved yet.", null, "NEWSSERVICE", true);
				return;
			}
			var topArticlesResult = await GetTopHeadlinesFromDb();  // You can replace with a method that fetches top articles for the day
			if (topArticlesResult?.Articles == null || topArticlesResult.Articles.Count == 0)
			{
			//	await _log.Db("No articles to create a social story for today", null, "NEWSSERVICE", true);
				return;
			}

			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			await using var transaction = await conn.BeginTransactionAsync();

			// Check if a social story already exists for today (user_id = 0, contains marker text)
			string marker = "📰 [b]Daily News Update![/b]";
			string checkSql = $@"
        SELECT COUNT(*) FROM stories
        WHERE user_id = {newsServiceAccountNo} AND DATE(`date`) = CURDATE()
        AND story_text LIKE CONCAT('%', @marker, '%');
        ";

			await using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
			{
				checkCmd.Parameters.AddWithValue("@marker", marker);
				var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
				if (exists)
				{
					await _log.Db("Daily news story already exists. Skipping creation.", null, "NEWSSERVICE");
					await transaction.RollbackAsync();
					return;
				}
			}

			// Build the story text and tokenize the descriptions of top articles
			var sb = new StringBuilder();
			sb.AppendLine(marker);

			var tokenFrequency = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
			var articleTokenMap = new List<(Article Article, List<string> Tokens)>();

			foreach (var article in topArticlesResult.Articles)
			{
				var tokens = TokenizeText(article.Description);
				articleTokenMap.Add((article, tokens));

				foreach (var token in tokens)
				{
					if (tokenFrequency.ContainsKey(token))
						tokenFrequency[token]++;
					else
						tokenFrequency[token] = 1;
				}
			}

			// Find the most frequent word
			var mostFrequentWord = tokenFrequency.OrderByDescending(kv => kv.Value).First().Key;
			await _log.Db($"Most frequent token from today's articles: '{mostFrequentWord}'", null, "NEWSSERVICE");

			// Find the article where that word appears the most
			Article? selectedArticle = null;
			int maxOccurrences = 0;

			foreach (var (article, tokens) in articleTokenMap)
			{
				int occurrences = tokens.Count(t => t.Equals(mostFrequentWord, StringComparison.OrdinalIgnoreCase));
				await _log.Db($"Token '{mostFrequentWord}' found {occurrences} times in article: {article.Title}", null, "NEWSSERVICE");

				if (occurrences > maxOccurrences)
				{
					maxOccurrences = occurrences;
					selectedArticle = article;
				}
			}
			if (selectedArticle == null)
			{
				await _log.Db("Error in CreateDailyNewsStoryAsync: No news article selected.", null, "NEWSSERVICE", true);
				return;
			}
			// Build the story string using only the most relevant article 
			sb.AppendLine($"[*][b]{selectedArticle.Title}[/b]\nRead more: {selectedArticle.Url} [/*]");

			string fullStoryText = sb.ToString().Trim();

			// Save the description tokens of selected article for file-matching
			var selectedArticleTokens = TokenizeText(selectedArticle.Description);


			// Insert the story into the 'stories' table
			string insertSql = @"
        INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
        VALUES (@userId, @storyText, NULL, NULL, NULL, UTC_TIMESTAMP());
        ";

			await using var insertCmd = new MySqlCommand(insertSql, conn, transaction);
			insertCmd.Parameters.AddWithValue("@userId", newsServiceAccountNo);
			insertCmd.Parameters.AddWithValue("@storyText", fullStoryText);

			await insertCmd.ExecuteNonQueryAsync();

			// Get the last inserted story ID
			string getLastStoryIdSql = "SELECT LAST_INSERT_ID();";
			int storyId = Convert.ToInt32(await new MySqlCommand(getLastStoryIdSql, conn, transaction).ExecuteScalarAsync());

			// Now, find the best matching file from the `file_uploads` table
			int? bestFileMatch = await FindBestMatchingFileAsync(selectedArticleTokens, conn, transaction);

			if (bestFileMatch != null)
			{
				// Link the matched file to the story
				string insertStoryFileSql = @"
            INSERT INTO story_files (story_id, file_id)
            VALUES (@storyId, @fileId);
            ";

				await using var storyFileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
				storyFileCmd.Parameters.AddWithValue("@storyId", storyId);
				storyFileCmd.Parameters.AddWithValue("@fileId", bestFileMatch.Value);

				await storyFileCmd.ExecuteNonQueryAsync();
			}

			await transaction.CommitAsync();
			await _log.Db("Daily news story created successfully.", null, "NEWSSERVICE");
		}
		catch (Exception ex)
		{
			await _log.Db("Error in CreateDailyNewsStoryAsync: " + ex.Message, null, "NEWSSERVICE", true);
		}
	}

	private List<string> TokenizeText(string input)
	{
		if (string.IsNullOrWhiteSpace(input))
			return new List<string>();

		var tokens = Regex
				.Matches(input.ToLowerInvariant(), @"\b[a-zA-Z]{2,}\b")
				.Select(match => match.Value)
				.Where(token => !Stopwords.Contains(token))
				.ToList();

		return tokens;
	}
	private async Task<int?> FindBestMatchingFileAsync(List<string> tokens, MySqlConnection conn, MySqlTransaction transaction)
	{
		if (tokens == null || tokens.Count == 0)
			return null;

		var fileScores = new Dictionary<int, int>(); // file_id -> score

		// We'll search using a FULLTEXT match (but also fall back to basic LIKE search)
		string sql = @"
		SELECT id, file_name, given_file_name
		FROM file_uploads
		WHERE is_folder = 0
		AND is_public = 1
		AND (file_name IS NOT NULL OR given_file_name IS NOT NULL) 
		AND file_type IN (
			'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico', 'heic', 'heif', 'raw', 'cr2', 'nef', 'orf', 'arw',
			'mp4', 'm4v', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv', 'mpeg', 'mpg', '3gp', '3g2', 'mts', 'm2ts', 'ts', 'vob', 'ogv'
		)";

		await using var cmd = new MySqlCommand(sql, conn, transaction);
		await using var reader = await cmd.ExecuteReaderAsync();

		while (await reader.ReadAsync())
		{
			int fileId = reader.GetInt32("id");
			string fileName = reader["file_name"]?.ToString() ?? "";
			string givenName = reader["given_file_name"]?.ToString() ?? "";

			var combinedText = $"{fileName} {givenName}".ToLowerInvariant();
			int score = tokens.Count(token => combinedText.Contains(token.ToLowerInvariant()));

			if (score > 0)
				fileScores[fileId] = score;
		}

		if (fileScores.Count == 0)
			return null;

		// Return the file_id with the highest score
		return fileScores.OrderByDescending(kv => kv.Value).First().Key;
	}

	public async Task CreateDailyCryptoNewsStoryAsync()
	{
		try
		{
			int numberOfArticles = await GetNewsCountInLast24HoursAsync();
			if (numberOfArticles < 50) {
			//	await _log.Db("Not enough articles saved yet.", null, "NEWSSERVICE", true); 
				return; 
			}

			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			await using var transaction = await conn.BeginTransactionAsync();

			// Check if a social story already exists for today (user_id = {newsServiceAccountNo}, contains marker text)
			string marker = "📰 [b]Crypto News Update![/b]";
			string checkSql = $@"
			SELECT COUNT(*) FROM stories
			WHERE user_id = {newsServiceAccountNo} AND DATE(`date`) = CURDATE()
			AND story_text LIKE CONCAT('%', @marker, '%');
		";

			await using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
			{
				checkCmd.Parameters.AddWithValue("@marker", marker);
				var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
				if (exists)
				{
					await _log.Db("Daily crypto news story already exists. Skipping creation.", null, "NEWSSERVICE");
					await transaction.RollbackAsync();
					return;
				}
			}

			var topArticlesResult = await GetTopCryptoArticlesByDayAsync();
			if (topArticlesResult?.Articles == null || topArticlesResult.Articles.Count == 0)
			{
				await _log.Db("No crypto articles to write a social story about", null, "NEWSSERVICE", true);
				return;
			}
			// Build story text from all articles
			var sb = new StringBuilder();
			sb.AppendLine(marker);
			foreach (var article in topArticlesResult.Articles)
			{
				sb.AppendLine($"[*][b]{article.Title}[/b]\nRead more: {article.Url} [/*]");
			}

			string fullStoryText = sb.ToString().Trim();

			string insertSql = @"
			INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
			VALUES (@userId, @storyText, NULL, NULL, NULL, UTC_TIMESTAMP());
		";

			await using var insertCmd = new MySqlCommand(insertSql, conn, transaction);
			insertCmd.Parameters.AddWithValue("@userId", newsServiceAccountNo);
			insertCmd.Parameters.AddWithValue("@storyText", fullStoryText);

			await insertCmd.ExecuteNonQueryAsync();
			await transaction.CommitAsync();

			await _log.Db("Daily crypto news story created successfully.", null, "NEWSSERVICE");
		}
		catch (Exception ex)
		{
			await _log.Db("Error in CreateDailyCryptoNewsStoryAsync: " + ex.Message, null, "NEWSSERVICE", true);
		}
	}
	public async Task<ArticlesResult> GetTopCryptoArticlesByDayAsync(int daysBack = 7)
	{
		var result = new ArticlesResult
		{
			Status = Statuses.Ok,
			Articles = new List<Article>()
		};

		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// Pull candidates without filtering too harshly
			string sql = $@"
			SELECT title, description, url, published_at, url_to_image, author, content, saved_at
			FROM (
				SELECT *,
					ROW_NUMBER() OVER (PARTITION BY DATE(saved_at) ORDER BY saved_at DESC) AS row_num
				FROM news_headlines
				WHERE saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL {daysBack} DAY)
			) filtered
			WHERE row_num <= 10
			ORDER BY saved_at DESC;
		";

			using var cmd = new MySqlCommand(sql, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			// Temp storage per day
			var dailyBuckets = new Dictionary<DateTime, List<Article>>();

			while (await reader.ReadAsync())
			{
				var article = new Article
				{
					Title = reader["title"]?.ToString(),
					Description = reader["description"]?.ToString(),
					Url = reader["url"]?.ToString(),
					PublishedAt = reader["published_at"] as DateTime?,
					Source = new Source
					{
						Id = "local-db",
						Name = "SavedHeadline"
					},
					Author = reader["author"]?.ToString(),
					Content = reader["content"]?.ToString(),
					UrlToImage = reader["url_to_image"]?.ToString(),
				};

				if (article.PublishedAt == null) continue;

				// Combine text fields for keyword matching
				string combinedText = $"{article.Title} {article.Description} {article.Content}".ToLower();

				// Filter articles by real keyword match (exact word)
				var words = Regex.Matches(combinedText, @"\b[a-zA-Z0-9]+\b")
												 .Select(m => m.Value.ToLowerInvariant())
												 .ToHashSet();

				var matchedKeywords = CryptoKeywords.Where(keyword =>
				{
					var lower = keyword.ToLowerInvariant();
					return words.Contains(lower) ||
								 words.Contains(lower + "s") ||
								 words.Contains(lower + "es") ||
								 words.Contains(lower.TrimEnd('e') + "ing") ||
								 words.Contains(lower + "ed");
				}).ToList();

				if (matchedKeywords.Count > 0)
				{
					Console.WriteLine($"Matched keywords for article '{article.Title}': {string.Join(", ", matchedKeywords)}");
				}
				else
				{
					continue;
				}


				DateTime date = article.PublishedAt.Value.Date;

				if (!dailyBuckets.ContainsKey(date))
					dailyBuckets[date] = new List<Article>();

				if (dailyBuckets[date].Count < 3)
					dailyBuckets[date].Add(article);
			}

			// Flatten sorted articles
			result.Articles = dailyBuckets
				.OrderByDescending(kvp => kvp.Key)
				.SelectMany(kvp => kvp.Value.OrderByDescending(a => a.PublishedAt))
				.ToList();

			result.TotalResults = result.Articles.Count;
		}
		catch (Exception ex)
		{
			await _log.Db("Exception in GetTopCryptoArticlesByDayAsync: " + ex.Message, null, "NEWSSERVICE", true);
			result.Status = Statuses.Error;
			result.Error = new Error
			{
				Code = NewsAPI.Constants.ErrorCodes.UnexpectedError,
				Message = ex.Message
			};
		}

		return result;
	}
	public async Task<int> GetNewsCountInLast24HoursAsync()
	{
		try
		{
			// Get the current time (UTC now)
			DateTime now = DateTime.UtcNow;
			DateTime twentyFourHoursAgo = now.AddHours(-24);

			// Open the database connection
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// SQL query to count stories created in the last 24 hours
			string checkSql = $@"
        SELECT COUNT(*) 
        FROM news_headlines 
        WHERE saved_at BETWEEN @startTime AND @endTime;";

			// Prepare and execute the command
			await using var cmd = new MySqlCommand(checkSql, conn);
			cmd.Parameters.AddWithValue("@startTime", twentyFourHoursAgo);
			cmd.Parameters.AddWithValue("@endTime", now);

			// Execute the query and get the result
			var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());

			// Log if necessary
			//await _log.Db($"Found {count} articles in the last 24 hours", null, "NEWSSERVICE", true);

			// Return the count
			return count;
		}
		catch (Exception ex)
		{
			// Log any errors
			await _log.Db($"Error retrieving story count: {ex.Message}", null, "NEWSSERVICE", true);
			return 0; // Return 0 in case of an error
		}
	}
}
