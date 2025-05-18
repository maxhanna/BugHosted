using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Top;
using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using SixLabors.ImageSharp;
using System.Data;
using System.Diagnostics;
using System.Net;
using System.Xml.Linq;
using Xabe.FFmpeg;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class TopController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
	 
		public TopController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";  
		}

		[HttpPost("/Top/GetTop", Name = "GetTop")]
		public async Task<IActionResult> GetTopEntries([FromBody] Topic[]? request)
		{
			var entries = new List<dynamic>();

			try
			{
				using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				string sql = @"SELECT id, entry, category, url, user_id, created_at
                       FROM maxhanna.top_entries";

				using MySqlCommand cmd = new MySqlCommand(sql, conn);

				if (request != null && request.Length > 0)
				{
					// Create a parameter for each topic and build the LIKE conditions
					var likeConditions = new List<string>();
					for (int i = 0; i < request.Length; i++)
					{
						likeConditions.Add($"category LIKE @topic{i}");
						cmd.Parameters.AddWithValue($"@topic{i}", $"%{request[i]}%");
					}
					sql += " WHERE " + string.Join(" OR ", likeConditions);
				}

				sql += " ORDER BY created_at DESC";


				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						entries.Add(new
						{
							Id = reader.GetInt32(reader.GetOrdinal("id")),
							Entry = reader.GetString(reader.GetOrdinal("entry")),
							Category = reader.GetString(reader.GetOrdinal("category")),
							Url = reader.IsDBNull(reader.GetOrdinal("url")) ? null : reader.GetString(reader.GetOrdinal("url")),
							UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("user_id")),
							CreatedAt = reader.GetDateTime(reader.GetOrdinal("created_at"))
						});
					}
				}

				return Ok(entries);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while getting top entries: {ex.Message}", null, "FILE", true);
				return StatusCode(500, "An error occurred while getting top entries.");
			}
		} 

		[HttpPost("/Top/AddEntryToCategory/", Name = "AddEntryToCategory")]
		public async Task<IActionResult> AddEntryToCategory([FromBody] AddTopRequest req)
		{
			if (string.IsNullOrEmpty(req.Entry) || req.Topics == null || req.Topics.Length == 0)
			{
				return BadRequest("Entry and Category are required fields.");
			}

			try
			{
				using MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				var topicNames = req.Topics
						   .Where(t => !string.IsNullOrEmpty(t.TopicText))
						   .Select(t => t.TopicText)
						   .ToArray();

				string sql = @"
					INSERT INTO maxhanna.top_entries (entry, category, url, user_id)
					VALUES (@entry, @category, @url, @userId)";

				using MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@entry", req.Entry);
				cmd.Parameters.AddWithValue("@category", string.Join(", ", topicNames));
				cmd.Parameters.AddWithValue("@url", req.Url ?? (object)DBNull.Value);
				cmd.Parameters.AddWithValue("@userId", req.UserId ?? (object)DBNull.Value);

				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				if (rowsAffected > 0)
				{
					return Ok(new { success = true, message = "Entry added successfully." });
				}
				else
				{
					return StatusCode(500, "Failed to add entry.");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while adding entry to category: " + ex.Message, null, "FILE", true);
				return StatusCode(500, "An error occurred while adding entry to category.");
			}
		}

	}
}
