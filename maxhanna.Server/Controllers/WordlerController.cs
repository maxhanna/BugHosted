using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class WordlerController : ControllerBase
    {
        private readonly ILogger<WordlerController> _logger;
        private readonly IConfiguration _config;

        public WordlerController(ILogger<WordlerController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Wordler/GetRandomWord/{difficulty}", Name = "GetRandomWord")]
        public async Task<IActionResult> GetRandomWord(int difficulty)
        {
            _logger.LogInformation($"POST /Wordler/GetRandomWord/{difficulty}");

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
                    SELECT MOD(ABS(CONV(SUBSTRING(MD5(CURDATE()), 1, 8), 16, 10)), (SELECT COUNT(*) FROM wordler_solutions WHERE difficulty = @difficulty)) + 1
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
                _logger.LogError(ex, "An error occurred while fetching the word of the day.");
                return StatusCode(500, "An error occurred while fetching the word of the day.");
            }
            return NotFound("No words found for the specified difficulty.");
        }

        [HttpPost("/Wordler/AddScore")]
        public async Task<IActionResult> AddScore([FromBody] WordlerScore score)
        {
            _logger.LogInformation($"POST /Wordler/AddScore for user {score.User?.Id ?? 0}");

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
                        _logger.LogError(ex, "Error adding score.");
                        return StatusCode(500, "An error occurred while adding the score.");
                    }
                }
            }
        }


        [HttpGet("/Wordler/CheckGuess/{difficulty}/{word}")]
        public async Task<IActionResult> CheckGuess(int difficulty, string word)
        {
            _logger.LogInformation($"GET /Wordler/CheckGuess/{difficulty}/{word}");
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

            string CheckProfanity(string word)
            {
                string[] profanity = ["4r5e", "5h1t", "5hit", "a55", "anal", "anus", "ar5e", "arrse", "arse", "ass", "ass-fucker", "asses",
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
                    "wang", "wank", "wanker", "wanky", "whoar", "whore", "willies", "xrated", "xxx"];


                if (profanity.Any(x => word.ToLower().Contains(x.ToLower())))
                {
                    return "You have a dirty Wordling mind! This pleases the Wordler.";
                }
                return String.Empty;
            }
        }
        [HttpPost("/Wordler/GetAllScores")]
        public async Task<IActionResult> GetAllScores([FromBody] User? user)
        {
            _logger.LogInformation($"GET /Wordler/GetAllScores (for user: {user?.Id})");

            var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
            var scores = new List<WordlerScore>();

            using (var conn = new MySqlConnection(connectionString))
            {
                await conn.OpenAsync();

                var currentDate = DateTime.UtcNow.Date;

                string sql = @"
                    SELECT ws.id, ws.user_id, ws.score, ws.time, ws.submitted,
                           u.id as user_id, u.username, ws.difficulty
                    FROM wordler_scores ws
                    JOIN users u ON ws.user_id = u.id 
                    WHERE 1=1 " +
                    (user == null ? "AND DATE(ws.submitted) = DATE(@currentDate) " : String.Empty) +
                    (user != null ? "AND ws.user_id = @UserId " : String.Empty) +
                    "ORDER BY DATE(ws.submitted) desc, ws.difficulty desc, ws.score asc, ws.time asc ";
                using (var cmd = new MySqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@currentDate", currentDate);
                    if (user != null && user?.Id != 0)
                    {
                        _logger.LogInformation($"adding parameter {user?.Id})");

                        cmd.Parameters.AddWithValue("@UserId", user?.Id);
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
                        _logger.LogError(ex, "Error retrieving scores.");
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
            _logger.LogInformation($"POST /Wordler/SubmitGuess");

            var connectionString = _config.GetConnectionString("DefaultConnection");
            try
            {
                await using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await connection.OpenAsync();

                var query = "INSERT INTO wordler_guess (user_id, attempt_number, guess, difficulty, date) " +
                            "VALUES (@user_id, @attempt_number, @guess, @difficulty, @date)";


                await using var command = new MySqlCommand(query, connection);
                command.Parameters.AddWithValue("@user_id", guess.User?.Id ?? 0);
                command.Parameters.AddWithValue("@attempt_number", guess.AttemptNumber);
                command.Parameters.AddWithValue("@guess", guess.Guess);
                command.Parameters.AddWithValue("@difficulty", guess.Difficulty);
                command.Parameters.AddWithValue("@date", DateTime.UtcNow);


                await command.ExecuteNonQueryAsync();
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inserting guess");
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpPost("/Wordler/GetGuesses/{difficulty}")]
        public async Task<IActionResult> GetGuesses([FromBody] User user, int difficulty)
        {
            if (user == null || user.Id == 0)
            {
                return Forbid("Anonymous users cannot save their guesses for later. Please log in if you want to keep your guess history.");
            }
            _logger.LogInformation($"POST /Wordler/GetGuesses/{difficulty} (for user : {user.Id}, Current UTC Time : {DateTime.UtcNow})");

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
                command.Parameters.AddWithValue("@user_id", user.Id);
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
                _logger.LogError(ex, "Error retrieving guesses");
                return StatusCode(500, "Internal server error");
            }
        }


        [HttpPost("/Wordler/GetDictionaryWord/{word}")]
        public async Task<IActionResult> GetDictionaryWord(string word)
        {
            _logger.LogInformation($"POST /Wordler/GetDictionaryWord/{word}");
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
                _logger.LogError(ex, "Error retrieving definition for word: " + word);
                return StatusCode(500, "Error retrieving definition for word: " + word);
            }
        }
        
        [HttpPost("/Wordler/GetConsecutiveDaysStreak/")]
        public async Task<IActionResult> GetConsecutiveDays([FromBody] User user)
        {
            _logger.LogInformation($"GET /Wordler/GetConsecutiveDaysStreak/{user.Id}");

            if (user.Id <= 0)
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
                        SELECT DATE(submitted) AS score_date
                        FROM wordler_scores
                        WHERE user_id = @userId
                        ORDER BY score_date DESC";

                    using (var command = new MySqlCommand(query, connection))
                    {
                        command.Parameters.AddWithValue("@userId", user.Id);

                        var scoreDates = new List<DateTime>();
                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                            {
                                scoreDates.Add(reader.GetDateTime("score_date"));
                            }
                        }

                        int consecutiveDays = CalculateConsecutiveDays(scoreDates);
                        return Ok(consecutiveDays);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching the consecutive days.");
                return StatusCode(500, "An error occurred while fetching the consecutive days.");
            }
        }

        private int CalculateConsecutiveDays(List<DateTime> dates)
        {
            if (dates == null || dates.Count == 0)
            {
                return 0;
            }

            // Sort the dates in ascending order
            dates.Sort();

            int consecutiveDays = 1;
            int maxConsecutiveDays = 1;

            for (int i = 1; i < dates.Count; i++)
            {
                // Check if the current date is the day after the previous date
                if ((dates[i] - dates[i - 1]).Days == 1)
                {
                    consecutiveDays++;
                    maxConsecutiveDays = Math.Max(maxConsecutiveDays, consecutiveDays);
                }
                else if ((dates[i] - dates[i - 1]).Days > 1)
                {
                    consecutiveDays = 1;
                }
            }

            return maxConsecutiveDays;
        }
    }
}