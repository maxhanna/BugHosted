using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using MySqlConnector;
using NewsAPI.Models;
using NewsAPI;
using Newtonsoft.Json;
using RestSharp;
using NewsAPI.Constants;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class NewsController : ControllerBase
    {  
        private readonly ILogger<NewsController> _logger;

        public NewsController(ILogger<NewsController> logger)
        {
            _logger = logger;
        }

        [HttpPost(Name = "GetAllNews")]
        public ArticlesResult GetAllNews([FromBody] User user, [FromQuery] string? keywords)
        {
            _logger.LogInformation($"POST /News (for user: {user.Id}, keywords?: {keywords})");
            try
            {
                var newsApiClient = new NewsApiClient("f782cf1b4d3349dd86ef8d9ac53d0440");
                var articlesResponse = new ArticlesResult();
                if (keywords != null)
                {
                    articlesResponse = newsApiClient.GetEverything(new EverythingRequest
                    {
                        Q = keywords,
                        SortBy = SortBys.PublishedAt,
                        Language = Languages.EN
                    });
                } else
                {
                    articlesResponse = newsApiClient.GetTopHeadlines(new TopHeadlinesRequest
                    {  
                        Language = Languages.EN
                    });
                }
                if (articlesResponse.Status == Statuses.Ok)
                {
                    return articlesResponse;  
                } 
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                return new ArticlesResult();
            }

            return new ArticlesResult();
        }

    }
}
