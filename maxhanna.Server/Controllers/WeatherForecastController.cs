using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Weather;
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

		private readonly Log _log;
		private readonly IConfiguration _config;

		public WeatherForecastController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("", Name = "GetWeatherForecast")]
		public async Task<WeatherForecast> GetWeatherForecast([FromBody] int userId)
		{ 
			var weatherLocationRes = await GetWeatherLocation(userId);
			var weatherLocation = weatherLocationRes.Location;
			if (string.IsNullOrEmpty(weatherLocation))
			{
				weatherLocation = "Montreal";
			}

			// Check if there's a valid entry in the database
			var cachedWeather = await GetCachedWeather(weatherLocation);
			if (cachedWeather != null)
			{ 
				return cachedWeather;
			}

			// Use the retrieved location in the API request
			var client = new RestClient(urlRoot);
			var request = new RestRequest($"?key={apiKey}&q={weatherLocation}&days=3");

			var response = client.Execute(request, Method.Get);
			var content = response.Content;
			if (content != null)
			{
				var weatherForecast = JsonConvert.DeserializeObject<WeatherForecast>(content!);

				// Cache the new weather data
				if (weatherForecast != null)
				{
					await CacheWeatherData(weatherForecast, weatherLocation);
				}
				return weatherForecast!;
			}
			else return new WeatherForecast();
		}

		private async Task<WeatherForecast?> GetCachedWeather(string location)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					string sql = "SELECT weather_data, timestamp FROM user_weather_forecast " +
											 "WHERE location = @Location ORDER BY timestamp DESC LIMIT 1;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Location", location);
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							if (await rdr.ReadAsync())
							{
								var timestamp = rdr.GetDateTime("timestamp");
								if (timestamp > DateTime.Now.AddMinutes(-60))
								{
									var weatherData = rdr.GetString("weather_data");
									return JsonConvert.DeserializeObject<WeatherForecast>(weatherData);
								}
							}
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while retrieving cached weather data. " + ex.Message, null, "WEATHER", true);
			}

			return null;
		}

		private async Task CacheWeatherData(WeatherForecast weatherForecast, string location)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					string sql = "INSERT INTO user_weather_forecast (location, weather_data, timestamp) " +
											 "VALUES (@Location, @WeatherData, @Timestamp) " +
											 "ON DUPLICATE KEY UPDATE weather_data = @WeatherData, timestamp = @Timestamp;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Location", location);
						cmd.Parameters.AddWithValue("@WeatherData", JsonConvert.SerializeObject(weatherForecast));
						cmd.Parameters.AddWithValue("@Timestamp", DateTime.Now);
						await cmd.ExecuteNonQueryAsync();
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while caching weather data. " + ex.Message, null, "WEATHER", true);
			}
		}

		[HttpPost("/WeatherForecast/GetWeatherLocation", Name = "GetWeatherLocation")]
		public async Task<WeatherLocation> GetWeatherLocation([FromBody] int userId)
		{ 
			if (userId == 0)
			{
				return new WeatherLocation();
			}
			var loc = new WeatherLocation();

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "SELECT ownership, location, city, country FROM maxhanna.weather_location WHERE ownership = @Owner;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							while (await rdr.ReadAsync())
							{
								loc.Ownership = rdr.GetInt32(0);
								loc.Location = rdr.IsDBNull(rdr.GetOrdinal("location")) ? null : rdr.GetString("location");
								loc.City = rdr.IsDBNull(rdr.GetOrdinal("city")) ? null : rdr.GetString("city");
								loc.Country = rdr.IsDBNull(rdr.GetOrdinal("country")) ? null : rdr.GetString("country");
							}
						}
					}
				} 
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while retrieving weather location. " + ex.Message, userId, "WEATHER", true);
				throw;
			}

			return loc;
		}

		[HttpPut("/WeatherForecast/UpdateWeatherLocation", Name = "UpdateWeatherLocation")]
		public async Task<IActionResult> UpdateOrCreateWeatherLocation([FromBody] CreateWeatherLocation location)
		{ 
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "INSERT INTO maxhanna.weather_location (ownership, location, city, country) VALUES (@Owner, @Location, @City, @Country) " +
											 "ON DUPLICATE KEY UPDATE location = @Location, city = @City, country = @Country;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", location.userId);
						cmd.Parameters.AddWithValue("@Location", location.location);
						cmd.Parameters.AddWithValue("@City", location.city);
						cmd.Parameters.AddWithValue("@Country", location.country);
						if (await cmd.ExecuteNonQueryAsync() >= 0)
						{
							return Ok("Weather location updated.");
						}
						else
						{
							_ = _log.Db("Returned 500", null, "WEATHER", true);
							return StatusCode(500, "Failed to update or create data");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while updating or creating Weather location." + ex.Message, location.userId, "WEATHER", true);
				throw;
			}
		}
	}
}
