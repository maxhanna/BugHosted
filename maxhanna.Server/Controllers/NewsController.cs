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

                // Simple keyword match on content/title/description for crypto keywords
                string sql = @"SELECT id as Id, title, description, url, published_at, url_to_image, content, author
                               FROM news_headlines
                               WHERE (LOWER(title) LIKE '%btc%' OR LOWER(content) LIKE '%crypto%' OR LOWER(description) LIKE '%crypto%')
                               ORDER BY saved_at DESC LIMIT 100;";
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
	}
}
