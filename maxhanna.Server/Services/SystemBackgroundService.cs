using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.Helpers;
using MySqlConnector;
using Newtonsoft.Json;
using System.Text;

namespace maxhanna.Server.Services
{
	public class SystemBackgroundService : BackgroundService
	{
		private readonly string _apiKey;
		private readonly string _coinwatchUrl = "https://api.livecoinwatch.com/coins/list";
		private readonly string _connectionString;
		private readonly HttpClient _httpClient;
		private readonly WebCrawler _webCrawler;
		private readonly KrakenService _krakenService;
		private readonly AiController _aiController;
		private readonly NewsService _newsService;
		private readonly ProfitCalculationService _profitService;
		private readonly TradeIndicatorService _indicatorService;
		private readonly MiningApi _miningApiService = new MiningApi();
		private readonly Log _log;
		private readonly IConfiguration _config; // needed for apiKey 
		private Timer _tenSecondTimer;
		private Timer _halfMinuteTimer;
		private Timer _minuteTimer;
		private Timer _fiveMinuteTimer;
		private Timer _hourlyTimer;
		private Timer _threeHourTimer;
		private Timer _sixHourTimer;
		private Timer _dailyTimer;
		private static bool _initialDelayApplied = false;
		private bool isCrawling = false;
		private bool lastWasCrypto = false;
		private static readonly SemaphoreSlim _tradeLock = new SemaphoreSlim(1, 1);
		private static readonly Dictionary<string, string> CoinNameMap = new(StringComparer.OrdinalIgnoreCase) {
			{ "BTC", "Bitcoin" }, { "XBT", "Bitcoin" }, { "ETH", "Ethereum" }, { "XDG", "Dogecoin" }, { "SOL", "Solana" }
		};
		private static readonly Dictionary<string, string> CoinSymbols = new(StringComparer.OrdinalIgnoreCase) {
			{ "Bitcoin", "₿" }, { "XBT", "₿" }, { "BTC", "₿" }, { "Ethereum", "Ξ" }, { "ETH", "Ξ" },
			{ "Dogecoin", "Ɖ" }, { "XDG", "Ɖ" }, { "Solana", "◎" }, { "SOL", "◎" }
		};

		public SystemBackgroundService(Log log, IConfiguration config, WebCrawler webCrawler, AiController aiController,
			KrakenService krakenService, NewsService newsService, ProfitCalculationService profitService, TradeIndicatorService indicatorService)
		{
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
			_apiKey = config.GetValue<string>("CoinWatch:ApiKey")!;
			_httpClient = new HttpClient();
			_webCrawler = webCrawler;
			_aiController = aiController;
			_log = log;
			_krakenService = krakenService;
			_newsService = newsService;
			_profitService = profitService;
			_indicatorService = indicatorService;

			_tenSecondTimer = new Timer(async _ => await Run10SecondTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_halfMinuteTimer = new Timer(async _ => await Run30SecondTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_minuteTimer = new Timer(async _ => await RunOneMinuteTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_fiveMinuteTimer = new Timer(async _ => await RunFiveMinuteTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_hourlyTimer = new Timer(async _ => await RunHourlyTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_threeHourTimer = new Timer(async _ => await RunThreeHourTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_sixHourTimer = new Timer(async _ => await RunSixHourTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_dailyTimer = new Timer(async _ => await RunDailyTasks(), null, Timeout.Infinite, Timeout.Infinite);
		}

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			// Start all timers but stagger the first run to avoid heavy startup spikes.
			// Apply a one-time initial delay on first process start so the background
			// work doesn't hit immediately after deployment. This is an in-process
			// delay (resets if the process restarts).
			if (!_initialDelayApplied)
			{
				_initialDelayApplied = true;
				// Wait 5 minutes before scheduling timers for the first run.
				try
				{
					await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
				}
				catch (OperationCanceledException) { /* shutting down */ }
			}
			// Each timer keeps its periodic interval; the initial due time is randomized.
			var rnd = new Random((int)DateTime.UtcNow.Ticks & 0x0000FFFF);

			// Small randomized delays for first run (only) - compressed so first executions happen sooner
			// Keep jitter to avoid thundering starts but reduce overall span.
			TimeSpan tenSecDelay = TimeSpan.FromSeconds(rnd.Next(1, 3));    // 1-2s
			TimeSpan halfMinDelay = TimeSpan.FromSeconds(rnd.Next(2, 6));   // 2-5s
			TimeSpan minuteDelay = TimeSpan.FromSeconds(rnd.Next(4, 12));   // 4-11s
			TimeSpan fiveMinDelay = TimeSpan.FromSeconds(rnd.Next(8, 25));  // 8-24s
			TimeSpan hourlyDelay = TimeSpan.FromSeconds(rnd.Next(12, 40));  // 12-39s
			TimeSpan threeHourDelay = TimeSpan.FromSeconds(rnd.Next(20, 80)); // 20-79s
			TimeSpan sixHourDelay = TimeSpan.FromSeconds(rnd.Next(30, 120));  // 30-119s

			_tenSecondTimer.Change(tenSecDelay, TimeSpan.FromSeconds(10));
			_halfMinuteTimer.Change(halfMinDelay, TimeSpan.FromSeconds(30));
			_minuteTimer.Change(minuteDelay, TimeSpan.FromMinutes(1));
			_fiveMinuteTimer.Change(fiveMinDelay, TimeSpan.FromMinutes(5));
			_hourlyTimer.Change(hourlyDelay, TimeSpan.FromHours(1));
			_threeHourTimer.Change(threeHourDelay, TimeSpan.FromHours(3));
			_sixHourTimer.Change(sixHourDelay, TimeSpan.FromHours(6));
			// Daily timer remains scheduled to next midnight
			_dailyTimer.Change(CalculateNextDailyRun(), TimeSpan.FromHours(24));

			// Keep the service running until cancellation
			while (!stoppingToken.IsCancellationRequested)
			{
				await Task.Delay(1000, stoppingToken);
			}
		}
		private async Task Run10SecondTasks()
		{
			await MakeCryptoTrade();
		}
		private async Task Run30SecondTasks()
		{
			await SpawnEncounterMetabots();
			await FetchWebsiteMetadata();
		}
		private async Task RunOneMinuteTasks()
		{
			await _aiController.AnalyzeAndRenameFile();
		}
		private async Task RunFiveMinuteTasks()
		{
			await EnsureUserFoldersExistAsync();
			await FetchAndStoreTopMarketCaps();
			await UpdateLastBTCWalletInfo();
			await FetchAndStoreCoinValues();
			_miningApiService.UpdateWalletInDB(_config, _log);
			lastWasCrypto = !lastWasCrypto;
			await _newsService.GetAndSaveTopQuarterHourlyHeadlines(!lastWasCrypto ? "Cryptocurrency" : null);
			await _profitService.CalculateDailyProfits();
			if (!_indicatorService.IsUpdating)
			{
				await _indicatorService.UpdateIndicators();
			}
			else
			{
				_ = _log.Db("Skipping indicator update - already in progress", null, "TISVC", outputToConsole: true);
			}
		}


		/// <summary>
		/// Ensure that every user in the users table has a physical folder under {baseUploadPath}/Users/{username}
		/// and a corresponding virtual folder entry in maxhanna.file_uploads (is_folder = 1).
		/// This mirrors the behavior performed by FileController.MakeDirectory and UserController.CreateUser.
		/// </summary>
		private async Task EnsureUserFoldersExistAsync()
		{
			string baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? "";
			if (string.IsNullOrWhiteSpace(baseTarget))
			{
				_ = _log.Db("baseUploadPath is not configured; skipping EnsureUserFoldersExistAsync.", null, "SYSTEM", true);
				return;
			}

			string usersRoot = Path.Combine(baseTarget, "Users");
			try { if (!Directory.Exists(usersRoot)) Directory.CreateDirectory(usersRoot); } catch (Exception ex) { _ = _log.Db("Failed to ensure Users root directory: " + ex.Message, null, "SYSTEM", true); }

			await using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			// Fetch all users
			var users = new List<(int Id, string Username)>();
			string selectSql = "SELECT id, username FROM maxhanna.users;";
			using (var cmd = new MySqlCommand(selectSql, conn))
			using (var reader = await cmd.ExecuteReaderAsync())
			{
				while (await reader.ReadAsync())
				{
					int id = reader.IsDBNull(0) ? 0 : reader.GetInt32(0);
					string username = reader.IsDBNull(1) ? id.ToString() : reader.GetString(1);
					users.Add((id, username));
				}
			}

			foreach (var u in users)
			{
				try
				{
					string userDir = Path.Combine(usersRoot, u.Username ?? u.Id.ToString());
					if (!Directory.Exists(userDir))
					{
						Directory.CreateDirectory(userDir);
						try { System.IO.File.WriteAllText(Path.Combine(userDir, ".private"), "private"); } catch { }
						_ = _log.Db($"Created physical user directory for '{u.Username}'.", u.Id, "SYSTEM");
					}

					// Ensure virtual folder entry exists in file_uploads
					string fileName = Path.GetFileName(userDir);
					string directoryName = (Path.GetDirectoryName(userDir) ?? "").Replace("\\", "/");
					if (!directoryName.EndsWith("/")) directoryName += "/";

					string checkSql = "SELECT COUNT(*) FROM maxhanna.file_uploads WHERE folder_path = @folderPath AND file_name = @fileName AND is_folder = 1 LIMIT 1;";
					using (var checkCmd = new MySqlCommand(checkSql, conn))
					{
						checkCmd.Parameters.AddWithValue("@folderPath", directoryName);
						checkCmd.Parameters.AddWithValue("@fileName", fileName);
						var existsObj = await checkCmd.ExecuteScalarAsync();
						int exists = existsObj == null || existsObj == DBNull.Value ? 0 : Convert.ToInt32(existsObj);
						if (exists == 0)
						{
							string insertSql = @"INSERT INTO maxhanna.file_uploads (user_id, upload_date, file_name, folder_path, is_public, is_folder) VALUES (@user_id, UTC_TIMESTAMP(), @fileName, @folderPath, @isPublic, @isFolder);";
							using (var insertCmd = new MySqlCommand(insertSql, conn))
							{
								insertCmd.Parameters.AddWithValue("@user_id", u.Id);
								insertCmd.Parameters.AddWithValue("@fileName", fileName);
								insertCmd.Parameters.AddWithValue("@folderPath", directoryName);
								insertCmd.Parameters.AddWithValue("@isPublic", 0);
								insertCmd.Parameters.AddWithValue("@isFolder", 1);
								try
								{
									await insertCmd.ExecuteNonQueryAsync();
									_ = _log.Db($"Inserted virtual folder entry for '{u.Username}'.", u.Id, "SYSTEM");
								}
								catch (MySqlException mex)
								{
									_ = _log.Db("Failed to insert virtual folder entry: " + mex.Message, u.Id, "SYSTEM", true);
								}
							}
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error ensuring folder for user '{u.Username}': " + ex.Message, u.Id, "SYSTEM", true);
				}
			}
		}
		private async Task RunHourlyTasks()
		{
			await AssignTrophies();
			await _aiController.ProvideMarketAnalysis();
			await _log.DeleteOldLogs();
		}
		private async Task RunSixHourTasks()
		{
			await FetchExchangeRates();
			await _profitService.CalculateWeeklyProfits();
			await _profitService.CalculateMonthlyProfits();
			await FetchAndStoreCryptoEvents();
			await FetchAndStoreFearGreedAsync();
			await FetchAndStoreGlobalMetricsAsync();
		}
		private async Task RunThreeHourTasks()
		{
			await MoveInactiveEnderHeroes();
		}
		private async Task RunDailyTasks()
		{
			await DeleteOldBattleReports();
			await DeleteOldGuests();
			await DeleteOldSearchResults();
			await DeleteOldSearchQueries();
			await DeleteOldSentimentAnalysis();
			await DeleteOldGlobalMetrics();
			await DeleteNotificationRequests();
			await DeleteHostAiRequests();
			await DeleteOldCoinValueEntries();
			await DeleteOldNews();
			await DeleteOldTradeVolumeEntries();
			await DeleteOldCoinMarketCaps();
			await DeleteOldEnderScores();
			await _newsService.CreateDailyCryptoNewsStoryAsync();
			await _newsService.CreateDailyNewsStoryAsync();
			await _newsService.PostDailyMemeAsync();
			await _newsService.CreateDailyMusicStoryAsync();
			await CleanupOldFavourites();
			await _log.BackupDatabase();
		}

		private TimeSpan CalculateNextDailyRun()
		{
			var now = DateTime.Now;
			var nextRun = new DateTime(now.Year, now.Month, now.Day, 0, 0, 0).AddDays(1);
			return nextRun - now;
		} 

		private async Task MoveInactiveEnderHeroes(int recentDisplacementHours = 8)
		{
			await using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();
			using var transaction = await conn.BeginTransactionAsync();
			try
			{
				const string displacementNotificationText = "Your lightcycle was displaced for inactivity and moved to a new sector.";
				// 1. Global throttle: if ANY displacement occurred in the last `recentDisplacementHours`, skip this run entirely.
				if (recentDisplacementHours > 0)
				{
					string globalScanSql = @"SELECT COUNT(*) FROM maxhanna.notifications 
						WHERE text = @dispText AND date >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @hrs HOUR);";
					await using (var gCmd = new MySqlCommand(globalScanSql, conn, transaction))
					{
						gCmd.Parameters.AddWithValue("@dispText", displacementNotificationText);
						gCmd.Parameters.AddWithValue("@hrs", recentDisplacementHours);
						var recentCountObj = await gCmd.ExecuteScalarAsync();
						int recentCount = recentCountObj == null ? 0 : Convert.ToInt32(recentCountObj);
						if (recentCount > 0)
						{
							await transaction.CommitAsync();
							_ = _log.Db($"Skipping displacement run: {recentCount} displacement(s) occurred within last {recentDisplacementHours}h.", null, "SYSTEM");
							return;
						}
					}
				}

				// 2. Build hash of users who already received a displacement notification in the past 8 hours (per-user cooldown)
				var recentlyDisplacedUsers = new HashSet<int>();
				string userScanSql = @"SELECT DISTINCT user_id FROM maxhanna.notifications 
					WHERE text = @dispText AND date >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 HOUR) AND user_id IS NOT NULL;";
				await using (var uCmd = new MySqlCommand(userScanSql, conn, transaction))
				{
					uCmd.Parameters.AddWithValue("@dispText", displacementNotificationText);
					using var uReader = await uCmd.ExecuteReaderAsync();
					while (await uReader.ReadAsync())
					{
						int uid = uReader.IsDBNull(0) ? 0 : uReader.GetInt32(0);
						if (uid > 0) recentlyDisplacedUsers.Add(uid);
					}
				}
				// Find heroes with >=2 total walls but 0 walls in last 8 hours
				const string selectSql = @"
				SELECT h.id as hero_id, h.user_id as user_id, h.level as hero_level
				FROM maxhanna.ender_hero h
				WHERE (
					SELECT COUNT(*) FROM maxhanna.ender_bike_wall w WHERE w.hero_id = h.id
				) >= 2
				AND (
					SELECT COUNT(*) FROM maxhanna.ender_bike_wall w2 WHERE w2.hero_id = h.id AND w2.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
				) = 0;";

				using var selCmd = new MySqlCommand(selectSql, conn, transaction);
				using var reader = await selCmd.ExecuteReaderAsync();
				var victims = new List<(int heroId, int? userId, int level)>();
				while (await reader.ReadAsync())
				{
					int heroId = Convert.ToInt32(reader["hero_id"]);
					int? userId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? null : Convert.ToInt32(reader["user_id"]);
					int level = reader.IsDBNull(reader.GetOrdinal("hero_level")) ? 1 : Convert.ToInt32(reader["hero_level"]);
					victims.Add((heroId, userId, level));
				}
				reader.Close();

				if (victims.Count == 0)
				{
					await transaction.CommitAsync();
					_ = _log.Db("No inactive ender heroes found to relocate.", null, "SYSTEM");
					return;
				}

				// Gather occupied hero spots (all levels) & wall spots for safety checks
				var occupiedSpots = new Dictionary<int, List<(int X, int Y)>>(); // level -> coords list
				var wallSpots = new Dictionary<int, List<(int X, int Y)>>();
				const string occSql = "SELECT id, level, coordsX, coordsY FROM maxhanna.ender_hero;";
				await using (var occCmd = new MySqlCommand(occSql, conn, transaction))
				await using (var occReader = await occCmd.ExecuteReaderAsync())
				{
					while (await occReader.ReadAsync())
					{
						int lvl = occReader.IsDBNull(occReader.GetOrdinal("level")) ? 1 : occReader.GetInt32("level");
						int cx = occReader.IsDBNull(occReader.GetOrdinal("coordsX")) ? 0 : occReader.GetInt32("coordsX");
						int cy = occReader.IsDBNull(occReader.GetOrdinal("coordsY")) ? 0 : occReader.GetInt32("coordsY");
						if (!occupiedSpots.TryGetValue(lvl, out var list)) { list = new List<(int, int)>(); occupiedSpots[lvl] = list; }
						list.Add((cx, cy));
					}
				}
				const string wallSql = "SELECT level, x, y FROM maxhanna.ender_bike_wall;";
				await using (var wallCmd = new MySqlCommand(wallSql, conn, transaction))
				await using (var wallReader = await wallCmd.ExecuteReaderAsync())
				{
					while (await wallReader.ReadAsync())
					{
						int lvl = wallReader.IsDBNull(wallReader.GetOrdinal("level")) ? 1 : wallReader.GetInt32("level");
						int wx = wallReader.IsDBNull(wallReader.GetOrdinal("x")) ? 0 : wallReader.GetInt32("x");
						int wy = wallReader.IsDBNull(wallReader.GetOrdinal("y")) ? 0 : wallReader.GetInt32("y");
						if (!wallSpots.TryGetValue(lvl, out var list)) { list = new List<(int, int)>(); wallSpots[lvl] = list; }
						list.Add((wx, wy));
					}
				}

				const int SAFE_DISTANCE = 32; // pixels
				const int MAX_ATTEMPTS = 150;
				const int MAP_SIZE = 1024; // should match hero creation logic

				bool IsSafe(int level, int x, int y)
				{
					if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return false;
					if (occupiedSpots.TryGetValue(level, out var heroes))
					{
						foreach (var (hx, hy) in heroes)
						{
							if (Math.Abs(hx - x) <= SAFE_DISTANCE && Math.Abs(hy - y) <= SAFE_DISTANCE) return false;
						}
					}
					if (wallSpots.TryGetValue(level, out var walls))
					{
						foreach (var (wx, wy) in walls)
						{
							if (Math.Abs(wx - x) <= SAFE_DISTANCE && Math.Abs(wy - y) <= SAFE_DISTANCE) return false;
						}
					}
					return true;
				}

				const string updateHeroSql = "UPDATE maxhanna.ender_hero SET coordsX = @X, coordsY = @Y WHERE id = @HeroId;";
				await using var updateHeroCmd = new MySqlCommand(updateHeroSql, conn, transaction);
				updateHeroCmd.Parameters.Add(new MySqlParameter("@X", MySqlDbType.Int32));
				updateHeroCmd.Parameters.Add(new MySqlParameter("@Y", MySqlDbType.Int32));
				updateHeroCmd.Parameters.Add(new MySqlParameter("@HeroId", MySqlDbType.Int32));

				const string insertNotificationSql = @"INSERT INTO maxhanna.notifications (user_id, text, date) VALUES (@userId, @text, UTC_TIMESTAMP());";
				await using var insertNotifCmd = new MySqlCommand(insertNotificationSql, conn, transaction);
				insertNotifCmd.Parameters.Add(new MySqlParameter("@userId", MySqlDbType.Int32));
				insertNotifCmd.Parameters.Add(new MySqlParameter("@text", MySqlDbType.VarChar));

				var rnd = new Random();
				int relocated = 0;
				foreach (var v in victims)
				{
					int lvl = v.level;
					int newX = 16; int newY = 16; bool found = false;
					for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++)
					{
						int x = rnd.Next(32, MAP_SIZE - 32);
						int y = rnd.Next(32, MAP_SIZE - 32);
						if (IsSafe(lvl, x, y)) { newX = x; newY = y; found = true; break; }
					}
					if (!found)
					{
						// fallback small expanding search
						for (int radius = 16; radius <= 160 && !found; radius += 16)
						{
							for (int dx = -radius; dx <= radius && !found; dx += 16)
							{
								for (int dy = -radius; dy <= radius && !found; dy += 16)
								{
									int tx = newX + dx; int ty = newY + dy;
									if (IsSafe(lvl, tx, ty)) { newX = tx; newY = ty; found = true; }
								}
							}
						}
					}

					updateHeroCmd.Parameters["@X"].Value = newX;
					updateHeroCmd.Parameters["@Y"].Value = newY;
					updateHeroCmd.Parameters["@HeroId"].Value = v.heroId;
					await updateHeroCmd.ExecuteNonQueryAsync();

					if (!occupiedSpots.TryGetValue(lvl, out var heroList)) { heroList = new List<(int, int)>(); occupiedSpots[lvl] = heroList; }
					heroList.Add((newX, newY));
					relocated++;

					if (v.userId.HasValue && v.userId.Value > 0)
					{
						// Skip displacement if user recently displaced (per-user cooldown)
						if (recentlyDisplacedUsers.Contains(v.userId.Value))
						{
							_ = _log.Db($"Skipping hero {v.heroId} displacement due to recent per-user cooldown (user {v.userId.Value}).", v.heroId, "SYSTEM");
							continue; // continue to next victim without committing previous move? (we already moved hero; revert?)
						}
						insertNotifCmd.Parameters["@userId"].Value = v.userId.Value;
						insertNotifCmd.Parameters["@text"].Value = displacementNotificationText;
						await insertNotifCmd.ExecuteNonQueryAsync();
						recentlyDisplacedUsers.Add(v.userId.Value); // update runtime set
					}
					_ = _log.Db($"Relocated inactive hero {v.heroId} to ({newX},{newY}) on level {lvl}.", v.heroId, "SYSTEM");
				}

				await transaction.CommitAsync();
				_ = _log.Db($"Relocated {relocated} inactive ender heroes.", null, "SYSTEM");
			}
			catch (Exception ex)
			{
				try { await transaction.RollbackAsync(); } catch { }
				_ = _log.Db($"Error relocating inactive ender heroes: {ex.Message}", null, "SYSTEM", true);
			}
		}
		public override async Task StopAsync(CancellationToken cancellationToken)
		{
			_halfMinuteTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_minuteTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_fiveMinuteTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_hourlyTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_threeHourTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_sixHourTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_dailyTimer?.Change(Timeout.Infinite, Timeout.Infinite);

			await base.StopAsync(cancellationToken);
		}

		private async Task FetchAndStoreFearGreedAsync()
		{
			await _log.Db("Fetching Fear & Greed index...", null, "FGI", outputToConsole: true);
			await using (var conn1 = new MySqlConnection(_connectionString))
			{
				await conn1.OpenAsync();

				const string latestSql = "SELECT MAX(updated) FROM crypto_fear_greed;";
				await using var latestCmd = new MySqlCommand(latestSql, conn1);
				var latestObj = await latestCmd.ExecuteScalarAsync();

				if (latestObj is DateTime lastUpdated &&
					lastUpdated >= DateTime.UtcNow.AddDays(-1))
				{
					await _log.Db(
						$"Fear-and-Greed already stored @ {lastUpdated:u}; skipped pull.",
						null, "FGI", outputToConsole: true);
					return;
				}
			}

			// 1. Grab the API key you put in appsettings.json
			var apiKey = _config.GetValue<string>("CoinMarketCap:ApiKey");
			if (string.IsNullOrWhiteSpace(apiKey))
			{
				await _log.Db("CoinMarketCap API key missing", null, "FGI", outputToConsole: true);
				return;
			}

			// 2. Call /v3/fear‑and‑greed/latest
			string json;
			using (var http = new HttpClient())
			{
				var req = new HttpRequestMessage
				{
					Method = HttpMethod.Get,
					RequestUri = new Uri("https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest"),
				};
				req.Headers.Add("X-CMC_PRO_API_KEY", apiKey);
				req.Headers.Add("Accepts", "application/json");

				using var resp = await http.SendAsync(req);
				resp.EnsureSuccessStatusCode();
				json = await resp.Content.ReadAsStringAsync();
			}

			// 3. Pull out the fields we care about
			var root = Newtonsoft.Json.Linq.JObject.Parse(json);
			var dataToken = root["data"];                 // object, not an array, for “latest”
			var indexValue = dataToken?["value"]?.ToObject<int>() ?? 0;
			var classification = dataToken?["value_classification"]?.ToObject<string>();
			var timestampUtc = dataToken?["timestamp"]?.ToObject<DateTime>() ?? DateTime.UtcNow;
			// 4. Insert / update
			await using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			// quick duplicate check (optional)
			const string existsSql = @"SELECT 1 FROM crypto_fear_greed
                               WHERE timestamp_utc = @ts
                                 AND updated >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
                               LIMIT 1;";
			await using (var exists = new MySqlCommand(existsSql, conn))
			{
				exists.Parameters.AddWithValue("@ts", timestampUtc);
				if (await exists.ExecuteScalarAsync() is not null)
				{
					await _log.Db("Fear‑and‑Greed already up‑to‑date, skipping.", null, "FGI", outputToConsole: true);
					return;
				}
			}

			const string upsertSql = @"
				INSERT INTO crypto_fear_greed (timestamp_utc, value, classification, updated)
				VALUES (@ts, @val, @class, UTC_TIMESTAMP())
				ON DUPLICATE KEY UPDATE
					value          = VALUES(value),
					classification = VALUES(classification),
					updated        = VALUES(updated);";

			await using (var cmd = new MySqlCommand(upsertSql, conn))
			{
				cmd.Parameters.AddWithValue("@ts", timestampUtc);
				cmd.Parameters.AddWithValue("@val", indexValue);
				cmd.Parameters.AddWithValue("@class", classification);
				await cmd.ExecuteNonQueryAsync();
			}

			await _log.Db($"Stored Fear & Greed = {indexValue} ({classification}) @ {timestampUtc:u}", null, "FGI", outputToConsole: true);
		}

		private async Task FetchAndStoreGlobalMetricsAsync()
		{
			await _log.Db("Fetching global metrics from CoinMarketCap...", null, "GMF", outputToConsole: true);

			// First check if we have recent data (within last 3 hours)
			await using (var checkConn = new MySqlConnection(_connectionString))
			{
				await checkConn.OpenAsync();

				const string recentCheckSql = @"
					SELECT 1 FROM crypto_global_metrics 
					WHERE last_updated >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
					LIMIT 1;";

				await using var checkCmd = new MySqlCommand(recentCheckSql, checkConn);
				if (await checkCmd.ExecuteScalarAsync() != null)
				{
					await _log.Db("Recent global metrics already exist (within last 3 hours), skipping update.",
								 null, "GMF", outputToConsole: true);
					return;
				}
			}

			// Get API key from config
			var apiKey = _config.GetValue<string>("CoinMarketCap:ApiKey");
			if (string.IsNullOrWhiteSpace(apiKey))
			{
				await _log.Db("CoinMarketCap API key missing", null, "GMF", outputToConsole: true);
				return;
			}

			// Call CoinMarketCap API
			string json;
			try
			{
				using var http = new HttpClient();
				var req = new HttpRequestMessage
				{
					Method = HttpMethod.Get,
					RequestUri = new Uri("https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest"),
				};
				req.Headers.Add("X-CMC_PRO_API_KEY", apiKey);
				req.Headers.Add("Accepts", "application/json");

				using var resp = await http.SendAsync(req);
				resp.EnsureSuccessStatusCode();
				json = await resp.Content.ReadAsStringAsync();
			}
			catch (Exception ex)
			{
				await _log.Db($"Failed to fetch global metrics: {ex.Message}", null, "GMF", outputToConsole: true);
				return;
			}

			// Parse the response
			try
			{
				var root = Newtonsoft.Json.Linq.JObject.Parse(json);
				var data = root["data"] ?? throw new Exception("No data in API response");
				var quote = data["quote"]?["USD"] ?? throw new Exception("No USD quote in API response");

				var timestamp = data["last_updated"]?.ToObject<DateTime>() ?? DateTime.UtcNow;

				// Check if we already have this exact timestamp (redundant check but good for safety)
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				const string existsSql = @"SELECT 1 FROM crypto_global_metrics 
                              WHERE timestamp_utc = @ts LIMIT 1;";
				await using var existsCmd = new MySqlCommand(existsSql, conn);
				existsCmd.Parameters.AddWithValue("@ts", timestamp);
				if (await existsCmd.ExecuteScalarAsync() != null)
				{
					await _log.Db($"Global metrics already exist @ {timestamp:u}, skipping.", null, "GMF", outputToConsole: true);
					return;
				}

				// Prepare the insert command
				const string insertSql = @"
					INSERT INTO crypto_global_metrics (
						timestamp_utc, btc_dominance, eth_dominance,
						active_cryptocurrencies, active_exchanges, active_market_pairs,
						total_market_cap, total_volume_24h, total_volume_24h_reported,
						altcoin_market_cap, altcoin_volume_24h, altcoin_volume_24h_reported,
						defi_market_cap, defi_volume_24h, 
						stablecoin_market_cap, stablecoin_volume_24h,
						derivatives_volume_24h, last_updated
					) VALUES (
						@ts, @btcDom, @ethDom,
						@activeCryptos, @activeExchanges, @activePairs,
						@totalCap, @totalVol, @totalVolReported,
						@altcoinCap, @altcoinVol, @altcoinVolReported,
						@defiCap, @defiVol,
						@stablecoinCap, @stablecoinVol,
						@derivativesVol, @lastUpdated
					)";

				await using var cmd = new MySqlCommand(insertSql, conn);

				// Add parameters
				cmd.Parameters.AddWithValue("@ts", timestamp);
				cmd.Parameters.AddWithValue("@btcDom", data["btc_dominance"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@ethDom", data["eth_dominance"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@activeCryptos", data["active_cryptocurrencies"]?.ToObject<int>() ?? 0);
				cmd.Parameters.AddWithValue("@activeExchanges", data["active_exchanges"]?.ToObject<int>() ?? 0);
				cmd.Parameters.AddWithValue("@activePairs", data["active_market_pairs"]?.ToObject<int>() ?? 0);

				cmd.Parameters.AddWithValue("@totalCap", quote["total_market_cap"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@totalVol", quote["total_volume_24h"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@totalVolReported", quote["total_volume_24h_reported"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@altcoinCap", quote["altcoin_market_cap"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@altcoinVol", quote["altcoin_volume_24h"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@altcoinVolReported", quote["altcoin_volume_24h_reported"]?.ToObject<decimal>() ?? 0m);

				cmd.Parameters.AddWithValue("@defiCap", quote["defi_market_cap"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@defiVol", quote["defi_volume_24h"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@stablecoinCap", quote["stablecoin_market_cap"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@stablecoinVol", quote["stablecoin_volume_24h"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@derivativesVol", quote["derivatives_volume_24h"]?.ToObject<decimal>() ?? 0m);
				cmd.Parameters.AddWithValue("@lastUpdated", data["last_updated"]?.ToObject<DateTime>() ?? DateTime.UtcNow);

				var affectedRows = await cmd.ExecuteNonQueryAsync();

				if (affectedRows > 0)
				{
					await _log.Db($"Successfully stored global metrics @ {timestamp:u}", null, "GMF", outputToConsole: true);
				}
				else
				{
					await _log.Db("Failed to store global metrics (no rows affected)", null, "GMF", outputToConsole: true);
				}
			}
			catch (Exception ex)
			{
				await _log.Db($"Failed to process global metrics: {ex.Message}", null, "GMF", outputToConsole: true);
			}
		}

		private async Task FetchAndStoreCryptoEvents()
		{
			await _log.Db("Fetching Crypto Calendar of events...", null, "CCS", outputToConsole: true);

			try
			{
				await using (var conn1 = new MySqlConnection(_connectionString))
				{
					await conn1.OpenAsync();

					var recentExistsSql = @"
						SELECT 1
						FROM crypto_calendar_events
						WHERE updated >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
						LIMIT 1;";

					await using (var recentCmd = new MySqlCommand(recentExistsSql, conn1))
					{
						var hasRecent = await recentCmd.ExecuteScalarAsync() is not null;
						if (hasRecent)
						{
							await _log.Db("Crypto-calendar already updated in the last 24 h. Skipping fetch.", null, "CCS", outputToConsole: true);
							return;
						}
					}
				}

				var apiKey = _config.GetValue<string>("CoinMarketCal:ApiKey");
				if (string.IsNullOrEmpty(apiKey))
				{
					await _log.Db("CoinMarketCal API key is missing in configuration", null, "CCS", outputToConsole: true);
					return;
				}

				using var httpClient = new HttpClient();
				var request = new HttpRequestMessage
				{
					Method = HttpMethod.Get,
					RequestUri = new Uri("https://developers.coinmarketcal.com/v1/events?max=100"),
					Headers =
					{
						{ "Accept", "application/json" },
						{ "x-api-key", apiKey },
					},
				};

				using var response = await httpClient.SendAsync(request);
				response.EnsureSuccessStatusCode();

				var responseBody = await response.Content.ReadAsStringAsync();
				//Console.WriteLine("Received response: " + responseBody);
				var eventsResponse = JsonConvert.DeserializeObject<CoinMarketCalResponse>(responseBody);

				if (eventsResponse?.Body == null || eventsResponse.Body.Count == 0)
				{
					await _log.Db("No events found in CoinMarketCal response", null, "CCS", outputToConsole: true);
					return;
				}

				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				// Delete events older than 10 years
				var deleteOldSql = "DELETE FROM crypto_calendar_events WHERE event_date < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 YEAR);";
				await using (var deleteCmd = new MySqlCommand(deleteOldSql, conn))
				{
					await deleteCmd.ExecuteNonQueryAsync();
				}

				foreach (var eventItem in eventsResponse.Body)
				{
					//Console.WriteLine($"Processing event: ID={eventItem?.Id}, Title={eventItem?.TitleText}, DateEvent={eventItem?.DateEvent}");

					var insertSql = @"
						INSERT INTO crypto_calendar_events 
						(event_id, title, coin_symbol, coin_name, event_date, created_date, source, description, is_hot, proof_url, updated)
						VALUES (@eventId, @title, @coinSymbol, @coinName, @eventDate, @createdDate, @source, @description, @isHot, @proofUrl, UTC_TIMESTAMP())
						ON DUPLICATE KEY UPDATE 
							title = VALUES(title),
							event_date = VALUES(event_date),
							created_date = VALUES(created_date),
							source = VALUES(source),
							description = VALUES(description),
							is_hot = VALUES(is_hot),
							proof_url = VALUES(proof_url);";

					await using (var insertCmd = new MySqlCommand(insertSql, conn))
					{
						insertCmd.Parameters.AddWithValue("@eventId", eventItem?.Id);
						insertCmd.Parameters.AddWithValue("@title", eventItem?.TitleText);
						insertCmd.Parameters.AddWithValue("@coinSymbol", eventItem?.Coins?[0].Symbol);
						insertCmd.Parameters.AddWithValue("@coinName", eventItem?.Coins?[0].Name);
						insertCmd.Parameters.AddWithValue("@eventDate", eventItem?.DateEvent);
						insertCmd.Parameters.AddWithValue("@createdDate", eventItem?.CreatedDate);
						insertCmd.Parameters.AddWithValue("@source", eventItem?.Source);
						insertCmd.Parameters.AddWithValue("@description", eventItem?.Description);
						insertCmd.Parameters.AddWithValue("@isHot", eventItem?.IsHot);
						insertCmd.Parameters.AddWithValue("@proofUrl", eventItem?.Proof);

						await insertCmd.ExecuteNonQueryAsync();
					}
				}

				await _log.Db($"Successfully stored {eventsResponse.Body.Count} crypto events", null, "CCS", outputToConsole: true);
			}
			catch (Exception ex)
			{
				await _log.Db($"Error fetching crypto events: {ex.Message}", null, "CCS", outputToConsole: true);
			}
		}
		private async Task FetchWebsiteMetadata()
		{
			if (!isCrawling)
			{
				try
				{
					this.isCrawling = true;
					await _webCrawler.StartBackgroundScrape();
				}
				catch (Exception ex)
				{
					_ = _log.Db("Exception while crawling : " + ex.Message, null);
				}
			}
			this.isCrawling = false;
		}
		private async Task MakeCryptoTrade()
		{
			if (!await _tradeLock.WaitAsync(0))
			{
				return;
			}

			try
			{
				// Get owner keys
				UserKrakenApiKey? ownerKeys = await _krakenService.GetApiKey(1).ConfigureAwait(false);
				if (ownerKeys?.ApiKey == null || ownerKeys.PrivateKey == null)
				{
					await _log.Db("No Kraken API keys found for userId: 1", 1, "SYSTEM", true).ConfigureAwait(false);
					return;
				}

				try
				{
					var volumePairs = new[] { "XBTUSDC", "XRPUSDC", "XDGUSDC", "ETHUSDC", "SOLUSDC" };
					var volumeTasks = new List<Task>();

					foreach (var pair in volumePairs)
					{
						volumeTasks.Add(SaveVolumeDataAsync(1, pair, ownerKeys).ContinueWith(t =>
						{
							if (t.IsFaulted)
							{
								_ = _log.Db($"Volume save failed for {pair}: {t.Exception?.InnerException?.Message}",
											1, "TRADE", true);
							}
						}));
					}

					await Task.WhenAll(volumeTasks).ConfigureAwait(false);
				}
				catch (Exception ex)
				{
					await _log.Db($"Volume data error: {ex.Message}", 1, "TRADE", true).ConfigureAwait(false);
					return;
				}

				// Collect trade task delegates
				var tradeTaskDelegates = new List<(Func<Task> TaskDelegate, string Crypto, int UserId, string Strategy)>();
				var cryptocurrencies = new[] { "BTC", "XRP", "SOL", "XDG", "ETH" };
				var strategies = new[] { "HFT", "DCA", "IND" };

				foreach (var crypto in cryptocurrencies)
				{
					foreach (var strategy in strategies)
					{
						var activeUsers = await _krakenService.GetActiveTradeBotUsers(crypto, strategy, null);
						foreach (var userId in activeUsers)
						{
							UserKrakenApiKey? keys = await _krakenService.GetApiKey(userId);
							if (keys == null || string.IsNullOrEmpty(keys.ApiKey) || string.IsNullOrEmpty(keys.PrivateKey))
							{
								await _log.Db($"No Kraken API keys found for userId: {userId}", userId, "SYSTEM", true);
								continue;
							}

							// Capture keys in a local variable to avoid closure issues
							UserKrakenApiKey capturedKeys = keys;
							tradeTaskDelegates.Add((
								() => _krakenService.MakeATrade(userId, crypto, capturedKeys, strategy),
								crypto,
								userId,
								strategy
							));
						}
					}
				}

				// Process tasks sequentially with 0.5-second delay
				//await _log.Db($"Starting execution of {tradeTaskDelegates.Count} trade tasks", null, "TRADE", true);
				foreach (var (taskDelegate, crypto, userId, strategy) in tradeTaskDelegates)
				{
					var startTime = DateTime.UtcNow;
					//await _log.Db($"Executing trade for userId={userId}, crypto={crypto}, strategy={strategy} at {startTime:u}", userId, "TRADE", true);
					try
					{
						await taskDelegate().ConfigureAwait(false);
					}
					catch (Exception ex)
					{
						await _log.Db($"Error executing trade for userId={userId}, crypto={crypto}, strategy={strategy}: {ex.Message}", userId, "TRADE", true);
					}

					var endTime = DateTime.UtcNow;
					var elapsedMs = (endTime - startTime).TotalMilliseconds;
					//await _log.Db($"Trade for userId={userId}, crypto={crypto}, strategy={strategy} completed in {elapsedMs:F2}ms", userId, "TRADE", true);
					await Task.Delay(500).ConfigureAwait(false);
				}

				//await _log.Db($"Completed execution of {tradeTaskDelegates.Count} trade tasks", null, "TRADE", true);
			}
			catch (Exception ex)
			{
				await _log.Db($"Exception while trading: {ex.Message}", null, "TRADE", true);
			}
			finally
			{
				_tradeLock.Release();
			}
		}
		private async Task UpdateLastBTCWalletInfo()
		{
			try
			{
				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				// Fetch the most recently updated BTC wallet where the last_fetched timestamp is older than 1 hour
				string fetchWalletSql = @"
					SELECT id, user_id, btc_address, last_fetched 
					FROM user_btc_wallet_info 
					WHERE last_fetched < UTC_TIMESTAMP() - INTERVAL 1 HOUR
					ORDER BY last_fetched DESC
					LIMIT 1;";

				WalletInfo? wallet = null;
				using (var cmd = new MySqlCommand(fetchWalletSql, conn))
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						wallet = new WalletInfo
						{
							Id = reader.GetInt32("id"),
							UserId = reader.GetInt32("user_id"),
							BtcAddress = reader.GetString("btc_address")
						};
					}
				}

				if (wallet == null)
				{
					_ = _log.Db("No BTC wallets found to update or all wallets are up to date.", null);
					return;
				}

				// Fetch wallet data from Blockchain.com API
				var walletData = await FetchBTCWalletData(wallet.BtcAddress);
				if (walletData == null)
				{
					_ = _log.Db($"Failed to update wallet info for address: {wallet.BtcAddress}", null);
					return;
				}

				// Insert the new wallet balance data into user_btc_wallet_balance
				string insertSql = @"
					INSERT INTO user_btc_wallet_balance (wallet_id, balance, fetched_at)
					VALUES (@WalletId, @FinalBalance, UTC_TIMESTAMP());";

				using (var insertCmd = new MySqlCommand(insertSql, conn))
				{
					decimal btc = walletData.FinalBalance / 100_000_000m;
					insertCmd.Parameters.AddWithValue("@WalletId", wallet.Id);
					insertCmd.Parameters.AddWithValue("@FinalBalance", btc);

					await insertCmd.ExecuteNonQueryAsync();
				}

				// Update the last_fetched timestamp in user_btc_wallet_info
				string updateLastFetchedSql = @"
					UPDATE user_btc_wallet_info 
					SET last_fetched = UTC_TIMESTAMP() 
					WHERE id = @WalletId;";

				using (var updateCmd = new MySqlCommand(updateLastFetchedSql, conn))
				{
					updateCmd.Parameters.AddWithValue("@WalletId", wallet.Id);
					await updateCmd.ExecuteNonQueryAsync();
				}

				//_ = _log.Db($"Successfully inserted wallet balance data and updated last_fetched for address: {wallet.BtcAddress}");
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while updating BTC wallet info. " + ex.Message, null);
			}
		}


		private async Task<BTCWalletData?> FetchBTCWalletData(string btcAddress)
		{
			string apiUrl = $"https://blockchain.info/rawaddr/{btcAddress}";

			try
			{
				var response = await _httpClient.GetAsync(apiUrl);
				if (response.IsSuccessStatusCode)
				{
					var responseContent = await response.Content.ReadAsStringAsync();
					return JsonConvert.DeserializeObject<BTCWalletData>(responseContent);
				}
				else
				{
					_ = _log.Db($"Failed to fetch BTC wallet data for address {btcAddress}: {response.StatusCode}", null);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error fetching BTC wallet data for address {btcAddress}. " + ex.Message, null);
			}

			return null;
		}
		private async Task DeleteOldBattleReports()
		{
			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				await using MySqlTransaction transaction = await conn.BeginTransactionAsync();
				try
				{
					string deleteSqlReportsAndBattles = @"
                        DELETE rd, b
                        FROM nexus_reports_deleted rd
                        JOIN nexus_battles b ON rd.battle_id = b.battle_id
                        WHERE b.timestamp < NOW() - INTERVAL 10 DAY;";

					await using (var deleteCmd = new MySqlCommand(deleteSqlReportsAndBattles, conn, transaction))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} old battle reports and references.", null);
					}

					string deleteSqlBaseUpgrades = @"
                        DELETE FROM nexus_base_upgrades
                        WHERE command_center_upgraded IS NULL
                        AND mines_upgraded IS NULL
                        AND supply_depot_upgraded IS NULL
                        AND factory_upgraded IS NULL
                        AND starport_upgraded IS NULL
                        AND engineering_bay_upgraded IS NULL
                        AND warehouse_upgraded IS NULL;";

					await using (var deleteCmd = new MySqlCommand(deleteSqlBaseUpgrades, conn, transaction))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} null nexus base upgrade rows.", null);
					}

					await transaction.CommitAsync();
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error occurred while deleting old battle reports or base upgrades. Rolling back transaction. " + ex.Message, null);
					await transaction.RollbackAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while establishing the database connection or transaction." + ex.Message, null);
			}
		}

		private async Task DeleteNotificationRequests()
		{
			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				await using MySqlTransaction transaction = await conn.BeginTransactionAsync();
				try
				{
					string deleteSql = @"
						UPDATE maxhanna.user_settings 
            SET notifications_enabled = NULL, 
                notifications_changed_date = UTC_TIMESTAMP() 
            WHERE notifications_changed_date < DATE_SUB(NOW(), INTERVAL 1 MONTH);";

					await using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} notification settings.", null);
					}

					await transaction.CommitAsync();
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error occurred while deleting notification settings. Rolling back transaction." + ex.Message, null);
					await transaction.RollbackAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while establishing the database connection or transaction." + ex.Message, null);
			}
		}
		private async Task DeleteHostAiRequests()
		{
			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				await using MySqlTransaction transaction = await conn.BeginTransactionAsync();
				try
				{
					var deleteSql = @"
                DELETE FROM maxhanna.host_ai_calls 
                WHERE created < UTC_TIMESTAMP() - INTERVAL 1 YEAR;";

					await using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} host ai calls.", null);
					}

					await transaction.CommitAsync();
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error occurred while deleting old HostAI calls. Rolling back transaction." + ex.Message, null);
					await transaction.RollbackAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while establishing the database connection or transaction." + ex.Message, null);
			}
		}

		private async Task DeleteOldNews()
		{
			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				await using MySqlTransaction transaction = await conn.BeginTransactionAsync();
				try
				{
					var deleteSql = @"
						DELETE FROM maxhanna.news_headlines 
						WHERE saved_at < UTC_TIMESTAMP() - INTERVAL 5 YEAR;";

					await using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} news headlines.", null);
					}

					await transaction.CommitAsync();
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error occurred while deleting old news headlines. Rolling back transaction." + ex.Message, null);
					await transaction.RollbackAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while establishing the database connection or transaction." + ex.Message, null);
			}
		}
		private async Task SpawnEncounterMetabots()
		{
			int spawnCount = 0;
			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				await using MySqlTransaction transaction = await conn.BeginTransactionAsync();
				try
				{
					// Get dead metabots that need respawning
					var getDeadMetabotsSql = @"
                SELECT hero_id, map, coordsX, coordsY, bot_types, level, hp,
                       head_part_type, legs_part_type, left_arm_part_type, right_arm_part_type
                FROM meta_encounter 
                WHERE last_killed < UTC_TIMESTAMP() - INTERVAL 30 SECOND;";

					List<MetabotEncounter> deadEncounters = new();

					await using (var getCmd = new MySqlCommand(getDeadMetabotsSql, conn, transaction))
					{
						await using var reader = await getCmd.ExecuteReaderAsync();
						while (await reader.ReadAsync())
						{
							deadEncounters.Add(new MetabotEncounter(
								reader.GetInt32("hero_id"),
								reader.GetString("map"),
								reader.GetInt32("coordsX"),
								reader.GetInt32("coordsY"),
								reader.GetString("bot_types"),
								reader.GetInt32("level"),
								reader.GetInt32("hp"),
								reader.GetInt32("head_part_type"),
								reader.GetInt32("legs_part_type"),
								reader.GetInt32("left_arm_part_type"),
								reader.GetInt32("right_arm_part_type")
							));
						}
					}

					// Respawn each dead metabot
					if (deadEncounters.Count > 0)
					{
						var random = new Random();
						foreach (var encounter in deadEncounters)
						{
							// Check if bot already exists
							string checkSql = "SELECT COUNT(*) FROM maxhanna.meta_bot WHERE hero_id = @HeroId;";
							int existingBotCount = 0;

							using (var command = new MySqlCommand(checkSql, conn, transaction))
							{
								command.Parameters.AddWithValue("@HeroId", encounter.HeroId);
								existingBotCount = Convert.ToInt32(await command.ExecuteScalarAsync());
							}

							if (existingBotCount > 0)
							{
								//_ = _log.Db($"Bot with hero_id {encounter.HeroId} already exists. Skipping.", null, "META", true);
								continue;
							}

							//Console.WriteLine("inserting encounterid: " + encounter.HeroId);
							// Select random bot type
							string[] botTypeArray = encounter.BotTypes.Split(',')
								.Select(bt => bt.Trim())
								.Where(bt => !string.IsNullOrEmpty(bt))
								.ToArray();
							if (botTypeArray.Length == 0)
							{
								_ = _log.Db($"No valid bot types for hero {encounter.HeroId}. Skipping.", null, outputToConsole: true);
								continue;
							}
							string selectedBotType = botTypeArray[random.Next(botTypeArray.Length)];
							int typeId = await GetBotTypeId(selectedBotType, conn, transaction);

							if (typeId == 0)
							{
								_ = _log.Db($"Invalid bot type '{selectedBotType}' for hero {encounter.HeroId}. Skipping.", null, outputToConsole: true);
								continue;
							}

							// Insert new metabot and get its ID
							int newBotId = 0;
							try
							{
								string insertSql = @"
									INSERT INTO maxhanna.meta_bot 
									(hero_id, name, type, hp, exp, level, is_deployed) 
									VALUES (@HeroId, @Name, @Type, @Hp, @Exp, @Level, @IsDeployed);
									SELECT LAST_INSERT_ID();";

								using (var command = new MySqlCommand(insertSql, conn, transaction))
								{
									command.Parameters.AddWithValue("@HeroId", encounter.HeroId);
									command.Parameters.AddWithValue("@Name", selectedBotType);
									command.Parameters.AddWithValue("@Type", typeId);
									command.Parameters.AddWithValue("@Hp", encounter.Hp);
									command.Parameters.AddWithValue("@Exp", 0);
									command.Parameters.AddWithValue("@Level", encounter.Level);
									command.Parameters.AddWithValue("@IsDeployed", true);

									newBotId = Convert.ToInt32(await command.ExecuteScalarAsync());
								}
							}
							catch (Exception ex)
							{
								_ = _log.Db($"Exception while respawning {selectedBotType} (ID: {encounter.HeroId}) at {encounter.Map}({encounter.CoordsX},{encounter.CoordsY}). " + ex.Message, null, outputToConsole: true);
								continue;
							}

							// Insert metabot parts into meta_encounter_bot_part
							var parts = new Dictionary<string, int>
							{
								{ "head", encounter.HeadPartType },
								{ "legs", encounter.LegsPartType },
								{ "left_arm", encounter.LeftArmPartType },
								{ "right_arm", encounter.RightArmPartType }
							};

							foreach (var part in parts)
							{
								try
								{
									// Get part details from meta_bot_part_type using part type as id
									string getPartSql = @"
                                SELECT damage_mod_min, damage_mod_max, skill 
                                FROM meta_bot_part_type 
                                WHERE id = @PartTypeId;";

									int damageMod = 0;
									string? skill = null;

									using (var command = new MySqlCommand(getPartSql, conn, transaction))
									{
										command.Parameters.AddWithValue("@PartTypeId", part.Value);

										await using var reader = await command.ExecuteReaderAsync();
										if (await reader.ReadAsync())
										{
											int minDamage = reader.GetInt32("damage_mod_min");
											int maxDamage = reader.GetInt32("damage_mod_max");
											damageMod = random.Next(minDamage, maxDamage + 1);
											skill = reader.IsDBNull(reader.GetOrdinal("skill")) ? "Sting" : reader.GetString("skill");
										}
										else
										{
											_ = _log.Db($"No part type found for {part.Key} with id {part.Value} for hero {encounter.HeroId}. Skipping part.", null, outputToConsole: true);
											continue;
										}
									}

									// Insert the part into meta_encounter_bot_part
									string insertPartSql = @"
										INSERT INTO maxhanna.meta_encounter_bot_part 
										(hero_id, part_name, type, damage_mod, skill) 
										VALUES (@HeroId, @PartName, @Type, @DamageMod, @Skill);";

									using (var command = new MySqlCommand(insertPartSql, conn, transaction))
									{
										command.Parameters.AddWithValue("@HeroId", encounter.HeroId);
										command.Parameters.AddWithValue("@PartName", part.Key.ToUpper());
										command.Parameters.AddWithValue("@Type", part.Value);
										command.Parameters.AddWithValue("@DamageMod", damageMod);
										command.Parameters.AddWithValue("@Skill", skill ?? (object)DBNull.Value);

										await command.ExecuteNonQueryAsync();
									}
								}
								catch (Exception ex)
								{
									_ = _log.Db($"Exception while inserting part {part.Key} for hero {encounter.HeroId}: {ex.Message}", null, outputToConsole: true);
									continue;
								}
							}

							// Update spawn time
							var updateSql = "UPDATE meta_encounter SET last_spawn = UTC_TIMESTAMP() WHERE hero_id = @heroId;";
							using (var updateCmd = new MySqlCommand(updateSql, conn, transaction))
							{
								updateCmd.Parameters.AddWithValue("@heroId", encounter.HeroId);
								await updateCmd.ExecuteNonQueryAsync();
							}
							spawnCount++;
							//	_ = _log.Db($"Respawned {selectedBotType} (ID: {newBotId}, HeroID: {encounter.HeroId}) at {encounter.Map}({encounter.CoordsX},{encounter.CoordsY})", null, outputToConsole: true);
						}
					}

					await transaction.CommitAsync();
					_ = _log.Db($"Processed {spawnCount} metabot respawns.", null, outputToConsole: spawnCount > 0);
				}
				catch (Exception ex)
				{
					_ = _log.Db("Error in metabot respawn transaction: " + ex.Message, null, outputToConsole: true);
					await transaction.RollbackAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Database connection error: " + ex.Message, null, outputToConsole: true);
			}
		}

		private async Task FetchAndStoreTopMarketCaps()
		{
			await _log.Db("Fetching top market caps from CoinMarketCap...", null, "MCS", outputToConsole: true);

			try
			{
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				const string recentCheckSql = @"
					SELECT recorded_at FROM coin_market_caps 
					WHERE recorded_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
					ORDER BY recorded_at DESC
					LIMIT 1;";

				await using var checkCmd = new MySqlCommand(recentCheckSql, conn);
				var lastUpdateTime = await checkCmd.ExecuteScalarAsync() as DateTime?;

				if (lastUpdateTime.HasValue)
				{
					var nextUpdateTime = lastUpdateTime.Value.AddHours(24);
					var timeLeft = nextUpdateTime - DateTime.UtcNow;

					await _log.Db($"Recent market cap data already exists. Next update in {timeLeft.Hours} hours and {timeLeft.Minutes} minutes.",
								  null, "MCS", outputToConsole: true);
					return;
				}

				// Fetch API key
				var apiKey = _config.GetValue<string>("CoinMarketCap:ApiKey");
				if (string.IsNullOrWhiteSpace(apiKey))
				{
					await _log.Db("CoinMarketCap API key missing", null, "MCS", outputToConsole: true);
					return;
				}

				// Fetch top 30 coins
				const string url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=30&convert=USD";
				var request = new HttpRequestMessage
				{
					Method = HttpMethod.Get,
					RequestUri = new Uri(url),
				};
				request.Headers.Add("X-CMC_PRO_API_KEY", apiKey);
				request.Headers.Add("Accepts", "application/json");

				var response = await _httpClient.SendAsync(request);
				response.EnsureSuccessStatusCode();
				var responseContent = await response.Content.ReadAsStringAsync();
				var root = Newtonsoft.Json.Linq.JObject.Parse(responseContent);
				var coins = root["data"]?.ToObject<List<Dictionary<string, object>>>();

				if (coins == null || coins.Count == 0)
				{
					await _log.Db("No market cap data found in CoinMarketCap response", null, "MCS", outputToConsole: true);
					return;
				}

				const string historicalDataSql = @"
					SELECT coin_id, market_cap_usd
					FROM coin_market_caps
					WHERE recorded_at BETWEEN UTC_TIMESTAMP() - INTERVAL 48 HOUR 
										AND UTC_TIMESTAMP() - INTERVAL 24 HOUR
					ORDER BY recorded_at DESC";
				var historicalData = new Dictionary<string, decimal>();
				await using (var historicalCmd = new MySqlCommand(historicalDataSql, conn))
				{
					await using var reader = await historicalCmd.ExecuteReaderAsync();
					while (await reader.ReadAsync())
					{
						// FIX 2: Only take the first/latest record per coin
						var coinId = reader.GetString("coin_id");
						if (!historicalData.ContainsKey(coinId))
						{
							historicalData[coinId] = reader.GetDecimal("market_cap_usd");
						}
					}
				}

				// Fetch CAD/USD exchange rate
				decimal cadUsdRate = 0.705m;
				const string rateSql = @"
					SELECT rate
					FROM exchange_rates
					WHERE base_currency = 'CAD' AND target_currency = 'USD'
					ORDER BY timestamp DESC
					LIMIT 1";

				await using (var rateCmd = new MySqlCommand(rateSql, conn))
				{
					var rateResult = await rateCmd.ExecuteScalarAsync();
					if (rateResult != null && rateResult != DBNull.Value)
					{
						cadUsdRate = Convert.ToDecimal(rateResult);
					}
					else
					{
						await _log.Db("No recent CAD/USD exchange rate found, using fallback rate 0.705", null, "MCS", outputToConsole: true);
					}
				}

				foreach (var coin in coins)
				{
					if (coin == null) continue;

					string coinId = coin["id"]?.ToString() ?? "";
					string rawSymbol = coin["symbol"]?.ToString()?.ToUpper() ?? "";
					string coinNameSafe = coin["name"]?.ToString() ?? "";
					var quote = (Newtonsoft.Json.Linq.JObject)coin["quote"];
					var usdData = (Newtonsoft.Json.Linq.JObject?)quote["USD"];
					if (usdData != null)
					{
						decimal marketCapSafe = Convert.ToDecimal(usdData["market_cap"] ?? 0);
						decimal priceSafe = Convert.ToDecimal(usdData["price"] ?? 0);
						decimal priceChangePercentage = Convert.ToDecimal(usdData["percent_change_24h"] ?? 0);
						string normalizedName = CoinNameMap.TryGetValue(coinNameSafe, out var mappedName) ? mappedName : coinNameSafe;
						string symbol = CoinSymbols.TryGetValue(normalizedName, out var knownSymbol) ? knownSymbol : rawSymbol;

						decimal yesterdayMarketCap = marketCapSafe;
						if (historicalData.TryGetValue(coinId, out var histCap))
						{
							yesterdayMarketCap = histCap;
						}
						else
						{
							await _log.Db($"No historical data found for {coinNameSafe} ({coinId}), using current cap", null, "MCS", outputToConsole: true);
						}

						// Calculate 24h inflow change (now non-zero!)
						decimal inflowChange = marketCapSafe - yesterdayMarketCap;

						// Calculate CAD values
						decimal marketCapCad = cadUsdRate != 0 ? marketCapSafe / cadUsdRate : marketCapSafe;
						decimal priceCad = cadUsdRate != 0 ? priceSafe / cadUsdRate : priceSafe;

						const string insertSql = @"
							INSERT INTO coin_market_caps (
								coin_id, symbol, name, market_cap_usd, market_cap_cad, price_usd, price_cad,
								price_change_percentage_24h, inflow_change_24h, recorded_at
							) VALUES (
								@CoinId, @Symbol, @Name, @MarketCapUsd, @MarketCapCad, @PriceUsd, @PriceCad,
								@PriceChangePercentage24h, @InflowChange24h, UTC_TIMESTAMP()
							)";

						await using (var insertCmd = new MySqlCommand(insertSql, conn))
						{
							insertCmd.Parameters.AddWithValue("@CoinId", coinId);
							insertCmd.Parameters.AddWithValue("@Symbol", symbol);
							insertCmd.Parameters.AddWithValue("@Name", normalizedName);
							insertCmd.Parameters.AddWithValue("@MarketCapUsd", marketCapSafe);
							insertCmd.Parameters.AddWithValue("@MarketCapCad", marketCapCad);
							insertCmd.Parameters.AddWithValue("@PriceUsd", priceSafe);
							insertCmd.Parameters.AddWithValue("@PriceCad", priceCad);
							insertCmd.Parameters.AddWithValue("@PriceChangePercentage24h", priceChangePercentage);
							insertCmd.Parameters.AddWithValue("@InflowChange24h", inflowChange);
							await insertCmd.ExecuteNonQueryAsync();
						}
					}
				}
				await _log.Db($"Successfully stored {coins.Count} top market cap records", null, "MCS", outputToConsole: true);
			}
			catch (Exception ex)
			{
				await _log.Db($"Error fetching/storing market caps: {ex.Message}", null, "MCS", outputToConsole: true);
			}
		}
		private async Task<int> GetBotTypeId(string botTypeName, MySqlConnection conn, MySqlTransaction transaction)
		{
			string query = "SELECT type FROM meta_encounter_bot_type WHERE bot_name = @BotName LIMIT 1;";

			using var command = new MySqlCommand(query, conn, transaction);
			command.Parameters.AddWithValue("@BotName", botTypeName);

			var result = await command.ExecuteScalarAsync();

			if (result != null && int.TryParse(result.ToString(), out var typeId))
			{
				return typeId;
			}

			_ = _log.Db($"Bot type '{botTypeName}' not found in meta_encounter_bot_type.", null);
			return 0; // Fallback or throw an exception based on your requirements
		}
		private async Task<ExchangeRateData?> FetchExchangeRates()
		{
			string apiUrl = $"https://api.exchangerate-api.com/v4/latest/CAD";

			try
			{
				var response = await _httpClient.GetAsync(apiUrl);
				if (response.IsSuccessStatusCode)
				{
					var responseContent = await response.Content.ReadAsStringAsync();
					var exchangeData = JsonConvert.DeserializeObject<ExchangeRateData>(responseContent);

					if (exchangeData != null)
					{
						await SaveExchangeRatesToDatabase(exchangeData);
					}

					return exchangeData;
				}
				else
				{
					_ = _log.Db($"Failed to fetch exchange rates for CAD: {response.StatusCode}", null);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error fetching exchange rates for CAD. " + ex.Message, null);
			}

			return null;
		}

		private async Task SaveExchangeRatesToDatabase(ExchangeRateData exchangeData)
		{
			try
			{
				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();

					// Check if an entry was added in the last 6 hours
					var checkSql = @"
						SELECT COUNT(*) FROM exchange_rates 
						WHERE timestamp >= UTC_TIMESTAMP() - INTERVAL 6 HOUR";

					using (var checkCmd = new MySqlCommand(checkSql, connection))
					{
						var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
						if (count > 0)
						{
							_ = _log.Db("Exchange rates not added as entries exist in the last 6 hours.", null);
							return;
						}
					}

					// Delete old entries (older than 10 years)
					var deleteSql = @"
						DELETE FROM exchange_rates 
						WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 10 YEAR";

					using (var deleteCmd = new MySqlCommand(deleteSql, connection))
					{
						await deleteCmd.ExecuteNonQueryAsync();
					}
					if (exchangeData.Rates == null || exchangeData.Rates.Count == 0)
					{
						_ = _log.Db("No exchange rates found in the response.", null);
						return;
					}
					foreach (var rate in exchangeData.Rates)
					{
						var insertSql = @"
							INSERT INTO exchange_rates (base_currency, target_currency, rate, timestamp) 
							VALUES (@base, @target, @rate, UTC_TIMESTAMP())";

						using (var insertCmd = new MySqlCommand(insertSql, connection))
						{
							insertCmd.Parameters.AddWithValue("@base", exchangeData.Base);
							insertCmd.Parameters.AddWithValue("@target", rate.Key);
							insertCmd.Parameters.AddWithValue("@rate", rate.Value);

							await insertCmd.ExecuteNonQueryAsync();
						}
					}

					_ = _log.Db("Exchange rates stored successfully.");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while storing exchange rates. " + ex.Message, null);
			}
		}


		private async Task DeleteOldGuests()
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					// SQL statement to delete from nexus_reports_deleted and nexus_battles in one go
					var deleteSql = @"
                        DELETE FROM maxhanna.users 
                        WHERE username LIKE 'Guest%'
                        AND (last_seen < (UTC_TIMESTAMP() - INTERVAL 10 DAY));";

					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} guest accounts older than 10 days.");
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while deleting old guest accounts. " + ex.Message, null);
			}
		}


		private async Task DeleteOldSearchResults()
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();
					var deleteSql = @"
                        DELETE FROM search_results 
						WHERE title IS NULL 
						AND description IS NULL
						AND author IS NULL
						AND keywords IS NULL
						AND image_url IS NULL
						AND response_code IS NULL
						AND last_crawled < UTC_TIMESTAMP() - INTERVAL 30 DAY;";

					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} search results older than 30 days.", null);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while deleting old search results. " + ex.Message, null);
			}
		}

		private async Task DeleteOldSearchQueries()
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();
					var deleteSql = @"
						DELETE FROM search_queries
						WHERE created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY;";

					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} search queries older than 7 days.", null);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while deleting old search queries. " + ex.Message, null);
			}
		}

		// Keep: Top 20 scores per user (score DESC, created_at ASC tie-break) regardless of age.
		// Delete: Any rows older than 3 days AND NOT in that top-20-per-user set.
		private async Task DeleteOldEnderScores()
		{
			try
			{
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				string deleteSql = @"
					DELETE FROM maxhanna.ender_top_scores
					WHERE created_at < UTC_TIMESTAMP() - INTERVAL 3 DAY
					  AND id IN (
					    SELECT rid FROM (
					      SELECT id AS rid,
					             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC, created_at ASC) AS rn
					      FROM maxhanna.ender_top_scores
					    ) ranked
					    WHERE rn > 20
					  );";

				int affected;
				await using (var cmd = new MySqlCommand(deleteSql, conn))
				{
					affected = await cmd.ExecuteNonQueryAsync();
				}
				_ = _log.Db($"Deleted {affected} old Ender scores (older than 3 days, excluding each user's top 20).", null, "ENDER_CLEANUP", true);
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error deleting old Ender scores: " + ex.Message, null, "ENDER_CLEANUP", true);
			}
		}

		private async Task DeleteOldSentimentAnalysis()
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();
					var deleteSql = @"
                        DELETE FROM market_sentiment_analysis 
						WHERE created < UTC_TIMESTAMP() - INTERVAL 10 YEARS;";

					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Deleted {affectedRows} market sentiment analysis records older than 10 years.", null);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while deleting market sentiment analysis records older than 10 years. " + ex.Message, null);
			}
		}
		public async Task DeleteOldGlobalMetrics()
		{
			const string componentName = "METRICS_CLEANUP";

			// Validate configuration
			if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				_ = _log.Db("Configuration or connection string is missing.", null, componentName, true);
				return;
			}

			// SQL query to delete global metrics records older than 10 years
			const string sql = @"
				DELETE FROM crypto_global_metrics 
				WHERE timestamp_utc < UTC_TIMESTAMP() - INTERVAL 10 YEAR";

			try
			{
				await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				await using var cmd = new MySqlCommand(sql, conn);
				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				if (rowsAffected > 0)
				{
					_ = _log.Db($"Deleted {rowsAffected} crypto global metrics records older than 10 years.", null, componentName, true);
				}
				else
				{
					_ = _log.Db("No crypto global metrics records found older than 10 years.", null, componentName, true);
				}
			}
			catch (MySqlException ex)
			{
				_ = _log.Db($"Database error deleting old crypto global metrics records: {ex.Message}", null, componentName, true);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Unexpected error deleting old crypto global metrics records: {ex.Message}", null, componentName, true);
			}
		}
		private async Task AssignTrophies()
		{
			int trophiesAssigned = 0;

			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					var trophyCriteria = new Dictionary<string, string>
					{
						{ "Novice Trader", "SELECT user_id FROM trade_history GROUP BY user_id HAVING COUNT(*) >= 5" },
						{ "Active Trader", "SELECT user_id FROM trade_history GROUP BY user_id HAVING COUNT(*) >= 25" },
						{ "Frequent Trader", "SELECT user_id FROM trade_history GROUP BY user_id HAVING COUNT(*) >= 100" },
						{ "Trade Addict", "SELECT user_id FROM trade_history GROUP BY user_id HAVING COUNT(*) >= 500" },
						{ "Trade Master", "SELECT user_id FROM trade_history GROUP BY user_id HAVING COUNT(*) >= 1000" },
						{ "$100 Portfolio", "SELECT user_id FROM trade_history GROUP BY user_id HAVING MAX(portfolio_value) >= 100" },
						{ "$1K Portfolio", "SELECT user_id FROM trade_history GROUP BY user_id HAVING MAX(portfolio_value) >= 1000" },
						{ "$10K Portfolio", "SELECT user_id FROM trade_history GROUP BY user_id HAVING MAX(portfolio_value) >= 10000" },
						{ "$100K Portfolio", "SELECT user_id FROM trade_history GROUP BY user_id HAVING MAX(portfolio_value) >= 100000" },
						{ "DCA Strategist", "SELECT user_id FROM trade_history WHERE strategy = 'DCA' GROUP BY user_id HAVING COUNT(*) >= 10" },
						{ "BTC Veteran", "SELECT user_id FROM trade_history WHERE from_currency = 'BTC' OR to_currency = 'BTC' GROUP BY user_id HAVING COUNT(*) >= 10" },
						{ "ETH Veteran", "SELECT user_id FROM trade_history WHERE from_currency = 'ETH' OR to_currency = 'ETH' GROUP BY user_id HAVING COUNT(*) >= 10" },
						{ "Altcoin Explorer", "SELECT user_id FROM trade_history WHERE from_currency NOT IN ('BTC','ETH','USDC') OR to_currency NOT IN ('BTC','ETH','USDC') GROUP BY user_id HAVING COUNT(*) >= 10" },
						{ "First Profit", "SELECT user_id FROM trade_history GROUP BY user_id HAVING SUM(trade_value_usdc) > 0" },
						{ "Consistent Profits", "SELECT user_id FROM (SELECT user_id, DATE(timestamp) AS day, SUM(trade_value_usdc) AS daily_pnl FROM trade_history GROUP BY user_id, day) AS daily WHERE daily_pnl > 0 GROUP BY user_id HAVING COUNT(*) >= 5" },
						{ "7-Day Streak", "SELECT user_id FROM (SELECT user_id, DATE(timestamp) AS day FROM trade_history GROUP BY user_id, day) AS days GROUP BY user_id HAVING COUNT(DISTINCT day) >= 7" },
						{ "30-Day Streak", "SELECT user_id FROM (SELECT user_id, DATE(timestamp) AS day FROM trade_history GROUP BY user_id, day) AS days GROUP BY user_id HAVING COUNT(DISTINCT day) >= 30" },
						{ "Year-Round Trader", "SELECT user_id FROM trade_history GROUP BY user_id HAVING COUNT(DISTINCT MONTH(timestamp)) >= 12" },
						{ "Chat Master 50", "SELECT sender AS user_id FROM messages GROUP BY sender HAVING COUNT(*) >= 50" },
						{ "Chat Master 100", "SELECT sender AS user_id FROM messages GROUP BY sender HAVING COUNT(*) >= 100" },
						{ "Chat Master 150", "SELECT sender AS user_id FROM messages GROUP BY sender HAVING COUNT(*) >= 150" },
						{ "Uploader 50", "SELECT user_id FROM file_uploads GROUP BY user_id HAVING COUNT(*) >= 50" },
						{ "Uploader 100", "SELECT user_id FROM file_uploads GROUP BY user_id HAVING COUNT(*) >= 100" },
						{ "Uploader 150", "SELECT user_id FROM file_uploads GROUP BY user_id HAVING COUNT(*) >= 150" },
						{ "Topic Creator 1", "SELECT created_by_user_id AS user_id FROM topics GROUP BY created_by_user_id HAVING COUNT(*) >= 1" },
						{ "Topic Creator 3", "SELECT created_by_user_id AS user_id FROM topics GROUP BY created_by_user_id HAVING COUNT(*) >= 3" },
						{ "Topic Creator 10", "SELECT created_by_user_id AS user_id FROM topics GROUP BY created_by_user_id HAVING COUNT(*) >= 10" },
						{ "Social Poster 10", "SELECT user_id FROM stories GROUP BY user_id HAVING COUNT(*) >= 10" },
						{ "Social Poster 50", "SELECT user_id FROM stories GROUP BY user_id HAVING COUNT(*) >= 50" },
						{ "Social Poster 100", "SELECT user_id FROM stories GROUP BY user_id HAVING COUNT(*) >= 100" },
						{ "Bug Wars Ensign", "SELECT user_id FROM maxhanna.nexus_bases GROUP BY user_id HAVING COUNT(*) >= 1" },
						{ "Bug Wars Chief", "SELECT user_id FROM maxhanna.nexus_bases GROUP BY user_id HAVING COUNT(*) >= 5" },
						{ "Bug Wars Commander", "SELECT user_id FROM maxhanna.nexus_bases GROUP BY user_id HAVING COUNT(*) >= 15" },
						{ "Bug Wars Colonel", "SELECT user_id FROM maxhanna.nexus_bases GROUP BY user_id HAVING COUNT(*) >= 150" },
						{ "Bug Wars General", "SELECT user_id FROM maxhanna.nexus_bases GROUP BY user_id HAVING COUNT(*) >= 1500" },
						{ "Bug Wars Emperor", "SELECT user_id FROM maxhanna.nexus_bases GROUP BY user_id HAVING COUNT(*) >= 2500" },
						{ "2024 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2024" },
						{ "2025 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2025" },
						{ "2026 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2026" },
						{ "2027 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2027" },
						{ "2028 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2028" },
						{ "2029 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2029" },
						{ "Wordler Beginner", "SELECT user_id FROM wordler_scores GROUP BY user_id HAVING COUNT(*) >= 3" },
						{ "Wordler Expert", "SELECT user_id FROM wordler_scores GROUP BY user_id HAVING COUNT(*) >= 30" },
						{ "Master Wordler", "SELECT user_id FROM wordler_scores GROUP BY user_id HAVING COUNT(*) >= 100" },
						{ "Wordler Legend", "SELECT user_id FROM wordler_scores GROUP BY user_id HAVING COUNT(*) >= 1000" },
						{ "Wordler God", "SELECT user_id FROM wordler_scores GROUP BY user_id HAVING COUNT(*) >= 10000" },
						{ "Array Scout", "SELECT user_id FROM array_characters WHERE ABS(position) > 10" },
						{ "Array Navigator", "SELECT user_id FROM array_characters WHERE ABS(position) > 100" },
						{ "Array Pathfinder", "SELECT user_id FROM array_characters WHERE ABS(position) > 1000" },
						{ "Array Voyager", "SELECT user_id FROM array_characters WHERE ABS(position) > 10000" },
						{ "Array Conqueror", "SELECT user_id FROM array_characters WHERE ABS(position) > 100000" },
						{ "Meta-Fighter", "SELECT DISTINCT u.id AS user_id FROM users u JOIN meta_hero mh ON u.id=mh.user_id JOIN meta_bot mb ON mh.id=mb.hero_id WHERE mb.level>5" },
						{ "Novice Meta-Fighter", "SELECT DISTINCT u.id AS user_id FROM users u JOIN meta_hero mh ON u.id=mh.user_id JOIN meta_bot mb ON mh.id=mb.hero_id WHERE mb.level>10" },
						{ "Elite Meta-Fighter", "SELECT DISTINCT u.id AS user_id FROM users u JOIN meta_hero mh ON u.id=mh.user_id JOIN meta_bot mb ON mh.id=mb.hero_id WHERE mb.level>20" },
						{ "Legendary Meta-Fighter", "SELECT DISTINCT u.id AS user_id FROM users u JOIN meta_hero mh ON u.id=mh.user_id JOIN meta_bot mb ON mh.id=mb.hero_id WHERE mb.level>30" },
						{ "Mastermind Fastest Win", @"
							SELECT user_id FROM mastermind_scores 
							WHERE time = (SELECT MIN(time) FROM mastermind_scores WHERE score > 0 AND DATE(submitted) = DATE(UTC_DATE())) 
							  AND score > 0 AND DATE(submitted) = DATE(UTC_DATE()) 
							  AND NOT EXISTS (
								  SELECT 1 FROM user_trophy ut 
								  JOIN user_trophy_type tt ON ut.trophy_id = tt.id 
								  WHERE ut.user_id = mastermind_scores.user_id AND tt.name = 'Mastermind Fastest Win'
							  )
							LIMIT 1
						" },
						{ "Mastermind Most Wins", @"
							SELECT user_id FROM (
								SELECT user_id, COUNT(*) AS win_count FROM mastermind_scores 
								WHERE score > 0 AND DATE(submitted) = DATE(UTC_DATE()) 
								GROUP BY user_id ORDER BY win_count DESC LIMIT 1
							) mw 
							WHERE NOT EXISTS (
								SELECT 1 FROM user_trophy ut 
								JOIN user_trophy_type tt ON ut.trophy_id = tt.id 
								WHERE ut.user_id = mw.user_id AND tt.name = 'Mastermind Most Wins'
							)
						" },
						{ "Mastermind 10 Wins", @"
							SELECT user_id FROM (
								SELECT user_id, COUNT(*) AS win_count FROM mastermind_scores 
								WHERE score > 0 
								GROUP BY user_id HAVING win_count >= 10
							) mw 
							WHERE NOT EXISTS (
								SELECT 1 FROM user_trophy ut 
								JOIN user_trophy_type tt ON ut.trophy_id = tt.id 
								WHERE ut.user_id = mw.user_id AND tt.name = 'Mastermind 10 Wins'
							)
						" },
						{ "Mastermind 100 Wins", @"
							SELECT user_id FROM (
								SELECT user_id, COUNT(*) AS win_count FROM mastermind_scores 
								WHERE score > 0 
								GROUP BY user_id HAVING win_count >= 100
							) mw 
							WHERE NOT EXISTS (
								SELECT 1 FROM user_trophy ut 
								JOIN user_trophy_type tt ON ut.trophy_id = tt.id 
								WHERE ut.user_id = mw.user_id AND tt.name = 'Mastermind 100 Wins'
							)
						" },
						{ "Mastermind 1000 Wins", @"
							SELECT user_id FROM (
								SELECT user_id, COUNT(*) AS win_count FROM mastermind_scores 
								WHERE score > 0 
								GROUP BY user_id HAVING win_count >= 1000
							) mw 
							WHERE NOT EXISTS (
								SELECT 1 FROM user_trophy ut 
								JOIN user_trophy_type tt ON ut.trophy_id = tt.id 
								WHERE ut.user_id = mw.user_id AND tt.name = 'Mastermind 1000 Wins'
							)
						" },
					};
					foreach (var trophy in trophyCriteria)
					{
						var sql = $@"
							INSERT INTO user_trophy (user_id, trophy_id)
							SELECT u.user_id, tt.id
							FROM ({trophy.Value}) u
							JOIN user_trophy_type tt ON tt.name = @TrophyName
							LEFT JOIN user_trophy ut ON ut.user_id = u.user_id AND ut.trophy_id = tt.id
							WHERE ut.user_id IS NULL;

							INSERT INTO notifications (user_id, user_profile_id, text)
							SELECT u.user_id, u.user_id, CONCAT('You have been awarded the trophy: ', @TrophyName)
							FROM ({trophy.Value}) u
							JOIN user_trophy_type tt ON tt.name = @TrophyName
							LEFT JOIN user_trophy ut ON ut.user_id = u.user_id AND ut.trophy_id = tt.id
							WHERE ut.user_id IS NULL;
						";

						using (var cmd = new MySqlCommand(sql, conn))
						{
							cmd.Parameters.AddWithValue("@TrophyName", trophy.Key);
							int rowsAffected = await cmd.ExecuteNonQueryAsync();
							trophiesAssigned += rowsAffected / 2; // Since we insert both a trophy and a notification
						}
					}

					_ = _log.Db($"Trophies assigned successfully. Total trophies awarded: {trophiesAssigned}", null);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while assigning trophies. " + ex.Message, null);
			}
		}
		public async Task SaveVolumeDataAsync(int userId, string pair, UserKrakenApiKey keys)
		{
			// Connect to the MySQL database
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();

				// Check if there's already a record for XBTUSDC in the last 30 seconds
				var query = @"
					SELECT COUNT(*) 
					FROM trade_market_volumes
					WHERE pair = @pair AND timestamp > @timestampThreshold;";

				var command = new MySqlCommand(query, connection);
				command.Parameters.AddWithValue("@pair", pair);
				command.Parameters.AddWithValue("@timestampThreshold", DateTime.UtcNow.AddSeconds(-30));

				var existingRecordCount = Convert.ToInt32(await command.ExecuteScalarAsync());
				if (existingRecordCount > 0)
				{
					return;
				}

				var volumes = await _krakenService.GetLatest15MinVolumeAsync(userId, pair, keys);

				query = @"
					INSERT INTO trade_market_volumes (pair, volume_coin, volume_usdc, timestamp)
					VALUES (@pair, @volume_coin, @volume_usdc, UTC_TIMESTAMP());";
				command = new MySqlCommand(query, connection);
				command.Parameters.AddWithValue("@pair", pair);
				command.Parameters.AddWithValue("@volume_coin", volumes?.Volume);
				command.Parameters.AddWithValue("@volume_usdc", volumes?.VolumeUSDC);
				await command.ExecuteNonQueryAsync();
			}
		}


	private async Task CleanupOldFavourites()
	{
		try
		{
			await using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();
			string sql = @"DELETE FROM maxhanna.favourites WHERE created < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 YEAR) AND COALESCE(view_count,0) < 3;";
			await using var cmd = new MySqlCommand(sql, conn);
			int deleted = Convert.ToInt32(await cmd.ExecuteNonQueryAsync());
			if (deleted > 0)
			{
				_ = _log.Db($"CleanupOldFavourites removed {deleted} rows", null, "SYSTEM");
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("CleanupOldFavourites failure: " + ex.Message, null, "SYSTEM", true);
		}
	}
		
		private async Task FetchAndStoreCoinValues()
		{
			await StoreCoinValues();
		}
		private async Task StoreCoinValues()
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					CoinResponse[] coinData = await FetchCoinData();

					if (coinData != null)
					{
						// Fetch the latest CAD/USD exchange rate
						decimal cadUsdRate = 0.705m; // Fallback rate (1 CAD = 0.705 USD)
						var rateSql = @"
							SELECT rate
							FROM exchange_rates
							WHERE base_currency = 'CAD' AND target_currency = 'USD'
							ORDER BY timestamp DESC
							LIMIT 1";

						using (var rateCmd = new MySqlCommand(rateSql, conn))
						{
							var rateResult = await rateCmd.ExecuteScalarAsync();
							if (rateResult != null && rateResult != DBNull.Value)
							{
								cadUsdRate = Convert.ToDecimal(rateResult);
							}
							else
							{
								_ = _log.Db("No recent CAD/USD exchange rate found, using fallback rate 0.705", null, "COINSVC", outputToConsole: true);
							}
						}

						foreach (var coin in coinData)
						{
							if (coin != null)
							{
								string rawSymbol = coin?.symbol?.ToUpper() ?? "";
								string coinNameSafe = coin?.name ?? "";
								decimal coinRateSafe = Convert.ToDecimal(coin?.rate ?? 0);
								string normalizedName = (CoinNameMap.TryGetValue(coinNameSafe, out var mappedName) ? mappedName : coinNameSafe) ?? "";
								string symbol = CoinSymbols.TryGetValue(normalizedName, out var knownSymbol) ? knownSymbol : "";
								// _ = _log.Db(
								// 	$"Raw Symbol: '{rawSymbol}' | Coin Name: '{coinNameSafe}' | Normalized Name: '{normalizedName}' | Final Symbol: '{symbol}' | Rate: {coinRateSafe}",
								// 	null,
								// 	"COINSVC",
								// 	outputToConsole: true
								//);
								var checkSql = @"
									SELECT 1 FROM coin_value 
									WHERE name = @Name 
									AND timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)
									LIMIT 1";

								using (var checkCmd = new MySqlCommand(checkSql, conn))
								{
									checkCmd.Parameters.AddWithValue("@Name", normalizedName);
									var recentEntries = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

									if (recentEntries == 0 && coinRateSafe != 0)
									{
										// Calculate value_cad using the exchange rate (USD to CAD)
										decimal valueCad = cadUsdRate != 0 ? coinRateSafe / cadUsdRate : coinRateSafe;

										var insertSql = @"
										INSERT INTO coin_value (symbol, name, value_cad, value_usd, timestamp) 
										VALUES (@Symbol, @Name, @ValueCAD, @ValueUSD, UTC_TIMESTAMP())";

										using (var insertCmd = new MySqlCommand(insertSql, conn))
										{
											insertCmd.Parameters.AddWithValue("@Symbol", symbol);
											insertCmd.Parameters.AddWithValue("@Name", normalizedName);
											insertCmd.Parameters.AddWithValue("@ValueCAD", valueCad);
											insertCmd.Parameters.AddWithValue("@ValueUSD", coinRateSafe);
											insertCmd.Parameters.AddWithValue("@Timestamp", DateTime.UtcNow);

											await insertCmd.ExecuteNonQueryAsync();
										}
									}
								}
							}
						}
					}

					_ = _log.Db("Coin values stored successfully.", null, "COINSVC");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error occurred while storing coin values: {ex.Message}", null, "COINSVC", outputToConsole: true);
			}
		}

		private async Task<CoinResponse[]> FetchCoinData()
		{
			CoinResponse[] coinData = [];
			var body = new
			{
				currency = "USD",
				sort = "rank",
				order = "ascending",
				offset = 0,
				maximum = 100,
				meta = true
			};

			var jsonBody = JsonConvert.SerializeObject(body);
			var content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
			content.Headers.Add("x-api-key", _apiKey);

			try
			{
				var response = await _httpClient.PostAsync(_coinwatchUrl, content);
				if (response.IsSuccessStatusCode)
				{
					var responseContent = await response.Content.ReadAsStringAsync();
					coinData = JsonConvert.DeserializeObject<CoinResponse[]>(responseContent) ?? [];
				}
				else
				{
					_ = _log.Db($"Failed to fetch coin values: {response.StatusCode}", null);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while fetching coin values. " + ex.Message, null);
			}

			return coinData;
		}

		private async Task DeleteOldCoinValueEntries()
		{
			using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				var deleteSql = @"
					DELETE FROM coin_value
					WHERE timestamp < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 YEAR)
					AND id NOT IN (
						SELECT id
						FROM (
							SELECT id,
								ROW_NUMBER() OVER (
									PARTITION BY name, 
									UNIX_TIMESTAMP(timestamp) DIV (5 * 60) 
									ORDER BY timestamp
								) AS rn
							FROM coin_value
							WHERE timestamp < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 YEAR)
						) ranked
						WHERE rn = 1
					);";

				using (var deleteCmd = new MySqlCommand(deleteSql, conn))
				{
					int rowsAffected = await deleteCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"Deleted {rowsAffected} old coin value entries.");
				}

				// Delete records older than 10 years
				var deleteOldSql = "DELETE FROM coin_value WHERE timestamp < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 YEAR);";
				using (var deleteOldCmd = new MySqlCommand(deleteOldSql, conn))
				{
					int rowsAffected = await deleteOldCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"Deleted {rowsAffected} coin value entries older than 10 years.");
				}
			}
		}
		private async Task DeleteOldCoinMarketCaps()
		{
			using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				var deleteSql = @"DELETE FROM maxhanna.coin_market_caps where recorded_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 YEAR);";

				using (var deleteCmd = new MySqlCommand(deleteSql, conn))
				{
					int rowsAffected = await deleteCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"Deleted {rowsAffected} old coin market capitals older than 5 years.");
				}
			}
		}
		private async Task DeleteOldTradeVolumeEntries()
		{
			using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				// Step 1: Delete records older than 1 year but younger than 10 years, keeping one per pair per 5-minute interval
				var deleteSql = @"
					DELETE FROM trade_market_volumes
					WHERE timestamp < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 YEAR)
					AND timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 YEAR)
					AND id NOT IN (
						SELECT id
						FROM (
							SELECT id,
									ROW_NUMBER() OVER (
										PARTITION BY pair, 
										UNIX_TIMESTAMP(timestamp) DIV (5 * 60) 
										ORDER BY timestamp
									) AS rn
							FROM trade_market_volumes
							WHERE timestamp < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 YEAR)
								AND timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 YEAR)
								AND timestamp IS NOT NULL
								AND pair IS NOT NULL
						) ranked
						WHERE rn = 1
					);";

				using (var deleteCmd = new MySqlCommand(deleteSql, conn))
				{
					int rowsAffected = await deleteCmd.ExecuteNonQueryAsync();
					if (rowsAffected > 0)
					{
						await _log.Db($"Deleted {rowsAffected} trade volume entries older than 1 year (keeping one per 5 minutes per pair)", null, "SYSTEM", true);
					}
				}

				// Step 2: Delete records older than 10 years
				var deleteOldSql = @"
					DELETE FROM trade_market_volumes
					WHERE timestamp < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 YEAR);";
				using (var deleteOldCmd = new MySqlCommand(deleteOldSql, conn))
				{
					int rowsAffected = await deleteOldCmd.ExecuteNonQueryAsync();
					if (rowsAffected > 0)
					{
						await _log.Db($"Deleted {rowsAffected} trade volume entries older than 10 years", null, "SYSTEM", true);
					}
				}
			}
		}
	}
	public class CoinResponse
	{
		public string? symbol { get; set; }
		public string? name { get; set; }
		public float rate { get; set; }
	}

	public class WalletInfo
	{
		public int Id { get; set; }
		public int UserId { get; set; }
		public string BtcAddress { get; set; } = string.Empty;
	}

	public class BTCWalletData
	{
		[JsonProperty("final_balance")]
		public long FinalBalance { get; set; }

		[JsonProperty("total_received")]
		public long TotalReceived { get; set; }

		[JsonProperty("total_sent")]
		public long TotalSent { get; set; }
	}
}
public class MetabotEncounter
{
	public int HeroId { get; }
	public string Map { get; }
	public int CoordsX { get; }
	public int CoordsY { get; }
	public string BotTypes { get; }
	public int Level { get; }
	public int Hp { get; }
	public int HeadPartType { get; }
	public int LegsPartType { get; }
	public int LeftArmPartType { get; }
	public int RightArmPartType { get; }

	public MetabotEncounter(int heroId, string map, int coordsX, int coordsY, string botTypes,
						  int level, int hp, int headPart, int legsPart, int leftArm, int rightArm)
	{
		HeroId = heroId;
		Map = map;
		CoordsX = coordsX;
		CoordsY = coordsY;
		BotTypes = botTypes;
		Level = level;
		Hp = hp;
		HeadPartType = headPart;
		LegsPartType = legsPart;
		LeftArmPartType = leftArm;
		RightArmPartType = rightArm;
	}
}
public class CoinMarketCalResponse
{
	[JsonProperty("body")]
	public List<CryptoEvent>? Body { get; set; }
}

public class CryptoEvent
{
	[JsonProperty("id")]
	public string? Id { get; set; }

	[JsonProperty("title")]
	public EventTitle? Title { get; set; }

	[JsonProperty("coins")]
	public List<EventCoin>? Coins { get; set; }

	[JsonProperty("date_event")]
	public DateTime DateEvent { get; set; }

	[JsonProperty("created_date")]
	public DateTime CreatedDate { get; set; }

	[JsonProperty("source")]
	public string? Source { get; set; }

	[JsonProperty("description")]
	public string? Description { get; set; }

	[JsonProperty("is_hot")]
	public bool IsHot { get; set; }

	[JsonProperty("proof")]
	public string? Proof { get; set; }

	public string? TitleText => Title?.English;
}

public class EventTitle
{
	[JsonProperty("en")]
	public string? English { get; set; }
}

public class EventCoin
{
	[JsonProperty("symbol")]
	public string? Symbol { get; set; }

	[JsonProperty("name")]
	public string? Name { get; set; }
}