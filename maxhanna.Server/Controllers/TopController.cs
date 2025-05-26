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
			var entries = new List<TopEntry>();
			try
			{
				using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				string sql = @"
					SELECT te.id, te.entry, te.category, te.url, te.text, te.user_id, te.created_at, sr.image_url 
					FROM maxhanna.top_entries AS te 
					LEFT JOIN maxhanna.search_results AS sr ON LOWER(sr.url) = te.url ";

				var likeConditions = new List<string>();
				if (request != null && request.Length > 0)
				{
					for (int i = 0; i < request.Length; i++)
					{
						likeConditions.Add($"te.category LIKE @topic{i}");
					}
					sql += " WHERE " + string.Join(" AND ", likeConditions);
				}

				sql += " ORDER BY te.created_at DESC";

				using MySqlCommand cmd = new MySqlCommand(sql, conn);

				if (request != null && request.Length > 0)
				{
					for (int i = 0; i < request.Length; i++)
					{
						cmd.Parameters.AddWithValue($"@topic{i}", $"%{request[i].TopicText}%");
					}
				}

				var entryIds = new List<int>();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var entry = new TopEntry
						{
							Id = reader.GetInt32(reader.GetOrdinal("id")),
							Entry = reader.GetString(reader.GetOrdinal("entry")),
							Category = reader.GetString(reader.GetOrdinal("category")),
							Text = reader.IsDBNull(reader.GetOrdinal("text")) ? null : reader.GetString(reader.GetOrdinal("text")),
							Url = reader.IsDBNull(reader.GetOrdinal("url")) ? null : reader.GetString(reader.GetOrdinal("url")),
							ImgUrl = reader.IsDBNull(reader.GetOrdinal("image_url")) ? null : reader.GetString(reader.GetOrdinal("image_url")),
							UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("user_id")),
							CreatedAt = reader.GetDateTime(reader.GetOrdinal("created_at")),
							TotalVotes = 0,
							Upvotes = 0,
							Downvotes = 0
						};
						entryIds.Add(entry.Id);
						entries.Add(entry);
					}
				}

				if (entryIds.Count > 0)
				{
					var votesResponse = await GetVotes(entryIds.ToArray()) as OkObjectResult;
					if (votesResponse != null && votesResponse.Value is Dictionary<int, VoteData> votes)
					{
						foreach (var entry in entries)
						{
							if (votes.TryGetValue(entry.Id, out VoteData? voteData))
							{
								entry.TotalVotes = voteData.Total;
								entry.Upvotes = voteData.Upvotes;
								entry.Downvotes = voteData.Downvotes;
							}
						}
					}
				}

				entries = entries.OrderByDescending(e => e.Upvotes - e.Downvotes).ToList();
				return Ok(entries);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while getting top entries: {ex.Message}", null, "FILE", true);
				return StatusCode(500, "An error occurred while getting top entries.");
			}
		}

		[HttpPost("/Top/Vote", Name = "Vote")]
		public async Task<IActionResult> Vote([FromBody] VoteRequest request)
		{
			try
			{
				using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				// First check if vote exists
				string checkSql = @"
            SELECT vote_value 
            FROM maxhanna.top_entry_votes
            WHERE entry_id = @entryId AND user_id = @userId";

				using MySqlCommand checkCmd = new MySqlCommand(checkSql, conn);
				checkCmd.Parameters.AddWithValue("@entryId", request.EntryId);
				checkCmd.Parameters.AddWithValue("@userId", request.UserId);

				int? existingVote = null;
				using (var reader = await checkCmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						existingVote = reader.GetInt32("vote_value");
					}
				}

				string sql;
				if (existingVote.HasValue)
				{
					// If existing vote is same as new vote, remove it (toggle)
					if ((existingVote == 1 && request.IsUpvote) || (existingVote == -1 && !request.IsUpvote))
					{
						sql = "DELETE FROM maxhanna.top_entry_votes WHERE entry_id = @entryId AND user_id = @userId";
					}
					else
					{
						// Otherwise update to new vote value
						sql = "UPDATE maxhanna.top_entry_votes SET vote_value = @voteValue WHERE entry_id = @entryId AND user_id = @userId";
					}
				}
				else
				{
					// Insert new vote
					sql = "INSERT INTO maxhanna.top_entry_votes (entry_id, user_id, vote_value) VALUES (@entryId, @userId, @voteValue)";
				}

				using MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@entryId", request.EntryId);
				cmd.Parameters.AddWithValue("@userId", request.UserId);

				if (sql.Contains("@voteValue"))
				{
					cmd.Parameters.AddWithValue("@voteValue", request.IsUpvote ? 1 : -1);
				}

				await cmd.ExecuteNonQueryAsync();

				return Ok(new { success = true });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while processing vote: {ex.Message}", null, "FILE", true);
				return StatusCode(500, "An error occurred while processing vote.");
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
					INSERT INTO maxhanna.top_entries (entry, category, url, text, user_id, created_at)
					VALUES (@entry, @category, @url, @text, @userId, UTC_TIMESTAMP())";

				using MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@entry", req.Entry);
				cmd.Parameters.AddWithValue("@category", string.Join(", ", topicNames));
				cmd.Parameters.AddWithValue("@text", req.Text ?? (object)DBNull.Value);
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

		[HttpPost("/Top/EditTop/", Name = "EditTop")]
		public async Task<IActionResult> EditTop([FromBody] EditTopRequest req)
		{
			if (req.EntryId <= 0)
			{
				return BadRequest("Valid Entry ID is required.");
			}

			try
			{
				using MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// Check if entry exists
				var checkSql = $"SELECT COUNT(*) FROM maxhanna.top_entries WHERE id = {req.EntryId}";
				using (MySqlCommand checkCmd = new MySqlCommand(checkSql, conn))
				{
					var exists = (long?)await checkCmd.ExecuteScalarAsync();
					if (exists == 0)
					{
						return NotFound("Entry not found.");
					}
				}

				// Build update parts
				var updates = new List<string>();

				if (!string.IsNullOrEmpty(req.Title))
				{
					updates.Add($"entry = '{MySqlHelper.EscapeString(req.Title)}'");
				}
				if (!string.IsNullOrEmpty(req.Url))
				{
					updates.Add($"url = '{MySqlHelper.EscapeString(req.Url)}'");
				}
				if (req.Text != null) // Allow empty string
				{
					updates.Add($"text = {(string.IsNullOrEmpty(req.Text) ? "NULL" : $"'{MySqlHelper.EscapeString(req.Text)}'")}");
				}

				// If nothing to update
				if (updates.Count == 0)
				{
					return BadRequest("No fields to update.");
				}

				// Build final query
				var updateSql = $@"
            UPDATE maxhanna.top_entries 
            SET {string.Join(", ", updates)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = {req.EntryId}";

				using MySqlCommand cmd = new MySqlCommand(updateSql, conn);
				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				if (rowsAffected > 0)
				{
					return Ok(new { success = true, message = "Entry updated successfully." });
				}

				return StatusCode(500, "Failed to update entry.");
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while editing entry: {ex.Message}", null, "FILE", true);
				return StatusCode(500, "An error occurred while editing entry.");
			}
		}

		[HttpPost("/Top/GetVotes", Name = "GetVotes")]
		public async Task<IActionResult> GetVotes([FromBody] int[] entryIds)
		{
			try
			{
				using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				string sql = @$"
            SELECT 
                entry_id,
                SUM(vote_value) AS total_votes,
                COUNT(CASE WHEN vote_value = 1 THEN 1 END) AS upvotes,
                COUNT(CASE WHEN vote_value = -1 THEN 1 END) AS downvotes
            FROM maxhanna.top_entry_votes
					WHERE entry_id IN ( { string.Join(",", entryIds.Select((_, i) => $"@id{ i} ")) } ) 
					GROUP BY entry_id";
					
		using MySqlCommand cmd = new MySqlCommand(sql, conn);

				for (int i = 0; i < entryIds.Length; i++)
				{
					cmd.Parameters.AddWithValue($"@id{i}", entryIds[i]);
				}

				var votes = new Dictionary<int, VoteData>();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						votes.Add(reader.GetInt32("entry_id"), new VoteData
						{
							Total = reader.GetInt32("total_votes"),
							Upvotes = reader.GetInt32("upvotes"),
							Downvotes = reader.GetInt32("downvotes")
						});
					}
				}

				return Ok(votes);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while getting votes: {ex.Message}", null, "FILE", true);
				return StatusCode(500, "An error occurred while getting votes.");
			}
		}

		[HttpPost("/Top/GetUserVotes", Name = "GetUserVotes")]
		public async Task<IActionResult> GetUserVotes([FromBody] UserVoteRequest request)
		{
			try
			{
				using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				string sql = @"
					SELECT entry_id, vote_value 
					FROM maxhanna.top_entry_votes
					WHERE user_id = @userId AND entry_id IN (" +
					string.Join(",", request.EntryIds.Select((_, i) => $"@id{i}")) + ")";

				using MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@userId", request.UserId);

				for (int i = 0; i < request.EntryIds.Length; i++)
				{
					cmd.Parameters.AddWithValue($"@id{i}", request.EntryIds[i]);
				}

				var votes = new Dictionary<int, int>();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						votes.Add(reader.GetInt32("entry_id"), reader.GetInt32("vote_value"));
					}
				}

				return Ok(votes);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while getting user votes: {ex.Message}", null, "FILE", true);
				return StatusCode(500, "An error occurred while getting user votes.");
			}
		}
	}
}
