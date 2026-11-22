using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Services;
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
			}				try
				{
					using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
					{
						await connection.OpenAsync();

						// Story reactions follow the story's visibility with the real
						// user (same rules as the feed): only the author, accepted
						// followers ('following' posts) or anyone (public posts) may
						// react — anonymous and unauthorized users can't react to
						// non-public posts.
						if (reactionRequest.StoryId != null)
						{
							if (!await SocialController.CanViewStoryAsync(connection, reactionRequest.StoryId.Value, reactionRequest.User?.Id ?? 0))
							{
								return NotFound("Story not found or not visible to you.");
							}
						}

						// Always insert a new reaction record (do not overwrite prior reactions by the same user)
						var commandStr = @" INSERT INTO reactions (user_id, comment_id, story_id, message_id, file_id, timestamp, type)
		                            VALUES (@userId, @commentId, @storyId, @messageId, @fileId, UTC_TIMESTAMP(), @type);";

					var command = new MySqlCommand(commandStr, connection);
					command.Parameters.AddWithValue("@userId", reactionRequest.User?.Id ?? 0);
					command.Parameters.AddWithValue("@commentId", reactionRequest.CommentId);
					command.Parameters.AddWithValue("@fileId", reactionRequest.FileId);
					command.Parameters.AddWithValue("@storyId", reactionRequest.StoryId);
					command.Parameters.AddWithValue("@messageId", reactionRequest.MessageId); 
					command.Parameters.AddWithValue("@type", reactionRequest.Type);
					command.Parameters.AddWithValue("@comment", "Reacted");


					await command.ExecuteNonQueryAsync();
					int? lastInsertId = (int?)(command.LastInsertedId);

					// Karma is a stored score, so re-bake the rows this reaction moved:
					// the author of the reacted post/comment gains a point and the
					// person reacting gains one for engaging.
					if (reactionRequest.StoryId != null)
					{
						await UserScoreService.RecomputeStoryAuthorAsync(connection, reactionRequest.StoryId.Value, _log);
					}
					if (reactionRequest.CommentId != null)
					{
						await UserScoreService.RecomputeCommentAuthorAsync(connection, reactionRequest.CommentId.Value, _log);
					}
					await UserScoreService.RecomputeUserAsync(connection, reactionRequest.User?.Id ?? 0, _log);

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
					var getOwnerCmd = new MySqlCommand("SELECT user_id, COALESCE(story_id, 0), COALESCE(comment_id, 0) FROM reactions WHERE id = @id LIMIT 1;", connection);
					getOwnerCmd.Parameters.AddWithValue("@id", request.ReactionId);
					int ownerId = 0;
					int reactedStoryId = 0;
					int reactedCommentId = 0;
					using (var ownerReader = await getOwnerCmd.ExecuteReaderAsync())
					{
						if (!await ownerReader.ReadAsync()) return NotFound("Reaction not found.");
						ownerId = ownerReader.GetInt32(0);
						reactedStoryId = ownerReader.GetInt32(1);
						reactedCommentId = ownerReader.GetInt32(2);
					}
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
					// Removing a reaction takes its karma back off both sides.
					if (reactedStoryId > 0) await UserScoreService.RecomputeStoryAuthorAsync(connection, reactedStoryId, _log);
					if (reactedCommentId > 0) await UserScoreService.RecomputeCommentAuthorAsync(connection, reactedCommentId, _log);
					await UserScoreService.RecomputeUserAsync(connection, ownerId, _log);
					return Ok(true);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while deleting the reaction." + ex.Message, null, "REACT", true);
				return StatusCode(500, "An error occurred while deleting the reaction.");
			}
		}

		[HttpGet("/Reaction/GetReactionsCount", Name = "GetReactionsCount")]
		public async Task<IActionResult> GetReactionsCount([FromQuery] int userId)
		{
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					var cmd = new MySqlCommand("SELECT COUNT(*) FROM reactions WHERE user_id = @userId;", connection);
					cmd.Parameters.AddWithValue("@userId", userId);
					var result = await cmd.ExecuteScalarAsync();
					int count = 0;
					if (result != null && int.TryParse(result.ToString(), out var parsed)) count = parsed;
					return Ok(count);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while getting reaction count." + ex.Message, userId, "REACT", true);
				return StatusCode(500, "An error occurred while getting reaction count.");
			}
		}
	}
}
