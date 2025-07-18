﻿using NewsAPI.Constants;
using NewsAPI.Models;
using NewsAPI;
using MySqlConnector;
using System.Text.RegularExpressions;
using System.Text;

public class NewsService
{ 
	private readonly IConfiguration _config;
	private readonly Log _log;
	private static readonly HashSet<string> Stopwords = new(StringComparer.OrdinalIgnoreCase)
	{
		"the", "and", "a", "an", "of", "to", "in", "for", "on", "with", "at", "by", "from", "up",
		"about", "as", "into", "like", "through", "after", "over", "between", "out", "against",
		"during", "without", "before", "under", "around", "among", "is", "are", "was", "were", "be",
		"has", "had", "have", "it", "this", "that", "these", "those", "you", "i", "he", "she", "they",
		"we", "but", "or", "so", "if", "because", "while", "just", "not", "no", "yes", "his", "her",
		"them", "my", "your", "its", "their", "our", "me", "him", "us", "them", "who", "whom", "which",
		"what", "where", "when", "why", "how", "all", "any", "some", "many", "much", "more", "most",
		"few", "fewer", "least", "less", "such", "same", "other", "another", "each", "every", "either",
		"neither", "both", "one", "two", "three", "first", "second", "third", "last", "next", "previous",
		"then", "now", "there", "here", "wherever", "whenever", "however", "therefore", "thus", "hence",
		"although", "though", "even", "unless", "until", "whereas", "despite", "new", "old", "long", "short",
		"big", "small", "large", "high", "low", "good", "bad", "right", "wrong", "true", "false", "same",
		"different", "important", "interesting", "difficult", "easy", "quick", "slow", "happy", "sad",
		"angry", "surprised", "excited", "bored", "tired", "scared", "worried", "confused", "relaxed", "calm",
		"ready", "willing", "able", "likely", "unlikely", "possible", "impossible", "necessary", "unnecessary",
		"available", "unavailable", "useful", "useless", "helpful", "harmful", "safe", "unsafe", "healthy",
		"unhealthy", "rich", "poor", "famous", "unknown", "popular", "unpopular", "beautiful", "ugly", "clean",
		"dirty", "clear", "unclear", "simple", "complex", "normal", "abnormal", "usual", "unusual", "common",
	};
	private static readonly HashSet<string> NegativeKeywordsForCryptoArticles = new(StringComparer.OrdinalIgnoreCase)
	{
		"nba", "nfl", "mlb", "nhl", "fifa", "uefa", "espn", "sports", "sport", "athlete", "athletics",
		"basketball", "football", "baseball", "hockey", "soccer", "tennis", "golf", "cricket", "rugby",
		"olympics", "playoffs", "tournament", "championship", "match", "game", "player", "team", "coach",
		"referee", "stadium", "arena", "score", "win", "loss", "victory", "defeat", "draft", "transfer",
		"contract", "salary", "injury", "foul", "penalty", "goal", "assist", "mvp", "all-star", "final",

		// Entertainment & Celebrities
		"movie", "film", "actor", "actress", "hollywood", "oscar", "emmy", "grammy", "award", "celebrity",
		"tv", "television", "series", "netflix", "disney", "hbo", "amazon prime", "streaming", "youtube",
		"music", "song", "album", "artist", "band", "concert", "tour", "billboard", "spotify", "tiktok",
		"instagram", "social media", "influencer", "viral", "trending", "famous", "red carpet", "gossip",
		"rumor", "scandal", "divorce", "marriage", "engagement", "birth", "death", "obituary", "biography",

		// Politics & World News
		"politics", "politician", "election", "president", "prime minister", "congress", "senate", "parliament",
		"government", "law", "bill", "policy", "tax", "economy", "trade", "sanction", "embargo", "treaty",
		"war", "conflict", "military", "army", "navy", "air force", "nato", "un", "united nations", "who",
		"european union", "brexit", "immigration", "refugee", "border", "security", "terrorism", "cyberattack",
		"hacking", "espionage", "diplomacy", "summit", "meeting", "negotiation", "protest", "riot", "strike",
		"scandal", "corruption", "investigation", "court", "judge", "verdict", "trial", "lawsuit", "crime",
		"police", "arrest", "murder", "shooting",

		// General Non-Crypto News
		"weather", "forecast", "hurricane", "earthquake", "flood", "fire", "disaster", "accident", "crash",
		"plane", "airplane", "flight", "train", "car", "vehicle", "traffic", "road", "bridge", "construction",
		"health", "medical", "doctor", "hospital", "disease", "virus", "covid", "pandemic", "vaccine", "medicine",
		"science", "research", "study", "discovery", "invention", "space", "nasa", "rocket", "mars", "moon",
		"alien", "ufo", "technology", "ai", "artificial intelligence", "robot", "machine learning", "quantum",
		"gadget", "smartphone", "laptop", "computer", "software", "hardware", "internet", "website", "app",
		"business", "company", "startup", "merger", "acquisition", "ceo", "founder", "investor", "stock",
		"market", "finance", "bank", "loan", "mortgage", "interest", "inflation", "recession", "unemployment",
		"job", "hire", "layoff", "salary", "wage", "union", "strike", "protest", "consumer", "product", "brand",
		"advertising", "marketing", "sales", "retail", "amazon", "walmart", "tesla", "apple", "google", "meta",
		"microsoft", "netflix", "disney", "sony", "nintendo", "playstation", "xbox", "gaming", "esports", "twitch",

		// Miscellaneous
		"food", "restaurant", "recipe", "cooking", "chef", "meal", "diet", "nutrition", "fitness", "gym",
		"exercise", "weight", "muscle", "health", "wellness", "travel", "tourism", "vacation", "hotel", "flight",
		"airline", "destination", "beach", "mountain", "city", "country", "culture", "tradition", "festival",
		"holiday", "christmas", "new year", "easter", "halloween", "thanksgiving", "valentine", "birthday",
		"wedding", "anniversary", "party", "celebration", "event", "concert", "festival", "exhibition", "museum",
		"art", "painting", "sculpture", "photography", "design", "fashion", "clothing", "shoes", "jewelry",
	};
	private static readonly HashSet<string> CryptoKeywords = new(StringComparer.OrdinalIgnoreCase)
	{
		"bitcoin", "btc", "ethereum", "eth", "tether", "usdt", "xrp", "bnb", "solana", "sol", "cardano", "ada", "dogecoin", "doge",
		"polkadot", "dot", "litecoin", "ltc", "tron", "trx", "monero", "xmr", "avalanche", "avax", "stellar", "xlm", "vechain", "vet",
		"chainlink", "aptos",   "arbitrum", "arb", "optimism",   "rndr", "sui", "algorand", "algo",
		"coinbase", "binance", "kraken", "bitfinex", "gemini", "huobi", "okx", "bitstamp", "kucoin", "crypto.com", "bybit", "mexc",
		"bitmart", "upbit", "bittrex", "probit", "gate.io", "poloniex", "wallet", "cold wallet", "hot wallet", "hardware wallet",
		"metamask", "trust wallet", "private key", "public key", "day trading", "forex", "margin trading", "leverage",
		"long position", "short position", "stop loss", "take profit", "trading bot", "pump and dump",
		"candlestick", "bullish", "bearish", "market cap", "volume", "liquidity", "blockchain", "ledger", "smart contract",
		"gas fees", "layer 1", "layer 2", "sharding", "rollups", "zk-rollup", "optimistic rollup", "sidechain", "consensus",
		"proof of work", "proof of stake", "pos", "pow", "staking", "validator", "mining", "miner", "hashrate", "hashing",
		"hashpower", "nonce", "node", "fork", "hard fork", "soft fork", "altcoin", "stablecoin", "shitcoin", "memecoin",
		"uniswap", "pancakeswap", "sushiswap", "aave",  "makerdao", "yearn finance", "curve", "balancer", "1inch",
		"polygon", "matic", "fantom", "ftm", "hedera", "hbar", "nft", "non-fungible token", "openSea", "sei", "phantom",
		"tron", "digital art", "bored ape", "crypto punk", "metaverse", "sandbox", "decentraland", "web3",
		"virtual land", "play to earn", "p2e", "axie infinity", "immutable x", "gamefi", "ledger", "trezor", "multisig",
		"2fa", "rugpull", "airdrop", "kyc", "aml", "regulation", "sec", "defi", "dapp", "dao",
		"downtime",  "cross-chain",  "digital currency",  "fiat currency", "central bank digital currency", "cbdc", "etf", "spot etf",
		"securities", "futures", "derivatives", "treasury bonds", "cryptocurrency", "crypto",
		"shiba inu", "shib", "pepe", "pepecoin", "floki", "floki inu", "bonk", "dogelon mars", "safemoon", "hoge", "wojak", 
		"wojak coin", "toshi", "base toshi", "turbo", "milady", "mog", "mog coin", 
		"wif", "dogwifhat", "bome", "book of meme", "tate", "andrew tate coin", "troll", "troll coin", "boden", "tremp", 
		"kishu inu", "kishu", "akita inu", "akita", "samoyedcoin", "samoyed", "babydoge", "baby doge", "smog", "smog token", 
		"myro", "myro coin", "popcat", "popcat coin", "coq", "coq inu", "honk", "honk token", "slerf", "slerf coin", "pol", "pol coin", 
		"meme", "meme coin", "fren", "fren coin", "anon", "anon coin", "chad", "chad coin", "viral", "viral coin", "degen", "degen coin", 
		"kek", "kek coin", "cummies", "cummies token", "lambo", "lambo coin", "hodl", "hodl coin", "wagmi", "wagmi coin", 
		"ngmi", "ngmi coin", "wen", "wen coin", "luna classic", "ustc", "terrausd classic",
		"scamcoin", "scam coin", "rug coin"
	};
	int newsServiceAccountNo = 308;
	int cryptoNewsServiceAccountNo = 309;
	int memeServiceAccountNo = 314;
	private const string MemeFolderPath = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Meme/";


	public NewsService(IConfiguration config, Log log)
	{
		_config = config;
		_log = log; 
	}
	public async Task<ArticlesResult?> GetTopHeadlines(string? keywords)
	{
		try
		{
			var newsApiClient = new NewsApiClient("f782cf1b4d3349dd86ef8d9ac53d0440");
			ArticlesResult? articlesResponse = new ArticlesResult();
			TopHeadlinesRequest hr = new TopHeadlinesRequest
			{
				Language = Languages.EN,
				Q = keywords 
			};
			articlesResponse = await newsApiClient.GetTopHeadlinesAsync(hr);

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
	public async Task<ArticlesResult?> GetTopCryptoHeadlines()
	{
		Console.WriteLine("Getting top crypto headlines");
		try
		{
			var newsApiClient = new NewsApiClient("f782cf1b4d3349dd86ef8d9ac53d0440"); 
			ArticlesResult? articlesResponse = await newsApiClient.GetTopHeadlinesAsync(new TopHeadlinesRequest
			{
				Language = Languages.EN, 
			});
			Console.WriteLine("Number of results: " + articlesResponse.Articles.Count);
			return articlesResponse;
			
		}
		catch (Exception ex)
		{
			_ = _log.Db("Exception GetTopCryptoHeadlines: " + ex.Message, null, "NEWSSERVICE", true);
			return null;
		} 
	}

	public async Task<bool> GetAndSaveTopQuarterHourlyHeadlines(string? keyword)
	{
		const int articlesToTake = 20;
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
					return false;
				}
			}

			var articlesResult = await GetTopHeadlines(keyword);

			if (articlesResult?.Status != Statuses.Ok || articlesResult.Articles == null)
			{
				await _log.Db("Failed to fetch top headlines", null, "NEWSSERVICE", false);
				return false;
			}

			var top20 = articlesResult.Articles.Take(articlesToTake).ToList();
			int successfullyInsertedCount = 0;
 
			using var transaction = await conn.BeginTransactionAsync();

			foreach (var article in top20)
			{
				try
				{
					string sql = @"
                    INSERT IGNORE INTO news_headlines 
                    (title, description, url, published_at, saved_at, url_to_image, content, author)
                    VALUES (@title, @description, @url, @published_at, UTC_TIMESTAMP(), @url_to_image, @content, @author);";

					using var cmd = new MySqlCommand(sql, conn, transaction);
					cmd.Parameters.AddWithValue("@title", article.Title ?? "");
					cmd.Parameters.AddWithValue("@description", article.Description ?? "");
					cmd.Parameters.AddWithValue("@url", article.Url ?? "");
					cmd.Parameters.AddWithValue("@published_at", article.PublishedAt ?? DateTime.UtcNow);
					cmd.Parameters.AddWithValue("@url_to_image", article.UrlToImage ?? "");
					cmd.Parameters.AddWithValue("@content", article.Content ?? "");
					cmd.Parameters.AddWithValue("@author", article.Author ?? "");

					int rowsAffected = await cmd.ExecuteNonQueryAsync(); 
					if (rowsAffected > 0)
					{
						successfullyInsertedCount++;
					}
				}
				catch (Exception ex)
				{
					// Log but continue with next article
					await _log.Db($"Failed to insert article (Title: {article.Title?.Substring(0, Math.Min(20, article.Title.Length))}...): {ex.Message}",
								 null, "NEWSSERVICE", false);
					continue;
				}
			}

			await transaction.CommitAsync();

			if (successfullyInsertedCount > 0)
			{
				await _log.Db($"Successfully saved {successfullyInsertedCount}/{articlesToTake} headlines{(keyword != null ? $" (keyword: {keyword})" : "")}",
							 null, "NEWSSERVICE", true);
				return true;
			}

			return false;
		}
		catch (Exception ex)
		{
			await _log.Db($"Critical error in GetAndSaveTopHeadlines: {ex.Message}", null, "NEWSSERVICE", true);
			return false;
		}
	}

	public async Task<ArticlesResult> GetArticlesFromDb(string? keywords = null, int? hours = null, int page = 1, int pageSize = 50)
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

			// Base SQL query with SQL_CALC_FOUND_ROWS
			var sql = new System.Text.StringBuilder(@"
            SELECT SQL_CALC_FOUND_ROWS 
                title, description, url, published_at, url_to_image, author, content, saved_at
            FROM news_headlines
            WHERE 1=1");

			using var cmd = new MySqlCommand("", conn);

			// Add keyword conditions if keywords are provided
			if (!string.IsNullOrWhiteSpace(keywords))
			{
				var searchTerms = keywords.Split(',')
					.Select(k => k.Trim())
					.Where(k => !string.IsNullOrEmpty(k))
					.ToList();

				if (searchTerms.Any())
				{
					var keywordConditions = new List<string>();
					for (int i = 0; i < searchTerms.Count; i++)
					{
						keywordConditions.Add($@"
                        (title LIKE CONCAT('%', @term{i}, '%')
                         OR description LIKE CONCAT('%', @term{i}, '%') 
                         OR content LIKE CONCAT('%', @term{i}, '%')
                         OR author LIKE CONCAT('%', @term{i}, '%')
                        )");
						cmd.Parameters.AddWithValue($"@term{i}", searchTerms[i]);
					}
					sql.Append(" AND (").Append(string.Join(" OR ", keywordConditions)).Append(")");
				}
			}

			// Add time filter if hours parameter has a value
			if (hours.HasValue)
			{
				sql.Append(" AND saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @hours HOUR)");
				cmd.Parameters.AddWithValue("@hours", hours.Value);
			}

			// Add pagination
			sql.Append($" ORDER BY saved_at DESC LIMIT {pageSize} OFFSET {(page - 1) * pageSize};");

			// Set the final command text
			cmd.CommandText = sql.ToString();

			// Execute the main query
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
						Name = reader["url"]?.ToString() ?? reader["author"]?.ToString(),
					},
					Author = reader["author"]?.ToString(),
					Content = reader["content"]?.ToString(),
					UrlToImage = reader["url_to_image"]?.ToString(),
				});
			}

			// Close the reader to allow the next query on the same connection
			await reader.CloseAsync();

			// Get total count using FOUND_ROWS()
			cmd.CommandText = "SELECT FOUND_ROWS() as total;";
			result.TotalResults = Convert.ToInt32(await cmd.ExecuteScalarAsync());
		}
		catch (Exception ex)
		{
			await _log.Db($"Exception in GetArticlesFromDb (keywords: {keywords}, hours: {hours}): {ex.Message}", null, "NEWSSERVICE", true);
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
				return;
			}

			var topArticlesResult = await GetArticlesFromDb(null, 24);
			if (topArticlesResult?.Articles == null || topArticlesResult.Articles.Count == 0)
			{
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
            AND story_text LIKE CONCAT('%', @marker, '%');";

			if (await CheckIfDailyNewsStoryAlreadyExists(conn, transaction, marker, checkSql))
			{
				await _log.Db("Daily news story already exists. Skipping creation.", null, "NEWSSERVICE");
				return;
			}

			// Build the story text and tokenize the descriptions of top articles
			var sb = new StringBuilder();
			sb.AppendLine(marker);

			List<(Article Article, List<string> Tokens)> articleTokenMap;
			string mostFrequentWord = GetMostFrequentWord(topArticlesResult, out articleTokenMap);
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
			// Insert the story into the 'stories' table (for the news service account)
			await CreateNewsPosts(conn, transaction, fullStoryText, selectedArticleTokens, newsServiceAccountNo);
			await _log.Db("Daily news story created successfully on both service account and user profile.", null, "NEWSSERVICE");
		}
		catch (Exception ex)
		{
			await _log.Db("Error in CreateDailyNewsStoryAsync: " + ex.Message, null, "NEWSSERVICE", true);
		}
	}

	private async Task CreateNewsPosts(MySqlConnection conn, MySqlTransaction transaction, string fullStoryText, List<string> selectedArticleTokens, int accountId)
	{
		string insertSql = @"
            INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
            VALUES (@userId, @storyText, NULL, NULL, NULL, UTC_TIMESTAMP());
        ";

		await using var insertCmd = new MySqlCommand(insertSql, conn, transaction);
		insertCmd.Parameters.AddWithValue("@userId", accountId);
		insertCmd.Parameters.AddWithValue("@storyText", fullStoryText);
		await insertCmd.ExecuteNonQueryAsync();

		// Get the last inserted story ID
		string getLastStoryIdSql = "SELECT LAST_INSERT_ID();";
		int storyId = Convert.ToInt32(await new MySqlCommand(getLastStoryIdSql, conn, transaction).ExecuteScalarAsync());

		// Now, find the best matching file from the `file_uploads` table
		int? bestFileMatch = await FindBestMatchingFileAsync(selectedArticleTokens, conn, transaction);
		string insertStoryFileSql = @"
                INSERT INTO story_files (story_id, file_id)
                VALUES (@storyId, @fileId);

				INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, (SELECT id FROM maxhanna.topics WHERE topic = 'News'));
            ";
		if (accountId == cryptoNewsServiceAccountNo) {
			insertStoryFileSql += " INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, (SELECT id FROM maxhanna.topics WHERE topic = 'Crypto'));";
		}
		if (bestFileMatch != null)
		{
			await using var storyFileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
			storyFileCmd.Parameters.AddWithValue("@storyId", storyId);
			storyFileCmd.Parameters.AddWithValue("@fileId", bestFileMatch.Value);
			await storyFileCmd.ExecuteNonQueryAsync();
		}

		// POST THE SAME STORY TO NEWS USER PROFILE
		string insertUserProfileSql = @"
            INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
            VALUES (@userId, @storyText, @profileUserId, NULL, NULL, UTC_TIMESTAMP());
        ";

		await using var userProfileCmd = new MySqlCommand(insertUserProfileSql, conn, transaction);
		userProfileCmd.Parameters.AddWithValue("@userId", accountId);
		userProfileCmd.Parameters.AddWithValue("@storyText", fullStoryText);
		userProfileCmd.Parameters.AddWithValue("@profileUserId", accountId); // Assuming you have newsUserId defined
		await userProfileCmd.ExecuteNonQueryAsync();

		// Get the last inserted story ID for user profile
		int userProfileStoryId = Convert.ToInt32(await new MySqlCommand(getLastStoryIdSql, conn, transaction).ExecuteScalarAsync());

		if (bestFileMatch != null)
		{
			// Link the same file to the user profile story
			await using var userProfileFileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
			userProfileFileCmd.Parameters.AddWithValue("@storyId", userProfileStoryId);
			userProfileFileCmd.Parameters.AddWithValue("@fileId", bestFileMatch.Value);
			await userProfileFileCmd.ExecuteNonQueryAsync();
		}

		await transaction.CommitAsync();
	}

	public async Task PostDailyMemeAsync()
	{
		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var transaction = await conn.BeginTransactionAsync();

			// Check if we already posted a meme today
			if (await HasPostedMemeTodayAsync(conn, transaction))
			{
				await _log.Db("Already posted a meme today. Skipping.", null, "MEMESERVICE");
				await transaction.RollbackAsync();
				return;
			}

			// Get today's most popular meme
			var topMeme = await GetMostPopularMemeTodayAsync(conn, transaction);

			if (topMeme == null)
			{
				await _log.Db("No memes uploaded today to post.", null, "MEMESERVICE");
				await transaction.RollbackAsync();
				return;
			}

			// Create the story text
			var storyText = $@"📢 [b]Top Daily Meme![/b]
<a href='https://bughosted.com/Memes/{topMeme.Id}'>https://bughosted.com/Memes/{topMeme.Id}</a>
Posted by user @{topMeme.Username}<br><small>Daily top memes are selected based on highest number of comments and reactions.</small>";

			// Insert the story
			await InsertMemeStoryAsync(conn, transaction, storyText, topMeme.Id, memeServiceAccountNo);
			await InsertMemeStoryAsync(conn, transaction, storyText, topMeme.Id, null);

			await transaction.CommitAsync();
			await _log.Db($"Successfully posted daily meme: {topMeme.FileName}", null, "MEMESERVICE");
		}
		catch (Exception ex)
		{
			await _log.Db($"Error in PostDailyMemeAsync: {ex.Message}", null, "MEMESERVICE", true);
		}
	}

	private async Task<bool> HasPostedMemeTodayAsync(MySqlConnection conn, MySqlTransaction transaction)
	{
		const string sql = @"
            SELECT COUNT(*) FROM stories 
            WHERE user_id = @userId 
            AND DATE(date) = CURDATE() 
            AND story_text LIKE '%Daily Meme!%'";

		using var cmd = new MySqlCommand(sql, conn, transaction);
		cmd.Parameters.AddWithValue("@userId", memeServiceAccountNo);
		return (long?)await cmd.ExecuteScalarAsync() > 0;
	}

	private async Task<MemeInfo?> GetMostPopularMemeTodayAsync(MySqlConnection conn, MySqlTransaction transaction)
	{
		const string sql = @"
        SELECT 
            fu.id,
            fu.file_name,
            fu.given_file_name,
            fu.user_id,
            fuu.username,
            COUNT(DISTINCT c.id) AS comment_count,
            COUNT(DISTINCT r.id) AS reaction_count
        FROM file_uploads fu
        LEFT JOIN users fuu ON fuu.id = fu.user_id
        LEFT JOIN comments c ON c.file_id = fu.id
        LEFT JOIN reactions r ON r.file_id = fu.id
        WHERE 
            fu.folder_path = @folderPath 
            AND fu.is_folder = 0 
            AND fu.is_public = 1
            AND fu.id NOT IN (
                SELECT sf.file_id 
                FROM story_files sf
                JOIN stories s ON s.id = sf.story_id
                WHERE s.user_id = @serviceAccountId
                AND s.story_text LIKE '%Daily Meme%'
                ORDER BY s.date DESC 
            )
        GROUP BY fu.id, fu.file_name, fu.given_file_name, fu.user_id, fuu.username
        HAVING (COUNT(DISTINCT c.id) + COUNT(DISTINCT r.id)) > 0
        ORDER BY fu.upload_date DESC, (COUNT(DISTINCT c.id) + COUNT(DISTINCT r.id)) DESC
        LIMIT 1";

		using var cmd = new MySqlCommand(sql, conn, transaction);
		cmd.Parameters.AddWithValue("@folderPath", MemeFolderPath);
		cmd.Parameters.AddWithValue("@serviceAccountId", memeServiceAccountNo);

		using var reader = await cmd.ExecuteReaderAsync();
		if (await reader.ReadAsync())
		{
			return new MemeInfo
			{
				Id = reader.GetInt32(reader.GetOrdinal("id")),
				FileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? null : reader.GetString(reader.GetOrdinal("file_name")),
				GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString(reader.GetOrdinal("given_file_name")),
				UserId = reader.GetInt32(reader.GetOrdinal("user_id")),
				Username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString(reader.GetOrdinal("username")),
				CommentCount = reader.IsDBNull(reader.GetOrdinal("comment_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("comment_count")),
				ReactionCount = reader.IsDBNull(reader.GetOrdinal("reaction_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("reaction_count"))
			};
		}

		return null;
	}

	private async Task InsertMemeStoryAsync(MySqlConnection conn, MySqlTransaction transaction, string storyText, int fileId, int? profileUserId)
	{
		// Insert the main story
		const string insertStorySql = @"
            INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date)
            VALUES (@userId, @storyText, @profileUserId, NULL, NULL, UTC_TIMESTAMP());
            SELECT LAST_INSERT_ID();";

		using var storyCmd = new MySqlCommand(insertStorySql, conn, transaction);
		storyCmd.Parameters.AddWithValue("@userId", memeServiceAccountNo);
		storyCmd.Parameters.AddWithValue("@storyText", storyText);
		storyCmd.Parameters.AddWithValue("@profileUserId", profileUserId ?? (object)DBNull.Value);

		var storyId = Convert.ToInt32(await storyCmd.ExecuteScalarAsync());

		// Link the meme file to the story
		const string insertStoryFileSql = @"
            INSERT INTO story_files (story_id, file_id)
            VALUES (@storyId, @fileId);

            INSERT INTO story_topics (story_id, topic_id) 
            VALUES (@storyId, (SELECT id FROM topics WHERE topic = 'Meme'));";

		using var fileCmd = new MySqlCommand(insertStoryFileSql, conn, transaction);
		fileCmd.Parameters.AddWithValue("@storyId", storyId);
		fileCmd.Parameters.AddWithValue("@fileId", fileId);
		await fileCmd.ExecuteNonQueryAsync();
	}
	private string GetMostFrequentWord(ArticlesResult topArticlesResult, out List<(Article Article, List<string> Tokens)> articleTokenMap)
	{
		var tokenFrequency = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
		articleTokenMap = new List<(Article Article, List<string> Tokens)>();
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
		return tokenFrequency.OrderByDescending(kv => kv.Value).First().Key;
	}

	private async Task<bool> CheckIfDailyNewsStoryAlreadyExists(MySqlConnection conn, MySqlTransaction transaction, string marker, string checkSql)
	{
		await using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
		{
			checkCmd.Parameters.AddWithValue("@marker", marker);
			var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
			if (exists)
			{
				await _log.Db("Daily news story already exists. Skipping creation.", null, "NEWSSERVICE");
				await transaction.RollbackAsync();
				return true;
			}
		}
		return false;
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

		// Filter out empty tokens
		var validTokens = tokens.Where(t => !string.IsNullOrWhiteSpace(t)).ToList();
		if (validTokens.Count == 0)
			return null;

		// Build the dynamic SQL query
		var sql = new StringBuilder(@"
        SELECT 
            id,
            (
                IFNULL((
                    SELECT SUM(
                        CASE 
                            WHEN LOWER(file_name) LIKE CONCAT('%', LOWER(token), '%') THEN 1 
                            ELSE 0 
                        END
                    )
                    FROM (");

		// Add token parameters for file_name matching
		for (int i = 0; i < validTokens.Count; i++)
		{
			sql.Append(i == 0 ? "SELECT ? AS token" : " UNION SELECT ?");
		}

		sql.Append(@") AS tokens
                    WHERE token <> '' AND token IS NOT NULL
                ), 0) +
                IFNULL((
                    SELECT SUM(
                        CASE 
                            WHEN LOWER(given_file_name) LIKE CONCAT('%', LOWER(token), '%') THEN 1 
                            ELSE 0 
                        END
                    )
                    FROM (");

		// Add token parameters for given_file_name matching
		for (int i = 0; i < validTokens.Count; i++)
		{
			sql.Append(i == 0 ? "SELECT ? AS token" : " UNION SELECT ?");
		}

		sql.Append($@") AS tokens
                    WHERE token <> '' AND token IS NOT NULL
                ), 0)
            ) AS score
        FROM file_uploads
        WHERE is_folder = 0
        AND is_public = 1
        AND folder_path = '{MemeFolderPath}' 
        AND (file_name IS NOT NULL OR given_file_name IS NOT NULL) 
        AND file_type IN (
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico', 'heic', 'heif', 'raw', 'cr2', 'nef', 'orf', 'arw',
            'mp4', 'm4v', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv', 'mpeg', 'mpg', '3gp', '3g2', 'mts', 'm2ts', 'ts', 'vob', 'ogv'
        )
        HAVING score > 0
        ORDER BY score DESC
        LIMIT 1");

		await using var cmd = new MySqlCommand(sql.ToString(), conn, transaction);

		// Add parameters twice (once for file_name matching, once for given_file_name matching)
		foreach (var token in validTokens)
		{
			cmd.Parameters.AddWithValue("", token);
		}
		foreach (var token in validTokens)
		{
			cmd.Parameters.AddWithValue("", token);
		}

		var result = await cmd.ExecuteScalarAsync();
		return result != null ? (int?)Convert.ToInt32(result) : null;
	}

	public async Task CreateDailyCryptoNewsStoryAsync()
	{
		try
		{
			int numberOfArticles = await GetNewsCountInLast24HoursAsync();
			if (numberOfArticles < 50)
			{
				//	await _log.Db("Not enough articles saved yet.", null, "NEWSSERVICE", true); 
				return;
			}

			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			await using var transaction = await conn.BeginTransactionAsync();

			// Check if a social story already exists for today (user_id = {cryptoNewsServiceAccountNo}, contains marker text)
			string marker = "📰 [b]Crypto News Update![/b]";
			string checkSql = $@"
				SELECT COUNT(*) FROM stories
				WHERE user_id = {cryptoNewsServiceAccountNo} AND DATE(`date`) = CURDATE()
				AND story_text LIKE CONCAT('%', @marker, '%');
			";


			if (await CheckIfDailyNewsStoryAlreadyExists(conn, transaction, marker, checkSql))
			{
				await _log.Db("Daily crypto news story already exists. Skipping creation.", null, "NEWSSERVICE");
				return;
			}

			var topArticlesResult = await GetTopCryptoArticleAsync(1);
			if (topArticlesResult == null)
			{
				await _log.Db("No crypto articles to write a social story about", null, "NEWSSERVICE", true);
				return;
			}
			// Build story text from all articles
			var sb = new StringBuilder();
			sb.AppendLine(marker); 
			sb.AppendLine($"[*][b]{topArticlesResult.Title}[/b]\nRead more: {topArticlesResult.Url} [/*]");
		 

			string fullStoryText = sb.ToString().Trim();
			var selectedArticleTokens = TokenizeText(fullStoryText);
			// Insert the story into the 'stories' table (for the news service account)
			await CreateNewsPosts(conn, transaction, fullStoryText, selectedArticleTokens, cryptoNewsServiceAccountNo);
			await _log.Db("Daily crypto news story created successfully.", null, "NEWSSERVICE");
		}
		catch (Exception ex)
		{
			await _log.Db("Error in CreateDailyCryptoNewsStoryAsync: " + ex.Message, null, "NEWSSERVICE", true);
		}
	}
	public async Task<Article?> GetTopCryptoArticleAsync(int daysBack = 1)
	{
		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// Query to get potential candidates with some basic filtering
			string sql = @"
            SELECT 
                title, description, url, published_at, url_to_image, author, content, saved_at,
                LENGTH(content) as content_length,
                (CASE WHEN author IS NOT NULL AND author != '' THEN 1 ELSE 0 END) as has_author,
                (CASE WHEN url_to_image IS NOT NULL AND url_to_image != '' THEN 1 ELSE 0 END) as has_image
            FROM news_headlines
            WHERE saved_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @daysBack DAY)
            ORDER BY saved_at DESC
            LIMIT 100;  // Get a reasonable number to evaluate
        ";

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@daysBack", daysBack);
			using var reader = await cmd.ExecuteReaderAsync();

			var candidates = new List<(Article Article, int ContentLength, bool HasAuthor, bool HasImage)>();

			while (await reader.ReadAsync())
			{
				var article = new Article
				{
					Title = reader["title"]?.ToString(),
					Description = reader["description"]?.ToString(),
					Url = reader["url"]?.ToString(),
					PublishedAt = reader["published_at"] as DateTime?,
					Source = new Source { Id = "local-db", Name = "SavedHeadline" },
					Author = reader["author"]?.ToString(),
					Content = reader["content"]?.ToString(),
					UrlToImage = reader["url_to_image"]?.ToString()
				};

				if (article.PublishedAt == null) continue;

				candidates.Add((
					article,
					ContentLength: reader["content_length"] as int? ?? 0,
					HasAuthor: (reader["has_author"] as int? ?? 0) == 1,
					HasImage: (reader["has_image"] as int? ?? 0) == 1
				));
			}

			// Score and select the best article
			var scoredArticles = candidates.Select(candidate =>
			{
				var score = CalculateCryptoArticleScore(
					candidate.Article,
					candidate.ContentLength,
					candidate.HasAuthor,
					candidate.HasImage);
				return (Article: candidate.Article, Score: score);
			})
			.Where(x => x.Score > 0)  // Only consider articles with some crypto relevance
			.OrderByDescending(x => x.Score)
			.ToList();

			return scoredArticles.FirstOrDefault().Article;
		}
		catch (Exception ex)
		{
			await _log.Db("Exception in GetTopCryptoArticleAsync: " + ex.Message, null, "NEWSSERVICE", true);
			return null;
		}
	}

	private float CalculateCryptoArticleScore(Article article, int contentLength, bool hasAuthor, bool hasImage)
	{
		if (article.Title == null || article.Content == null)
			return 0;

		// Combine text fields for analysis
		string combinedText = $"{article.Title} {article.Description} {article.Content}".ToLower();

		// 1. Keyword relevance (more matches = higher score)
		var words = Regex.Matches(combinedText, @"\b[a-zA-Z0-9]+\b")
						.Select(m => m.Value.ToLowerInvariant())
						.ToHashSet();

		var keywordMatches = CryptoKeywords
			.Select(keyword => keyword.ToLowerInvariant())
			.Count(keyword =>
				words.Contains(keyword) ||
				words.Contains(keyword + "s") ||
				words.Contains(keyword + "es"));
		if (keywordMatches == 0)
			return 0;

		float keywordScore = keywordMatches * 2.0f;

		// 2. Content quality indicators
		float qualityScore = 0;

		// Longer content is generally better
		qualityScore += Math.Min(contentLength / 1000.0f, 5); // Max 5 points

		// Has author and image
		if (hasAuthor) qualityScore += 1;
		if (hasImage) qualityScore += 1;

		// 3. Title indicators (exclamation, question marks might indicate importance)
		if (article.Title.Contains("!")) qualityScore += 0.5f;
		if (article.Title.Contains("?")) qualityScore += 0.3f;

		// 4. Major keywords boost (Bitcoin, Ethereum, etc.)
		var majorKeywords = new[] { "bitcoin", "ethereum", "crypto", "cryptocurrency", "blockchain" };
		var majorMatches = majorKeywords.Count(k => words.Contains(k));
		float majorKeywordBoost = majorMatches * 3.0f;

		// 5. Negative indicators (reduce score for clickbait)
		float negativeScore = 0;
		var clickbaitWords = new[] { "secret", "shocking", "you won't believe", "this one trick" };
		if (clickbaitWords.Any(w => article.Title.ToLower().Contains(w)))
		{
			negativeScore -= 3.0f;
		}
		foreach (var negKeyword in NegativeKeywordsForCryptoArticles)
		{
			if (combinedText.Contains(negKeyword))
			{
				negativeScore -= 5.0f; // Heavy penalty for sports terms
				break;
			}
		}
		// 6. Recentness (newer articles get slightly higher score)
		float recentnessScore = 0;
		if (article.PublishedAt.HasValue)
		{
			var hoursOld = (DateTime.UtcNow - article.PublishedAt.Value).TotalHours;
			recentnessScore = (float)Math.Max(0, 5 - (hoursOld / 24.0)); // Up to 5 points for freshness
		}

		// Combine all scores
		float totalScore =
			keywordScore +
			qualityScore +
			majorKeywordBoost +
			negativeScore +
			recentnessScore;

		return totalScore;
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
	private class MemeInfo
	{
		public int Id { get; set; }
		public string? FileName { get; set; }
		public string? GivenFileName { get; set; }
		public int UserId { get; set; }
		public string? Username { get; set; }
		public int CommentCount { get; set; }
		public int ReactionCount { get; set; }
	}
}
