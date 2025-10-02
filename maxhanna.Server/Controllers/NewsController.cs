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
	}
}
