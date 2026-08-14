using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class RacingController : ControllerBase
	{
		private static readonly ConcurrentDictionary<int, RacingCarState> _cars = new();
		private static readonly ConcurrentQueue<PendingRaceResult> _pendingResults = new();
		private static readonly object _persistLock = new();
		private static int _persistIntervalSeconds = 15;
		private static readonly Lazy<Timer> _persistTimer = new(() =>
			new Timer(PersistAllToDb, null,
				TimeSpan.FromSeconds(_persistIntervalSeconds),
				TimeSpan.FromSeconds(_persistIntervalSeconds)));
		private static string? _connStrCache;
		private static bool _startupLoadStarted = false;
		private static bool _shutdownHooksRegistered = false;
		private sealed class RacingCarState
		{
			public int UserId;
			public string PlayerName = "";
			public List<object> Upgrades = new();
			public int SkinId = 1;
			public int SpoilerId = 0;
			public int RimId = 0;
			public int ExhaustId = 0;
			public int DecalId = 0;
			public int GlowId = 0;
			public int AccentId = 0;
			public int GlowIntensity = 50;
			public HashSet<int> OwnedParts = new();
			public int TotalRaces = 0;
			public int Wins = 0;
			public int Money = 500;
			public double BestLap = 0; 
			public Dictionary<int, double> BestLapsByTrack = new(); 
			public int TotalEarnings = 0;
			public bool Dirty = false;
			public int Version = 0;
		}
		private sealed class PendingRaceResult
		{
			public int UserId;
			public string PlayerName = "";
			public int Position;
			public double LapTime;
			public double TotalTime;
			public int MoneyEarned;
			public int TrackId = 1;
		}
		private sealed class LeaderboardEntry
		{
			public int PlayerId { get; set; }
			public string PlayerName { get; set; } = "";
			public int Position { get; set; }
			public double LapTime { get; set; }
			public double TotalTime { get; set; }
			public int MoneyEarned { get; set; }
			public bool IsBot { get; set; } = false;
		}
		private sealed class UpgradeDef
		{
			public int Id { get; set; }
			public string Name { get; set; } = "";
			public string Category { get; set; } = "";
			public int Level { get; set; }
			public int MaxLevel { get; set; }
			public int Cost { get; set; }
			public string Description { get; set; } = "";
			public int StatBonus { get; set; }
		}
		private readonly IConfiguration _config;
		public RacingController(IConfiguration config, IHostApplicationLifetime appLifetime)
		{
			_config = config;
			_connStrCache ??= config.GetValue<string>("ConnectionStrings:maxhanna");
			int interval = _persistIntervalSeconds;
			_persistIntervalSeconds = Math.Max(5, interval);
			_ = _persistTimer.Value;
			if (!_startupLoadStarted)
			{
				lock (_persistLock)
				{
					if (!_startupLoadStarted)
					{
						_startupLoadStarted = true;
						LoadAllFromDb();
					}
				}
			}
			RegisterShutdownDump(appLifetime);
		}
		private static string? GetConnStr()
		{
			if (!string.IsNullOrEmpty(_connStrCache)) return _connStrCache;
			try
			{
				_connStrCache = new ConfigurationBuilder().AddJsonFile("appsettings.json").Build()
					.GetValue<string>("ConnectionStrings:maxhanna");
			}
			catch { }
			return _connStrCache;
		}
		private RacingCarState EnsureCarLoaded(int userId)
		{
			if (_cars.TryGetValue(userId, out var st)) return st;
			st = LoadFromDb(userId);
			_cars[userId] = st;
			return st;
		}
		private RacingCarState LoadFromDb(int userId)
		{
			var st = new RacingCarState { UserId = userId };
			try
			{
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				if (string.IsNullOrEmpty(connStr)) return st;
				using var conn = new MySqlConnection(connStr);
				conn.Open();
				using var cmd = new MySqlCommand(@"
					SELECT upgrades_json, skin_id, spoiler_id, rim_id, exhaust_id, decal_id, glow_id, accent_id,
					       total_races, wins, money, best_lap, total_earnings, player_name, owned_parts_json, glow_intensity
					FROM racing_player_car WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using (var rdr = cmd.ExecuteReader())
				{
					if (rdr.Read())
					{
						if (!rdr.IsDBNull(0) && rdr.GetString(0) is { Length: > 0 } j)
						{
							st.Upgrades = JsonSerializer.Deserialize<List<object>>(j) ?? new List<object>();
							if (NormalizeEngineUpgradeBonuses(st.Upgrades)) st.Dirty = true;
						}
						st.SkinId = rdr.IsDBNull(1) ? 1 : rdr.GetInt32(1);
						st.SpoilerId = rdr.IsDBNull(2) ? 0 : rdr.GetInt32(2);
						st.RimId = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
						st.ExhaustId = rdr.IsDBNull(4) ? 0 : rdr.GetInt32(4);
						st.DecalId = rdr.IsDBNull(5) ? 0 : rdr.GetInt32(5);
						st.GlowId = rdr.IsDBNull(6) ? 0 : rdr.GetInt32(6);
						st.AccentId = rdr.IsDBNull(7) ? 0 : rdr.GetInt32(7);
						st.TotalRaces = rdr.GetInt32(8);
						st.Wins = rdr.GetInt32(9);
						st.Money = rdr.GetInt32(10);
						st.BestLap = rdr.IsDBNull(11) ? 0 : rdr.GetDouble(11);
						st.TotalEarnings = rdr.IsDBNull(12) ? 0 : rdr.GetInt32(12);
						st.PlayerName = rdr.IsDBNull(13) ? "" : rdr.GetString(13);
						if (!rdr.IsDBNull(14) && rdr.GetString(14) is { Length: > 0 } oj)
						{
							try
							{
								var parsed = JsonSerializer.Deserialize<List<int>>(oj);
								if (parsed != null) st.OwnedParts = new HashSet<int>(parsed);
							}
							catch { }
						}
						st.GlowIntensity = rdr.IsDBNull(15) ? 50 : Math.Clamp(rdr.GetInt32(15), 0, 100);
					}
				}
				using var bestCmd = new MySqlCommand(@"
					SELECT track_id, best_lap FROM racing_best_laps WHERE user_id = @uid AND best_lap > 0", conn);
				bestCmd.Parameters.AddWithValue("@uid", userId);
				using var bestRdr = bestCmd.ExecuteReader();
				while (bestRdr.Read())
				{
					st.BestLapsByTrack[bestRdr.GetInt32(0)] = bestRdr.GetDouble(1);
				}
			}
			catch { }
			return st;
		}
		private static void LoadAllFromDb()
		{
			try
			{
				var connStr = GetConnStr();
				if (string.IsNullOrEmpty(connStr)) return;
				using var conn = new MySqlConnection(connStr);
				conn.Open();
				using var cmd = new MySqlCommand(@"
					SELECT user_id, upgrades_json, skin_id, spoiler_id, rim_id, exhaust_id, decal_id, glow_id, accent_id,
					       total_races, wins, money, best_lap, total_earnings, player_name, owned_parts_json, glow_intensity
					FROM racing_player_car", conn);
				int loaded = 0;
				using (var rdr = cmd.ExecuteReader())
				{
					while (rdr.Read())
					{
						var st = new RacingCarState { UserId = rdr.GetInt32(0) };
						if (!rdr.IsDBNull(1) && rdr.GetString(1) is { Length: > 0 } j)
						{
							st.Upgrades = JsonSerializer.Deserialize<List<object>>(j) ?? new List<object>();
							if (NormalizeEngineUpgradeBonuses(st.Upgrades)) st.Dirty = true;
						}
						st.SkinId = rdr.IsDBNull(2) ? 1 : rdr.GetInt32(2);
						st.SpoilerId = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
						st.RimId = rdr.IsDBNull(4) ? 0 : rdr.GetInt32(4);
						st.ExhaustId = rdr.IsDBNull(5) ? 0 : rdr.GetInt32(5);
						st.DecalId = rdr.IsDBNull(6) ? 0 : rdr.GetInt32(6);
						st.GlowId = rdr.IsDBNull(7) ? 0 : rdr.GetInt32(7);
						st.AccentId = rdr.IsDBNull(8) ? 0 : rdr.GetInt32(8);
						st.TotalRaces = rdr.GetInt32(9);
						st.Wins = rdr.GetInt32(10);
						st.Money = rdr.GetInt32(11);
						st.BestLap = rdr.IsDBNull(12) ? 0 : rdr.GetDouble(12);
						st.TotalEarnings = rdr.IsDBNull(13) ? 0 : rdr.GetInt32(13);
						st.PlayerName = rdr.IsDBNull(14) ? "" : rdr.GetString(14);
						if (!rdr.IsDBNull(15) && rdr.GetString(15) is { Length: > 0 } oj)
						{
							try
							{
								var parsed = JsonSerializer.Deserialize<List<int>>(oj);
								if (parsed != null) st.OwnedParts = new HashSet<int>(parsed);
							}
							catch { }
						}
						st.GlowIntensity = rdr.IsDBNull(16) ? 50 : Math.Clamp(rdr.GetInt32(16), 0, 100);
						_cars[st.UserId] = st;
						loaded++;
					}
				}
				using var bestCmd = new MySqlCommand(@"
					SELECT user_id, track_id, best_lap FROM racing_best_laps WHERE best_lap > 0", conn);
				using var bestRdr = bestCmd.ExecuteReader();
				while (bestRdr.Read())
				{
					if (_cars.TryGetValue(bestRdr.GetInt32(0), out var car))
					{
						car.BestLapsByTrack[bestRdr.GetInt32(1)] = bestRdr.GetDouble(2);
					}
				}
				Console.WriteLine($"[Racing] Startup: loaded {loaded} player car(s) from DB into memory.");
			}
			catch (Exception ex)
			{
				Console.WriteLine($"[Racing] Startup DB load failed: {ex.Message}");
				_startupLoadStarted = false;
			}
		}
		private static void RegisterShutdownDump(IHostApplicationLifetime? appLifetime)
		{
			if (_shutdownHooksRegistered) return;
			lock (_persistLock)
			{
				if (_shutdownHooksRegistered) return;
				_shutdownHooksRegistered = true;
				appLifetime?.ApplicationStopping.Register(() => PersistAllToDbBlocking());
				AppDomain.CurrentDomain.ProcessExit += (_, _) => PersistAllToDbBlocking();
				Console.CancelKeyPress += (_, _) => PersistAllToDbBlocking();
			}
		}
		private static object ToCarJson(RacingCarState st)
		{
			int userId, skinId, spoilerId, rimId, exhaustId, decalId, glowId, accentId, glowIntensity, totalRaces, wins, money, totalEarnings;
			double bestLap;
			string playerName;
			List<object> upgrades;
			Dictionary<int, double> bestLapsByTrack;
			List<int> ownedParts;
			lock (st)
			{
				userId = st.UserId;
				upgrades = new List<object>(st.Upgrades);
				skinId = st.SkinId; spoilerId = st.SpoilerId; rimId = st.RimId;
				exhaustId = st.ExhaustId; decalId = st.DecalId; glowId = st.GlowId; accentId = st.AccentId;
				glowIntensity = st.GlowIntensity;
				totalRaces = st.TotalRaces; wins = st.Wins; money = st.Money;
				bestLap = st.BestLap; totalEarnings = st.TotalEarnings;
				bestLapsByTrack = new Dictionary<int, double>(st.BestLapsByTrack);
				ownedParts = st.OwnedParts.OrderBy(x => x).ToList();
				playerName = st.PlayerName;
			}
			return new
			{
				UserId = userId,
				PlayerName = playerName,
				Upgrades = upgrades,
				SkinId = skinId,
				SpoilerId = spoilerId,
				RimId = rimId,
				ExhaustId = exhaustId,
				DecalId = decalId,
				GlowId = glowId,
				AccentId = accentId,
				GlowIntensity = glowIntensity,
				OwnedParts = ownedParts,
				TotalRaces = totalRaces,
				Wins = wins,
				Money = money,
				BestLap = bestLap,
				BestLapsByTrack = bestLapsByTrack,
				TotalEarnings = totalEarnings
			};
		}
		private static void PersistAllToDb(object? state) => PersistAllToDbCore(false);
		private static void PersistAllToDbBlocking() => PersistAllToDbCore(true); 
		private static void ScheduleFlush()
		{
			try { _ = Task.Run(PersistAllToDbBlocking); }
			catch { }
		}
		private static void PersistAllToDbCore(bool waitForLock)
		{
			bool acquired = waitForLock
				? Monitor.TryEnter(_persistLock, TimeSpan.FromSeconds(15))
				: Monitor.TryEnter(_persistLock);
			if (!acquired) return;
			try
			{
				bool anyDirty = false;
				foreach (var kv in _cars) { if (kv.Value.Dirty) { anyDirty = true; break; } }
				if (!anyDirty && _pendingResults.IsEmpty) return;
				var connStr = GetConnStr();
				if (string.IsNullOrEmpty(connStr)) return;
				using var conn = new MySqlConnection(connStr);
				conn.Open();
				int carsWritten = 0;
				foreach (var kv in _cars)
				{
					var st = kv.Value;
					if (!st.Dirty) continue;
					int version;
					using (var cmd = new MySqlCommand(@"
					INSERT INTO racing_player_car (user_id, player_name, upgrades_json, skin_id, spoiler_id, rim_id, exhaust_id, decal_id, glow_id, accent_id, total_races, wins, money, best_lap, total_earnings, owned_parts_json, glow_intensity)
					VALUES (@uid, @name, @upgrades, @skin, @sp, @rm, @ex, @dc, @glow, @acc, @races, @wins, @money, @best, @earnings, @owned, @gi)
					ON DUPLICATE KEY UPDATE
						player_name = @name, upgrades_json = @upgrades, skin_id = @skin, spoiler_id = @sp, rim_id = @rm,
						exhaust_id = @ex, decal_id = @dc, glow_id = @glow, accent_id = @acc, total_races = @races, wins = @wins,
						money = @money, best_lap = @best, total_earnings = @earnings, owned_parts_json = @owned, glow_intensity = @gi", conn))
					{
						lock (st)
						{
							cmd.Parameters.AddWithValue("@uid", st.UserId);
							cmd.Parameters.AddWithValue("@name", st.PlayerName);
							cmd.Parameters.AddWithValue("@upgrades", JsonSerializer.Serialize(st.Upgrades));
							cmd.Parameters.AddWithValue("@skin", st.SkinId);
							cmd.Parameters.AddWithValue("@sp", st.SpoilerId);
							cmd.Parameters.AddWithValue("@rm", st.RimId);
							cmd.Parameters.AddWithValue("@ex", st.ExhaustId);
							cmd.Parameters.AddWithValue("@dc", st.DecalId);
						cmd.Parameters.AddWithValue("@glow", st.GlowId);
						cmd.Parameters.AddWithValue("@acc", st.AccentId);
						cmd.Parameters.AddWithValue("@gi", st.GlowIntensity);
							cmd.Parameters.AddWithValue("@races", st.TotalRaces);
							cmd.Parameters.AddWithValue("@wins", st.Wins);
							cmd.Parameters.AddWithValue("@money", st.Money);
							cmd.Parameters.AddWithValue("@best", st.BestLap);
							cmd.Parameters.AddWithValue("@earnings", st.TotalEarnings);
							cmd.Parameters.AddWithValue("@owned", JsonSerializer.Serialize(st.OwnedParts.OrderBy(x => x).ToList()));
							version = st.Version;
						}
						cmd.ExecuteNonQuery(); 
						Dictionary<int, double> bestByTrack;
						lock (st) { bestByTrack = new Dictionary<int, double>(st.BestLapsByTrack); }
						foreach (var kvBest in bestByTrack)
						{
							if (kvBest.Value <= 0) continue;
							using var blCmd = new MySqlCommand(@"
								INSERT INTO racing_best_laps (user_id, track_id, best_lap)
								VALUES (@uid, @track, @best)
								ON DUPLICATE KEY UPDATE best_lap = LEAST(best_lap, VALUES(best_lap))", conn);
							blCmd.Parameters.AddWithValue("@uid", st.UserId);
							blCmd.Parameters.AddWithValue("@track", kvBest.Key);
							blCmd.Parameters.AddWithValue("@best", kvBest.Value);
							blCmd.ExecuteNonQuery();
						}
						lock (st)
						{
							if (st.Version == version) st.Dirty = false;
						}
						carsWritten++;
					}
				}
				var results = new List<PendingRaceResult>();
				while (_pendingResults.TryDequeue(out var r)) results.Add(r);				int resultsWritten = 0;
				// Only real players' results are persisted — bot laps (negative user ids)
				// are dropped so the leaderboard reflects human scores alone.
				foreach (var r in results)
				{
					try
					{
						if (r.UserId < 0) { resultsWritten++; continue; }
						using var cmd = new MySqlCommand(@"
							INSERT INTO racing_results (user_id, player_name, position, lap_time, total_time, money_earned, track_id, raced_at)
							VALUES (@uid, @name, @pos, @lap, @total, @money, @track, UTC_TIMESTAMP())", conn);
						cmd.Parameters.AddWithValue("@uid", r.UserId);
						cmd.Parameters.AddWithValue("@name", r.PlayerName);
						cmd.Parameters.AddWithValue("@pos", r.Position);
						cmd.Parameters.AddWithValue("@lap", r.LapTime);
						cmd.Parameters.AddWithValue("@total", r.TotalTime);
						cmd.Parameters.AddWithValue("@money", r.MoneyEarned);
						cmd.Parameters.AddWithValue("@track", r.TrackId);
						cmd.ExecuteNonQuery();
						resultsWritten++;
					}
					catch { _pendingResults.Enqueue(r); }
				}
				if (carsWritten > 0 || resultsWritten > 0)
				{
					Console.WriteLine($"[Racing] Dump: wrote {carsWritten} car(s) and {resultsWritten} result(s) to DB.");
				}
			}
			catch (Exception ex)
			{
				Console.WriteLine($"[Racing] Persist dump failed: {ex.Message}");
			}
			finally { Monitor.Exit(_persistLock); }
		}
		[HttpGet("activeplayers")]
		public IActionResult GetActivePlayers()
		{
			var count = Hubs.RacingHub.ActiveRacerCount;
			return Ok(new { count });
		}
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
		public IActionResult GetPlayerCar(int userId)
		{
			try
			{
				var st = EnsureCarLoaded(userId);
				return Ok(ToCarJson(st));
			}
			catch { return BadRequest(); }
		}
		[HttpGet("friends/{userId}")]
		public IActionResult GetFriendRecords(int userId)
		{
			try
			{
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				var friendIds = new List<int>();
				if (!string.IsNullOrEmpty(connStr))
				{
					using var conn = new MySqlConnection(connStr);
					conn.Open();
					using var cmd = new MySqlCommand(@"
						SELECT u.id FROM users u
						INNER JOIN friends f ON u.id = f.friend_id WHERE f.user_id = @uid
						UNION
						SELECT u.id FROM users u
						INNER JOIN friends f ON u.id = f.user_id WHERE f.friend_id = @uid", conn);
					cmd.Parameters.AddWithValue("@uid", userId);
					using var rdr = cmd.ExecuteReader();
					while (rdr.Read()) friendIds.Add(rdr.GetInt32(0));
				}
				var result = new List<object>();
				foreach (var fid in friendIds)
				{
					RacingCarState? st = null;
					if (_cars.TryGetValue(fid, out var cached)) st = cached;
					else
					{
						st = LoadFromDb(fid);
						_cars.TryAdd(fid, st);
					}
					Dictionary<int, double> bests;
					lock (st)
					{
						if (st.BestLapsByTrack.Count == 0) continue;
						bests = new Dictionary<int, double>(st.BestLapsByTrack);
					}
					result.Add(new
					{
						UserId = fid,
						PlayerName = string.IsNullOrWhiteSpace(st.PlayerName) ? $"User {fid}" : st.PlayerName,
						BestLapsByTrack = bests
					});
				}
				return Ok(result);
			}
			catch { return Ok(new List<object>()); }
		}
		[HttpPost("car/save")]
		public IActionResult SavePlayerCar([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.TryGetProperty("userId", out var u) ? u.GetInt32() : 0;
				if (userId <= 0) return BadRequest();
				var st = EnsureCarLoaded(userId);
				lock (st)
				{
					if (body.TryGetProperty("playerName", out var pn)) st.PlayerName = pn.GetString() ?? "";
					if (body.TryGetProperty("upgrades", out var ups) && ups.ValueKind == JsonValueKind.Array)
						st.Upgrades = JsonSerializer.Deserialize<List<object>>(ups.GetRawText()) ?? st.Upgrades;
					if (body.TryGetProperty("skinId", out var si)) st.SkinId = si.GetInt32();
					if (body.TryGetProperty("spoilerId", out var sp)) st.SpoilerId = sp.GetInt32();
					if (body.TryGetProperty("rimId", out var rm)) st.RimId = rm.GetInt32();
					if (body.TryGetProperty("exhaustId", out var ex)) st.ExhaustId = ex.GetInt32();
					if (body.TryGetProperty("decalId", out var dc)) st.DecalId = dc.GetInt32();
					if (body.TryGetProperty("glowId", out var gl)) st.GlowId = gl.GetInt32();
					if (body.TryGetProperty("accentId", out var ac)) st.AccentId = ac.GetInt32();
					if (body.TryGetProperty("glowIntensity", out var gi)) st.GlowIntensity = Math.Clamp(gi.GetInt32(), 0, 100);
					if (body.TryGetProperty("totalRaces", out var tr)) st.TotalRaces = tr.GetInt32();
					if (body.TryGetProperty("wins", out var w)) st.Wins = w.GetInt32();
					if (body.TryGetProperty("money", out var m))
					{
						int newMoney = m.GetInt32();
						if (newMoney < 0) return BadRequest("Money cannot be negative");
						st.Money = newMoney;
					}
					if (body.TryGetProperty("bestLap", out var bl)) st.BestLap = bl.GetDouble();
					if (body.TryGetProperty("bestLapsByTrack", out var blt) && blt.ValueKind == JsonValueKind.Object)
					{
						var parsed = JsonSerializer.Deserialize<Dictionary<int, double>>(blt.GetRawText());
						if (parsed != null)
						{
							foreach (var kv in parsed)
							{
								if (kv.Value <= 0) continue;
								if (!st.BestLapsByTrack.TryGetValue(kv.Key, out var existing) || kv.Value < existing)
									st.BestLapsByTrack[kv.Key] = kv.Value;
							}
							var bests = st.BestLapsByTrack.Values.Where(v => v > 0).ToList();
							if (bests.Count > 0) st.BestLap = bests.Min();
						}
					}
					if (body.TryGetProperty("totalEarnings", out var te)) st.TotalEarnings = te.GetInt32();
					if (body.TryGetProperty("ownedParts", out var op) && op.ValueKind == JsonValueKind.Array)
					{
						try
						{
							var parsed = JsonSerializer.Deserialize<List<int>>(op.GetRawText());
							if (parsed != null) st.OwnedParts = new HashSet<int>(parsed.Where(x => x > 0));
						}
						catch { }
					}
					st.Dirty = true;
					st.Version++;
				}
				ScheduleFlush();
				return Ok(new { ok = true });
			}
			catch { return BadRequest(); }
		}
		[HttpPost("car/upgrade")]
		public IActionResult BuyUpgrade([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				int upgradeId = body.GetProperty("upgradeId").GetInt32();
				var def = GetUpgradeDef(upgradeId);
				if (def == null) return BadRequest("Invalid upgrade");
				var st = EnsureCarLoaded(userId);
				lock (st)
				{
					if (st.Money < def.Cost) return BadRequest("Not enough money");
					foreach (var u in st.Upgrades)
					{
						if (u is JsonElement je && je.TryGetProperty("id", out var id) && id.GetInt32() == upgradeId)
							return BadRequest("Already owned");
					}
					var camel = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
					st.Upgrades.Add(JsonSerializer.Deserialize<object>(JsonSerializer.Serialize(def, camel))!);
					st.Money -= def.Cost;
					st.Dirty = true;
					st.Version++;
				}
				ScheduleFlush();
				return Ok(ToCarJson(st));
			}
			catch { return BadRequest(); }
		}
		[HttpPost("car/skin")]
		public IActionResult BuySkin([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				int skinId = body.GetProperty("skinId").GetInt32();
				var st = EnsureCarLoaded(userId);
				int cost = GetSkinCost(skinId);
				if (cost < 0) return BadRequest("Invalid skin");
				lock (st)
				{
					if (st.Money < cost) return BadRequest("Not enough money");
					st.SkinId = skinId;
					st.Money -= cost;
					st.Dirty = true;
					st.Version++;
				}
				ScheduleFlush();
				return Ok(ToCarJson(st));
			}
			catch { return BadRequest(); }
		}
		private static int GetSkinCost(int skinId) => skinId switch
		{
			1 => 0,
			2 => 500,
			3 => 500,
			4 => 1500,
			5 => 2000,
			6 => 3000,
			7 => 5000,
			8 => 8000,
			9 => 2500,
			10 => 2500,
			11 => 3500,
			12 => 3500,
			13 => 3500,
			14 => 4500,
			15 => 4500,
			16 => 5000,
			17 => 5500,
			18 => 6000,
			19 => 6500,
			20 => 7000,
			21 => 7500,
			22 => 8000,
			23 => 9000,
			24 => 12000,
			_ => -1,
		};
		[HttpPost("race/result")]
		public IActionResult SubmitRaceResult([FromBody] JsonElement body)
		{
			try
			{
				int userId = body.GetProperty("userId").GetInt32();
				var result = body.GetProperty("result");
				_pendingResults.Enqueue(new PendingRaceResult
				{
					UserId = userId,
					PlayerName = result.TryGetProperty("playerName", out var pn) ? pn.GetString() ?? "" : "",
					Position = result.GetProperty("position").GetInt32(),
					LapTime = result.TryGetProperty("lapTime", out var lt) ? lt.GetDouble() : 0,
					TotalTime = result.TryGetProperty("totalTime", out var tt) ? tt.GetDouble() : 0,
					MoneyEarned = result.TryGetProperty("moneyEarned", out var me) ? me.GetInt32() : 0,
					TrackId = result.TryGetProperty("trackId", out var tk) ? tk.GetInt32() : 1,
				});					ScheduleFlush();
				return Ok(new { ok = true });
			}
			catch { return BadRequest(); }
		}
		[HttpGet("leaderboard/{trackId}")]
		public async Task<IActionResult> GetLeaderboard(int trackId, [FromQuery] int userId = 0)
		{
			try
			{
				var results = new List<LeaderboardEntry>();
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				if (!string.IsNullOrEmpty(connStr))
				{
					using var conn = new MySqlConnection(connStr);
					await conn.OpenAsync();
					using var cmd = new MySqlCommand(@"
						SELECT user_id, player_name, MIN(lap_time) AS lap_time,
						       COALESCE(MAX(NULLIF(total_time, 0)), 0) AS total_time
						FROM (								SELECT r.user_id, COALESCE(NULLIF(r.player_name, ''), u.username, 'Unknown') AS player_name,
								       r.lap_time AS lap_time, r.total_time AS total_time
								FROM racing_results r
								LEFT JOIN users u ON r.user_id = u.id
								WHERE r.lap_time > 0 AND r.track_id = @trackId
							UNION ALL
							SELECT bl.user_id, COALESCE(NULLIF(c.player_name, ''), u.username, 'Unknown') AS player_name,
							       bl.best_lap AS lap_time, 0 AS total_time
							FROM racing_best_laps bl
							LEFT JOIN racing_player_car c ON c.user_id = bl.user_id
							LEFT JOIN users u ON bl.user_id = u.id
							WHERE bl.best_lap > 0 AND bl.track_id = @trackId							) t
							GROUP BY user_id, player_name
							ORDER BY lap_time ASC LIMIT 100", conn);
					cmd.Parameters.AddWithValue("@trackId", trackId);
					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							results.Add(new LeaderboardEntry
						{
							PlayerId = rdr.GetInt32(0),
							PlayerName = rdr.GetString(1),
							LapTime = rdr.GetDouble(2),
							TotalTime = rdr.GetDouble(3),
							Position = 0,
							MoneyEarned = 0,
							IsBot = false
						});
						}
					}
				}
				var pendingBest = new Dictionary<int, LeaderboardEntry>();
				foreach (var r in _pendingResults)
				{
					if (r.LapTime <= 0 || r.UserId < 0 || r.TrackId != trackId) continue;
					if (!pendingBest.TryGetValue(r.UserId, out var existing) || r.LapTime < existing.LapTime)
					{
						pendingBest[r.UserId] = new LeaderboardEntry
						{
							PlayerId = r.UserId,
							PlayerName = r.PlayerName,
							Position = 0,
							LapTime = r.LapTime,
							TotalTime = r.TotalTime,
							MoneyEarned = 0,
							IsBot = false
						};
					}
				}
				foreach (var kv in pendingBest) results.Add(kv.Value);
				results = results
					.GroupBy(e => e.PlayerId)
					.Select(g => g.OrderBy(e => e.LapTime).First())
					.OrderBy(e => e.LapTime)
					.Take(50)
					.ToList();
				int totalCount = 0;
				int userRank = 0;
				if (!string.IsNullOrEmpty(connStr) && userId > 0)
				{
					using var conn2 = new MySqlConnection(connStr);
					await conn2.OpenAsync();
					using (var cntCmd = new MySqlCommand(@"
						SELECT COUNT(*) FROM (
							SELECT user_id, MIN(lap_time) AS best FROM (
								SELECT r.user_id, r.lap_time AS lap_time FROM racing_results r
								WHERE r.lap_time > 0 AND r.track_id = @trackId
								UNION ALL
								SELECT bl.user_id, bl.best_lap AS lap_time FROM racing_best_laps bl
								WHERE bl.best_lap > 0 AND bl.track_id = @trackId
							) u GROUP BY user_id
						) t", conn2))
					{
						cntCmd.Parameters.AddWithValue("@trackId", trackId);
						totalCount = Convert.ToInt32(await cntCmd.ExecuteScalarAsync());
					}
					using (var bestCmd = new MySqlCommand(@"
						SELECT MIN(lap_time) FROM (
							SELECT r.lap_time AS lap_time FROM racing_results r
							WHERE r.lap_time > 0 AND r.track_id = @trackId AND r.user_id = @uid
							UNION ALL
							SELECT bl.best_lap AS lap_time FROM racing_best_laps bl
							WHERE bl.best_lap > 0 AND bl.track_id = @trackId AND bl.user_id = @uid
						) me", conn2))
					{
						bestCmd.Parameters.AddWithValue("@trackId", trackId);
						bestCmd.Parameters.AddWithValue("@uid", userId);
						var myBest = await bestCmd.ExecuteScalarAsync();
						if (myBest != null && myBest != DBNull.Value && Convert.ToDouble(myBest) > 0)
						{
							using var rankCmd = new MySqlCommand(@"
								SELECT COUNT(*) + 1 FROM (
									SELECT user_id, MIN(lap_time) AS best FROM (
										SELECT r.user_id, r.lap_time AS lap_time FROM racing_results r
										WHERE r.lap_time > 0 AND r.track_id = @trackId
										UNION ALL
									SELECT bl.user_id, bl.best_lap AS lap_time FROM racing_best_laps bl
									WHERE bl.best_lap > 0 AND bl.track_id = @trackId
								) u GROUP BY user_id
							) t WHERE t.best < @myBest", conn2);
							rankCmd.Parameters.AddWithValue("@trackId", trackId);
							rankCmd.Parameters.AddWithValue("@myBest", Convert.ToDouble(myBest));
							userRank = Convert.ToInt32(await rankCmd.ExecuteScalarAsync());
						}
					}
				}
				double bestLap = results.Count > 0 ? results[0].LapTime : 0;
				return Ok(new { results, totalCount, userRank, bestLap });
			}
			catch { return Ok(new { results = new List<LeaderboardEntry>(), totalCount = 0, userRank = 0, bestLap = 0.0 }); }
		}
		[HttpGet("leaderboard-by-track")]
		public async Task<IActionResult> GetAllTrackLeaderboards([FromQuery] int userId = 0)
		{
			try
			{
				var perTrack = new Dictionary<int, Dictionary<int, double>>();
				var names = new Dictionary<int, string>();
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				if (!string.IsNullOrEmpty(connStr))
				{
					using var conn = new MySqlConnection(connStr);
					await conn.OpenAsync();
					using var cmd = new MySqlCommand(@"
						SELECT id as track_id, user_id, lap_time, player_name FROM (
							SELECT r.id, r.user_id, r.lap_time AS lap_time,
							       COALESCE(u.username, 'Unknown') AS player_name
							FROM racing_results r 
							LEFT JOIN users u ON r.user_id = u.id
							WHERE r.lap_time > 0 AND r.user_id != 0
							UNION ALL
							SELECT bl.track_id, bl.user_id, bl.best_lap AS lap_time,
							       COALESCE(NULLIF(c.player_name, ''), u.username, 'Unknown') AS player_name
							FROM racing_best_laps bl
							LEFT JOIN racing_player_car c ON c.user_id = bl.user_id
							LEFT JOIN users u ON bl.user_id = u.id
							WHERE bl.best_lap > 0 AND bl.user_id > 0
						) t", conn);
					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							int uid = rdr.GetInt32(1);
							int tid = rdr.GetInt32(0);
							double lap = rdr.GetDouble(2);
							if (uid <= 0 || lap <= 0) continue;
							if (!perTrack.TryGetValue(tid, out var byUser))
							{
								byUser = new Dictionary<int, double>();
								perTrack[tid] = byUser;
							}
							if (!byUser.TryGetValue(uid, out var existing) || lap < existing) byUser[uid] = lap;
							names[uid] = rdr.IsDBNull(3) ? "Unknown" : rdr.GetString(3);
						}
					}
				}
				foreach (var r in _pendingResults)
				{
					if (r.LapTime <= 0 || r.UserId <= 0) continue;
					if (!perTrack.TryGetValue(r.TrackId, out var byUser))
					{
						byUser = new Dictionary<int, double>();
						perTrack[r.TrackId] = byUser;
					}
					if (!byUser.TryGetValue(r.UserId, out var existing) || r.LapTime < existing)
						byUser[r.UserId] = r.LapTime;
					if (!names.ContainsKey(r.UserId)) names[r.UserId] = r.PlayerName;
				}
				var tracks = new List<object>();
				foreach (var kv in perTrack)
				{
					var ranked = kv.Value
						.Select(p => new
					{
							playerId = p.Key,
							playerName = names.TryGetValue(p.Key, out var n) ? n : "Unknown",
							lapTime = p.Value
						})
						.OrderBy(e => e.lapTime)
						.ToList();
					var top = ranked.Take(20)
						.Select(e => new LeaderboardEntry
					{
							PlayerId = e.playerId,
							PlayerName = e.playerName,
							LapTime = e.lapTime,
							TotalTime = 0,
							Position = 0,
							MoneyEarned = 0,
							IsBot = false
						})
						.ToList();
					double userLap = 0;
					int userRank = 0;
					if (userId > 0 && kv.Value.TryGetValue(userId, out var mine))
					{
						userLap = mine;
						userRank = 1 + ranked.Count(e => e.lapTime < mine);
					}
					tracks.Add(new
					{
						trackId = kv.Key,
						totalCount = ranked.Count,
						bestLap = ranked.Count > 0 ? ranked[0].lapTime : 0.0,
						userLap,
						userRank,
						results = top
					});
				}
				return Ok(new { tracks });
			}
			catch { return Ok(new { tracks = new List<object>() }); }
		}
		[HttpGet("leaderboard-overall")]
		public async Task<IActionResult> GetOverallLeaderboard([FromQuery] int userId = 0)
		{
			try
			{
				var perUser = new Dictionary<int, Dictionary<int, double>>();
				var names = new Dictionary<int, string>();
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				if (!string.IsNullOrEmpty(connStr))
				{
					using var conn = new MySqlConnection(connStr);
					await conn.OpenAsync();
					using var cmd = new MySqlCommand(@"
						SELECT user_id, track_id, lap_time, player_name FROM (
							SELECT r.user_id, r.track_id, r.lap_time AS lap_time,
							       COALESCE(NULLIF(r.player_name, ''), u.username, 'Unknown') AS player_name
							FROM racing_results r
							LEFT JOIN users u ON r.user_id = u.id
							WHERE r.lap_time > 0 AND r.user_id > 0
							UNION ALL
							SELECT bl.user_id, bl.track_id, bl.best_lap AS lap_time,
							       COALESCE(NULLIF(c.player_name, ''), u.username, 'Unknown') AS player_name
							FROM racing_best_laps bl
							LEFT JOIN racing_player_car c ON c.user_id = bl.user_id
							LEFT JOIN users u ON bl.user_id = u.id
							WHERE bl.best_lap > 0 AND bl.user_id > 0
						) t", conn);
					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							int uid = rdr.GetInt32(0);
							int tid = rdr.GetInt32(1);
							double lap = rdr.GetDouble(2);
							if (uid <= 0 || lap <= 0) continue;
							if (!perUser.TryGetValue(uid, out var byTrack))
							{
								byTrack = new Dictionary<int, double>();
								perUser[uid] = byTrack;
							}
							if (!byTrack.TryGetValue(tid, out var existing) || lap < existing) byTrack[tid] = lap;
							names[uid] = rdr.IsDBNull(3) ? "Unknown" : rdr.GetString(3);
						}
					}
				}
				var ranked = perUser
					.Select(kv =>
					{
						double overall = kv.Value.Values.Min();
						int trackId = kv.Value.First(p => p.Value == overall).Key;
						return new
					{
							playerId = kv.Key,
							playerName = names.TryGetValue(kv.Key, out var n) ? n : "Unknown",
							lapTime = overall,
							trackId,
							bestLapsByTrack = kv.Value
					};
					})
					.OrderBy(e => e.lapTime)
					.Take(100)
					.ToList();
				int totalCount = perUser.Count;
				int userRank = 0;
				if (userId > 0 && perUser.TryGetValue(userId, out var mine))
				{
					double myBest = mine.Values.Min();
					userRank = 1 + perUser.Count(kv => kv.Value.Values.Min() < myBest);
				}
				double bestLap = ranked.Count > 0 ? ranked[0].lapTime : 0;
				return Ok(new { results = ranked, totalCount, userRank, bestLap });
			}
			catch { return Ok(new { results = new List<object>(), totalCount = 0, userRank = 0, bestLap = 0.0 }); }
		}
		private static bool NormalizeEngineUpgradeBonuses(List<object> upgrades)
		{
			bool changed = false;
			if (upgrades == null) return false;
			for (int i = 0; i < upgrades.Count; i++)
			{
				if (upgrades[i] is not JsonElement je) continue;
				if (!je.TryGetProperty("category", out var cat) || cat.GetString() != "engine") continue;
				if (!je.TryGetProperty("id", out var idProp) || !idProp.TryGetInt32(out int id)) continue;
				var def = GetUpgradeDef(id);
				if (def == null) continue;
				bool bonusMatches = je.TryGetProperty("statBonus", out var sb) && sb.TryGetInt32(out int cur) && cur == def.StatBonus;
				bool costMatches = je.TryGetProperty("cost", out var cp) && cp.TryGetInt32(out int storedCost) && storedCost == def.Cost;
				if (bonusMatches && costMatches) continue;
				try
				{
					var obj = JsonSerializer.Deserialize<JsonObject>(je.GetRawText());
					if (obj == null) continue;
					obj["statBonus"] = def.StatBonus;
					obj["description"] = def.Description;
					obj["cost"] = def.Cost;
					upgrades[i] = obj;
					changed = true;
				}
				catch { }
			}
			return changed;
		}
		private static UpgradeDef? GetUpgradeDef(int id)
		{
			return id switch
			{
				1 => new UpgradeDef { Id = 1, Name = "Stage 1 Engine", Category = "engine", Level = 1, MaxLevel = 5, Cost = 250, Description = "+5% Top Speed", StatBonus = 5 },
				2 => new UpgradeDef { Id = 2, Name = "Stage 2 Engine", Category = "engine", Level = 2, MaxLevel = 5, Cost = 750, Description = "+10% Top Speed", StatBonus = 10 },
				3 => new UpgradeDef { Id = 3, Name = "Stage 3 Engine", Category = "engine", Level = 3, MaxLevel = 5, Cost = 2000, Description = "+15% Top Speed", StatBonus = 15 },
				4 => new UpgradeDef { Id = 4, Name = "Stage 4 Engine", Category = "engine", Level = 4, MaxLevel = 5, Cost = 6000, Description = "+20% Top Speed", StatBonus = 20 },
				5 => new UpgradeDef { Id = 5, Name = "Stage 5 Engine", Category = "engine", Level = 5, MaxLevel = 5, Cost = 18000, Description = "+25% Top Speed", StatBonus = 25 },
				6 => new UpgradeDef { Id = 6, Name = "Sport Tires", Category = "tires", Level = 1, MaxLevel = 4, Cost = 300, Description = "+5% Grip", StatBonus = 5 },
				7 => new UpgradeDef { Id = 7, Name = "Racing Tires", Category = "tires", Level = 2, MaxLevel = 4, Cost = 800, Description = "+12% Grip", StatBonus = 12 },
				8 => new UpgradeDef { Id = 8, Name = "Slick Tires", Category = "tires", Level = 3, MaxLevel = 4, Cost = 2000, Description = "+20% Grip", StatBonus = 20 },
				9 => new UpgradeDef { Id = 9, Name = "Hyper Tires", Category = "tires", Level = 4, MaxLevel = 4, Cost = 6000, Description = "+30% Grip", StatBonus = 30 },
				10 => new UpgradeDef { Id = 10, Name = "Sport Suspension", Category = "suspension", Level = 1, MaxLevel = 3, Cost = 400, Description = "+5% Cornering", StatBonus = 5 },
				11 => new UpgradeDef { Id = 11, Name = "Race Suspension", Category = "suspension", Level = 2, MaxLevel = 3, Cost = 1200, Description = "+12% Cornering", StatBonus = 12 },
				12 => new UpgradeDef { Id = 12, Name = "Pro Suspension", Category = "suspension", Level = 3, MaxLevel = 3, Cost = 3500, Description = "+20% Cornering", StatBonus = 20 },
				13 => new UpgradeDef { Id = 13, Name = "Stage 1 Brakes", Category = "brakes", Level = 1, MaxLevel = 3, Cost = 250, Description = "+10% Braking", StatBonus = 10 },
				14 => new UpgradeDef { Id = 14, Name = "Stage 2 Brakes", Category = "brakes", Level = 2, MaxLevel = 3, Cost = 700, Description = "+20% Braking", StatBonus = 20 },
				15 => new UpgradeDef { Id = 15, Name = "Stage 3 Brakes", Category = "brakes", Level = 3, MaxLevel = 3, Cost = 1800, Description = "+30% Braking", StatBonus = 30 },
				16 => new UpgradeDef { Id = 16, Name = "Carbon Body", Category = "body", Level = 1, MaxLevel = 2, Cost = 1000, Description = "-5% Weight", StatBonus = 5 },
				17 => new UpgradeDef { Id = 17, Name = "Aero Body", Category = "body", Level = 2, MaxLevel = 2, Cost = 3000, Description = "-12% Weight", StatBonus = 12 },
				_ => null
			};
		}
	}
}
