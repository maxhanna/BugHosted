using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Users;
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
		private readonly NewsService _newsService;
		private readonly ProfitCalculationService _profitService;
		private readonly MiningApi _miningApiService = new MiningApi();
		private readonly Log _log;
		private readonly IConfiguration _config; // needed for apiKey
		private Timer _tenSecondTimer;
		private Timer _halfMinuteTimer;
		private Timer _minuteTimer;
		private Timer _fiveMinuteTimer;
		private Timer _hourlyTimer;
		private Timer _sixHourTimer;
		private Timer _dailyTimer;
		private bool isCrawling = false;
		private bool lastWasCrypto = false;

		public SystemBackgroundService(Log log, IConfiguration config, WebCrawler webCrawler, KrakenService krakenService, 
										NewsService newsService, ProfitCalculationService profitService)
		{ 
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
			_apiKey = config.GetValue<string>("CoinWatch:ApiKey")!;
			_httpClient = new HttpClient();
			_webCrawler = webCrawler;
			_log = log;
			_krakenService = krakenService;
			_newsService = newsService;
			_profitService = profitService;

			_tenSecondTimer = new Timer(async _ => await Run10SecondTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_halfMinuteTimer = new Timer(async _ => await Run30SecondTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_minuteTimer = new Timer(async _ => await FetchWebsiteMetadata(), null, Timeout.Infinite, Timeout.Infinite);
			_fiveMinuteTimer = new Timer(async _ => await RunFiveMinuteTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_hourlyTimer = new Timer(async _ => await AssignTrophies(), null, Timeout.Infinite, Timeout.Infinite);
			_sixHourTimer = new Timer(async _ => await RunSixHourTasks(), null, Timeout.Infinite, Timeout.Infinite);
			_dailyTimer = new Timer(async _ => await RunDailyTasks(), null, Timeout.Infinite, Timeout.Infinite);
		}

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			// Start all timers 
			_tenSecondTimer.Change(TimeSpan.Zero, TimeSpan.FromSeconds(10));
			_halfMinuteTimer.Change(TimeSpan.Zero, TimeSpan.FromSeconds(30));
			_minuteTimer.Change(TimeSpan.Zero, TimeSpan.FromMinutes(1));
			_fiveMinuteTimer.Change(TimeSpan.Zero, TimeSpan.FromMinutes(5));
			_hourlyTimer.Change(TimeSpan.Zero, TimeSpan.FromHours(1));
			_sixHourTimer.Change(TimeSpan.Zero, TimeSpan.FromHours(6));
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
		}
		private async Task RunFiveMinuteTasks()
		{
			await UpdateLastBTCWalletInfo();
			await FetchAndStoreCoinValues();
			_miningApiService.UpdateWalletInDB(_config, _log);
			lastWasCrypto = !lastWasCrypto;
			await _newsService.GetAndSaveTopQuarterHourlyHeadlines(!lastWasCrypto ? "Cryptocurrency" : null);
			await _profitService.CalculateDailyProfits();
		}

		private async Task RunSixHourTasks()
		{
			await FetchExchangeRates();
			await _profitService.CalculateWeeklyProfits();
			await _profitService.CalculateMonthlyProfits();
		}

		private async Task RunDailyTasks()
		{
			await DeleteOldBattleReports();
			await DeleteOldGuests();
			await DeleteOldSearchResults();
			await DeleteNotificationRequests();
			await DeleteHostAiRequests();
			await DeleteOldCoinValueEntries();
			await _newsService.CreateDailyCryptoNewsStoryAsync();
			await _newsService.CreateDailyNewsStoryAsync();
			await _newsService.PostDailyMemeAsync();
			await DeleteOldNews();
			await DeleteOldTradeVolumeEntries();
			await _log.DeleteOldLogs();
			await _log.BackupDatabase();
		}
		private TimeSpan CalculateNextDailyRun()
		{
			var now = DateTime.Now;
			var nextRun = new DateTime(now.Year, now.Month, now.Day, 0, 0, 0).AddDays(1);
			return nextRun - now;
		}
		public override async Task StopAsync(CancellationToken cancellationToken)
		{
			_halfMinuteTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_minuteTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_fiveMinuteTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_hourlyTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_sixHourTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_dailyTimer?.Change(Timeout.Infinite, Timeout.Infinite);

			await base.StopAsync(cancellationToken);
		}
		//private async Task PostRandomMemeToTwitter()
		//{
		//	using var conn = new MySqlConnection(_connectionString);
		//	await conn.OpenAsync();

		//	string query = @"
		//      SELECT file_name, folder_path, description 
		//      FROM file_uploads 
		//      WHERE is_folder = 0
		//      AND LOWER(folder_path) LIKE '%meme%' 
		//      AND file_size > 0 AND file_size < 300000 
		//      ORDER BY RAND() LIMIT 1";

		//	using var cmd = new MySqlCommand(query, conn);
		//	using var reader = await cmd.ExecuteReaderAsync();

		//	if (!reader.HasRows)
		//	{
		//		_ = _log.Db("No memes found.");
		//		return;
		//	}

		//	await reader.ReadAsync();
		//	string fileName = reader.GetString("file_name");
		//	string folderPath = reader.GetString("folder_path");
		//	string description = reader.IsDBNull("description") ? "Check this meme!" : reader.GetString("description");

		//	var twitterService = new TwitterService(
		//			_config.GetValue<string>("X:ClientId"),
		//			_config.GetValue<string>("X:ClientSecret"),
		//			_config.GetValue<string>("X:AccessTokenSecret")
		//	);

		//	// Step 1: Get the authorization URL for user login to get the authorization code
		//	string authorizationUrl = await twitterService.GetAuthorizationUrlAsync();
		//	_ = _log.Db("Visit this URL and authorize the app: " + authorizationUrl);

		//	// After the user visits the URL and gives authorization, they will be redirected to your redirect_uri with a code parameter.
		//	// You need to capture this code.
		//	string authorizationCode = "CAPTURED_AUTHORIZATION_CODE_FROM_REDIRECT";

		//	// Step 2: Exchange the authorization code for an access token
		//	string accessToken = await twitterService.GetAccessTokenAsync(authorizationCode, "bughosted.com");

		//	if (string.IsNullOrEmpty(accessToken))
		//	{
		//		_logger.LogError("Failed to retrieve access token.");
		//		return;
		//	}

		//	// Step 3: Post a tweet with an image URL (if media upload is not required)
		//	string imageUrl = $"https://bughosted.com/assets/Uploads/Meme/{folderPath}/{fileName}";

		//	bool tweetPosted = await twitterService.PostTweetWithImage(accessToken, description, imageUrl);
		//	if (tweetPosted)
		//	{
		//		_ = _log.Db("Tweet posted successfully!");
		//	}
		//	else
		//	{
		//		_logger.LogError("Failed to post tweet.");
		//	}

		//	// Step 4: If media upload is required (optional - this part is for uploading media directly to Twitter)
		//	string mediaPath = Path.Combine("path_to_your_local_image_folder", fileName); // Ensure the image path is correct

		//	string mediaId = await twitterService.UploadMedia(accessToken, mediaPath);
		//	if (!string.IsNullOrEmpty(mediaId))
		//	{
		//		bool mediaTweetPosted = await twitterService.PostTweetWithMedia(accessToken, description, mediaId);
		//		if (mediaTweetPosted)
		//		{
		//			_ = _log.Db("Tweet with media posted successfully!");
		//		}
		//		else
		//		{
		//			_logger.LogError("Failed to post tweet with media.");
		//		}
		//	}
		//}


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
			UserKrakenApiKey? ownerkeys = await _krakenService.GetApiKey(1);
			if (ownerkeys == null || string.IsNullOrEmpty(ownerkeys.ApiKey) || string.IsNullOrEmpty(ownerkeys.PrivateKey))
			{
				_ = _log.Db("No Kraken API keys found for userId: 1", 1, "SYSTEM", true);
				return;
			}
			try { 
				await SaveVolumeDataAsync(1, "XBTUSDC", ownerkeys);
				await SaveVolumeDataAsync(1, "XRPUSDC", ownerkeys);
			}
			catch (Exception ex)
			{
				_ = _log.Db("Exception while getting volumes before trading : " + ex.Message, null);
				return;
			}

			var activeBTCUsers = await _krakenService.GetActiveTradeBotUsers("BTC", null);
			foreach (var userId in activeBTCUsers)
			{
				try
				{
					UserKrakenApiKey? keys = await _krakenService.GetApiKey(userId);
					if (keys == null || string.IsNullOrEmpty(keys.ApiKey) || string.IsNullOrEmpty(keys.PrivateKey))
					{
						_ = _log.Db("No Kraken API keys found for this user", userId, "SYSTEM", true);
						return;
					}
					await _krakenService.MakeATrade(userId, "BTC", keys);
				}
				catch (Exception ex)
				{
					_ = _log.Db("Exception while trading : " + ex.Message, null);
					return;
				}
			}

			var activeXRPUsers = await _krakenService.GetActiveTradeBotUsers("XRP", null);
			foreach (var userId in activeXRPUsers)
			{
				try
				{
					UserKrakenApiKey? keys = await _krakenService.GetApiKey(userId);
					if (keys == null || string.IsNullOrEmpty(keys.ApiKey) || string.IsNullOrEmpty(keys.PrivateKey))
					{
						_ = _log.Db("No Kraken API keys found for this user", userId, "SYSTEM", true);
						return;
					}
					await _krakenService.MakeATrade(userId, "XRP", keys);
				}
				catch (Exception ex)
				{
					_ = _log.Db("Exception while trading : " + ex.Message, null);
					return;
				}
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
					ORDER BY last_fetched ASC
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
						WHERE (title IS NULL OR title = '') 
						AND (description IS NULL OR description = '') 
						AND (author IS NULL OR author = '') 
						AND (keywords IS NULL OR keywords = '') 
						AND (image_url IS NULL OR image_url = '') 
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
								{ "2024 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2024" },
								{ "2025 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2025" },
								{ "2026 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2026" },
								{ "2027 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2027" },
								{ "2028 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2028" },
								{ "2029 User", "SELECT id AS user_id FROM users WHERE YEAR(last_seen) = 2029" },
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
						foreach (var coin in coinData)
						{
							var checkSql = @"
								SELECT COUNT(*) FROM coin_value 
								WHERE symbol = @Symbol 
								AND timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)";

							using (var checkCmd = new MySqlCommand(checkSql, conn))
							{
								checkCmd.Parameters.AddWithValue("@Symbol", coin.symbol);
								var recentEntries = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

								if (recentEntries == 0)
								{
									// Only insert if no recent entries exist
									var insertSql = @"
										INSERT INTO coin_value (symbol, name, value_cad, timestamp) 
										VALUES (@Symbol, @Name, @ValueCAD, UTC_TIMESTAMP())";

									using (var insertCmd = new MySqlCommand(insertSql, conn))
									{
										insertCmd.Parameters.AddWithValue("@Symbol", coin.symbol);
										insertCmd.Parameters.AddWithValue("@Name", coin.name);
										insertCmd.Parameters.AddWithValue("@ValueCAD", coin.rate);

										await insertCmd.ExecuteNonQueryAsync();
									}
								}
							}
						}
					}

					_ = _log.Db("Coin values stored successfully.", null);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while storing coin values. " + ex.Message, null);
			}
		}

		private async Task<CoinResponse[]> FetchCoinData()
		{
			CoinResponse[] coinData = [];
			var body = new
			{
				currency = "CAD",
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