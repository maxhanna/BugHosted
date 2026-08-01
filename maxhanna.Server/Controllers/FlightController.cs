using maxhanna.Server.Services;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
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
		private readonly FlightBatchService _batchService;

		public FlightController(IHttpClientFactory httpClientFactory, IConfiguration config, Log log, FlightBatchService batchService)
		{
			_httpClientFactory = httpClientFactory;
			_config = config;
			_log = log;
			_batchService = batchService;
		}

		[HttpGet("states")]
		public async Task<IActionResult> GetStates([FromQuery] string? callsigns = null)
		{
			try
			{
				if (string.IsNullOrWhiteSpace(callsigns))
					return Ok(new { states = new List<object>() });

				var callsignList = callsigns
					.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
					.Select(c => c.Trim().ToUpperInvariant())
					.Where(c => !string.IsNullOrWhiteSpace(c))
					.Distinct()
					.ToList();

				var states = await _batchService.RequestStates(callsignList);

				var wanted = callsigns.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
					.Select(c => c.ToUpperInvariant())
					.ToHashSet();

				var matched = states
					.Where(s => s.Count > 1 && s[1] is string cs && wanted.Contains(((string)cs).Trim().ToUpperInvariant()))
					.ToList();

				return Ok(new { states = matched });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Flight states error: {ex.Message}", null, "FLIGHT", true);
				return Ok(new { states = new List<object>() });
			}
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
							"flighttracking",
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

		private static readonly Dictionary<string, string> IataToIcao = new(StringComparer.OrdinalIgnoreCase)
		{
			["AC"] = "ACA",   // Air Canada
			["WS"] = "WJA",   // WestJet
			["AA"] = "AAL",   // American Airlines
			["DL"] = "DAL",   // Delta
			["UA"] = "UAL",   // United
			["WN"] = "SWA",   // Southwest
			["AS"] = "ASA",   // Alaska Airlines
			["B6"] = "JBU",   // JetBlue
			["NK"] = "NKS",   // Spirit
			["F9"] = "FFT",   // Frontier
			["SY"] = "SCX",   // Sun Country
			["HA"] = "HAL",   // Hawaiian
			["LH"] = "DLH",   // Lufthansa
			["BA"] = "BAW",   // British Airways
			["AF"] = "AFR",   // Air France
			["KL"] = "KLM",   // KLM
			["TK"] = "THY",   // Turkish Airlines
			["EK"] = "UAE",   // Emirates
			["QR"] = "QTR",   // Qatar Airways
			["EY"] = "ETD",   // Etihad
			["SQ"] = "SIA",   // Singapore Airlines
			["CX"] = "CPA",   // Cathay Pacific
			["JL"] = "JAL",   // Japan Airlines
			["NH"] = "ANA",   // All Nippon
			["QF"] = "QFA",   // Qantas
			["NZ"] = "ANZ",   // Air New Zealand
			["VS"] = "VIR",   // Virgin Atlantic
			["DY"] = "NAX",   // Norwegian
			["FR"] = "RYR",   // Ryanair
			["U2"] = "EZY",   // EasyJet
		};

		[HttpGet("lookup")]
		public async Task<IActionResult> LookupFlight([FromQuery] string query)
		{
			if (string.IsNullOrWhiteSpace(query))
				return Ok(new { found = false, callsign = (string?)null });

			var raw = query.Trim().ToUpperInvariant();
			var candidates = new List<string> { raw };

			// Try stripping common suffixes like numbers to find the IATA prefix
			var letters = new string(raw.TakeWhile(char.IsLetter).ToArray());
			if (letters.Length >= 2 && letters.Length < raw.Length)
			{
				if (IataToIcao.TryGetValue(letters, out var icao))
				{
					var numberPart = raw[letters.Length..];
					candidates.Add(icao + numberPart);
				}
			}

			// Also try the raw input as an ICAO code if it looks like one (3 letters + digits)
			if (letters.Length == 2 && raw.Length > 2)
			{
				var numberPart = raw[letters.Length..];
				// Some airlines use 3-letter ICAO directly
				foreach (var kv in IataToIcao)
				{
					if (kv.Value.Equals(letters, StringComparison.OrdinalIgnoreCase))
					{
						candidates.Add(letters + numberPart);
						break;
					}
				}
			}

			candidates = candidates.Distinct().ToList();

			var states = await _batchService.RequestStates(candidates);

			foreach (var cs in candidates)
			{
				var match = states.FirstOrDefault(s => s.Count > 1 && s[1] is string scs &&
					scs.Trim().Equals(cs, StringComparison.OrdinalIgnoreCase));
				if (match != null)
				{
					return Ok(new
					{
						found = true,
						callsign = cs,
						lat = match.Count > 6 ? match[6] : null,
						lon = match.Count > 5 ? match[5] : null
					});
				}
			}

			return Ok(new { found = false, callsign = (string?)null });
		}

		[HttpGet("schedule")]
		public async Task<IActionResult> GetSchedule([FromQuery] string callsign)
		{
			if (string.IsNullOrWhiteSpace(callsign))
				return Ok(new { found = false });

			var cs = callsign.Trim().ToUpperInvariant();
			var apiKey = _config.GetValue<string>("Aviationstack:Api");
			if (string.IsNullOrEmpty(apiKey))
				return Ok(new { found = false, error = "API key not configured" });

			try
			{
				using var conn = new MySqlConnection(_config["ConnectionStrings:maxhanna"]);
				await conn.OpenAsync();
 
				await using (var cleanup = new MySqlCommand(
					"DELETE FROM maxhanna.flight_schedule_cache WHERE fetched_at < UTC_TIMESTAMP() - INTERVAL 6 HOUR", conn))
				{
					await cleanup.ExecuteNonQueryAsync();
				}

				await using (var readCmd = new MySqlCommand(
					"SELECT schedule, fetched_at FROM maxhanna.flight_schedule_cache WHERE callsign = @cs ORDER BY fetched_at DESC LIMIT 1", conn))
				{
					readCmd.Parameters.AddWithValue("@cs", cs);
					await using var reader = await readCmd.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						var json = reader.GetString(0);
						var fetched = reader.GetDateTime(1);
						var diffMinutes = (DateTime.UtcNow - fetched).TotalMinutes;
						if (diffMinutes >= 0 && diffMinutes < 30)
						{
							// Deserialize with System.Text.Json (not Newtonsoft JToken) so the
							// response serializes back to the same shape the frontend expects.
							return Ok(new { found = true, schedule = System.Text.Json.JsonSerializer.Deserialize<object>(json) });
						}
					}
				}

				// Delete stale cache entry before calling the API,
				// so a failed/empty API response doesn't leave stale data.
				await using (var delStale = new MySqlCommand(
					"DELETE FROM maxhanna.flight_schedule_cache WHERE callsign = @cs", conn))
				{
					delStale.Parameters.AddWithValue("@cs", cs);
					await delStale.ExecuteNonQueryAsync();
				}

				var client = _httpClientFactory.CreateClient();
				client.Timeout = TimeSpan.FromSeconds(10);
				var response = await client.GetAsync(
					$"http://api.aviationstack.com/v1/flights?access_key={apiKey}&flight_icao={cs}");

				if (!response.IsSuccessStatusCode)
					return Ok(new { found = false });

				var body = await response.Content.ReadAsStringAsync();
				var parsed = JObject.Parse(body);
				var dataArray = parsed["data"] as JArray;

				if (dataArray == null || dataArray.Count == 0)
					return Ok(new { found = false });

				await using (var insertCmd = new MySqlCommand(
					"REPLACE INTO maxhanna.flight_schedule_cache (callsign, schedule, fetched_at) VALUES (@cs, @json, UTC_TIMESTAMP())", conn))
				{
					insertCmd.Parameters.AddWithValue("@cs", cs);
					insertCmd.Parameters.AddWithValue("@json", dataArray.ToString(Newtonsoft.Json.Formatting.None));
					await insertCmd.ExecuteNonQueryAsync();
				}

				// Remove landed flights from cache (arrival scheduled time has passed)
				await using (var removeLanded = new MySqlCommand(
					"DELETE FROM maxhanna.flight_schedule_cache WHERE callsign = @cs AND fetched_at < UTC_TIMESTAMP() - INTERVAL 2 HOUR", conn))
				{
					removeLanded.Parameters.AddWithValue("@cs", cs);
					await removeLanded.ExecuteNonQueryAsync();
				}

				// Deserialize with System.Text.Json (not List<JObject>) so the schedule array
				// round-trips to real objects instead of empty nested arrays.
				var scheduleObj = System.Text.Json.JsonSerializer.Deserialize<object>(dataArray.ToString(Newtonsoft.Json.Formatting.None));
				return Ok(new { found = true, schedule = scheduleObj });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Flight schedule error for {callsign}: {ex.Message}", null, "FLIGHT", true);
				return Ok(new { found = false, error = ex.Message });
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
