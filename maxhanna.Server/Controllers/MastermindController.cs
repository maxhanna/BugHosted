using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class MastermindController : ControllerBase
    {
        // Supporting classes
        public class MastermindGameState
        {
            public int Id { get; set; }
            public int UserId { get; set; }
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
            public int Score { get; set; }
            public int Tries { get; set; }
            public int Time { get; set; } // seconds
            public DateTime Submitted { get; set; }
        }

        public class MastermindGuessRequest
        {
            public List<string>? Guess { get; set; }
            public List<string>? Sequence { get; set; }
        }

        public class MastermindFeedback
        {
            public int Black { get; set; }
            public int White { get; set; }
        }

        // Fields
        private readonly string _connectionString;
        private static readonly string[] COLORS = new[] { "red", "blue", "green", "yellow", "purple", "orange" };
        private static readonly int SEQUENCE_LENGTH = 4;
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
        public IActionResult GetSequence()
        {
            var sequence = new List<string>();
            for (int i = 0; i < SEQUENCE_LENGTH; i++)
            {
                sequence.Add(COLORS[rand.Next(COLORS.Length)]);
            }
            return Ok(sequence);
        }

        [HttpPost("SubmitGuess")]
        public IActionResult SubmitGuess([FromBody] MastermindGuessRequest req)
        {
            if (req.Guess == null || req.Sequence == null || req.Guess.Count != SEQUENCE_LENGTH || req.Sequence.Count != SEQUENCE_LENGTH)
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
            var feedback = GetFeedback(req.Guess, req.Sequence);

            // If game is won (all black pegs), save score
            if (feedback.Black == SEQUENCE_LENGTH)
            {
                // Example: You may want to pass userId, score, tries, time, etc. Here, score is SEQUENCE_LENGTH, tries is 1, time is 0 for demo
                var score = new MastermindScore
                {
                    UserId = 0, // TODO: Replace with actual user id
                    Score = SEQUENCE_LENGTH,
                    Tries = 1, // TODO: Replace with actual number of tries
                    Time = 0, // TODO: Replace with actual time
                    Submitted = DateTime.UtcNow
                };
                // Save the score
                using (var conn = new MySqlConnector.MySqlConnection(_connectionString))
                {
                    conn.Open();
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
            // Black pegs: correct color and position
            for (int i = 0; i < SEQUENCE_LENGTH; i++)
            {
                if (guessCopy[i] == seqCopy[i])
                {
                    black++;
                    seqCopy[i] = REMOVED;
                    guessCopy[i] = REMOVED;
                }
            }
            // White pegs: correct color, wrong position
            for (int i = 0; i < SEQUENCE_LENGTH; i++)
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
                if (gameId == 0)
                {
                    // Insert new game
                    string insertGame = @"INSERT INTO mastermind_games (user_id, sequence, is_finished, last_updated) VALUES (@UserId, @Sequence, @IsFinished, @LastUpdated); SELECT LAST_INSERT_ID();";
                    using (var cmd = new MySqlConnector.MySqlCommand(insertGame, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", state.UserId);
                        cmd.Parameters.AddWithValue("@Sequence", string.Join(",", state.Sequence));
                        cmd.Parameters.AddWithValue("@IsFinished", state.IsFinished);
                        cmd.Parameters.AddWithValue("@LastUpdated", state.LastUpdated);
                        var result = await cmd.ExecuteScalarAsync();
                        gameId = Convert.ToInt32(result);
                    }
                }
                else
                {
                    // Update existing game
                    string updateGame = @"UPDATE mastermind_games SET sequence=@Sequence, is_finished=@IsFinished, last_updated=@LastUpdated WHERE id=@Id";
                    using (var cmd = new MySqlConnector.MySqlCommand(updateGame, conn))
                    {
                        cmd.Parameters.AddWithValue("@Id", gameId);
                        cmd.Parameters.AddWithValue("@Sequence", string.Join(",", state.Sequence));
                        cmd.Parameters.AddWithValue("@IsFinished", state.IsFinished);
                        cmd.Parameters.AddWithValue("@LastUpdated", state.LastUpdated);
                        await cmd.ExecuteNonQueryAsync();
                    }
                }

                // Delete existing guesses for this game
                string deleteGuesses = @"DELETE FROM mastermind_guesses WHERE game_id=@GameId";
                using (var cmd = new MySqlConnector.MySqlCommand(deleteGuesses, conn))
                {
                    cmd.Parameters.AddWithValue("@GameId", gameId);
                    await cmd.ExecuteNonQueryAsync();
                }

                // Insert guesses
                foreach (var guess in state.Guesses)
                {
                    string insertGuess = @"INSERT INTO mastermind_guesses (game_id, colors, black, white) VALUES (@GameId, @Colors, @Black, @White)";
                    using (var cmd = new MySqlConnector.MySqlCommand(insertGuess, conn))
                    {
                        cmd.Parameters.AddWithValue("@GameId", gameId);
                        cmd.Parameters.AddWithValue("@Colors", string.Join(",", guess.Colors));
                        cmd.Parameters.AddWithValue("@Black", guess.Black);
                        cmd.Parameters.AddWithValue("@White", guess.White);
                        await cmd.ExecuteNonQueryAsync();
                    }
                }
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
                string getGame = @"SELECT id, sequence, is_finished, last_updated FROM mastermind_games WHERE user_id=@UserId AND is_finished=0 ORDER BY last_updated DESC LIMIT 1";
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

    }
}
