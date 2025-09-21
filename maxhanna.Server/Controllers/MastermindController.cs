using Microsoft.AspNetCore.Mvc;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class MastermindController : ControllerBase
    {
        private readonly string _connectionString;
        private static readonly string[] COLORS = new[] { "red", "blue", "green", "yellow", "purple", "orange" };
        private static readonly int SEQUENCE_LENGTH = 4;
        private const int MAX_TRIES = 10;
        private static readonly Random rand = new Random();

        public MastermindController(IConfiguration config)
        {
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        }

        [HttpGet("GetBestScores")]
        public async Task<IActionResult> GetBestScores()
        {
            var scores = new List<MastermindScore>();
            using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                string sql = @"SELECT id, user_id, score, tries, time, submitted FROM mastermind_scores ORDER BY score DESC, tries ASC, time ASC LIMIT 10";
                using (var cmd = new MySqlConnector.MySqlCommand(sql, conn))
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        scores.Add(new MastermindScore
                        {
                            Id = reader.GetInt32(0),
                            UserId = reader.GetInt32(1),
                            Score = reader.GetInt32(2),
                            Tries = reader.GetInt32(3),
                            Time = reader.GetInt32(4),
                            Submitted = reader.GetDateTime(5)
                        });
                    }
                }
            }
            return Ok(scores);
        }

        [HttpGet("GetSequence")]

        [HttpPost("SubmitGuess")]
        public IActionResult SubmitGuess([FromBody] MastermindGuessRequest req)
        {
            if (req.Guess == null || req.Sequence == null || req.Guess.Count != req.SequenceLength || req.Sequence.Count != req.SequenceLength)
                return BadRequest("Invalid guess or sequence.");
            // Ensure all colors are valid
            foreach (var color in req.Guess)
            {
                if (!COLORS.Contains(color))
                    return BadRequest($"Invalid color: {color}");
            }
            foreach (var color in req.Sequence)
            {
                if (!COLORS.Contains(color))
                    return BadRequest($"Invalid color in sequence: {color}");
            }
            int gameId = 0;
            MastermindFeedback feedback = GetFeedback(req.Guess, req.Sequence);
            using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
            {
                conn.Open();
                // Get the game id for the unfinished game
                string getGameId = @"SELECT id FROM mastermind_games WHERE user_id=@UserId AND is_finished=0 LIMIT 1";
                using (var cmd = new MySqlConnector.MySqlCommand(getGameId, conn))
                {
                    cmd.Parameters.AddWithValue("@UserId", req.UserId);
                    var result = cmd.ExecuteScalar();
                    if (result != null && int.TryParse(result.ToString(), out int foundId))
                    {
                        gameId = foundId;
                    }
                }
                // Insert the guess with current UTC time
                if (gameId > 0)
                {
                    string insertGuess = @"INSERT INTO mastermind_guesses (game_id, colors, black, white, guess_time_utc) VALUES (@GameId, @Colors, @Black, @White, UTC_TIMESTAMP())";
                    using (var cmd = new MySqlConnector.MySqlCommand(insertGuess, conn))
                    {
                        cmd.Parameters.AddWithValue("@GameId", gameId);
                        cmd.Parameters.AddWithValue("@Colors", string.Join(",", req.Guess));
                        cmd.Parameters.AddWithValue("@Black", feedback.Black);
                        cmd.Parameters.AddWithValue("@White", feedback.White);
                        cmd.ExecuteNonQuery();
                    }
                }
                // If game is won (all black pegs) or lost, save score and clean up guesses
                bool finished = feedback.Black == req.SequenceLength || req.TriesLeft == 0;
                if (finished && gameId > 0)
                {
                    int totalTimeSeconds = 0;
                    // Get all guess times for this game
                    var guessTimes = new List<DateTime>();
                    string getGuessTimes = @"SELECT guess_time_utc FROM mastermind_guesses WHERE game_id=@GameId ORDER BY id ASC";
                    using (var cmd = new MySqlConnector.MySqlCommand(getGuessTimes, conn))
                    {
                        cmd.Parameters.AddWithValue("@GameId", gameId);
                        using (var reader = cmd.ExecuteReader())
                        {
                            while (reader.Read())
                            {
                                guessTimes.Add(reader.GetDateTime(0));
                            }
                        }
                    }
                    if (guessTimes.Count > 1)
                    {
                        totalTimeSeconds = (int)(guessTimes.Last() - guessTimes.First()).TotalSeconds;
                    }
                    // Fetch difficulty and sequence_length from mastermind_games for this game
                    string getGameMeta = @"SELECT difficulty, sequence_length FROM mastermind_games WHERE id=@GameId";
                    string difficulty = req.Difficulty;
                    int sequenceLength = req.SequenceLength;
                    using (var metaCmd = new MySqlConnector.MySqlCommand(getGameMeta, conn))
                    {
                        metaCmd.Parameters.AddWithValue("@GameId", gameId);
                        using (var reader = metaCmd.ExecuteReader())
                        {
                            if (reader.Read())
                            {
                                difficulty = reader.GetString(0);
                                sequenceLength = reader.GetInt32(1);
                            }
                        }
                    }
                    var score = new MastermindScore
                    {
                        UserId = req.UserId,
                        Difficulty = difficulty,
                        SequenceLength = sequenceLength,
                        Score = feedback.Black == sequenceLength ? sequenceLength : 0,
                        Tries = req.TriesLeft > 0 ? (MAX_TRIES - req.TriesLeft + 1) : MAX_TRIES,
                        Time = totalTimeSeconds,
                        Submitted = DateTime.UtcNow
                    };
                    // Always save score when game is finished
                    string sql = @"INSERT INTO mastermind_scores (user_id, score, tries, time, submitted) VALUES (@UserId, @Score, @Tries, @Time, @Submitted)";
                    using (var cmd = new MySqlConnector.MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", score.UserId);
                        cmd.Parameters.AddWithValue("@Score", score.Score);
                        cmd.Parameters.AddWithValue("@Tries", score.Tries);
                        cmd.Parameters.AddWithValue("@Time", score.Time);
                        cmd.Parameters.AddWithValue("@Submitted", score.Submitted);
                        cmd.ExecuteNonQuery();
                    }
                    // Mark game as finished
                    string finishGame = @"UPDATE mastermind_games SET is_finished=1 WHERE user_id=@UserId AND is_finished=0";
                    using (var cmd = new MySqlConnector.MySqlCommand(finishGame, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", score.UserId);
                        cmd.ExecuteNonQuery();
                    }
                    // Delete guesses for finished game
                    string deleteGuesses = @"DELETE FROM mastermind_guesses WHERE game_id IN (SELECT id FROM mastermind_games WHERE is_finished=1)";
                    using (var cmd = new MySqlConnector.MySqlCommand(deleteGuesses, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", score.UserId);
                        cmd.ExecuteNonQuery();
                    }
                }
            }
            return Ok(feedback);
        }

        [HttpPost("SaveScore")]
        public async Task<IActionResult> SaveScore([FromBody] MastermindScore score)
        {
            using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                string sql = @"INSERT INTO mastermind_scores (user_id, score, tries, time, submitted) VALUES (@UserId, @Score, @Tries, @Time, @Submitted)";
                using (var cmd = new MySqlConnector.MySqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@UserId", score.UserId);
                    cmd.Parameters.AddWithValue("@Score", score.Score);
                    cmd.Parameters.AddWithValue("@Tries", score.Tries);
                    cmd.Parameters.AddWithValue("@Time", score.Time);
                    cmd.Parameters.AddWithValue("@Submitted", DateTime.UtcNow);
                    await cmd.ExecuteNonQueryAsync();
                }
            }
            return Ok("Score saved successfully.");
        }

        private MastermindFeedback GetFeedback(List<string> guess, List<string> sequence)
        {
            int black = 0, white = 0;
            var seqCopy = sequence.ToList();
            var guessCopy = guess.ToList();
            const string REMOVED = "__REMOVED__";
            int length = Math.Min(guess.Count, sequence.Count);
            // Black pegs: correct color and position
            for (int i = 0; i < length; i++)
            {
                if (guessCopy[i] == seqCopy[i])
                {
                    black++;
                    seqCopy[i] = REMOVED;
                    guessCopy[i] = REMOVED;
                }
            }
            // White pegs: correct color, wrong position
            for (int i = 0; i < length; i++)
            {
                if (guessCopy[i] != REMOVED && seqCopy.Contains(guessCopy[i]))
                {
                    white++;
                    seqCopy[seqCopy.IndexOf(guessCopy[i])] = REMOVED;
                }
            }
            return new MastermindFeedback { Black = black, White = white };
        }



        [HttpPost("SaveGameState")]
        public async Task<IActionResult> SaveGameState([FromBody] MastermindGameState state)
        {
            // Save or update mastermind_games
            using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                int gameId = state.Id;
                // Try to find an unfinished game for this user
                if (gameId == 0)
                {
                    string findGame = @"SELECT id FROM mastermind_games WHERE user_id=@UserId AND is_finished=0 LIMIT 1";
                    using (var cmd = new MySqlConnector.MySqlCommand(findGame, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", state.UserId);
                        var result = await cmd.ExecuteScalarAsync();
                        if (result != null && int.TryParse(result.ToString(), out int foundId))
                        {
                            gameId = foundId;
                        }
                    }
                }
                if (gameId == 0)
                {
                    // Insert new game
                    string insertGame = @"INSERT INTO mastermind_games (user_id, sequence, is_finished, last_updated, difficulty, sequence_length) VALUES (@UserId, @Sequence, @IsFinished, @LastUpdated, @Difficulty, @SequenceLength); SELECT LAST_INSERT_ID();";
                    using (var cmd = new MySqlConnector.MySqlCommand(insertGame, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", state.UserId);
                        cmd.Parameters.AddWithValue("@Sequence", string.Join(",", state.Sequence));
                        cmd.Parameters.AddWithValue("@IsFinished", state.IsFinished);
                        cmd.Parameters.AddWithValue("@LastUpdated", state.LastUpdated);
                        cmd.Parameters.AddWithValue("@Difficulty", state.Difficulty);
                        cmd.Parameters.AddWithValue("@SequenceLength", state.SequenceLength);
                        var result = await cmd.ExecuteScalarAsync();
                        gameId = Convert.ToInt32(result);
                    }
                }
                else
                {
                    // Update existing game
                    string updateGame = @"UPDATE mastermind_games SET sequence=@Sequence, is_finished=@IsFinished, last_updated=@LastUpdated, difficulty=@Difficulty, sequence_length=@SequenceLength WHERE id=@Id";
                    using (var cmd = new MySqlConnector.MySqlCommand(updateGame, conn))
                    {
                        cmd.Parameters.AddWithValue("@Id", gameId);
                        cmd.Parameters.AddWithValue("@Sequence", string.Join(",", state.Sequence));
                        cmd.Parameters.AddWithValue("@IsFinished", state.IsFinished);
                        cmd.Parameters.AddWithValue("@LastUpdated", state.LastUpdated);
                        cmd.Parameters.AddWithValue("@Difficulty", state.Difficulty);
                        cmd.Parameters.AddWithValue("@SequenceLength", state.SequenceLength);
                        await cmd.ExecuteNonQueryAsync();
                    }
                }

                // ...existing code...
            }
            return Ok();
        }

        [HttpGet("LoadGameState")]
        public async Task<IActionResult> LoadGameState([FromQuery] int userId)
        {
            using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                // Get unfinished game for user
                string getGame = @"SELECT id, sequence, is_finished, last_updated, difficulty, sequence_length FROM mastermind_games WHERE user_id=@UserId AND is_finished=0 ORDER BY last_updated DESC LIMIT 1";
                MastermindGameState? state = null;
                int gameId = 0;
                using (var cmd = new MySqlConnector.MySqlCommand(getGame, conn))
                {
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            gameId = reader.GetInt32(0);
                            var sequenceStr = reader.GetString(1);
                            state = new MastermindGameState
                            {
                                Id = gameId,
                                UserId = userId,
                                Sequence = sequenceStr.Split(',').ToList(),
                                IsFinished = reader.GetBoolean(2),
                                LastUpdated = reader.GetDateTime(3),
                                Difficulty = reader.GetString(4),
                                SequenceLength = reader.GetInt32(5),
                                Guesses = new List<MastermindGuessRecord>()
                            };
                        }
                    }
                }
                if (state != null)
                {
                    // Get guesses for this game
                    string getGuesses = @"SELECT colors, black, white FROM mastermind_guesses WHERE game_id=@GameId ORDER BY id ASC";
                    using (var cmd = new MySqlConnector.MySqlCommand(getGuesses, conn))
                    {
                        cmd.Parameters.AddWithValue("@GameId", gameId);
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                            {
                                var colorsStr = reader.GetString(0);
                                var colors = colorsStr.Split(',').ToList();
                                var black = reader.GetInt32(1);
                                var white = reader.GetInt32(2);
                                state.Guesses.Add(new MastermindGuessRecord
                                {
                                    Colors = colors,
                                    Black = black,
                                    White = white
                                });
                            }
                        }
                    }
                    return Ok(state);
                }
                // No unfinished game found
                return Ok(null);
            }
        }

        [HttpPost("ExitGame")]
        public async Task<IActionResult> ExitGame([FromBody] int userId)
        {
            using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                // Get unfinished game ids for user
                var gameIds = new List<int>();
                string getGames = "SELECT id FROM mastermind_games WHERE user_id=@UserId AND is_finished=0";
                using (var cmd = new MySqlConnector.MySqlCommand(getGames, conn))
                {
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            gameIds.Add(reader.GetInt32(0));
                        }
                    }
                }
                if (gameIds.Count > 0)
                {
                    // Delete guesses for these games
                    string deleteGuesses = "DELETE FROM mastermind_guesses WHERE game_id IN (" + string.Join(",", gameIds) + ")";
                    using (var cmd = new MySqlConnector.MySqlCommand(deleteGuesses, conn))
                    {
                        await cmd.ExecuteNonQueryAsync();
                    }
                    // Delete the games themselves
                    string deleteGames = "DELETE FROM mastermind_games WHERE id IN (" + string.Join(",", gameIds) + ")";
                    using (var cmd = new MySqlConnector.MySqlCommand(deleteGames, conn))
                    {
                        await cmd.ExecuteNonQueryAsync();
                    }
                }
            }
            return Ok();
        }
    }

    // Supporting classes
    public class MastermindGameState
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Difficulty { get; set; } = "easy";
        public int SequenceLength { get; set; } = 4;
        public List<string> Sequence { get; set; } = new();
        public List<MastermindGuessRecord> Guesses { get; set; } = new();
        public bool IsFinished { get; set; }
        public DateTime LastUpdated { get; set; }
    }

    public class MastermindGuessRecord
    {
        public int Id { get; set; }
        public int GameId { get; set; }
        public List<string> Colors { get; set; } = new();
        public int Black { get; set; }
        public int White { get; set; }
    }

    public class MastermindScore
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Difficulty { get; set; } = "easy";
        public int SequenceLength { get; set; } = 4;
        public int Score { get; set; }
        public int Tries { get; set; }
        public int Time { get; set; } // seconds
        public DateTime Submitted { get; set; }
    }

    public class MastermindGuessRequest
    {
        public List<string>? Guess { get; set; }
        public List<string>? Sequence { get; set; }
        public int UserId { get; set; }
        public int TriesLeft { get; set; }
        public string Difficulty { get; set; } = "easy";
        public int SequenceLength { get; set; } = 4;
    }

    public class MastermindFeedback
    {
        public int Black { get; set; }
        public int White { get; set; }
    } 
}
