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

				// Ollama request payload
				var requestBody = new
				{
					model = "gemma3",  // Make sure you have the correct model installed
					prompt = request.Message,
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
	}
}
