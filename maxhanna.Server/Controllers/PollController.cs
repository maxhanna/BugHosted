using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Chat;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class PollController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public PollController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Poll/Vote", Name = "PollVote")]
		public async Task<IActionResult> PollVote([FromBody] VoteRequest request)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// First check if the user already voted on this component
				string checkSql = @"
            SELECT id, value 
            FROM poll_votes 
            WHERE user_id = @userId AND component_id = @componentId
            LIMIT 1";

				// Delete existing vote if it exists
				string deleteSql = @"
            DELETE FROM poll_votes 
            WHERE user_id = @userId AND component_id = @componentId";

				// Then insert new vote
				string insertSql = @"
            INSERT INTO poll_votes (user_id, component_id, value, timestamp)
            VALUES (@userId, @componentId, @value, UTC_TIMESTAMP())";

				// Check if user already voted
				string? existingValue = null;
				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@userId", request.UserId);
					checkCmd.Parameters.AddWithValue("@componentId", request.ComponentId);

					using (var reader = await checkCmd.ExecuteReaderAsync())
					{
						if (reader.Read())
						{
							existingValue = reader.IsDBNull("value") ? null : reader.GetString("value");
						}
					}
				}

				// If user is voting with the same value, just return current results
				if (existingValue == request.Value)
				{
					return await GetPollResults(request.ComponentId, conn);
				}

				// Delete existing vote if it exists
				using (var deleteCmd = new MySqlCommand(deleteSql, conn))
				{
					deleteCmd.Parameters.AddWithValue("@userId", request.UserId);
					deleteCmd.Parameters.AddWithValue("@componentId", request.ComponentId);
					await deleteCmd.ExecuteNonQueryAsync();
				}

				// Insert new vote
				using (var insertCmd = new MySqlCommand(insertSql, conn))
				{
					insertCmd.Parameters.AddWithValue("@userId", request.UserId);
					insertCmd.Parameters.AddWithValue("@componentId", request.ComponentId);
					insertCmd.Parameters.AddWithValue("@value", request.Value);

					await insertCmd.ExecuteNonQueryAsync();
				}

				return await GetPollResults(request.ComponentId, conn);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing poll vote. " + ex.Message, request.UserId, "POLL", true);
				return StatusCode(500, "An error occurred while processing your vote.");
			}
			finally
			{
				conn.Close();
			}
		}


		[HttpPost("/Poll/DeleteVote", Name = "DeleteVote")]
		public async Task<IActionResult> DeleteVote([FromBody] VoteRequest request)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// First check if the user already voted on this component
				string checkSql = @"
					SELECT id, value 
					FROM poll_votes 
					WHERE user_id = @userId AND component_id = @componentId
					LIMIT 1";

				// Delete existing vote if it exists
				string deleteSql = @"
					DELETE FROM poll_votes 
					WHERE user_id = @userId AND component_id = @componentId LIMIT 1;";

				// Check if user already voted
				string? existingValue = null;
				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@userId", request.UserId);
					checkCmd.Parameters.AddWithValue("@componentId", request.ComponentId);

					using (var reader = await checkCmd.ExecuteReaderAsync())
					{
						if (reader.Read())
						{
							existingValue = reader.IsDBNull("value") ? null : reader.GetString("value");
						}
					}
				}

				// Delete existing vote if it exists
				using (var deleteCmd = new MySqlCommand(deleteSql, conn))
				{
					deleteCmd.Parameters.AddWithValue("@userId", request.UserId);
					deleteCmd.Parameters.AddWithValue("@componentId", request.ComponentId);
					await deleteCmd.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while deleting poll vote. " + ex.Message, request.UserId, "POLL", true);
				return StatusCode(500, "An error occurred while deleting your vote.");
			}
			finally
			{
				conn.Close();
			}
			return Ok("Vote deleted successfully.");
		}

		private async Task<IActionResult> GetPollResults(string componentId, MySqlConnection conn)
		{
			string resultsSql = @"
        SELECT 
            value,
            COUNT(*) as vote_count,
            COUNT(DISTINCT user_id) as unique_voters
        FROM poll_votes
        WHERE component_id = @componentId
        GROUP BY value
        ORDER BY vote_count DESC";

			string totalVotersSql = @"
        SELECT COUNT(DISTINCT user_id) 
        FROM poll_votes 
        WHERE component_id = @componentId";

			// Who voted (joined with users + display pictures, mirroring the chat
			// history poll query) so every consumer of /Poll/Results can render
			// the voter list, not just the tallies.
			string votersSql = @"
        SELECT pv.id, pv.user_id, pv.component_id, pv.value, pv.timestamp, u.username,
               udpfu.folder_path AS display_picture_folder,
               udpfu.file_name AS display_picture_filename
        FROM poll_votes pv
        JOIN users u ON pv.user_id = u.id
        LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
        LEFT JOIN file_uploads udpfu ON udp.file_id = udpfu.id
        WHERE pv.component_id = @componentId
        ORDER BY pv.timestamp DESC";

			var response = new
			{
				ComponentId = componentId,
				Options = new List<object>(),
				TotalVoters = 0,
				UserVotes = new List<object>()
			};

			// Get vote counts per value
			using (var cmd = new MySqlCommand(resultsSql, conn))
			{
				cmd.Parameters.AddWithValue("@componentId", componentId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					var options = new List<object>();
					while (await reader.ReadAsync())
					{
						options.Add(new
						{
							Value = reader.GetString("value"),
							VoteCount = reader.GetInt32("vote_count"),
							UniqueVoters = reader.GetInt32("unique_voters")
						});
					}
					response = new
					{
						ComponentId = componentId,
						Options = options,
						response.TotalVoters,
						response.UserVotes
					};
				}
			}

			// Get total unique voters
			using (var cmd = new MySqlCommand(totalVotersSql, conn))
			{
				cmd.Parameters.AddWithValue("@componentId", componentId);
				response = new
				{
					response.ComponentId,
					response.Options,
					TotalVoters = Convert.ToInt32(await cmd.ExecuteScalarAsync()),
					response.UserVotes
				};
			}

			// Fetch the voter list
			using (var cmd = new MySqlCommand(votersSql, conn))
			{
				cmd.Parameters.AddWithValue("@componentId", componentId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					var userVotes = new List<object>();
					while (await reader.ReadAsync())
					{
						string? displayPicPath = null;
						if (!reader.IsDBNull(reader.GetOrdinal("display_picture_folder")) && !reader.IsDBNull(reader.GetOrdinal("display_picture_filename")))
						{
							displayPicPath = $"{reader.GetString("display_picture_folder")}/{reader.GetString("display_picture_filename")}";
						}
						userVotes.Add(new
						{
							Id = reader.GetInt32("id"),
							UserId = reader.GetInt32("user_id"),
							ComponentId = reader.GetString("component_id"),
							Value = reader.GetString("value"),
							Timestamp = reader.GetDateTime("timestamp"),
							Username = reader.GetString("username"),
							DisplayPicture = displayPicPath
						});
					}
					response = new
					{
						response.ComponentId,
						response.Options,
						response.TotalVoters,
						UserVotes = userVotes
					};
				}
			}

			return Ok(response);
		}

		[HttpGet("/Poll/Results", Name = "PollResults")]
		public async Task<IActionResult> PollResults([FromQuery] string componentId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				return await GetPollResults(componentId, conn);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching poll results. " + ex.Message, null, "POLL", true);
				return StatusCode(500, "An error occurred while fetching poll results.");
			}
			finally
			{
				conn.Close();
			}
		}
 
		public class VoteRequest
		{
			public int UserId { get; set; }
			public string? Value { get; set; }
			public required string ComponentId { get; set; }
		} 
	}
}
