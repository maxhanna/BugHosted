using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Net;
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

                    if (CheckIfReactionExists(connection, reactionRequest.User?.Id ?? 0, reactionRequest.CommentId, reactionRequest.StoryId, reactionRequest.MessageId, reactionRequest.FileId))
                    {
                        _logger.LogInformation("Found reaction, going to update it");

                        commandStr = @"  
                            UPDATE reactions 
                            SET type = @type 
                            WHERE user_id = @userId";

                        // Add conditions for comment_id, story_id, message_id if present
                        if (reactionRequest.CommentId.HasValue)
                        {
                            commandStr += " AND comment_id = @commentId";
                        }
                        if (reactionRequest.StoryId.HasValue)
                        {
                            commandStr += " AND story_id = @storyId";
                        }
                        if (reactionRequest.MessageId.HasValue)
                        {
                            commandStr += " AND message_id = @messageId";
                        }
                        if (reactionRequest.FileId.HasValue)
                        {
                            commandStr += " AND file_id = @fileId";
                        }
                        commandStr += ";";
                    }
                    else
                    {
                        commandStr = @"  
                            INSERT INTO reactions (user_id, comment_id, story_id, message_id, file_id, timestamp, type)
                            VALUES (@userId, @commentId, @storyId, @messageId, @fileId, @timestamp, @type);

                              -- Notify the creator of the content
                            INSERT INTO maxhanna.notifications (user_id, from_user_id, file_id, text, story_id)
                            SELECT 
                                creator.user_id AS user_id,
                                @userId AS from_user_id,
                                CASE 
                                    WHEN @fileId IS NOT NULL THEN @fileId
                                    WHEN @commentId IS NOT NULL THEN comment.file_id
                                    ELSE NULL
                                END AS file_id,
                                @comment AS text,
                                CASE 
                                    WHEN @storyId IS NOT NULL THEN @storyId
                                    WHEN @commentId IS NOT NULL THEN comment.story_id
                                    ELSE NULL
                                END AS story_id
                            FROM (
                                SELECT user_id FROM maxhanna.file_uploads WHERE id = @fileId
                                UNION ALL
                                SELECT user_id FROM maxhanna.comments AS comment WHERE id = @commentId
                                UNION ALL
                                SELECT sender FROM maxhanna.messages WHERE id = @messageId
                                UNION ALL
                                SELECT user_id FROM maxhanna.stories WHERE id = @storyId
                            ) AS creator
                            LEFT JOIN maxhanna.comments AS comment ON comment.id = @commentId
                            WHERE creator.user_id IS NOT NULL;";
                    }

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

                    if (command.LastInsertedId == 0)
                    {
                        _logger.LogInformation($"Reaction updated for user {reactionRequest.User?.Id ?? 0}.");
                    }
                    else
                    {
                        _logger.LogInformation($"Reaction added for user {reactionRequest.User?.Id ?? 0}.");
                    }

                    return Ok("Reaction added successfully.");
                }

            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while adding the reaction.");
                return StatusCode(500, "An error occurred while adding the reaction.");
            }
        }
        private bool CheckIfReactionExists(MySqlConnection connection, int userId, int? commentId, int? storyId, int? messageId, int? fileId)
        {
            string query = @"
                SELECT COUNT(*)
                FROM reactions
                WHERE user_id = @userId
                AND (comment_id = @commentId OR story_id = @storyId OR message_id = @messageId OR file_id = @fileId)";

            MySqlCommand command = new MySqlCommand(query, connection);
            command.Parameters.AddWithValue("@userId", userId);
            command.Parameters.AddWithValue("@commentId", commentId ?? (object)DBNull.Value);
            command.Parameters.AddWithValue("@storyId", storyId ?? (object)DBNull.Value);
            command.Parameters.AddWithValue("@messageId", messageId ?? (object)DBNull.Value);
            command.Parameters.AddWithValue("@fileId", fileId ?? (object)DBNull.Value);

            int count = Convert.ToInt32(command.ExecuteScalar());
            return count > 0;
        }
    }
}
