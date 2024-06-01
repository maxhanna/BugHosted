
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace maxhanna.Server.Controllers.Helpers
{
    public class DalleImageGeneratorService : BackgroundService
    {
        private readonly ILogger<DalleImageGeneratorService> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _apiKey;
        private readonly string _outputDirectory;

        public DalleImageGeneratorService(ILogger<DalleImageGeneratorService> logger, IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _apiKey = "sk-proj-ObDmItDaI81QO7sucYELT3BlbkFJwn17jaTkW85KNc3ni9M5"; // Replace with your OpenAI API key
            _outputDirectory = "DalleImages";
            Directory.CreateDirectory(_outputDirectory);
        }
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("DalleImageGeneratorService started.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await GenerateAndSaveImage();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while generating or saving the image.");
                }

                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }

            _logger.LogInformation("DalleImageGeneratorService stopped.");
        }

        private async Task GenerateAndSaveImage()
        {
            var httpClient = _httpClientFactory.CreateClient();
            var requestUrl = "https://api.openai.com/v1/images/generations";

            var requestData = new
            {
                model = "dall-e-3",
                prompt = "A futuristic cityscape with flying cars",
                n = 1,
                size = "1024x1024"
            };

            var requestContent = new StringContent(JsonSerializer.Serialize(requestData), System.Text.Encoding.UTF8, "application/json");

            var requestMessage = new HttpRequestMessage(HttpMethod.Post, requestUrl)
            {
                Content = requestContent
            };
            requestMessage.Headers.Add("Authorization", $"Bearer {_apiKey}");

            var response = await httpClient.SendAsync(requestMessage);

            var responseContent = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError($"Failed to generate image. Status code: {response.StatusCode}, Response: {responseContent}");
                response.EnsureSuccessStatusCode(); // This will throw an exception with the status code
            }

            var responseData = JsonSerializer.Deserialize<JsonDocument>(responseContent);
            var base64Image = responseData.RootElement.GetProperty("data")[0].GetProperty("image").GetString();

            var imageBytes = Convert.FromBase64String(base64Image);
            var fileName = Path.Combine(_outputDirectory, $"dalle_image_{DateTime.UtcNow:yyyyMMddHHmmss}.png");

            await File.WriteAllBytesAsync(fileName, imageBytes);

            _logger.LogInformation($"Image generated and saved to {fileName}");
        }
    }
}
