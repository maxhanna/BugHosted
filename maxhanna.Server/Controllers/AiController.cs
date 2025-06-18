using Google.Apis.Auth.OAuth2;
using maxhanna.Server.Controllers.DataContracts.Array;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class AiController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly HttpClient _httpClient;

		public AiController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
			_httpClient = new HttpClient();
		}

		[HttpPost("/Ai/SendMessageToAi", Name = "SendMessageToAi")]
		public async Task<IActionResult> SendMessageToAi([FromBody] AiRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			if (request.UserId != 0)
			{
				if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
			}

			if (request == null || string.IsNullOrWhiteSpace(request.Message))
			{
				return BadRequest("Message cannot be empty.");
			}
			try
			{
				bool hasExceeded = await HasExceededUsageLimit("text", request.UserId);
				if (hasExceeded)
				{
					return StatusCode(429, new { Reply = "You have exceeded the maximum number of text requests for this month." });
				}
				if (!request.SkipSave)
				{
					await UpdateUserRequestCount(request.UserId, request.Message, "text");
				}

				// Ollama API URL
				string url = "http://localhost:11434/api/generate";
				string basePrompt = request.Message;

				switch (request.MaxCount)
				{
					case 30: // Super short
						basePrompt += "\n\nRespond in one concise sentence. Do not elaborate.";
						break;

					case 200: // Short
						basePrompt += "\n\nRespond briefly. Keep it to a few sentences and avoid unnecessary detail.";
						break;

					case 450: // Medium
						basePrompt += "\n\nRespond with a moderate amount of detail. Two to three paragraphs is ideal.";
						break;

					case 600: // Long
						basePrompt += "\n\nRespond in detail. Feel free to explain thoroughly and give multiple examples if needed.";
						break;

					case 0: // Unfiltered
							// No modification � allow model to respond freely
						break;

					default:
						// Catch-all for unexpected values, use safe default
						basePrompt += "\n\nRespond briefly.";
						break;
				}

				// Ollama request payload
				var requestBody = new
				{
					model = "gemma3",  // Make sure you have the correct model installed
					prompt = basePrompt,
					stream = false,
					max_tokens = request.MaxCount,
				};

				var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

				// Create a CancellationTokenSource
				using (var cancellationTokenSource = new CancellationTokenSource())
				{
					var cancellationToken = cancellationTokenSource.Token;

					// Create an HttpRequestMessage
					var httpRequestMessage = new HttpRequestMessage(HttpMethod.Post, url)
					{
						Content = jsonContent
					};

					// Pass the cancellation token in the request
					var ollamaResponse = await _httpClient.SendAsync(httpRequestMessage, HttpCompletionOption.ResponseHeadersRead, cancellationToken);

					if (!ollamaResponse.IsSuccessStatusCode)
					{
						return StatusCode((int)ollamaResponse.StatusCode, new { Reply = "Error communicating with Ollama API. " });
					}

					// Stream the response
					var stream = ollamaResponse.Content.ReadAsStream();
					var buffer = new byte[1024];
					using (var ms = new MemoryStream())
					{
						while (true)
						{
							var bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, cancellationToken);
							if (bytesRead == 0)
								break;

							ms.Write(buffer, 0, bytesRead);
							var chunk = Encoding.UTF8.GetString(ms.ToArray());
							ms.SetLength(0); // Reset the MemoryStream for the next chunk

							// Send each chunk as part of the response
							await Response.WriteAsync(chunk, cancellationToken);
							await Response.Body.FlushAsync(cancellationToken);
						}
					}

					return new EmptyResult(); // End the response
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in SendMessageToAi: {ex.Message}", null);
				return StatusCode(500, new { Reply = "Internal server error." });
			}
		}


		[HttpPost("/Ai/GenerateImageWithAi", Name = "GenerateImageWithAi")]
		public async Task<IActionResult> GenerateImageWithAi([FromBody] AiRequest request)
		{
			if (request == null || string.IsNullOrWhiteSpace(request.Message))
			{
				return BadRequest(new { Reply = "Message cannot be empty." });
			}
			if (request.UserId == 0)
			{
				return BadRequest(new { Reply = "User cannot be null." });
			}

			try
			{
				bool hasExceeded = await HasExceededUsageLimit("image", request.UserId);
				if (hasExceeded)
				{
					return StatusCode(429, new { Reply = "You have exceeded the maximum number of image requests for this month." });
				}
				await UpdateUserRequestCount(request.UserId, request.Message, "image");
				// Load Service Account credentials from JSON key file
				GoogleCredential credential = GoogleCredential.FromFile("./Properties/gen-lang-client-0917682158-bbfe62a207b1.json")
																			.CreateScoped("https://www.googleapis.com/auth/cloud-platform");

				// Get OAuth2 token
				var token = await credential.UnderlyingCredential.GetAccessTokenForRequestAsync();

				var requestBody = new
				{
					instances = new[]
						{
								new { prompt = request.Message }
						}
				};

				var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

				// Attach OAuth token to request headers
				_httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

				var response = await _httpClient.PostAsync(
						"https://us-central1-aiplatform.googleapis.com/v1/projects/bughosted/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict",
						jsonContent
				);

				var responseBody = await response.Content.ReadAsStringAsync();

				if (!response.IsSuccessStatusCode)
				{
					_ = _log.Db($"Imagen API error: {response}", null);
					return StatusCode((int)response.StatusCode, new { Reply = $"Error communicating with Imagen API: {responseBody}" });
				}

				return Ok(responseBody);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in GenerateImageWithAi: {ex.Message}", null);
				return StatusCode(500, new { Reply = "Internal server error." });
			}
		}

		[HttpPost("/Ai/GetMarketSentiment", Name = "GetMarketSentiment")]
		public async Task<IActionResult> GetMarketSentiment([FromBody] MarketSentimentRequest request)
		{ 
			DateTime utcNow = DateTime.UtcNow; 
			DateTime from = request.Start ?? utcNow.AddDays(-7);
			DateTime to = request.End ?? utcNow;

			if (from > to)
				return BadRequest("`start` must be earlier than `end`.");

			var snapshots = new List<object>();

			await using (var conn = new MySqlConnection(
							 _config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				const string sql = @"
					SELECT id,
						sentiment_score,
						analysis_text,
						created
					FROM   market_sentiment_analysis
					WHERE  created BETWEEN @from AND @to
					ORDER  BY created DESC;";

				using var cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@from", from);
				cmd.Parameters.AddWithValue("@to", to);

				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					snapshots.Add(new
					{
						Id = reader.GetInt32("id"),
						SentimentScore = reader.GetInt32("sentiment_score"),
						Analysis = reader.GetString("analysis_text"),
						CreatedUtc = reader.GetDateTime("created")
					});
				}
			}

			if (snapshots.Count == 0)
				return NoContent();                    // 204 – nothing for that range

			return Ok(snapshots);                      // 200 – JSON array
		}

		/// <summary>
		/// Returns true when either (a) a fresh sentiment row already exists
		/// or (b) one was just generated and inserted.  Returns false only on error.
		/// </summary>
		public async Task<bool> ProvideMarketAnalysis()
		{
			_ = _log.Db("Providing Market Sentiment Analysis for the last 3 hours...", null, "AIController", outputToConsole: true);
			try
			{
				var newsBlob = await GetLatestNewsDescriptionsAsync();
				// 1.  Do we already have a snapshot from the last 3 h?
				await using (var conn = new MySqlConnection(
								  _config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					const string recentSql = @"
                SELECT id, sentiment_score, analysis_text, created
                FROM   market_sentiment_analysis
                WHERE  created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
                ORDER  BY created DESC
                LIMIT  1";

					using var checkCmd = new MySqlCommand(recentSql, conn);
					using var reader = await checkCmd.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						// Already exists, no need to insert again
						return true;
					}
				}

				// 2.  Build the prompt exactly once
				var prompt = @$"
					Provide a sentiment analysis of the market (0 = black-swan crash imminent, 100 = everyone eager to buy).
					Return ONLY in this exact format:

					Sentiment: <number>
					Analysis: <concise explanation>

					Given the following news articles:
					{newsBlob}";

				// 4.  Call Ollama exactly like SendMessageToAi, but capture the JSON
				var ollamaUrl = "http://localhost:11434/api/generate";
				var body = new
				{
					model = "gemma3",
					prompt = prompt,
					stream = false,
					max_tokens = 450
				};

				using var httpRequest = new HttpRequestMessage(HttpMethod.Post, ollamaUrl)
				{
					Content = new StringContent(
						JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
				};

				var ollamaResponse = await _httpClient.SendAsync(httpRequest);
				if (!ollamaResponse.IsSuccessStatusCode)
				{
					_ = _log.Db($"Ollama error: {ollamaResponse.StatusCode}", null);
					return false;
				}

				var rawJson = await ollamaResponse.Content.ReadAsStringAsync();
				// Ollama’s /generate returns { "response":"…text…" , … }
				var parsed = JsonSerializer.Deserialize<JsonElement>(rawJson);
				var aiText = parsed.GetProperty("response").GetString() ?? "";

				// 5.  Parse “Sentiment: 73, Analysis: …”
				//     (robust split in case the comma is missing or spacing differs)
				var firstLine = aiText.Split('\n', StringSplitOptions.RemoveEmptyEntries)
									  .FirstOrDefault() ?? "";
				var scoreMatch = System.Text.RegularExpressions.Regex.Match(firstLine, @"Sentiment:\s*(\d{1,3})",
											 System.Text.RegularExpressions.RegexOptions.IgnoreCase);
				var sentimentScore = scoreMatch.Success
								   ? int.Parse(scoreMatch.Groups[1].Value)
								   : -1; // sentinel for unexpected format
				var analysisText = aiText.Replace("Sentiment:", "")
										 .Replace($" {sentimentScore}", "")
										 .Replace("Analysis:", "")
										 .Trim();

				// 6.  Store the snapshot
				await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					const string insertSql = @"
						INSERT INTO market_sentiment_analysis
						(sentiment_score, analysis_text, created)
						VALUES
						(@score, @analysis, UTC_TIMESTAMP());";

					using var insertCmd = new MySqlCommand(insertSql, conn);
					insertCmd.Parameters.AddWithValue("@score", sentimentScore);
					insertCmd.Parameters.AddWithValue("@analysis", analysisText);
					await insertCmd.ExecuteNonQueryAsync();
				}

				return true;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"ProvideMarketAnalysis failed: {ex.Message}", null);
				return false;
			}
		}
		public async Task<string> GetLatestNewsDescriptionsAsync()
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			const string sql = @"
				SELECT description
				FROM news_headlines
				WHERE saved_at >= NOW() - INTERVAL 1 DAY
				AND description IS NOT NULL;";

			using var cmd = new MySqlCommand(sql, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			var descriptions = new List<string>();
			while (await reader.ReadAsync())
			{
				if (!reader.IsDBNull(0))
					descriptions.Add(reader.GetString(0));
			}

			return string.Join("\n\n", descriptions);
		}

		private async Task<bool> HasExceededUsageLimit(string callType, int userId)
		{
			string sql = "";
			long currentCount = 0;
			long limit = 0;
			int MaxTextRequestsPerHourGlobal = 600;
			int MaxTextRequestsPerHourUser = 100;
			int MaxImageRequestsPerHour = 1;

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			if (callType == "text")
			{
				// Check global text requests in the last hour
				limit = MaxTextRequestsPerHourGlobal;
				sql = @"
            SELECT COUNT(*)
            FROM maxhanna.host_ai_calls
            WHERE type = 'text'
              AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR);";

				using var cmdTextGlobal = new MySqlCommand(sql, conn);
				long globalCount = (long)(await cmdTextGlobal.ExecuteScalarAsync() ?? 0L);
				if (userId == 0)
				{
					return globalCount >= MaxTextRequestsPerHourGlobal;
				}
				// Check user-specific text requests in the last hour
				sql = @"
            SELECT COUNT(*)
            FROM maxhanna.host_ai_calls
            WHERE type = 'text'
              AND user_id = @userId
              AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR);";

				using var cmdTextUser = new MySqlCommand(sql, conn);
				cmdTextUser.Parameters.AddWithValue("@userId", userId);
				long userCount = (long)(await cmdTextUser.ExecuteScalarAsync() ?? 0L);

				// Return true if either limit is exceeded
				return globalCount >= MaxTextRequestsPerHourGlobal || userCount >= MaxTextRequestsPerHourUser;
			}
			else
			{
				// Check image requests in the current calendar month
				limit = MaxImageRequestsPerHour;
				sql = @"
            SELECT COUNT(*)
            FROM maxhanna.host_ai_calls
            WHERE type = 'image'
              AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR);";

				using var cmdImage = new MySqlCommand(sql, conn);
				currentCount = (long)(await cmdImage.ExecuteScalarAsync() ?? 0L);
				_ = _log.Db($"Current image requests this month: {currentCount} (Limit: {limit})", null);

				return currentCount >= limit;
			}
		}
		private async Task UpdateUserRequestCount(int userId, string message, string callType)
		{
			// Basic validation for callType
			if (callType != "text" && callType != "image")
			{
				_ = _log.Db($"Invalid callType '{callType}' provided to UpdateUserRequestCount.", null);
				// Decide if you want to throw an exception or just log and potentially skip insert
				return; // Or throw new ArgumentException("Invalid callType");
			}

			string sql = @"
        INSERT INTO maxhanna.host_ai_calls (user_id, created, message, type)
        VALUES (@UserId, UTC_TIMESTAMP(), @message, @type);";

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId); // Assuming 0 for anonymous/unknown if user is null
			cmd.Parameters.AddWithValue("@message", message);
			cmd.Parameters.AddWithValue("@type", callType); // Add the type parameter
			await cmd.ExecuteNonQueryAsync();
		}
		public class AiRequest
		{
			public required int UserId { get; set; }
			public required string Message { get; set; }
			public required bool SkipSave { get; set; }
			public required int MaxCount { get; set; }
		}
		public class MarketSentimentRequest
		{
			public DateTime? Start { get; set; }
			public DateTime? End { get; set; }
		}
	}
}
