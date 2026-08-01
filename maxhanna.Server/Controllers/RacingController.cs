using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MySqlConnector;
using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class RacingController : ControllerBase
	{
		private readonly IConfiguration _config;
		public RacingController(IConfiguration config) { _config = config; }

		[HttpGet("tracks")]
		public IActionResult GetTracks()
		{
			var tracks = new[]
			{
				new { Id = 1, Name = "Sunset Circuit", Difficulty = "easy", Laps = 3, Length = 1200, Description = "A simple coastal circuit with wide corners", EntryFee = 0, PrizePool = 300 },
				new { Id = 2, Name = "Mountain Pass", Difficulty = "medium", Laps = 3, Length = 1800, Description = "Twisty mountain roads with elevation changes", EntryFee = 500, PrizePool = 1500 },
				new { Id = 3, Name = "Downtown GP", Difficulty = "hard", Laps = 5, Length = 2500, Description = "Technical city circuit with tight corners", EntryFee = 2000, PrizePool = 8000 },
			};
			return Ok(tracks);
		}

		[HttpGet("car/{userId}")]
		public async Task<IActionResult> GetPlayerCar(int userId)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				using var cmd = new MySqlCommand(@"
					SELECT user_id, upgrades_json, skin_id, total_races, wins, money, best_lap, total_earnings
					FROM racing_player_car WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				if (await rdr.ReadAsync())
				{
					var upgrades = new List<object>();
					if (!await rdr.IsDBNullAsync(1))
					{
						var json = rdr.GetString(1);
						upgrades = JsonSerializer.Deserialize<List<object>>(json) ?? new List<object>();
					}
					return Ok(new
					{
						UserId = rdr.GetInt32(0),
						Upgrades = upgrades,
						SkinId = rdr.IsDBNull(2) ? 1 : rdr.GetInt32(2),
						TotalRaces = rdr.GetInt32(3),
						Wins = rdr.GetInt32(4),
						Money = rdr.GetInt32(5),
						BestLap = rdr.IsDBNull(6) ? 0 : rdr.GetDouble(6),
						TotalEarnings = rdr.GetInt32(7)
					});
				}
				return Ok(new { UserId = userId, Upgrades = new List<object>(), SkinId = 1, TotalRaces = 0, Wins = 0, Money = 500, BestLap = 0, TotalEarnings = 0 });
			}
			catch { return BadRequest(); }
		}

		[HttpPost("car/save")]
		public async Task<IActionResult> SavePlayerCar([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				var upgradesJson = body.TryGetProperty("upgrades", out var ups) ? ups.GetRawText() : "[]";
				int skinId = body.TryGetProperty("skinId", out var si) ? si.GetInt32() : 1;
				int totalRaces = body.TryGetProperty("totalRaces", out var tr) ? tr.GetInt32() : 0;
				int wins = body.TryGetProperty("wins", out var w) ? w.GetInt32() : 0;
				int money = body.TryGetProperty("money", out var m) ? m.GetInt32() : 500;
				double bestLap = body.TryGetProperty("bestLap", out var bl) ? bl.GetDouble() : 0;
				int totalEarnings = body.TryGetProperty("totalEarnings", out var te) ? te.GetInt32() : 0;

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				using var cmd = new MySqlCommand(@"
					INSERT INTO racing_player_car (user_id, upgrades_json, skin_id, total_races, wins, money, best_lap, total_earnings)
					VALUES (@uid, @upgrades, @skin, @races, @wins, @money, @best, @earnings)
					ON DUPLICATE KEY UPDATE
						upgrades_json = @upgrades, skin_id = @skin, total_races = @races,
						wins = @wins, money = @money, best_lap = @best, total_earnings = @earnings", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				cmd.Parameters.AddWithValue("@upgrades", upgradesJson);
				cmd.Parameters.AddWithValue("@skin", skinId);
				cmd.Parameters.AddWithValue("@races", totalRaces);
				cmd.Parameters.AddWithValue("@wins", wins);
				cmd.Parameters.AddWithValue("@money", money);
				cmd.Parameters.AddWithValue("@best", bestLap);
				cmd.Parameters.AddWithValue("@earnings", totalEarnings);
				await cmd.ExecuteNonQueryAsync();

				return Ok(new { ok = true });
			}
			catch { return BadRequest(); }
		}

		[HttpPost("car/upgrade")]
		public async Task<IActionResult> BuyUpgrade([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				int upgradeId = body.GetProperty("upgradeId").GetInt32();

				var (cost, name, cat, level) = GetUpgradeDef(upgradeId);
				if (cost <= 0) return BadRequest("Invalid upgrade");

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// Get current car data
				int currentMoney = 500;
				string? upgradesJson = "[]";
				using (var getCmd = new MySqlCommand("SELECT money, upgrades_json FROM racing_player_car WHERE user_id = @uid", conn))
				{
					getCmd.Parameters.AddWithValue("@uid", userId);
					using var rdr = await getCmd.ExecuteReaderAsync();
					if (await rdr.ReadAsync())
					{
						currentMoney = rdr.GetInt32(0);
						upgradesJson = rdr.IsDBNull(1) ? "[]" : rdr.GetString(1);
					}
					await rdr.CloseAsync();
				}

				if (currentMoney < cost) return BadRequest("Not enough money");

				var upgrades = JsonSerializer.Deserialize<List<JsonElement>>(upgradesJson ?? "[]") ?? new List<JsonElement>();
				// Check if already owned
				foreach (var u in upgrades)
				{
					if (u.TryGetProperty("id", out var id) && id.GetInt32() == upgradeId)
						return BadRequest("Already owned");
				}

				// Add upgrade
				var newUpgrade = new Dictionary<string, object>
				{
					["id"] = upgradeId,
					["name"] = name,
					["category"] = cat,
					["level"] = level,
					["cost"] = cost,
				};
				upgrades.Add(JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(newUpgrade)));

				int newMoney = currentMoney - cost;
				string newJson = JsonSerializer.Serialize(upgrades);

				using var upCmd = new MySqlCommand("UPDATE racing_player_car SET upgrades_json = @json, money = @money WHERE user_id = @uid", conn);
				upCmd.Parameters.AddWithValue("@uid", userId);
				upCmd.Parameters.AddWithValue("@json", newJson);
				upCmd.Parameters.AddWithValue("@money", newMoney);
				await upCmd.ExecuteNonQueryAsync();

				return Ok(new { UserId = userId, Upgrades = upgrades, Money = newMoney, SkinId = 1, TotalRaces = 0, Wins = 0, BestLap = 0, TotalEarnings = 0 });
			}
			catch { return BadRequest(); }
		}

		[HttpPost("car/skin")]
		public async Task<IActionResult> BuySkin([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				int skinId = body.GetProperty("skinId").GetInt32();

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				using var cmd = new MySqlCommand("UPDATE racing_player_car SET skin_id = @skin WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				cmd.Parameters.AddWithValue("@skin", skinId);
				await cmd.ExecuteNonQueryAsync();

				return Ok(new { ok = true });
			}
			catch { return BadRequest(); }
		}

		[HttpPost("race/result")]
		public async Task<IActionResult> SubmitRaceResult([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				var result = body.GetProperty("result");

				int position = result.GetProperty("position").GetInt32();
				double lapTime = result.TryGetProperty("lapTime", out var lt) ? lt.GetDouble() : 0;
				double totalTime = result.TryGetProperty("totalTime", out var tt) ? tt.GetDouble() : 0;
				int moneyEarned = result.TryGetProperty("moneyEarned", out var me) ? me.GetInt32() : 0;

				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				using var cmd = new MySqlCommand(@"
					INSERT INTO racing_results (user_id, position, lap_time, total_time, money_earned, raced_at)
					VALUES (@uid, @pos, @lap, @total, @money, UTC_TIMESTAMP())", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				cmd.Parameters.AddWithValue("@pos", position);
				cmd.Parameters.AddWithValue("@lap", lapTime);
				cmd.Parameters.AddWithValue("@total", totalTime);
				cmd.Parameters.AddWithValue("@money", moneyEarned);
				await cmd.ExecuteNonQueryAsync();

				return Ok(new { ok = true });
			}
			catch { return BadRequest(); }
		}

		[HttpGet("leaderboard/{trackId}")]
		public async Task<IActionResult> GetLeaderboard(int trackId)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				using var cmd = new MySqlCommand(@"
					SELECT r.user_id, u.username, r.position, r.lap_time, r.total_time, r.money_earned
					FROM racing_results r
					JOIN users u ON r.user_id = u.id
					ORDER BY r.lap_time ASC LIMIT 20", conn);
				using var rdr = await cmd.ExecuteReaderAsync();
				var results = new List<object>();
				while (await rdr.ReadAsync())
				{
					results.Add(new
					{
						PlayerId = rdr.GetInt32(0),
						PlayerName = rdr.GetString(1),
						Position = rdr.GetInt32(2),
						LapTime = rdr.GetDouble(3),
						TotalTime = rdr.GetDouble(4),
						MoneyEarned = rdr.GetInt32(5),
						IsBot = false
					});
				}
				return Ok(results);
			}
			catch { return Ok(new List<object>()); }
		}

		private static (int cost, string name, string cat, int level) GetUpgradeDef(int id)
		{
			return id switch
			{
				1 => (500, "Stage 1 Engine", "engine", 1),
				2 => (1500, "Stage 2 Engine", "engine", 2),
				3 => (4000, "Stage 3 Engine", "engine", 3),
				4 => (10000, "Stage 4 Engine", "engine", 4),
				5 => (25000, "Stage 5 Engine", "engine", 5),
				6 => (300, "Sport Tires", "tires", 1),
				7 => (800, "Racing Tires", "tires", 2),
				8 => (2000, "Slick Tires", "tires", 3),
				9 => (6000, "Hyper Tires", "tires", 4),
				10 => (400, "Sport Suspension", "suspension", 1),
				11 => (1200, "Race Suspension", "suspension", 2),
				12 => (3500, "Pro Suspension", "suspension", 3),
				13 => (250, "Stage 1 Brakes", "brakes", 1),
				14 => (700, "Stage 2 Brakes", "brakes", 2),
				15 => (1800, "Stage 3 Brakes", "brakes", 3),
				16 => (1000, "Carbon Body", "body", 1),
				17 => (3000, "Aero Body", "body", 2),
				_ => (0, "", "", 0)
			};
		}
	}
}
