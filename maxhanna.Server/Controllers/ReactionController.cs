using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class ReactionController : ControllerBase
	{
		private readonly ILogger<ReactionController> _logger;
		private readonly IConfiguration _config;

		public ReactionController(ILogger<ReactionController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
		}

		[HttpPost("/Reaction/AddReaction", Name = "AddReaction")]
		public async Task<IActionResult> AddReaction([FromBody] Reaction reactionRequest)
		{
			_logger.LogInformation("POST /Reaction/AddReaction");

			if (reactionRequest == null || (reactionRequest.CommentId == null && reactionRequest.MessageId == null && reactionRequest.FileId == null && reactionRequest.StoryId == null))
			{
				_logger.LogWarning("Invalid reaction request.");
				return BadRequest("Invalid reaction request.");
			}

			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();

					var commandStr = "";
					int? reactionId = CheckIfReactionExists(connection, reactionRequest.User?.Id ?? 0, reactionRequest.CommentId, reactionRequest.StoryId, reactionRequest.MessageId, reactionRequest.FileId);
					if (reactionId != null)
					{
						_logger.LogInformation("Found reaction, going to update it");

						commandStr = @" UPDATE reactions 
                            SET type = @type 
                            WHERE id = @reactionId LIMIT 1;"; 
					}
					else
					{
						commandStr = @" INSERT INTO reactions (user_id, comment_id, story_id, message_id, file_id, timestamp, type)
                            VALUES (@userId, @commentId, @storyId, @messageId, @fileId, @timestamp, @type);";
					}

					var command = new MySqlCommand(commandStr, connection);
					if (reactionId != null)
					{
						command.Parameters.AddWithValue("@reactionId", reactionId);
					}
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
					if (command.LastInsertedId == 0)
					{
						_logger.LogInformation($"Reaction updated for user {reactionRequest.User?.Id ?? 0}.");
					}
					else
					{
						_logger.LogInformation($"Reaction added for user {reactionRequest.User?.Id ?? 0}.");
					}

					return Ok(reactionId ?? lastInsertId ?? 0);
				}

			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while adding the reaction.");
				return StatusCode(500, "An error occurred while adding the reaction.");
			}
		}
		private int? CheckIfReactionExists(MySqlConnection connection, int userId, int? commentId, int? storyId, int? messageId, int? fileId)
		{
			string query = @"
                SELECT id
                FROM reactions
                WHERE user_id = @userId
                AND (comment_id = @commentId OR story_id = @storyId OR message_id = @messageId OR file_id = @fileId) LIMIT 1;";

			MySqlCommand command = new MySqlCommand(query, connection);
			command.Parameters.AddWithValue("@userId", userId);
			command.Parameters.AddWithValue("@commentId", commentId ?? (object)DBNull.Value);
			command.Parameters.AddWithValue("@storyId", storyId ?? (object)DBNull.Value);
			command.Parameters.AddWithValue("@messageId", messageId ?? (object)DBNull.Value);
			command.Parameters.AddWithValue("@fileId", fileId ?? (object)DBNull.Value);

			var result = command.ExecuteScalar(); 
			return result != null ? Convert.ToInt32(result) : (int?)null; 
		}
	}
}
