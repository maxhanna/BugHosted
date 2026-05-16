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

		[HttpGet("tracked")]
		public async Task<IActionResult> GetTrackedFlights([FromQuery] int userId)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand("SELECT id, callsign, label, origin, destination, origin_lat, origin_lon, dest_lat, dest_lon, enabled FROM maxhanna.flight_tracked WHERE user_id = @userId ORDER BY created_at", conn))
					{
						cmd.Parameters.AddWithValue("@userId", userId);
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							var flights = new List<object>();
							while (await reader.ReadAsync())
							{
								flights.Add(new
								{
									id = reader.GetInt32("id").ToString(),
									callsign = reader.GetString("callsign"),
									label = reader.IsDBNull(reader.GetOrdinal("label")) ? null : reader.GetString("label"),
									origin = reader.IsDBNull(reader.GetOrdinal("origin")) ? null : reader.GetString("origin"),
									destination = reader.IsDBNull(reader.GetOrdinal("destination")) ? null : reader.GetString("destination"),
									originLat = reader.IsDBNull(reader.GetOrdinal("origin_lat")) ? null : (double?)reader.GetDouble("origin_lat"),
									originLon = reader.IsDBNull(reader.GetOrdinal("origin_lon")) ? null : (double?)reader.GetDouble("origin_lon"),
									destLat = reader.IsDBNull(reader.GetOrdinal("dest_lat")) ? null : (double?)reader.GetDouble("dest_lat"),
									destLon = reader.IsDBNull(reader.GetOrdinal("dest_lon")) ? null : (double?)reader.GetDouble("dest_lon"),
									enabled = reader.GetBoolean("enabled"),
								});
							}
							return Ok(new { flights });
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Get tracked flights error: {ex.Message}", userId, "FLIGHT", true);
				return Ok(new { flights = new List<object>() });
			}
		}

		[HttpPost("tracked")]
		public async Task<IActionResult> AddTrackedFlight([FromBody] TrackedFlightRequest request)
		{
			if (string.IsNullOrWhiteSpace(request.Callsign))
				return BadRequest("Callsign is required.");

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand(@"INSERT INTO maxhanna.flight_tracked (user_id, callsign, label, origin, destination, origin_lat, origin_lon, dest_lat, dest_lon, enabled, created_at) VALUES (@userId, @callsign, @label, @origin, @destination, @originLat, @originLon, @destLat, @destLon, 1, UTC_TIMESTAMP()); SELECT LAST_INSERT_ID();", conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.UserId);
						cmd.Parameters.AddWithValue("@callsign", request.Callsign.Trim().ToUpper());
						cmd.Parameters.AddWithValue("@label", (object?)request.Label ?? DBNull.Value);
						cmd.Parameters.AddWithValue("@origin", (object?)request.Origin ?? DBNull.Value);
						cmd.Parameters.AddWithValue("@destination", (object?)request.Destination ?? DBNull.Value);
						cmd.Parameters.AddWithValue("@originLat", (object?)request.OriginLat ?? DBNull.Value);
						cmd.Parameters.AddWithValue("@originLon", (object?)request.OriginLon ?? DBNull.Value);
						cmd.Parameters.AddWithValue("@destLat", (object?)request.DestLat ?? DBNull.Value);
						cmd.Parameters.AddWithValue("@destLon", (object?)request.DestLon ?? DBNull.Value);
						var id = Convert.ToInt32(await cmd.ExecuteScalarAsync());
						return Ok(new { id = id.ToString() });
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Add tracked flight error: {ex.Message}", request.UserId, "FLIGHT", true);
				return StatusCode(500, "Failed to add tracked flight.");
			}
		}

		[HttpPut("tracked")]
		public async Task<IActionResult> UpdateTrackedFlight([FromBody] UpdateTrackedFlightRequest request)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand("UPDATE maxhanna.flight_tracked SET enabled = @enabled WHERE id = @id AND user_id = @userId", conn))
					{
						cmd.Parameters.AddWithValue("@id", request.Id);
						cmd.Parameters.AddWithValue("@userId", request.UserId);
						cmd.Parameters.AddWithValue("@enabled", request.Enabled);
						await cmd.ExecuteNonQueryAsync();
						return Ok(new { ok = true });
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Update tracked flight error: {ex.Message}", request.UserId, "FLIGHT", true);
				return StatusCode(500, "Failed to update tracked flight.");
			}
		}

		[HttpDelete("tracked")]
		public async Task<IActionResult> DeleteTrackedFlight([FromQuery] int id, [FromQuery] int userId)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand("DELETE FROM maxhanna.flight_tracked WHERE id = @id AND user_id = @userId", conn))
					{
						cmd.Parameters.AddWithValue("@id", id);
						cmd.Parameters.AddWithValue("@userId", userId);
						await cmd.ExecuteNonQueryAsync();
						return Ok(new { ok = true });
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Delete tracked flight error: {ex.Message}", userId, "FLIGHT", true);
				return StatusCode(500, "Failed to delete tracked flight.");
			}
		}
	}

	public class TrackedFlightRequest
	{
		public int UserId { get; set; }
		public string Callsign { get; set; } = "";
		public string? Label { get; set; }
		public string? Origin { get; set; }
		public string? Destination { get; set; }
		public double? OriginLat { get; set; }
		public double? OriginLon { get; set; }
		public double? DestLat { get; set; }
		public double? DestLon { get; set; }
	}

	public class UpdateTrackedFlightRequest
	{
		public int Id { get; set; }
		public int UserId { get; set; }
		public bool Enabled { get; set; }
	}
}
