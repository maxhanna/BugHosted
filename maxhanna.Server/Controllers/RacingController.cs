using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MySqlConnector;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class RacingController : ControllerBase
	{
		// ── In-memory game state ─────────────────────────────────────────────
		// The racing game (garage, cash, upgrades, appearance, results) lives in
		// server memory so closing/reopening the component never loses progress.
		// A 10-minute timer dumps anything dirty to the DB for long-term
		// persistence (same pattern as GrandTheftController).
		private static readonly ConcurrentDictionary<int, RacingCarState> _cars = new();
		private static readonly ConcurrentQueue<PendingRaceResult> _pendingResults = new();
		private static readonly object _persistLock = new();
		private static readonly Lazy<Timer> _persistTimer = new(() =>
			new Timer(PersistAllToDb, null, TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(10)));
		private static bool _schemaEnsured = false;
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
			public int TotalRaces = 0;
			public int Wins = 0;
			public int Money = 500;
			public double BestLap = 0;
			public int TotalEarnings = 0;
			public bool Dirty = false;
			// Incremented on every mutation so the dump timer can tell whether a
			// concurrent save landed while it was writing (avoids clearing a stale
			// Dirty flag and silently dropping an update).
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
		}

		private sealed class LeaderboardEntry
		{
			public int PlayerId;
			public string PlayerName = "";
			public int Position;
			public double LapTime;
			public double TotalTime;
			public int MoneyEarned;
			public bool IsBot = false;
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
		public RacingController(IConfiguration config)
		{
			_config = config;
			_connStrCache ??= config.GetValue<string>("ConnectionStrings:maxhanna");
			_ = _persistTimer.Value; // ensure the 10-min dump timer is running

			// Restore every saved player's car into server memory so a restart never
			// wipes game data — the DB is the source of truth for long-term state.
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

			// Flush any dirty in-memory state when the process shuts down, so a
			// restart inside the 10-minute dump window doesn't lose recent progress.
			RegisterShutdownDump();
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

		private static void EnsureSchema(string connStr)
		{
			if (_schemaEnsured) return;
			lock (_persistLock)
			{
				if (_schemaEnsured) return;
				try
				{
					using var conn = new MySqlConnection(connStr);
					conn.Open();
					using (var cmd = new MySqlCommand(@"
						CREATE TABLE IF NOT EXISTS racing_player_car (
							user_id INT PRIMARY KEY,
							player_name VARCHAR(64) NOT NULL DEFAULT '',
							upgrades_json LONGTEXT NULL,
							skin_id INT NOT NULL DEFAULT 1,
							spoiler_id INT NOT NULL DEFAULT 0,
							rim_id INT NOT NULL DEFAULT 0,
							exhaust_id INT NOT NULL DEFAULT 0,
							decal_id INT NOT NULL DEFAULT 0,
							total_races INT NOT NULL DEFAULT 0,
							wins INT NOT NULL DEFAULT 0,
							money INT NOT NULL DEFAULT 500,
							best_lap DOUBLE NOT NULL DEFAULT 0,
							total_earnings INT NOT NULL DEFAULT 0
						)", conn))
					{
						cmd.ExecuteNonQuery();
					}
					using (var cmd = new MySqlCommand(@"
						CREATE TABLE IF NOT EXISTS racing_results (
							id INT AUTO_INCREMENT PRIMARY KEY,
							user_id INT NOT NULL,
							player_name VARCHAR(64) NOT NULL DEFAULT '',
							position INT NOT NULL DEFAULT 1,
							lap_time DOUBLE NOT NULL DEFAULT 0,
							total_time DOUBLE NOT NULL DEFAULT 0,
							money_earned INT NOT NULL DEFAULT 0,
							raced_at DATETIME NULL
						)", conn))
					{
						cmd.ExecuteNonQuery();
					}
					// Bring older tables up to date — each ALTER throws if the column
					// already exists, so swallow per-column errors.
					foreach (var col in new[] { "spoiler_id", "rim_id", "exhaust_id", "decal_id", "total_earnings" })
					{
						try
						{
							using var alt = new MySqlCommand($"ALTER TABLE racing_player_car ADD COLUMN {col} INT NOT NULL DEFAULT 0", conn);
							alt.ExecuteNonQuery();
						}
						catch { }
					}
					// best_lap was added to the CREATE TABLE later, so tables created
					// before that never got the column — without it the load SELECT
					// and the persist UPSERT both throw and best lap silently never
					// saves (the row even fails to round-trip on restart). Add it.
					foreach (var (col, def) in new[] { ("best_lap", "DOUBLE NOT NULL DEFAULT 0") })
					{
						try
						{
							using var alt = new MySqlCommand($"ALTER TABLE racing_player_car ADD COLUMN {col} {def}", conn);
							alt.ExecuteNonQuery();
						}
						catch { }
					}
					foreach (var (table, col) in new[] { ("racing_player_car", "player_name VARCHAR(64) NOT NULL DEFAULT ''"), ("racing_results", "player_name VARCHAR(64) NOT NULL DEFAULT ''") })
					{
						try
						{
							using var alt = new MySqlCommand($"ALTER TABLE {table} ADD COLUMN {col}", conn);
							alt.ExecuteNonQuery();
						}
						catch { }
					}
					_schemaEnsured = true;
				}
				catch { }
			}
		}

		/// <summary>Lazy-load a user's car from the DB (or a fresh default) into memory.</summary>
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
				EnsureSchema(connStr);
				using var conn = new MySqlConnection(connStr);
				conn.Open();
				using var cmd = new MySqlCommand(@"
					SELECT upgrades_json, skin_id, spoiler_id, rim_id, exhaust_id, decal_id,
					       total_races, wins, money, best_lap, total_earnings, player_name
					FROM racing_player_car WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using var rdr = cmd.ExecuteReader();
				if (rdr.Read())
				{
					if (!rdr.IsDBNull(0) && rdr.GetString(0) is { Length: > 0 } j)
						st.Upgrades = JsonSerializer.Deserialize<List<object>>(j) ?? new List<object>();
					st.SkinId = rdr.IsDBNull(1) ? 1 : rdr.GetInt32(1);
					st.SpoilerId = rdr.IsDBNull(2) ? 0 : rdr.GetInt32(2);
					st.RimId = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
					st.ExhaustId = rdr.IsDBNull(4) ? 0 : rdr.GetInt32(4);
					st.DecalId = rdr.IsDBNull(5) ? 0 : rdr.GetInt32(5);
					st.TotalRaces = rdr.GetInt32(6);
					st.Wins = rdr.GetInt32(7);
					st.Money = rdr.GetInt32(8);
					st.BestLap = rdr.IsDBNull(9) ? 0 : rdr.GetDouble(9);
					st.TotalEarnings = rdr.IsDBNull(10) ? 0 : rdr.GetInt32(10);
					st.PlayerName = rdr.IsDBNull(11) ? "" : rdr.GetString(11);
				}
			}
			catch { }
			return st;
		}

		/// <summary>
		/// Warm-up pass run once at server start: read every player's saved car from
		/// the DB into memory so a restart never wipes game state. Runs inside the
		/// persist lock so it can't race the 10-minute dump.
		/// </summary>
		private static void LoadAllFromDb()
		{
			try
			{
				var connStr = GetConnStr();
				if (string.IsNullOrEmpty(connStr)) return;
				EnsureSchema(connStr);
				using var conn = new MySqlConnection(connStr);
				conn.Open();
				using var cmd = new MySqlCommand(@"
					SELECT user_id, upgrades_json, skin_id, spoiler_id, rim_id, exhaust_id, decal_id,
					       total_races, wins, money, best_lap, total_earnings, player_name
					FROM racing_player_car", conn);
				using var rdr = cmd.ExecuteReader();
				while (rdr.Read())
				{
					var st = new RacingCarState { UserId = rdr.GetInt32(0) };
					if (!rdr.IsDBNull(1) && rdr.GetString(1) is { Length: > 0 } j)
						st.Upgrades = JsonSerializer.Deserialize<List<object>>(j) ?? new List<object>();
					st.SkinId = rdr.IsDBNull(2) ? 1 : rdr.GetInt32(2);
					st.SpoilerId = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
					st.RimId = rdr.IsDBNull(4) ? 0 : rdr.GetInt32(4);
					st.ExhaustId = rdr.IsDBNull(5) ? 0 : rdr.GetInt32(5);
					st.DecalId = rdr.IsDBNull(6) ? 0 : rdr.GetInt32(6);
					st.TotalRaces = rdr.GetInt32(7);
					st.Wins = rdr.GetInt32(8);
					st.Money = rdr.GetInt32(9);
					st.BestLap = rdr.IsDBNull(10) ? 0 : rdr.GetDouble(10);
					st.TotalEarnings = rdr.IsDBNull(11) ? 0 : rdr.GetInt32(11);
					st.PlayerName = rdr.IsDBNull(12) ? "" : rdr.GetString(12);
					_cars[st.UserId] = st;
				}
			}
			catch
			{
				// DB may not be ready at boot — let the next request retry the warm-up
				// instead of permanently disabling it (lazy per-user load still works).
				_startupLoadStarted = false;
			}
		}

		/// <summary>
		/// Best-effort dump of all dirty cars when the process exits (Ctrl+C, kill,
		/// IIS stop). The dump timer may not have fired yet for recent changes, so
		/// this makes a restart inside the 10-minute window lossless.
		/// </summary>
		private static void RegisterShutdownDump()
		{
			if (_shutdownHooksRegistered) return;
			lock (_persistLock)
			{
				if (_shutdownHooksRegistered) return;
				_shutdownHooksRegistered = true;
				AppDomain.CurrentDomain.ProcessExit += (_, _) => PersistAllToDb(null);
				Console.CancelKeyPress += (_, _) => PersistAllToDb(null);
			}
		}

		private static object ToCarJson(RacingCarState st)
		{
			// Snapshot under the car lock: MVC serializes the response AFTER this
			// method returns, so handing it the live list would let a concurrent
			// BuyUpgrade .Add() trip "Collection was modified" mid-serialize.
			int userId, skinId, spoilerId, rimId, exhaustId, decalId, totalRaces, wins, money, totalEarnings;
			double bestLap;
			string playerName;
			List<object> upgrades;
			lock (st)
			{
				userId = st.UserId;
				upgrades = new List<object>(st.Upgrades);
				skinId = st.SkinId; spoilerId = st.SpoilerId; rimId = st.RimId;
				exhaustId = st.ExhaustId; decalId = st.DecalId;
				totalRaces = st.TotalRaces; wins = st.Wins; money = st.Money;
				bestLap = st.BestLap; totalEarnings = st.TotalEarnings;
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
				TotalRaces = totalRaces,
				Wins = wins,
				Money = money,
				BestLap = bestLap,
				TotalEarnings = totalEarnings
			};
		}

		/// <summary>Periodic dump: if anything is dirty, persist it to the DB.</summary>
		private static void PersistAllToDb(object? state)
		{
			if (!Monitor.TryEnter(_persistLock)) return;
			try
			{
				bool anyDirty = false;
				foreach (var kv in _cars) { if (kv.Value.Dirty) { anyDirty = true; break; } }
				if (!anyDirty && _pendingResults.IsEmpty) return;

				var connStr = GetConnStr();
				if (string.IsNullOrEmpty(connStr)) return;
				EnsureSchema(connStr);
				using var conn = new MySqlConnection(connStr);
				conn.Open();

				foreach (var kv in _cars)
				{
					var st = kv.Value;
					if (!st.Dirty) continue;
					int version;
					using (var cmd = new MySqlCommand(@"
						INSERT INTO racing_player_car (user_id, player_name, upgrades_json, skin_id, spoiler_id, rim_id, exhaust_id, decal_id, total_races, wins, money, best_lap, total_earnings)
						VALUES (@uid, @name, @upgrades, @skin, @sp, @rm, @ex, @dc, @races, @wins, @money, @best, @earnings)
						ON DUPLICATE KEY UPDATE
							player_name = @name, upgrades_json = @upgrades, skin_id = @skin, spoiler_id = @sp, rim_id = @rm,
							exhaust_id = @ex, decal_id = @dc, total_races = @races, wins = @wins,
							money = @money, best_lap = @best, total_earnings = @earnings", conn))
					{
						// Snapshot under the car lock so a concurrent save can't mutate the
						// upgrades list mid-serialize (Collection was modified).
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
							cmd.Parameters.AddWithValue("@races", st.TotalRaces);
							cmd.Parameters.AddWithValue("@wins", st.Wins);
							cmd.Parameters.AddWithValue("@money", st.Money);
							cmd.Parameters.AddWithValue("@best", st.BestLap);
							cmd.Parameters.AddWithValue("@earnings", st.TotalEarnings);
							version = st.Version;
						}
						cmd.ExecuteNonQuery();
						lock (st)
						{
							// Only clear Dirty if no save landed while we were writing
							// (a concurrent save would have bumped Version).
							if (st.Version == version) st.Dirty = false;
						}
					}
				}

				// Drain results into a local list so a mid-loop DB failure re-enqueues
				// the remainder instead of silently dropping it.
				var results = new List<PendingRaceResult>();
				while (_pendingResults.TryDequeue(out var r)) results.Add(r);
				foreach (var r in results)
				{
					try
					{
						using var cmd = new MySqlCommand(@"
							INSERT INTO racing_results (user_id, player_name, position, lap_time, total_time, money_earned, raced_at)
							VALUES (@uid, @name, @pos, @lap, @total, @money, UTC_TIMESTAMP())", conn);
						cmd.Parameters.AddWithValue("@uid", r.UserId);
						cmd.Parameters.AddWithValue("@name", r.PlayerName);
						cmd.Parameters.AddWithValue("@pos", r.Position);
						cmd.Parameters.AddWithValue("@lap", r.LapTime);
						cmd.Parameters.AddWithValue("@total", r.TotalTime);
						cmd.Parameters.AddWithValue("@money", r.MoneyEarned);
						cmd.ExecuteNonQuery();
					}
					catch { _pendingResults.Enqueue(r); }
				}
			}
			catch { }
			finally { Monitor.Exit(_persistLock); }
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
					if (body.TryGetProperty("totalRaces", out var tr)) st.TotalRaces = tr.GetInt32();
					if (body.TryGetProperty("wins", out var w)) st.Wins = w.GetInt32();
					if (body.TryGetProperty("money", out var m))
					{
						int newMoney = m.GetInt32();
						// The server is the source of truth for cash — reject any save
						// that would persist a negative balance instead of accepting it
						// blindly (that's how double-buys wrote negative money).
						if (newMoney < 0) return BadRequest("Money cannot be negative");
						st.Money = newMoney;
					}
					if (body.TryGetProperty("bestLap", out var bl)) st.BestLap = bl.GetDouble();
					if (body.TryGetProperty("totalEarnings", out var te)) st.TotalEarnings = te.GetInt32();
					st.Dirty = true;
					st.Version++;
				}
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
					// Serialize with camelCase so the client's u.id/u.category/u.statBonus
					// reads work (raw JsonSerializer.Serialize would emit PascalCase keys
					// that survive the response as pre-serialized nodes -> NaN stats).
					var camel = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
					st.Upgrades.Add(JsonSerializer.Deserialize<object>(JsonSerializer.Serialize(def, camel))!);
					st.Money -= def.Cost;
					st.Dirty = true;
					st.Version++;
				}
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
					// Charge for the skin and reject the purchase if the player can't
					// afford it — mirrors the upgrade endpoint so cash can't go negative.
					if (st.Money < cost) return BadRequest("Not enough money");
					st.SkinId = skinId;
					st.Money -= cost;
					st.Dirty = true;
					st.Version++;
				}
				return Ok(ToCarJson(st));
			}
			catch { return BadRequest(); }
		}

		// Matches the client's CAR_SKINS costs (ids 1-8). Returning -1 flags an
		// unknown skin so the endpoint rejects it.
		private static int GetSkinCost(int skinId) => skinId switch
		{
			1 => 0, 2 => 500, 3 => 500, 4 => 1500, 5 => 2000, 6 => 3000, 7 => 5000, 8 => 8000,
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
				});
				return Ok(new { ok = true });
			}
			catch { return BadRequest(); }
		}

		[HttpGet("leaderboard/{trackId}")]
		public async Task<IActionResult> GetLeaderboard(int trackId)
		{
			try
			{
				var results = new List<LeaderboardEntry>();
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				if (!string.IsNullOrEmpty(connStr))
				{
					EnsureSchema(connStr);
					using var conn = new MySqlConnection(connStr);
					await conn.OpenAsync();
					using var cmd = new MySqlCommand(@"
						SELECT r.user_id, COALESCE(NULLIF(r.player_name, ''), u.username) AS player_name,
						       MIN(r.lap_time) AS lap_time, MIN(r.total_time) AS total_time
						FROM racing_results r
						LEFT JOIN users u ON r.user_id = u.id
						WHERE r.lap_time > 0
						GROUP BY r.user_id, player_name
						ORDER BY lap_time ASC LIMIT 20", conn);
					using var rdr = await cmd.ExecuteReaderAsync();
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
				// Merge in-memory results not yet flushed so new races show instantly.
				// Keep only each player's best pending lap so a single player can't
				// occupy multiple board slots before the periodic flush runs.
				var pendingBest = new Dictionary<int, LeaderboardEntry>();
				foreach (var r in _pendingResults)
				{
					if (r.LapTime <= 0) continue;
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

				// Dedupe against rows already in the DB (player may appear in both)
				results = results
					.GroupBy(e => e.PlayerId)
					.Select(g => g.OrderBy(e => e.LapTime).First())
					.OrderBy(e => e.LapTime)
					.Take(20)
					.ToList();
				return Ok(results);
			}
			catch { return Ok(new List<LeaderboardEntry>()); }
		}

		private static UpgradeDef? GetUpgradeDef(int id)
		{
			return id switch
			{
				1 => new UpgradeDef { Id = 1, Name = "Stage 1 Engine", Category = "engine", Level = 1, MaxLevel = 5, Cost = 500, Description = "+10% Top Speed", StatBonus = 10 },
				2 => new UpgradeDef { Id = 2, Name = "Stage 2 Engine", Category = "engine", Level = 2, MaxLevel = 5, Cost = 1500, Description = "+20% Top Speed", StatBonus = 20 },
				3 => new UpgradeDef { Id = 3, Name = "Stage 3 Engine", Category = "engine", Level = 3, MaxLevel = 5, Cost = 4000, Description = "+30% Top Speed", StatBonus = 30 },
				4 => new UpgradeDef { Id = 4, Name = "Stage 4 Engine", Category = "engine", Level = 4, MaxLevel = 5, Cost = 10000, Description = "+40% Top Speed", StatBonus = 40 },
				5 => new UpgradeDef { Id = 5, Name = "Stage 5 Engine", Category = "engine", Level = 5, MaxLevel = 5, Cost = 25000, Description = "+50% Top Speed", StatBonus = 50 },
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
