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
        private static readonly string apiUrl = "https://api.goperigon.com/v1/all?excludeLabel=Low%20Content&size=100&sortBy=date&language=en";
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
                    augmentedUrl += "&q=" + keywords;
                }

                client.DefaultRequestHeaders.Clear(); 
                client.DefaultRequestHeaders.Add("X-API-KEY", apiKey);
                _logger.LogInformation("Client request headers: " + client.DefaultRequestHeaders.ToString());

                HttpResponseMessage response = await client.GetAsync(augmentedUrl);

                if (response.IsSuccessStatusCode)
                {
                    string responseBody = await response.Content.ReadAsStringAsync();

                    var newsData = JsonConvert.DeserializeObject<NewsResponse>(responseBody);
                    _logger.LogInformation($"Returning {newsData}");

                    return Ok(newsData);
                }
                else
                {
                    _logger.LogInformation($"Returning error ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");

                    return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return StatusCode(500, "An error occurred while fetching news data");
            }
        }

    }
}
