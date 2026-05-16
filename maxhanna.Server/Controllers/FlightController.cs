using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class FlightController : ControllerBase
	{
		private readonly IHttpClientFactory _httpClientFactory;
		private readonly IConfiguration _config;
		private readonly Log _log;

		public FlightController(IHttpClientFactory httpClientFactory, IConfiguration config, Log log)
		{
			_httpClientFactory = httpClientFactory;
			_config = config;
			_log = log;
		}

		[HttpGet("states")]
		public async Task<IActionResult> GetStates([FromQuery] string? callsigns = null)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cleanup = new MySqlCommand("DELETE FROM maxhanna.flight_cache WHERE created_at < UTC_TIMESTAMP() - INTERVAL 2 MINUTE", conn))
					{
						await cleanup.ExecuteNonQueryAsync();
					}

					string? cachedJson = null;
					using (var readCmd = new MySqlCommand("SELECT cache_data FROM maxhanna.flight_cache ORDER BY created_at DESC LIMIT 1", conn))
					{
						var result = await readCmd.ExecuteScalarAsync();
						if (result != null && result != DBNull.Value)
						{
							cachedJson = result.ToString();
						}
					}

					List<List<object?>> states;
					if (cachedJson != null)
					{
						states = JsonConvert.DeserializeObject<List<List<object?>>>(cachedJson) ?? new List<List<object?>>();
					}
					else
					{
						states = await FetchFromOpenSky();
						if (states.Count > 0)
						{
							var json = JsonConvert.SerializeObject(states);
							Console.WriteLine($"Cached: {json}");
							using (var insertCmd = new MySqlCommand("INSERT INTO maxhanna.flight_cache (cache_data, created_at) VALUES (@data, UTC_TIMESTAMP())", conn))
							{
								insertCmd.Parameters.AddWithValue("@data", json);
								await insertCmd.ExecuteNonQueryAsync();
							}
						}
					}

					if (string.IsNullOrWhiteSpace(callsigns))
						return Ok(new { states = new List<object>() });

					var wanted = callsigns.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
						.Select(c => c.ToUpperInvariant())
						.ToHashSet();

					var matched = states
						.Where(s => s.Count > 1 && s[1] is string cs && wanted.Contains(((string)cs).Trim().ToUpperInvariant()))
						.ToList();

					return Ok(new { states = matched });
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Flight states error: {ex.Message}", null, "FLIGHT", true);
				return Ok(new { states = new List<object>() });
			}
		}

		private async Task<List<List<object?>>> FetchFromOpenSky()
		{
			try
			{
				var client = _httpClientFactory.CreateClient();
				var response = await client.GetAsync("https://opensky-network.org/api/states/all");
				if (response.IsSuccessStatusCode)
				{
					var json = await response.Content.ReadAsStringAsync();
					var data = JsonConvert.DeserializeAnonymousType(json, new { states = new List<List<object?>>() });
					if (data?.states != null)
					{
						return data.states;
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"OpenSky fetch error: {ex.Message}", null, "FLIGHT", true);
			}
			return new List<List<object?>>();
		}
	}
}
