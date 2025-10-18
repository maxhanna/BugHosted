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

        [HttpGet("crypto-today")]
        public async Task<IActionResult> GetCryptoToday()
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

				// Simple keyword match on content/title/description for crypto keywords (include ETH, XRP, SOL, DOGE)
				string sql = @"SELECT id as Id, title, description, url, published_at, url_to_image, content, author
							   FROM news_headlines
							   WHERE (
								   LOWER(title) LIKE '%btc%' OR LOWER(content) LIKE '%btc%' OR LOWER(description) LIKE '%btc%'
								   OR LOWER(title) LIKE '%crypto%' OR LOWER(content) LIKE '%crypto%' OR LOWER(description) LIKE '%crypto%'
								   OR LOWER(title) LIKE '%eth%' OR LOWER(content) LIKE '%eth%' OR LOWER(description) LIKE '%eth%'
								   OR LOWER(title) LIKE '%ethereum%' OR LOWER(content) LIKE '%ethereum%' OR LOWER(description) LIKE '%ethereum%'
								   OR LOWER(title) LIKE '%xrp%' OR LOWER(content) LIKE '%xrp%' OR LOWER(description) LIKE '%xrp%'
								   OR LOWER(title) LIKE '%sol%' OR LOWER(content) LIKE '%sol%' OR LOWER(description) LIKE '%sol%'
								   OR LOWER(title) LIKE '%solana%' OR LOWER(content) LIKE '%solana%' OR LOWER(description) LIKE '%solana%'
								   OR LOWER(title) LIKE '%doge%' OR LOWER(content) LIKE '%doge%' OR LOWER(description) LIKE '%doge%'
								   OR LOWER(title) LIKE '%dogecoin%' OR LOWER(content) LIKE '%dogecoin%' OR LOWER(description) LIKE '%dogecoin%'
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

		[HttpGet("coin")]
		public async Task<IActionResult> GetArticlesByCoin([FromQuery] string coin)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(coin)) return BadRequest("coin is required");

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// map coin to search tokens using REGEXP with word-boundaries to avoid substring matches
				var tokenSql = coin.ToLowerInvariant() switch
				{
					var c when c.Contains("ethereum") || c == "ethereum" || c == "eth" =>
						"(LOWER(title) REGEXP '[[:<:]]eth[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]eth[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]eth[[:>:]]' OR LOWER(title) REGEXP '[[:<:]]ethereum[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]ethereum[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]ethereum[[:>:]]')",
					var c when c.Contains("doge") || c == "dogecoin" =>
						"(LOWER(title) REGEXP '[[:<:]]doge(coin)?[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]doge(coin)?[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]doge(coin)?[[:>:]]')",
					var c when c.Contains("xrp") =>
						"(LOWER(title) REGEXP '[[:<:]]xrp[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]xrp[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]xrp[[:>:]]')",
					var c when c.Contains("sol") || c.Contains("solana") =>
						"(LOWER(title) REGEXP '[[:<:]]sol[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]sol[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]sol[[:>:]]' OR LOWER(title) REGEXP '[[:<:]]solana[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]solana[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]solana[[:>:]]')",
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
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				string sql = @"
					SELECT
						SUM(CASE WHEN (LOWER(title) REGEXP '[[:<:]]eth[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]eth[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]eth[[:>:]]' OR LOWER(title) REGEXP '[[:<:]]ethereum[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]ethereum[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]ethereum[[:>:]]') THEN 1 ELSE 0 END) AS Ethereum,
						SUM(CASE WHEN (LOWER(title) REGEXP '[[:<:]]doge(coin)?[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]doge(coin)?[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]doge(coin)?[[:>:]]') THEN 1 ELSE 0 END) AS Dogecoin,
						SUM(CASE WHEN (LOWER(title) REGEXP '[[:<:]]xrp[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]xrp[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]xrp[[:>:]]') THEN 1 ELSE 0 END) AS XRP,
						SUM(CASE WHEN (LOWER(title) REGEXP '[[:<:]]sol[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]sol[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]sol[[:>:]]' OR LOWER(title) REGEXP '[[:<:]]solana[[:>:]]' OR LOWER(content) REGEXP '[[:<:]]solana[[:>:]]' OR LOWER(description) REGEXP '[[:<:]]solana[[:>:]]') THEN 1 ELSE 0 END) AS Solana
					FROM news_headlines;";

				using var cmd = new MySqlCommand(sql, conn);
				using var reader = await cmd.ExecuteReaderAsync();
				if (await reader.ReadAsync())
				{
					var eth = Convert.ToInt32(reader["Ethereum"] ?? 0);
					var doge = Convert.ToInt32(reader["Dogecoin"] ?? 0);
					var xrp = Convert.ToInt32(reader["XRP"] ?? 0);
					var sol = Convert.ToInt32(reader["Solana"] ?? 0);

					return Ok(new { Ethereum = eth, Dogecoin = doge, XRP = xrp, Solana = sol });
				}

				return Ok(new { Ethereum = 0, Dogecoin = 0, XRP = 0, Solana = 0 });
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
