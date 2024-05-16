using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using RestSharp;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class WeatherForecastController : ControllerBase
    {
        private static string apiKey = "ed8780abdcd9416eaa6220743242504";
        private static string urlRoot = "https://api.weatherapi.com/v1/forecast.json";

        private readonly ILogger<WeatherForecastController> _logger;

        public WeatherForecastController(ILogger<WeatherForecastController> logger)
        {
            _logger = logger;
        }

        
        [HttpPost("", Name = "GetWeatherForecast")]
        public WeatherForecast Get([FromBody] User user)
        {
            _logger.LogInformation("POST /WeatherForecast");

            var client = new RestClient(urlRoot);
            var request = new RestRequest($"?key={apiKey}&q=Montreal&days=3");


            var response = client.Execute(request, Method.Get);
            var content = response.Content;

            var weatherForecast = JsonConvert.DeserializeObject<WeatherForecast>(content!);
            return weatherForecast!;
             

        }
    }
}
