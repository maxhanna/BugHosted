using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

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
				if (string.IsNullOrWhiteSpace(callsigns))
					return Ok(new { states = new List<object>() });

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
						var callsignList = callsigns
							.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
							.Select(c => c.Trim().ToUpperInvariant())
							.Where(c => !string.IsNullOrWhiteSpace(c))
							.Distinct()
							.ToList();

						states = await FetchFromAirplanesLive(callsignList);

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

		private async Task<List<List<object?>>> FetchFromAirplanesLive(List<string> callsigns)
		{
			if (callsigns.Count == 0) return new List<List<object?>>();

			var client = _httpClientFactory.CreateClient();
			client.Timeout = TimeSpan.FromSeconds(15);

			async Task<List<List<object?>>> FetchOne(string cs)
			{
				try
				{
					var response = await client.GetAsync($"https://api.airplanes.live/v2/callsign/{Uri.EscapeDataString(cs)}");
					if (!response.IsSuccessStatusCode) return new List<List<object?>>();

					var json = await response.Content.ReadAsStringAsync();
					return ParseAirplanesResponse(json);
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Airplanes.live error for {cs}: {ex.Message}", null, "FLIGHT", true);
					return new List<List<object?>>();
				}
			}

			var tasks = callsigns.Select(FetchOne);
			var results = await Task.WhenAll(tasks);
			return results.SelectMany(r => r).ToList();
		}

		private static List<List<object?>> ParseAirplanesResponse(string json)
		{
			var results = new List<List<object?>>();
			var obj = JObject.Parse(json);
			var acArray = obj["ac"] as JArray;
			long now = obj["now"]?.Value<long>() ?? 0;
			long ts = now / 1000;

			if (acArray == null) return results;

			foreach (var ac in acArray)
			{
				var state = new List<object?>();
				state.Add(ac["hex"]?.ToString());                            // [0] icao24
				state.Add(ac["flight"]?.ToString()?.Trim());                // [1] callsign
				state.Add("");                                               // [2] origin_country
				state.Add(ts);                                               // [3] time_position
				state.Add(ts);                                               // [4] last_contact
				state.Add(ac["lon"]?.Value<double?>());                     // [5] longitude
				state.Add(ac["lat"]?.Value<double?>());                     // [6] latitude

				var altToken = ac["alt_baro"];
				if (altToken != null && (altToken.Type == JTokenType.Float || altToken.Type == JTokenType.Integer))
					state.Add(altToken.Value<double>());                     // [7] barometric altitude
				else if (altToken?.Type == JTokenType.String && altToken.Value<string>() == "ground")
					state.Add(0);
				else
					state.Add(null);

				state.Add(altToken?.Type == JTokenType.String && altToken.Value<string>() == "ground"); // [8] on_ground
				state.Add(ac["gs"]?.Value<double?>());                      // [9] ground speed
				state.Add(ac["track"]?.Value<double?>());                   // [10] heading
				state.Add(ac["r"]?.ToString());                             // [11] registration
				state.Add(ac["t"]?.ToString());                             // [12] aircraft type
				state.Add(ac["desc"]?.ToString());                          // [13] description
				state.Add(ac["ownOp"]?.ToString());                         // [14] owner/operator

				results.Add(state);
			}

			return results;
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
						
						// Insert user event when flight tracking starts
						await UserEventController.InsertUserEventStatic(
							request.UserId, 
							"FlightTracking", 
							$"Started tracking flight {request.Callsign}", 
							id, 
							"Flight", 
							_config, 
							_log);
						
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
