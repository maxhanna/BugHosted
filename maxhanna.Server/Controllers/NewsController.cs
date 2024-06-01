using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using MySqlConnector;
using Newtonsoft.Json;
using RestSharp;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class NewsController : ControllerBase
    {
        private static readonly HttpClient client = new HttpClient();
        private static readonly string apiUrl = "https://api.goperigon.com/v1/all";
        private static readonly string apiKey = "b94bb4e9-f2fb-4ec9-bf30-b6ab071ba00d";

        private readonly ILogger<NewsController> _logger;
        private readonly IConfiguration _config;

        public NewsController(ILogger<NewsController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost(Name = "GetAllNews")]
        public async Task<IActionResult> GetAllNews([FromBody] User user, [FromQuery] string? keywords)
        {
            _logger.LogInformation($"POST /News (for user: {user.Id}, keywords?: {keywords})");
            try
            {
                var augmentedUrl = apiUrl;
                if (!string.IsNullOrEmpty(keywords))
                {
                    augmentedUrl += "?q=" + keywords;
                }
                // Add API key to request headers
                client.DefaultRequestHeaders.Add("X-API-KEY", apiKey);
                _logger.LogInformation("Client request headers: " + client.DefaultRequestHeaders.ToString());

                // Make a GET request to the API endpoint
                HttpResponseMessage response = await client.GetAsync(augmentedUrl);

                // Check if the request was successful
                if (response.IsSuccessStatusCode)
                {
                    // Read the response content
                    string responseBody = await response.Content.ReadAsStringAsync();
                    //_logger.LogInformation($"got response body: {responseBody}");

                    // Deserialize JSON response into object
                    var newsData = JsonConvert.DeserializeObject<NewsResponse>(responseBody);
                    _logger.LogInformation($"Returning {newsData}");

                    // Return the news data
                    return Ok(newsData);
                }
                else
                {
                    _logger.LogInformation($"Returning error ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");

                    // Return error status code and message
                    return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
                }
            }
            catch (Exception ex)
            {
                // Log and return error
                Console.WriteLine(ex.Message);
                return StatusCode(500, "An error occurred while fetching news data");
            }
        }

    } 
}
