using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class AiController : ControllerBase
	{
		private readonly ILogger<AiController> _logger;
		private readonly IConfiguration _config;
		private readonly HttpClient _httpClient;

		public AiController(ILogger<AiController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
			_httpClient = new HttpClient();
		}

		[HttpPost("/Ai/SendMessageToAi", Name = "SendMessageToAi")]
		public async Task<IActionResult> SendMessageToAi([FromBody] AiRequest request)
		{
			if (string.IsNullOrWhiteSpace(request.Message))
			{
				return BadRequest("Message cannot be empty.");
			}

			_logger.LogInformation($"POST /Ai/SendMessage ({request.Message})");

			try
			{
				string apiKey = _config.GetValue<string>("GoogleGemini:ApiKey") ?? "";
				if (string.IsNullOrEmpty(apiKey))
				{
					return StatusCode(500, "Google Gemini API key is not configured.");
				}

				var requestBody = new
				{
					contents = new[]
						{
								new { parts = new[] { new { text = request.Message } } }
						}
				};

				var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

				var response = await _httpClient.PostAsync($"https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key={apiKey}", jsonContent);
				var responseBody = await response.Content.ReadAsStringAsync();

				_logger.LogInformation($"Google Gemini response: {responseBody}");

				if (!response.IsSuccessStatusCode)
				{
					_logger.LogError($"Google Gemini API error: {responseBody}");
					return StatusCode((int)response.StatusCode, "Error communicating with Google Gemini API.");
				}

				string reply = JsonDocument.Parse(responseBody)
													 .RootElement
													 .GetProperty("candidates")[0]
													 .GetProperty("content")
													 .GetProperty("parts")[0]
													 .GetProperty("text")
													 .GetString() ?? "No response from AI."; 

				return Ok(new { Reply = reply });
			}
			catch (Exception ex)
			{
				_logger.LogError($"Error in SendMessage: {ex.Message}");
				return StatusCode(500, "Internal server error.");
			}
		}
	}

	public class AiRequest
	{
		public required string Message { get; set; }
	}

	public class AiResponse
	{
		public required List<Candidate> Candidates { get; set; }
	}

	public class Candidate
	{
		public required Content Content { get; set; }
	}

	public class Content
	{
		public required List<Part> Parts { get; set; }
	}

	public class Part
	{
		public required string Text { get; set; }
	}
}
