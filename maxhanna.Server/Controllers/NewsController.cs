using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Weather;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using maxhanna.Server.Controllers.DataContracts.News;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class NewsController : ControllerBase
	{
		// Simple in-memory cache for coin counts to avoid repeated heavy SQL runs
		private static readonly object _coinCountsCacheLock = new object();
		private static DateTime? _coinCountsCacheTime = null;
		private static object? _coinCountsCache = null;
		private const int CoinCountsCacheSeconds = 10800; // TTL for coin counts cache
		private readonly Log _log;
		private readonly NewsService _newsService;
		private readonly IConfiguration _config;

		public NewsController(Log log, IConfiguration config, NewsService newsService)
		{
			_log = log;
			_config = config;
			_newsService = newsService;
		}

		[HttpPost(Name = "GetAllNews")]
		public async Task<ArticlesResult> GetAllNews(
		[FromQuery] string? q,
		[FromQuery] int page = 1,
		[FromQuery] int pageSize = 50)
		{
			try
			{
				if (q != null)
				{
					return await _newsService.GetArticlesFromDb(q, null, page, pageSize);
				}
				else
				{
					return await _newsService.GetArticlesFromDb(null, null, page, pageSize);
				}
			}
			catch (Exception)
			{
				return new ArticlesResult();
			}
		}

		[HttpPost("/News/GetDefaultSearch", Name = "GetDefaultSearch")]
		public async Task<IActionResult> GetDefaultSearch([FromBody] int UserId)
		{
			string defaultSearch = "";

			try
			{
				string sql = "SELECT default_search FROM maxhanna.user_default_search WHERE user_id = @user_id LIMIT 1;";

				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					using (var cmd = new MySqlCommand(sql, connection))
					{
						cmd.Parameters.AddWithValue("@user_id", UserId);
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								defaultSearch = reader["default_search"]?.ToString() ?? "";
							}
						}
					}
				}

				if (string.IsNullOrEmpty(defaultSearch))
				{
					return NotFound("No default search found for this user.");
				}

				return Ok(defaultSearch);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error retrieving default search: {ex.Message}", UserId, "NEWS", true);
				return StatusCode(500, "An error occurred while retrieving the default search.");
			}
		}

		[HttpPost("/News/SaveDefaultSearch", Name = "SaveDefaultSearch")]
		public async Task<IActionResult> SaveDefaultSearch([FromBody] SaveDefaultSearchRequest request)
		{
			try
			{
				string sql = @"
					INSERT INTO maxhanna.user_default_search (user_id, default_search)
					VALUES (@user_id, @default_search)
					ON DUPLICATE KEY UPDATE default_search = VALUES(default_search);";

				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					using (var cmd = new MySqlCommand(sql, connection))
					{
						cmd.Parameters.AddWithValue("@user_id", request.UserId);
						cmd.Parameters.AddWithValue("@default_search", request.Search);
						await cmd.ExecuteNonQueryAsync();
					}
				}

				return Ok("Saved default search.");
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error saving default search: {ex.Message}", request.UserId, "NEWS", true);
				return StatusCode(500, "An error occurred while saving the default search.");
			}
		}
		
        [HttpGet("negative-today")]
        public async Task<IActionResult> GetNegativeToday()
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

				// Find latest sentiment row for today (use UTC_DATE because recorded_at is saved with UTC_TIMESTAMP)
				string sql = @"SELECT article_ids FROM news_sentiment_score WHERE DATE(recorded_at) = UTC_DATE() ORDER BY recorded_at DESC LIMIT 1;";
                using var cmd = new MySqlCommand(sql, conn);
                var obj = await cmd.ExecuteScalarAsync();
                if (obj == null || obj == DBNull.Value) return Ok(new List<Article>());

				var json = obj as string;
				if (string.IsNullOrWhiteSpace(json)) return Ok(new List<Article>());

				var ids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(json) ?? new List<int>();

				if (ids.Count == 0) return Ok(new List<Article>());

                string inClause = string.Join(',', ids);
                string fetchSql = $@"SELECT id as Id, title, description, url, published_at, url_to_image, content, author FROM news_headlines WHERE id IN ({inClause});";
                using var fetchCmd = new MySqlCommand(fetchSql, conn);
                using var reader = await fetchCmd.ExecuteReaderAsync();
                var list = new List<Article>();
                while (await reader.ReadAsync())
                {
                    list.Add(new Article
                    {
                        Title = reader["title"]?.ToString(),
                        Description = reader["description"]?.ToString(),
                        Url = reader["url"]?.ToString(),
                        PublishedAt = reader["published_at"] as DateTime?,
                        UrlToImage = reader["url_to_image"]?.ToString(),
                        Content = reader["content"]?.ToString(),
                        Author = reader["author"]?.ToString()
                    });
                }
                return Ok(list);
            }
            catch (Exception ex)
            {
                await _log.Db($"NewsController.GetNegativeToday failed: {ex.Message}", null, "API", true);
                return StatusCode(500);
            }
        }

		[HttpGet("negative-today-preview")]
		public async Task<IActionResult> GetNegativeTodayPreview([FromQuery] int limit = 5)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				string sql = @"SELECT article_ids FROM news_sentiment_score WHERE DATE(recorded_at) = UTC_DATE() ORDER BY recorded_at DESC LIMIT 1;";
				using var cmd = new MySqlCommand(sql, conn);
				var obj = await cmd.ExecuteScalarAsync();
				if (obj == null || obj == DBNull.Value) return Ok(new List<object>());

				var json = obj as string;
				if (string.IsNullOrWhiteSpace(json)) return Ok(new List<object>());

				var ids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(json) ?? new List<int>();
				if (ids.Count == 0) return Ok(new List<object>());

				string inClause = string.Join(',', ids);
				string fetchSql = $@"SELECT id as Id, title, url, published_at, url_to_image, description FROM news_headlines WHERE id IN ({inClause}) ORDER BY FIELD(id, {inClause}) LIMIT @limit;";
				using var fetchCmd = new MySqlCommand(fetchSql, conn);
				fetchCmd.Parameters.AddWithValue("@limit", limit);
				using var reader = await fetchCmd.ExecuteReaderAsync();
				var list = new List<object>();
				while (await reader.ReadAsync())
				{
					list.Add(new {
						title = reader["title"]?.ToString(),
						url = reader["url"]?.ToString(),
						publishedAt = reader["published_at"] as DateTime?,
						urlToImage = reader["url_to_image"]?.ToString(),
						description = reader["description"]?.ToString()
					});
				}
				// total negative count is the number of ids we had
				var total = ids.Count;
				return Ok(new { total = total, articles = list });
			}
			catch (Exception ex)
			{
				await _log.Db($"NewsController.GetNegativeTodayPreview failed: {ex.Message}", null, "API", true);
				return StatusCode(500);
			}
		}

        [HttpGet("crypto-today")]
        public async Task<IActionResult> GetCryptoToday()
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

				// Keyword match on content/title/description using explicit boundary regexes to avoid substring matches
				string sql = @"SELECT id as Id, title, description, url, published_at, url_to_image, content, author
							   FROM news_headlines
							   WHERE (
								   LOWER(title) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)'
								   )
							   ORDER BY saved_at DESC LIMIT 200;";
                using var cmd = new MySqlCommand(sql, conn);
                using var reader = await cmd.ExecuteReaderAsync();
                var list = new List<Article>();
                while (await reader.ReadAsync())
                {
                    list.Add(new Article
                    {
                        Title = reader["title"]?.ToString(),
                        Description = reader["description"]?.ToString(),
                        Url = reader["url"]?.ToString(),
                        PublishedAt = reader["published_at"] as DateTime?,
                        UrlToImage = reader["url_to_image"]?.ToString(),
                        Content = reader["content"]?.ToString(),
                        Author = reader["author"]?.ToString()
                    });
                }
                return Ok(list);
            }
            catch (Exception ex)
            {
                await _log.Db($"NewsController.GetCryptoToday failed: {ex.Message}", null, "API", true);
                return StatusCode(500);
            }
        }

		[HttpGet("crypto-today-preview")]
		public async Task<IActionResult> GetCryptoTodayPreview([FromQuery] int limit = 5)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				string sql = @"SELECT id as Id, title, description, url, published_at, url_to_image
							   FROM news_headlines
							   WHERE (
								   LOWER(title) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)'
								   )
							   ORDER BY saved_at DESC LIMIT @limit;";

				using var cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@limit", limit);
				using var reader = await cmd.ExecuteReaderAsync();
				var list = new List<object>();
				while (await reader.ReadAsync())
				{
					list.Add(new {
						title = reader["title"]?.ToString(),
						url = reader["url"]?.ToString(),
						publishedAt = reader["published_at"] as DateTime?,
						urlToImage = reader["url_to_image"]?.ToString(),
						description = reader["description"]?.ToString()
					});
				}
				// compute total count for crypto articles using same WHERE predicate (cheap count)
				string countSql = @"SELECT COUNT(*) FROM news_headlines WHERE (
								   LOWER(title) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])btc([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])crypto([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])solana([^-a-z0-9]|$)'
								   OR LOWER(title) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)'
								   );";
				using var countCmd = new MySqlCommand(countSql, conn);
				var totalObj = await countCmd.ExecuteScalarAsync();
				var total = Convert.ToInt32(totalObj ?? 0);
				return Ok(new { total = total, articles = list });
			}
			catch (Exception ex)
			{
				await _log.Db($"NewsController.GetCryptoTodayPreview failed: {ex.Message}", null, "API", true);
				return StatusCode(500);
			}
		}

		[HttpGet("coin")]
		public async Task<IActionResult> GetArticlesByCoin([FromQuery] string coin)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(coin)) return BadRequest("coin is required");

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// map coin to search tokens using explicit regex boundaries to avoid POSIX/ICU incompatibilities
				var tokenSql = coin.ToLowerInvariant() switch
				{
					var c when c.Contains("ethereum") || c == "ethereum" || c == "eth" =>
						"(LOWER(title) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(title) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)')",
					var c when c.Contains("doge") || c == "dogecoin" =>
						"(LOWER(title) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)')",
					var c when c.Contains("xrp") =>
						"(LOWER(title) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)')",
					var c when c.Contains("sol") || c.Contains("solana") =>
						"(LOWER(title) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(title) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)')",
					_ => null
				};

				if (tokenSql == null) return Ok(new List<Article>());

				string sql = $@"SELECT id as Id, title, description, url, published_at, url_to_image, content, author
							   FROM news_headlines
							   WHERE {tokenSql}
							   ORDER BY saved_at DESC LIMIT 200;";
				using var cmd = new MySqlCommand(sql, conn);
				using var reader = await cmd.ExecuteReaderAsync();
				var list = new List<Article>();
				while (await reader.ReadAsync())
				{
					list.Add(new Article
					{
						Title = reader["title"]?.ToString(),
						Description = reader["description"]?.ToString(),
						Url = reader["url"]?.ToString(),
						PublishedAt = reader["published_at"] as DateTime?,
						UrlToImage = reader["url_to_image"]?.ToString(),
						Content = reader["content"]?.ToString(),
						Author = reader["author"]?.ToString()
					});
				}
				return Ok(list);
			}
			catch (Exception ex)
			{
				await _log.Db($"NewsController.GetArticlesByCoin failed: {ex.Message}", null, "API", true);
				return StatusCode(500);
			}
		}

		[HttpGet("coin-counts")]
		public async Task<IActionResult> GetCoinCounts()
		{
			try
			{
				// Check cache first
				lock (_coinCountsCacheLock)
				{
					if (_coinCountsCache != null && _coinCountsCacheTime.HasValue)
					{
						var age = DateTime.UtcNow - _coinCountsCacheTime.Value;
						if (age.TotalSeconds <= CoinCountsCacheSeconds)
						{
							return Ok(_coinCountsCache);
						}
					}
				}

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				string sql = @"
					SELECT
						SUM(CASE WHEN (LOWER(title) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])eth([^a-z0-9]|$)' OR LOWER(title) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])ethereum([^a-z0-9]|$)') THEN 1 ELSE 0 END) AS Ethereum,
						SUM(CASE WHEN (LOWER(title) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])doge(coin)?([^a-z0-9]|$)') THEN 1 ELSE 0 END) AS Dogecoin,
						SUM(CASE WHEN (LOWER(title) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])xrp([^a-z0-9]|$)') THEN 1 ELSE 0 END) AS XRP,
						SUM(CASE WHEN (LOWER(title) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])sol([^a-z0-9]|$)' OR LOWER(title) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(content) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)' OR LOWER(description) REGEXP '(^|[^a-z0-9])solana([^a-z0-9]|$)') THEN 1 ELSE 0 END) AS Solana
					FROM news_headlines;";

				using var cmd = new MySqlCommand(sql, conn);
				using var reader = await cmd.ExecuteReaderAsync();
				if (await reader.ReadAsync())
				{
					var eth = Convert.ToInt32(reader["Ethereum"] ?? 0);
					var doge = Convert.ToInt32(reader["Dogecoin"] ?? 0);
					var xrp = Convert.ToInt32(reader["XRP"] ?? 0);
					var sol = Convert.ToInt32(reader["Solana"] ?? 0);

					var obj = new { Ethereum = eth, Dogecoin = doge, XRP = xrp, Solana = sol };
					lock (_coinCountsCacheLock)
					{
						_coinCountsCache = obj;
						_coinCountsCacheTime = DateTime.UtcNow;
					}

					return Ok(obj);
				}

				var emptyObj = new { Ethereum = 0, Dogecoin = 0, XRP = 0, Solana = 0 };
				lock (_coinCountsCacheLock)
				{
					_coinCountsCache = emptyObj;
					_coinCountsCacheTime = DateTime.UtcNow;
				}

				return Ok(emptyObj);
			}
			catch (Exception ex)
			{
				await _log.Db($"NewsController.GetCoinCounts failed: {ex.Message}", null, "API", true);
				return StatusCode(500);
			}
		}

		[HttpGet("count")]
		public async Task<IActionResult> GetNewsCount()
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				string sql = "SELECT COUNT(1) FROM news_headlines;";
				using var cmd = new MySqlCommand(sql, conn);
				var obj = await cmd.ExecuteScalarAsync();
				var count = Convert.ToInt32(obj ?? 0);
				return Ok(new { count });
			}
			catch (Exception ex)
			{
				await _log.Db($"NewsController.GetNewsCount failed: {ex.Message}", null, "API", true);
				return Ok(new { count = 0 });
			}
		}
	}
}
