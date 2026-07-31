using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class FollowController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly Log _log;

        public FollowController(IConfiguration config, Log log)
        {
            _config = config;
            _log = log;
        }

        [HttpPost("toggle")]
        public async Task<IActionResult> ToggleFollow([FromBody] ToggleFollowRequest request)
        {
            if (request.UserId <= 0) return BadRequest("UserId is required.");
            if (string.IsNullOrWhiteSpace(request.FollowType)) return BadRequest("FollowType is required (story, file, or comment).");
            if (request.FollowId <= 0) return BadRequest("FollowId is required.");

            var validTypes = new[] { "story", "file", "comment" };
            if (!validTypes.Contains(request.FollowType.ToLower()))
                return BadRequest("FollowType must be 'story', 'file', or 'comment'.");

            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Check if already following
                using var checkCmd = new MySqlCommand(
                    "SELECT id FROM user_follows WHERE user_id = @userId AND follow_type = @type AND follow_id = @followId",
                    conn);
                checkCmd.Parameters.AddWithValue("@userId", request.UserId);
                checkCmd.Parameters.AddWithValue("@type", request.FollowType.ToLower());
                checkCmd.Parameters.AddWithValue("@followId", request.FollowId);

                var existing = await checkCmd.ExecuteScalarAsync();

                if (existing != null)
                {
                    // Unfollow
                    using var delCmd = new MySqlCommand(
                        "DELETE FROM user_follows WHERE id = @id", conn);
                    delCmd.Parameters.AddWithValue("@id", existing);
                    await delCmd.ExecuteNonQueryAsync();

                    _ = _log.Db($"User {request.UserId} unfollowed {request.FollowType} {request.FollowId}", request.UserId, "FOLLOW", outputToConsole: true);
                    return Ok(new { following = false, message = "Unfollowed." });
                }
                else
                {
                    // Follow
                    using var insCmd = new MySqlCommand(
                        "INSERT INTO user_follows (user_id, follow_type, follow_id) VALUES (@userId, @type, @followId)",
                        conn);
                    insCmd.Parameters.AddWithValue("@userId", request.UserId);
                    insCmd.Parameters.AddWithValue("@type", request.FollowType.ToLower());
                    insCmd.Parameters.AddWithValue("@followId", request.FollowId);
                    await insCmd.ExecuteNonQueryAsync();

                    _ = _log.Db($"User {request.UserId} followed {request.FollowType} {request.FollowId}", request.UserId, "FOLLOW", outputToConsole: true);
                    return Ok(new { following = true, message = "Following." });
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error toggling follow: {ex.Message}", request.UserId, "FOLLOW", outputToConsole: true);
                return StatusCode(500, "An error occurred while toggling follow.");
            }
        }

        [HttpGet("check")]
        public async Task<IActionResult> CheckFollow([FromQuery] int userId, [FromQuery] string followType, [FromQuery] int followId)
        {
            if (userId <= 0 || followId <= 0 || string.IsNullOrWhiteSpace(followType))
                return Ok(new { following = false });

            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT 1 FROM user_follows WHERE user_id = @userId AND follow_type = @type AND follow_id = @followId LIMIT 1",
                    conn);
                cmd.Parameters.AddWithValue("@userId", userId);
                cmd.Parameters.AddWithValue("@type", followType.ToLower());
                cmd.Parameters.AddWithValue("@followId", followId);

                var result = await cmd.ExecuteScalarAsync();
                return Ok(new { following = result != null });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error checking follow: {ex.Message}", userId, "FOLLOW", outputToConsole: true);
                return Ok(new { following = false });
            }
        }

        [HttpGet("list")]
        public async Task<IActionResult> ListFollows([FromQuery] int userId)
        {
            if (userId <= 0) return BadRequest("UserId is required.");

            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var cmd = new MySqlCommand(
                    "SELECT follow_type, follow_id, created_at FROM user_follows WHERE user_id = @userId ORDER BY created_at DESC",
                    conn);
                cmd.Parameters.AddWithValue("@userId", userId);

                var result = new List<object>();
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Add(new
                    {
                        followType = reader.GetString("follow_type"),
                        followId = reader.GetInt32("follow_id"),
                        createdAt = reader.GetDateTime("created_at")
                    });
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error listing follows: {ex.Message}", userId, "FOLLOW", outputToConsole: true);
                return StatusCode(500, "An error occurred.");
            }
        }
    }

    public class ToggleFollowRequest
    {
        public int UserId { get; set; }
        public string FollowType { get; set; } = ""; // "story", "file", or "comment"
        public int FollowId { get; set; }
    }
}
