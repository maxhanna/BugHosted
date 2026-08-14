using maxhanna.Server.Controllers.DataContracts.Marbles;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class MarblesController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public MarblesController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		/// <summary>
		/// Record a finished single-player (vs Computer) game. The score is
		/// the number of marbles the player cleared before their board filled
		/// up. Multiplayer matches never submit here.
		/// </summary>
		[HttpPost("/Marbles/AddScore")]
		public async Task<IActionResult> AddScore([FromBody] MarblesScore score)
		{
			if (score.Score < 0 || score.Difficulty < 0 || score.Difficulty > 2)
			{
				return BadRequest("Invalid score submission.");
			}

			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			if (string.IsNullOrEmpty(connectionString))
			{
				_ = _log.Db("No connection string configured for Marbles high scores.", null, "MARBLES", true);
				return StatusCode(500, "High scores are not available right now.");
			}

			try
			{
				using var conn = new MySqlConnection(connectionString);
				await conn.OpenAsync(); 

				using var cmd = new MySqlCommand(@"
					INSERT INTO marbles_scores (user_id, username, score, difficulty, duration_seconds, submitted)
					VALUES (@UserId, @Username, @Score, @Difficulty, @DurationSeconds, UTC_TIMESTAMP());", conn);
				cmd.Parameters.AddWithValue("@UserId", score.UserId);
				cmd.Parameters.AddWithValue("@Username", (object?)TrimmedOrNull(score.Username) ?? DBNull.Value);
				cmd.Parameters.AddWithValue("@Score", score.Score);
				cmd.Parameters.AddWithValue("@Difficulty", score.Difficulty);
				cmd.Parameters.AddWithValue("@DurationSeconds", Math.Max(0, score.DurationSeconds));
				await cmd.ExecuteNonQueryAsync();

				return Ok("Score recorded successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error adding Marbles score: " + ex.Message, score.UserId, "MARBLES", true);
				return StatusCode(500, "An error occurred while adding the score.");
			}
		}

		/// <summary>
		/// All-time leaderboard of single-player Marbles scores, plus the
		/// caller's own best entry. Pass a user id in the body to include
		/// myBest; otherwise it is omitted.
		/// </summary>
		[HttpPost("/Marbles/GetHighScores")]
		public async Task<IActionResult> GetHighScores([FromBody] int? userId)
		{
			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			if (string.IsNullOrEmpty(connectionString))
			{
				return Ok(new { scores = new List<MarblesScore>(), myBest = (MarblesScore?)null });
			}

			try
			{
				var scores = new List<MarblesScore>();
				using var conn = new MySqlConnection(connectionString);
				await conn.OpenAsync(); 

				using (var cmd = new MySqlCommand(@"
					SELECT ms.id, ms.user_id, ms.username, ms.score, ms.difficulty, ms.duration_seconds, ms.submitted,
					       u.username AS u_username
					FROM marbles_scores ms
					LEFT JOIN users u ON ms.user_id = u.id
					ORDER BY ms.score DESC, ms.duration_seconds ASC, ms.submitted ASC
					LIMIT 50;", conn))
				{
					using var reader = await cmd.ExecuteReaderAsync();
					while (await reader.ReadAsync())
					{
						scores.Add(ReadScore(reader));
					}
				}

				MarblesScore? myBest = null;
				if (userId is int uid && uid > 0)
				{
					using var cmd = new MySqlCommand(@"
						SELECT ms.id, ms.user_id, ms.username, ms.score, ms.difficulty, ms.duration_seconds, ms.submitted,
						       u.username AS u_username
						FROM marbles_scores ms
						LEFT JOIN users u ON ms.user_id = u.id
						WHERE ms.user_id = @UserId
						ORDER BY ms.score DESC, ms.duration_seconds ASC
						LIMIT 1;", conn);
					cmd.Parameters.AddWithValue("@UserId", uid);
					using var reader = await cmd.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						myBest = ReadScore(reader);
					}
				}

				return Ok(new { scores, myBest });
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error retrieving Marbles high scores: " + ex.Message, userId, "MARBLES", true);
				return StatusCode(500, "An error occurred while retrieving the high scores.");
			}
		}

		private static MarblesScore ReadScore(MySqlDataReader reader)
		{
			string? storedName = null;
			string? joinedName = null;
			try
			{
				if (!reader.IsDBNull(reader.GetOrdinal("username"))) storedName = reader.GetString("username");
			}
			catch { /* column may be missing on legacy rows */ }
			try
			{
				if (!reader.IsDBNull(reader.GetOrdinal("u_username"))) joinedName = reader.GetString("u_username");
			}
			catch { /* no users table join */ }

			return new MarblesScore
			{
				Id = reader.GetInt32("id"),
				UserId = reader.GetInt32("user_id"),
				Username = string.IsNullOrWhiteSpace(joinedName) ? storedName : joinedName,
				Score = reader.GetInt32("score"),
				Difficulty = reader.GetInt32("difficulty"),
				DurationSeconds = reader.GetInt32("duration_seconds"),
				Submitted = reader.GetDateTime("submitted"),
			};
		}

		private static string? TrimmedOrNull(string? value)
		{
			var trimmed = value?.Trim();
			return string.IsNullOrEmpty(trimmed) ? null : trimmed;
		}
	}
}
