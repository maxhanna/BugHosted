using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
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
        private readonly IConfiguration _config;

        public WeatherForecastController(ILogger<WeatherForecastController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("", Name = "GetWeatherForecast")]
        public async Task<WeatherForecast> GetWeatherForecast([FromBody] User user)
        {
            _logger.LogInformation("POST /WeatherForecast");

            // Get the weather location for the user
            var weatherLocationRes = await GetWeatherLocation(user);
            var weatherLocation = weatherLocationRes.Location;
            if (weatherLocation == null || string.IsNullOrEmpty(weatherLocation))
            {
                weatherLocation = "Montreal";
            }
            // Use the retrieved location in the API request
            var client = new RestClient(urlRoot);
            var request = new RestRequest($"?key={apiKey}&q={weatherLocation}&days=3");

            var response = client.Execute(request, Method.Get);
            var content = response.Content;

            var weatherForecast = JsonConvert.DeserializeObject<WeatherForecast>(content);
            return weatherForecast;
        }

        [HttpPost("/WeatherForecast/GetWeatherLocation", Name = "GetWeatherLocation")]
        public async Task<WeatherLocation> GetWeatherLocation([FromBody] User user)
        {
            _logger.LogInformation($"Getting weather location for user ID: {user.Id}");

            var loc = new WeatherLocation();

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    string sql =
                        "SELECT ownership, location FROM maxhanna.weather_location WHERE ownership = @Owner;";
                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Owner", user.Id);
                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            while (await rdr.ReadAsync())
                            {
                                loc.Ownership = rdr.GetInt32(0);
                                loc.Location = rdr.GetString(1);
                            }
                        }
                    }
                }

                _logger.LogInformation("Weather location retrieved successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while retrieving weather location.");
                throw;
            }

            return loc;
        }

        [HttpPut("/WeatherForecast/UpdateWeatherLocation", Name = "UpdateWeatherLocation")]
        public async Task<IActionResult> UpdateOrCreateWeatherLocation([FromBody] CreateWeatherLocation location)
        {
            _logger.LogInformation($"Updating or creating weather location for user ID: {location.user.Id}");

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    string sql =
                        "INSERT INTO maxhanna.weather_location (ownership, location) VALUES (@Owner, @Location) " +
                        "ON DUPLICATE KEY UPDATE location = @Location;";
                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Owner", location.user.Id);
                        cmd.Parameters.AddWithValue("@Location", location.location);
                        if (await cmd.ExecuteNonQueryAsync() >= 0)
                        {
                            _logger.LogInformation("Returned OK");
                            return Ok("Weather location updated.");
                        }
                        else
                        {
                            _logger.LogInformation("Returned 500");
                            return StatusCode(500, "Failed to update or create data");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while updating or creating Weather location.");
                throw;
            }
        }

    }
}
