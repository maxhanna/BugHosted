using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class ReactionController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public ReactionController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Reaction/AddReaction", Name = "AddReaction")]
		public async Task<IActionResult> AddReaction([FromBody] Reaction reactionRequest)
		{ 
			if (reactionRequest == null || (reactionRequest.CommentId == null && reactionRequest.MessageId == null && reactionRequest.FileId == null && reactionRequest.StoryId == null))
			{ 
				return BadRequest("Invalid reaction request.");
			}

			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();

					// Always insert a new reaction record (do not overwrite prior reactions by the same user)
					var commandStr = @" INSERT INTO reactions (user_id, comment_id, story_id, message_id, file_id, timestamp, type)
		                            VALUES (@userId, @commentId, @storyId, @messageId, @fileId, @timestamp, @type);";

					var command = new MySqlCommand(commandStr, connection);
					command.Parameters.AddWithValue("@userId", reactionRequest.User?.Id ?? 0);
					command.Parameters.AddWithValue("@commentId", reactionRequest.CommentId);
					command.Parameters.AddWithValue("@fileId", reactionRequest.FileId);
					command.Parameters.AddWithValue("@storyId", reactionRequest.StoryId);
					command.Parameters.AddWithValue("@messageId", reactionRequest.MessageId);
					command.Parameters.AddWithValue("@timestamp", DateTime.UtcNow);
					command.Parameters.AddWithValue("@type", reactionRequest.Type);
					command.Parameters.AddWithValue("@comment", "Reacted");


					await command.ExecuteNonQueryAsync();
					int? lastInsertId = (int?)(command.LastInsertedId);
 
					return Ok(lastInsertId ?? 0);
				}

			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while adding the reaction." + ex.Message, reactionRequest.User?.Id, "REACT", true);
				return StatusCode(500, "An error occurred while adding the reaction.");
			}
		}

		[HttpPost("/Reaction/DeleteReaction", Name = "DeleteReaction")]
		public async Task<IActionResult> DeleteReaction([FromBody] DeleteReactionRequest request)
		{
			try
			{
				if (request == null || request.ReactionId <= 0) return BadRequest("Invalid reaction request.");
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					// Verify ownership: only the user who created the reaction may delete it
					var getOwnerCmd = new MySqlCommand("SELECT user_id FROM reactions WHERE id = @id LIMIT 1;", connection);
					getOwnerCmd.Parameters.AddWithValue("@id", request.ReactionId);
					var ownerObj = await getOwnerCmd.ExecuteScalarAsync();
					if (ownerObj == null) return NotFound("Reaction not found.");
					int ownerId = Convert.ToInt32(ownerObj);
					// Try to get authenticated user id from HttpContext; if not set, fall back to request.UserId
					int requestingUserId = 0;
					try { requestingUserId = Convert.ToInt32(HttpContext.Items["UserId"] ?? 0); } catch { requestingUserId = 0; }
					if (requestingUserId == 0 && request.UserId != 0) requestingUserId = request.UserId;
					if (requestingUserId == 0 || requestingUserId != ownerId)
					{
						return Forbid();
					}
					var delCmd = new MySqlCommand("DELETE FROM reactions WHERE id = @id LIMIT 1;", connection);
					delCmd.Parameters.AddWithValue("@id", request.ReactionId);
					await delCmd.ExecuteNonQueryAsync();
					return Ok(true);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while deleting the reaction." + ex.Message, null, "REACT", true);
				return StatusCode(500, "An error occurred while deleting the reaction.");
			}
		}
		private int? CheckIfReactionExists(MySqlConnection connection, int userId, int? commentId, int? storyId, int? messageId, int? fileId)
		{
			string query = @"
				SELECT id
				FROM reactions
				WHERE user_id = @userId
				AND (
					(comment_id = @commentId OR (@commentId IS NULL AND comment_id IS NULL))
					AND 
					(story_id = @storyId OR (@storyId IS NULL AND story_id IS NULL))
					AND 
					(message_id = @messageId OR (@messageId IS NULL AND message_id IS NULL))
					AND 
					(file_id = @fileId OR (@fileId IS NULL AND file_id IS NULL))
				)
				LIMIT 1;";

			MySqlCommand command = new MySqlCommand(query, connection);
			command.Parameters.AddWithValue("@userId", userId);
			command.Parameters.AddWithValue("@commentId", commentId ?? (object)DBNull.Value);
			command.Parameters.AddWithValue("@storyId", storyId ?? (object)DBNull.Value);
			command.Parameters.AddWithValue("@messageId", messageId ?? (object)DBNull.Value);
			command.Parameters.AddWithValue("@fileId", fileId ?? (object)DBNull.Value);

			Console.WriteLine(command.CommandText);
			Console.WriteLine(string.Join(", ", command.Parameters.Cast<MySqlParameter>().Select(p => $"{p.ParameterName}: {p.Value}")));

			var result = command.ExecuteScalar();
			return result != null ? Convert.ToInt32(result) : (int?)null;
		}
	}
}
