using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Wordler;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class WordlerController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private static readonly HashSet<string> profanity = new(StringComparer.OrdinalIgnoreCase) {"4r5e", "5h1t", "5hit", "a55", "anal", "anus", "ar5e", "arrse", "arse", "ass", "ass-fucker", "asses",
			"assfucker", "assfukka", "asshole", "assholes", "asswhole", "a_s_s", "b!tch", "b00bs", "b17ch", "b1tch", "ballbag", "balls",
			"ballsack", "bastard", "beastial", "beastiality", "bellend", "bestial", "bestiality", "bi+ch", "biatch", "bitch", "bitcher",
			"bitchers", "bitches", "bitchin", "bitching", "bloody", "blow job", "blowjob", "blowjobs", "boiolas", "bollock", "bollok",
			"boner", "boob", "boobs", "booobs", "boooobs", "booooobs", "booooooobs", "breasts", "buceta", "bugger", "bum", "bunny fucker",
			"butt", "butthole", "buttmuch", "buttplug", "c0ck", "c0cksucker", "carpet muncher", "cawk", "chink", "cipa", "cl1t", "clit",
			"clitoris", "clits", "cnut", "cock", "cock-sucker", "cockface", "cockhead", "cockmunch", "cockmuncher", "cocks", "cocksuck",
			"cocksucked", "cocksucker", "cocksucking", "cocksucks", "cocksuka", "cocksukka", "cok", "cokmuncher", "coksucka", "coon", "cox",
			"crap", "cum", "cummer", "cumming", "cums", "cumshot", "cunilingus", "cunillingus", "cunnilingus", "cunt", "cuntlick", "cuntlicker",
			"cuntlicking", "cunts", "cyalis", "cyberfuc", "cyberfuck", "cyberfucked", "cyberfucker", "cyberfuckers", "cyberfucking", "d1ck", "damn",
			"dick", "dickhead", "dildo", "dildos", "dink", "dinks", "dirsa", "dlck", "dog-fucker", "doggin", "dogging", "donkeyribber", "doosh",
			"duche", "dyke", "ejaculate", "ejaculated", "ejaculates", "ejaculating", "ejaculatings", "ejaculation", "ejakulate", "f u c k",
			"f u c k e r", "f4nny", "fag", "fagging", "faggitt", "faggot", "faggs", "fagot", "fagots", "fags", "fanny", "fannyflaps", "fannyfucker",
			"fanyy", "fatass", "fcuk", "fcuker", "fcuking", "feck", "fecker", "felching", "fellate", "fellatio", "fingerfuck", "fingerfucked", "fingerfucker",
			"fingerfuckers", "fingerfucking", "fingerfucks", "fistfuck", "fistfucked", "fistfucker", "fistfuckers", "fistfucking", "fistfuckings",
			"fistfucks", "flange", "fook", "fooker", "fuck", "fucka", "fucked", "fucker", "fuckers", "fuckhead", "fuckheads", "fuckin", "fucking",
			"fuckings", "fuckingshitmotherfucker", "fuckme", "fucks", "fuckwhit", "fuckwit", "fudge packer", "fudgepacker", "fuk", "fuker", "fukker",
			"fukkin", "fuks", "fukwhit", "fukwit", "fux", "fux0r", "f_u_c_k", "gangbang", "gangbanged", "gangbangs", "gaylord", "gaysex", "goatse",
			"god-dam", "god-damned", "goddamn", "goddamned", "hardcoresex", "hell", "heshe", "hoar", "hoare", "hoer", "homo", "hore", "horniest",
			"horny", "hotsex", "jack-off", "jackoff", "jap", "jerk-off", "jism", "jiz", "jizm", "jizz", "kawk", "knob", "knobead", "knobed", "knobend",
			"knobhead", "knobjocky", "knobjokey", "kock", "kondum", "kondums", "kum", "kummer", "kumming", "kums", "kunilingus", "l3i+ch", "l3itch",
			"labia", "lmfao", "lust", "lusting", "m0f0", "m0fo", "m45terbate", "ma5terb8", "ma5terbate", "masochist", "master-bate", "masterb8", "masterbat*",
			"masterbat3", "masterbate", "masterbation", "masterbations", "masturbate", "mo-fo", "mof0", "mofo", "mothafuck", "mothafucka", "mothafuckas",
			"mothafuckaz", "mothafucked", "mothafucker", "mothafuckers", "mothafuckin", "mothafucking", "mothafuckings", "mothafucks", "mother fucker",
			"motherfuck", "motherfucked", "motherfucker", "motherfuckers", "motherfuckin", "motherfucking", "motherfuckings", "motherfuckka", "motherfucks",
			"muff", "mutha", "muthafecker", "muthafuckker", "muther", "mutherfucker", "n1gga", "n1gger", "nazi", "nigg3r", "nigg4h", "nigga", "niggah",
			"niggas", "niggaz", "nigger", "niggers", "nob", "nob jokey", "nobhead", "nobjocky", "nobjokey", "numbnuts", "nutsack", "orgasim", "orgasims",
			"orgasm", "orgasms", "p0rn", "pawn", "pecker", "penis", "penisfucker", "phonesex", "phuck", "phuk", "phuked", "phuking", "phukked", "phukking",
			"phuks", "phuq", "pigfucker", "pimpis", "piss", "pissed", "pisser", "pissers", "pisses", "pissflaps", "pissin", "pissing", "pissoff", "poop",
			"porn", "porno", "pornography", "pornos", "prick", "pricks", "pron", "pube", "pusse", "pussi", "pussies", "pussy", "pussys", "rectum",
			"retard", "rimjaw", "rimming", "s hit", "s.o.b.", "sadist", "schlong", "screwing", "scroat", "scrote", "scrotum", "semen", "sex",
			"sh!+", "sh!t", "sh1t", "shag", "shagger", "shaggin", "shagging", "shemale", "shi+", "shit", "shitdick", "shite", "shited", "shitey",
			"shitfuck", "shitfull", "shithead", "shiting", "shitings", "shits", "shitted", "shitter", "shitters", "shitting", "shittings", "shitty",
			"skank", "slut", "sluts", "smegma", "smut", "snatch", "son-of-a-bitch", "spac", "spunk", "s_h_i_t", "t1tt1e5", "t1tties", "teets", "teez",
			"testical", "testicle", "tit", "titfuck", "tits", "titt", "tittie5", "tittiefucker", "titties", "tittyfuck", "tittywank", "titwank",
			"tosser", "turd", "tw4t", "twat", "twathead", "twatty", "twunt", "twunter", "v14gra", "v1gra", "vagina", "viagra", "vulva", "w00se",
			"wang", "wank", "wanker", "wanky", "whoar", "whore", "willies", "xrated", "xxx" };

		public WordlerController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Wordler/GetRandomWord/{difficulty}", Name = "GetRandomWord")]
		public async Task<IActionResult> GetRandomWord(int difficulty)
		{
			if (difficulty < 4 || difficulty > 7)
			{
				return BadRequest("Invalid difficulty level. Please choose between 4, 5, 6, or 7.");
			}

			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			try
			{
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					// SQL query to get the word of the day
					string fetchWordOfTheDayQuery = @"
						SELECT word
						FROM (
							SELECT word,
								ROW_NUMBER() OVER (ORDER BY word) AS row_num
							FROM wordler_solutions
							WHERE difficulty = @difficulty
						) AS words_with_index
						WHERE words_with_index.row_num = (
							SELECT MOD(ABS(CONV(SUBSTRING(MD5(UTC_DATE()), 1, 8), 16, 10)), (SELECT COUNT(*) FROM wordler_solutions WHERE difficulty = @difficulty)) + 1
						);
					";

					using (var command = new MySqlCommand(fetchWordOfTheDayQuery, connection))
					{
						command.Parameters.AddWithValue("@difficulty", difficulty);
						var res = await command.ExecuteScalarAsync();
						if (res != null)
						{
							string wordOfTheDay = (string)res;
							if (wordOfTheDay == null || string.IsNullOrEmpty(wordOfTheDay))
							{
								return NotFound("No words found for the specified difficulty.");
							}
							return Ok(wordOfTheDay);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching the word of the day." + ex.Message, null, "WORDLER", true);
				return StatusCode(500, "An error occurred while fetching the word of the day.");
			}
			return NotFound("No words found for the specified difficulty.");
		}

		[HttpPost("/Wordler/AddScore")]
		public async Task<IActionResult> AddScore([FromBody] WordlerScore score)
		{
			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			using (var conn = new MySqlConnection(connectionString))
			{
				await conn.OpenAsync();

				// Check if a score already exists for the current user and date
				string checkSql = @"
                    SELECT COUNT(*)
                    FROM wordler_scores
                    WHERE user_id = @UserId
                    AND DATE(submitted) = DATE(UTC_DATE())
                    AND difficulty = @Difficulty";
				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@UserId", score.User?.Id ?? 0);
					checkCmd.Parameters.AddWithValue("@Difficulty", score.Difficulty);
					var existingScoreCount = await checkCmd.ExecuteScalarAsync();
					if (existingScoreCount != null && Convert.ToInt32(existingScoreCount) > 0)
					{
						return BadRequest($"A score has already been submitted today for user: {score.User?.Username ?? "Anonymous"}.");
					}
				}

				// If no score exists for the current user and date, proceed to insert the new score
				string sql = @"
                    INSERT INTO wordler_scores (user_id, score, time, difficulty, submitted)
                    VALUES (@UserId, @Score, @Time, @Difficulty, @Submitted)";
				using (var cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@UserId", score.User?.Id ?? 0);
					cmd.Parameters.AddWithValue("@Score", score.Score);
					cmd.Parameters.AddWithValue("@Time", score.Time);
					cmd.Parameters.AddWithValue("@Difficulty", score.Difficulty);
					cmd.Parameters.AddWithValue("@Submitted", DateTime.UtcNow);

					try
					{
						await cmd.ExecuteNonQueryAsync();
						return Ok("Score recorded successfully.");
					}
					catch (Exception ex)
					{
						_ = _log.Db("Error adding score." + ex.Message, score.User?.Id, "WORDLER", true);
						return StatusCode(500, "An error occurred while adding the score.");
					}
				}
			}
		}


		[HttpGet("/Wordler/CheckGuess/{difficulty}/{word}")]
		public async Task<IActionResult> CheckGuess(int difficulty, string word)
		{
			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			using (var conn = new MySqlConnection(connectionString))
			{
				await conn.OpenAsync();

				// Check if a score already exists for the current user and date
				string checkSql = @"
                    SELECT COUNT(*)
                    FROM wordler_words
                    WHERE word = @Word
                    AND difficulty = @Difficulty";
				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@Word", word);
					checkCmd.Parameters.AddWithValue("@Difficulty", difficulty);
					var existingScoreCount = await checkCmd.ExecuteScalarAsync();
					if (existingScoreCount != null && Convert.ToInt32(existingScoreCount) > 0)
					{
						return Ok((existingScoreCount + " " + CheckProfanity(word)).Trim());
					}
				}
			}
			return Ok((0 + " " + CheckProfanity(word)).Trim());
		}
		[HttpPost("/Wordler/GetAllScores")]
		public async Task<IActionResult> GetAllScores([FromBody] int? userId)
		{
			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
			var scores = new List<WordlerScore>();

			using (var conn = new MySqlConnection(connectionString))
			{
				await conn.OpenAsync();

				// Do not limit to current date here; callers (client) will filter for 'today' when needed.
				string sql = @"
                    SELECT ws.id, ws.user_id, ws.score, ws.time, ws.submitted,
                           u.id as user_id, u.username, ws.difficulty
                    FROM wordler_scores ws
                    JOIN users u ON ws.user_id = u.id 
                    WHERE 1=1 " +
						(userId != null ? "AND ws.user_id = @UserId " : String.Empty) +
						"ORDER BY DATE(ws.submitted) desc, ws.difficulty desc, ws.score asc, ws.time asc LIMIT 20;";
				using (var cmd = new MySqlCommand(sql, conn))
				{
					// No @currentDate parameter needed
					if (userId != null && userId != 0)
					{
						cmd.Parameters.AddWithValue("@UserId", userId);
					}

					try
					{
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								var tmpuser = new User
								{
									Id = reader.GetInt32("user_id"),
									Username = reader.GetString("username"),
								};

								scores.Add(new WordlerScore
								{
									Id = reader.GetInt32("id"),
									User = tmpuser,
									Score = reader.GetInt32("score"),
									Time = reader.GetInt32("time"),
									Submitted = reader.GetDateTime("submitted"),
									Difficulty = reader.GetInt32("difficulty"),
								});
							}
						}
					}
					catch (Exception ex)
					{
						_ = _log.Db("Error retrieving scores." + ex.Message, userId, "WORDLER", true);
						return StatusCode(500, "An error occurred while retrieving the scores.");
					}
				}

				return Ok(scores);
			}
		}

		[HttpPost("/Wordler/SubmitGuess")]
		public async Task<IActionResult> SubmitGuess([FromBody] WordlerGuess guess)
		{
			if (guess.User == null || guess.User.Id == 0)
			{
				return Forbid("Anonymous users cannot save their guesses for later. Please log in if you want to keep your guess history.");
			}
			var connectionString = _config.GetConnectionString("DefaultConnection");
			try
			{
				await using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await connection.OpenAsync();

				var query = "INSERT INTO wordler_guess (user_id, attempt_number, guess, difficulty, date) " +
										"VALUES (@user_id, @attempt_number, @guess, @difficulty, @date)";


				await using var command = new MySqlCommand(query, connection);
				command.Parameters.AddWithValue("@user_id", guess.User.Id);
				command.Parameters.AddWithValue("@attempt_number", guess.AttemptNumber);
				command.Parameters.AddWithValue("@guess", guess.Guess);
				command.Parameters.AddWithValue("@difficulty", guess.Difficulty);
				command.Parameters.AddWithValue("@date", DateTime.UtcNow);


				await command.ExecuteNonQueryAsync();
				return Ok(new { success = true });
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error inserting guess. " + ex.Message, guess.User.Id, "WORDLER", true);
				return StatusCode(500, "Internal server error");
			}
		}

		[HttpPost("/Wordler/GetGuesses/{difficulty}")]
		public async Task<IActionResult> GetGuesses([FromBody] int userId, int difficulty)
		{
			if (userId == 0)
			{
				return Forbid("Anonymous users cannot save their guesses for later. Please log in if you want to keep your guess history.");
			}
			var guesses = new List<WordlerGuess>();

			try
			{
				await using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await connection.OpenAsync();

				string query = $@"
                    SELECT wg.user_id, wg.attempt_number, wg.guess, wg.difficulty, wg.date, u.id, u.username
                    FROM wordler_guess wg
                    JOIN users u ON wg.user_id = u.id
                    WHERE 
                        DATE(wg.date) = DATE(@currentDate) 
                        AND wg.user_id = @user_id 
                        AND wg.difficulty = @difficulty";

				await using var command = new MySqlCommand(query, connection);
				command.Parameters.AddWithValue("@user_id", userId);
				command.Parameters.AddWithValue("@difficulty", difficulty);
				command.Parameters.AddWithValue("@currentDate", DateTime.UtcNow);

				await using var reader = await command.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					var guessUser = new User
					{
						Id = reader.GetInt32("id"),
						Username = reader.GetString("username"),
					};

					guesses.Add(new WordlerGuess
					{
						User = guessUser,
						AttemptNumber = reader.GetInt32("attempt_number"),
						Guess = reader.GetString("guess"),
						Difficulty = reader.GetInt32("difficulty"),
						Date = reader.GetDateTime("date")
					});
				}

				return Ok(guesses);
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error retrieving guesses" + ex.Message, userId, "WORLDER", true);
				return StatusCode(500, "Internal server error");
			}
		}


		[HttpPost("/Wordler/GetDictionaryWord/{word}")]
		public async Task<IActionResult> GetDictionaryWord(string word)
		{
			string definition = "";
			try
			{
				await using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await connection.OpenAsync();

				string query = $@"
                    SELECT definition
                    FROM wordler_solutions 
                    WHERE word = @word;";

				await using var command = new MySqlCommand(query, connection);
				command.Parameters.AddWithValue("@word", word);

				await using var reader = await command.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					definition = reader.GetString("definition");
				}

				return Ok(definition);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error retrieving definition for word: {word}." + ex.Message, null, "WORLDER", true);
				return StatusCode(500, "Error retrieving definition for word: " + word);
			}
		}

		[HttpPost("/Wordler/GetBestConsecutiveDaysStreak/")]
		public async Task<IActionResult> GetBestConsecutiveDays([FromBody] int userId)
		{
			if (userId <= 0)
			{
				return BadRequest("Invalid user ID.");
			}

			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			try
			{
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					string query = @"
                        SELECT DISTINCT DATE(submitted) AS score_date
                        FROM wordler_scores
                        WHERE user_id = @userId
                        ORDER BY score_date DESC";

					using (var command = new MySqlCommand(query, connection))
					{
						command.Parameters.AddWithValue("@userId", userId);

						var scoreDates = new List<DateTime>();
						using (var reader = await command.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								scoreDates.Add(reader.GetDateTime("score_date"));
							}
						}

						int consecutiveDays = CalculateConsecutiveDays(scoreDates, false);
						return Ok(consecutiveDays);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching the consecutive days." + ex.Message, userId, "WORDLER", true);
				return StatusCode(500, "An error occurred while fetching the consecutive days.");
			}
		}

		[HttpPost("/Wordler/GetBestConsecutiveDaysStreakOverall/")]
		public async Task<IActionResult> GetBestConsecutiveDaysStreakOverall()
		{
			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			try
			{
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					string query = @"
                SELECT user_id, DATE(submitted) AS score_date
                FROM wordler_scores
                GROUP BY user_id, DATE(submitted)
                ORDER BY user_id, score_date";

					using (var command = new MySqlCommand(query, connection))
					{
						var userStreaks = new Dictionary<int, List<DateTime>>();

						using (var reader = await command.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								int currentUserId = reader.GetInt32("user_id");
								DateTime scoreDate = reader.GetDateTime("score_date");

								if (!userStreaks.ContainsKey(currentUserId))
								{
									userStreaks[currentUserId] = new List<DateTime>();
								}
								userStreaks[currentUserId].Add(scoreDate);
							}
						}

						int bestStreak = 0;
						int bestUserId = 0;

						foreach (var kvp in userStreaks)
						{
							int currentStreak = CalculateConsecutiveDays(kvp.Value, false);
							if (currentStreak > bestStreak)
							{
								bestStreak = currentStreak;
								bestUserId = kvp.Key;
							}
						}

						return Ok(new
						{
							UserId = bestUserId,
							Streak = bestStreak
						});
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching the consecutive days." + ex.Message, 0, "WORDLER", true);
				return StatusCode(500, "An error occurred while fetching the consecutive days.");
			}
		}


		[HttpPost("/Wordler/GetCurrentStreak/")]
		public async Task<IActionResult> GetCurrentStreak([FromBody] int userId)
		{
			if (userId <= 0)
			{
				return BadRequest("Invalid user ID.");
			}

			var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			try
			{
				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();

					string query = @"
                        SELECT DISTINCT DATE(submitted) AS score_date
                        FROM wordler_scores
                        WHERE user_id = @userId
                        ORDER BY score_date DESC";

					using (var command = new MySqlCommand(query, connection))
					{
						command.Parameters.AddWithValue("@userId", userId);

						var scoreDates = new List<DateTime>();
						using (var reader = await command.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								scoreDates.Add(reader.GetDateTime("score_date"));
							}
						}

						int consecutiveDays = CalculateConsecutiveDays(scoreDates, true);
						return Ok(consecutiveDays);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching the consecutive days." + ex.Message, userId, "WORDLER", true);
				return StatusCode(500, "An error occurred while fetching the consecutive days.");
			}
		}

		private int CalculateConsecutiveDays(List<DateTime> dates, bool startFromToday)
		{
			if (dates == null || !dates.Any())
				return 0;

			// Ensure dates are unique
			var uniqueDates = dates.Select(d => d.Date).Distinct().ToList();
			if (!uniqueDates.Any())
				return 0;

			if (startFromToday)
			{
				// Current streak: Count backward from most recent score
				var descendingDates = uniqueDates.OrderByDescending(d => d).ToList();
				DateTime today = DateTime.Today; // April 29, 2025
				DateTime current = descendingDates[0]; // Most recent score date

				if (current < today.AddDays(-1)) // Last score before yesterday
					return 0;

				int streak = 1;
				for (int i = 1; i < descendingDates.Count; i++)
				{
					DateTime previous = descendingDates[i];
					if (current.AddDays(-1) == previous)
					{
						streak++;
						current = previous;
					}
					else
					{
						break; // Gap in dates, streak ends
					}
				}
				return streak;
			}
			else
			{
				// Longest streak: Scan all dates for max contiguous sequence
				var ascendingDates = uniqueDates.OrderBy(d => d).ToList();
				int streak = 1;
				int maxStreak = 1;

				for (int i = 1; i < ascendingDates.Count; i++)
				{
					if (ascendingDates[i] == ascendingDates[i - 1].AddDays(1))
					{
						streak++;
						maxStreak = Math.Max(maxStreak, streak);
					}
					else
					{
						streak = 1; // Reset streak on gap
					}
				}
				return maxStreak;
			}
		}

		private string CheckProfanity(string word)
		{
			if (profanity.Contains(word))
			{
				return "You have a dirty Wordling mind! This pleases the Wordler.";
			}
			return string.Empty;
		}
	}
}
