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

					var commandStr = "";
					int? reactionId = CheckIfReactionExists(connection, reactionRequest.User?.Id ?? 0,
						reactionRequest.CommentId, reactionRequest.StoryId, reactionRequest.MessageId, reactionRequest.FileId);
					if (reactionId != null)
					{ 
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
 
					return Ok(reactionId ?? lastInsertId ?? 0);
				}

			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while adding the reaction." + ex.Message, reactionRequest.User?.Id, "REACT", true);
				return StatusCode(500, "An error occurred while adding the reaction.");
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
