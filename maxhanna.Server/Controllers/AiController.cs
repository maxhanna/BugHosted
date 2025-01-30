using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;

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
					contents = new[] { new { parts = new[] { new { text = request.Message } } } }
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
		[HttpPost("/Ai/GenerateImageWithAi", Name = "GenerateImageWithAi")]
		public async Task<IActionResult> GenerateImageWithAi([FromBody] AiRequest request)
		{
			if (string.IsNullOrWhiteSpace(request.Message))
			{
				return BadRequest("Message cannot be empty.");
			}

			_logger.LogInformation($"POST /Ai/GenerateImageWithAi ({request.Message})");

			try
			{
				string apiKey = _config.GetValue<string>("GoogleGemini:ApiKey") ?? "";
				if (string.IsNullOrEmpty(apiKey))
				{
					return StatusCode(500, "Google AI API key is not configured.");
				}

				var requestBody = new
				{
					prompt = request.Message,
					model = "imagen-3.0-generate-002", // Specify the Imagen model here
					config = new
					{
						negative_prompt = "people", // You can customize this based on your needs
						number_of_images = 1, // Number of images to generate
						include_rai_reason = true, // Include reasons for the generated image
						output_mime_type = "image/jpeg" // The output mime type
					}
				};

				var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

				var response = await _httpClient.PostAsync(
		$"https://generativelanguage.googleapis.com/v1beta/models/imagen:generateImage?key={apiKey}",
								jsonContent
				);

				var responseBody = await response.Content.ReadAsStringAsync();
				_logger.LogInformation($"Imagen API response: {responseBody}");

				if (!response.IsSuccessStatusCode)
				{
					_logger.LogError($"Imagen API error: {response}");
					return StatusCode((int)response.StatusCode, $"Error communicating with Imagen API: {response}");
				}

				// Parse response
				var jsonDoc = JsonDocument.Parse(responseBody);
				if (jsonDoc.RootElement.TryGetProperty("generated_images", out var generatedImages) && generatedImages.GetArrayLength() > 0)
				{
					var firstImage = generatedImages[0];
					if (firstImage.TryGetProperty("image", out var imageElement))
					{
						string base64Image = imageElement.GetString() ?? "";
						base64Image = base64Image.Replace("\n", "").Replace("\r", "");

						// Validate base64
						if (IsValidBase64(base64Image))
						{
							return Ok(new { Reply = base64Image, MimeType = "image/jpeg" });
						}
						else
						{
							return BadRequest("Invalid base64 image data.");
						}
					}
				}

				return StatusCode(500, "No image was generated.");
			}
			catch (Exception ex)
			{
				_logger.LogError($"Error in GenerateImageWithAi: {ex.Message}");
				return StatusCode(500, "Internal server error.");
			}
		}
		private bool IsValidBase64(string base64String)
		{
			try
			{
				Convert.FromBase64String(base64String); // Attempt to decode base64
				return true;
			}
			catch
			{
				return false;
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
}
