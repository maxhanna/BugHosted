using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using MySqlConnector;
using Newtonsoft.Json;
using System.Data;
using System.Text;

namespace maxhanna.Server.Services
{
	public class SystemBackgroundService : BackgroundService
	{
		private readonly ILogger<SystemBackgroundService> _logger;
		private readonly string _apiKey;
		private readonly string _coinwatchUrl = "https://api.livecoinwatch.com/coins/list";
		private readonly string _connectionString;
		private readonly HttpClient _httpClient;
		private readonly WebCrawler _webCrawler;
		private readonly IConfiguration _config;
		private DateTime _lastDailyTaskRun = DateTime.MinValue;
		private DateTime _lastMinuteTaskRun = DateTime.MinValue;
		private DateTime _lastFiveMinuteTaskRun = DateTime.MinValue;
		private DateTime _lastHourlyTaskRun = DateTime.MinValue; // Track the last execution time for FetchAndStoreCoinValues
		private DateTime _lastMidDayTaskRun = DateTime.MinValue; // Track the last execution time for FetchAndStoreCoinValues

		public SystemBackgroundService(ILogger<SystemBackgroundService> logger, IConfiguration config, WebCrawler webCrawler)
		{
			_logger = logger;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
			_apiKey = config.GetValue<string>("CoinWatch:ApiKey")!;
			_httpClient = new HttpClient();
			_webCrawler = webCrawler; 
		}

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			while (!stoppingToken.IsCancellationRequested)
			{
				_logger.LogInformation("Refreshing system information: {time}", DateTimeOffset.Now);

				// Run tasks that need to execute every 1 minute
				if ((DateTime.Now - _lastMinuteTaskRun).TotalMinutes >= 1)
				{ 
					await FetchWebsiteMetadata();
				} 
				// Run tasks that need to execute every 5 minutes
				if ((DateTime.Now - _lastFiveMinuteTaskRun).TotalMinutes >= 5)
				{
					await UpdateLastBTCWalletInfo(); 
				}
				// Check if 1 hour has passed since the last coin fetch
				if ((DateTime.Now - _lastHourlyTaskRun).TotalHours >= 1)
				{
					await FetchAndStoreCoinValues();
					await AssignTrophies();
				//	await PostRandomMemeToTwitter();
					_lastHourlyTaskRun = DateTime.Now;
				}

				// Check if 6 hour has passed since the last exchange rate fetch
				if ((DateTime.Now - _lastMidDayTaskRun).TotalHours >= 6)
				{
					await FetchExchangeRates();
					_lastMidDayTaskRun = DateTime.Now;
				}

				// Check and run daily tasks only once every 24 hours
				if ((DateTime.Now - _lastDailyTaskRun).TotalHours >= 24)
				{
					await DeleteOldBattleReports();
					await DeleteOldGuests();
					await DeleteOldSearchResults(); 
					_lastDailyTaskRun = DateTime.Now;
				}

				// Delay for 5 minutes before repeating
				await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
			}
		}
		private async Task PostRandomMemeToTwitter()
		{
			using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			string query = @"
        SELECT file_name, folder_path, description 
        FROM file_uploads 
        WHERE is_folder = 0
        AND LOWER(folder_path) LIKE '%meme%' 
        AND file_size > 0 AND file_size < 300000 
        ORDER BY RAND() LIMIT 1";

			using var cmd = new MySqlCommand(query, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			if (!reader.HasRows)
			{
				_logger.LogInformation("No memes found.");
				return;
			}

			await reader.ReadAsync();
			string fileName = reader.GetString("file_name");
			string folderPath = reader.GetString("folder_path");
			string description = reader.IsDBNull("description") ? "Check this meme!" : reader.GetString("description");

			var twitterService = new TwitterService(
					_config.GetValue<string>("X:ClientId"),
					_config.GetValue<string>("X:ClientSecret"),
					_config.GetValue<string>("X:AccessTokenSecret")
			);

			// Step 1: Get the authorization URL for user login to get the authorization code
			string authorizationUrl = await twitterService.GetAuthorizationUrlAsync();
			Console.WriteLine("Visit this URL and authorize the app: " + authorizationUrl);

			// After the user visits the URL and gives authorization, they will be redirected to your redirect_uri with a code parameter.
			// You need to capture this code.
			string authorizationCode = "CAPTURED_AUTHORIZATION_CODE_FROM_REDIRECT";

			// Step 2: Exchange the authorization code for an access token
			string accessToken = await twitterService.GetAccessTokenAsync(authorizationCode, "bughosted.com");

			if (string.IsNullOrEmpty(accessToken))
			{
				_logger.LogError("Failed to retrieve access token.");
				return;
			}

			// Step 3: Post a tweet with an image URL (if media upload is not required)
			string imageUrl = $"https://bughosted.com/assets/Uploads/Meme/{folderPath}/{fileName}";

			bool tweetPosted = await twitterService.PostTweetWithImage(accessToken, description, imageUrl);
			if (tweetPosted)
			{
				_logger.LogInformation("Tweet posted successfully!");
			}
			else
			{
				_logger.LogError("Failed to post tweet.");
			}

			// Step 4: If media upload is required (optional - this part is for uploading media directly to Twitter)
			string mediaPath = Path.Combine("path_to_your_local_image_folder", fileName); // Ensure the image path is correct

			string mediaId = await twitterService.UploadMedia(accessToken, mediaPath);
			if (!string.IsNullOrEmpty(mediaId))
			{
				bool mediaTweetPosted = await twitterService.PostTweetWithMedia(accessToken, description, mediaId);
				if (mediaTweetPosted)
				{
					_logger.LogInformation("Tweet with media posted successfully!");
				}
				else
				{
					_logger.LogError("Failed to post tweet with media.");
				}
			}
		}


		private async Task FetchWebsiteMetadata()
		{ 
			try
			{
				await _webCrawler.FetchWebsiteMetadata();
			}
			catch (Exception ex)
			{
				Console.WriteLine("Exception while crawling : " + ex.Message);
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
					_logger.LogInformation("No BTC wallets found to update or all wallets are up to date.");
					return;
				}

				// Fetch wallet data from Blockchain.com API
				var walletData = await FetchBTCWalletData(wallet.BtcAddress);
				if (walletData == null)
				{
					_logger.LogWarning($"Failed to update wallet info for address: {wallet.BtcAddress}");
					return;
				}

				// Insert the new wallet balance data into user_btc_wallet_balance
				string insertSql = @"
            INSERT INTO user_btc_wallet_balance (wallet_id, final_balance, total_received, total_sent, fetched_at)
            VALUES (@WalletId, @FinalBalance, @TotalReceived, @TotalSent, UTC_TIMESTAMP());";

				using (var insertCmd = new MySqlCommand(insertSql, conn))
				{
					insertCmd.Parameters.AddWithValue("@WalletId", wallet.Id);
					insertCmd.Parameters.AddWithValue("@FinalBalance", walletData.FinalBalance);
					insertCmd.Parameters.AddWithValue("@TotalReceived", walletData.TotalReceived);
					insertCmd.Parameters.AddWithValue("@TotalSent", walletData.TotalSent);

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

				_logger.LogInformation($"Successfully inserted wallet balance data and updated last_fetched for address: {wallet.BtcAddress}");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while updating BTC wallet info.");
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
					_logger.LogWarning($"Failed to fetch BTC wallet data for address {btcAddress}: {response.StatusCode}");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, $"Error fetching BTC wallet data for address {btcAddress}.");
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
						_logger.LogInformation($"Deleted {affectedRows} old battle reports and references.");
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
						_logger.LogInformation($"Deleted {affectedRows} null nexus base upgrade rows.");
					}

					await transaction.CommitAsync();
				}
				catch (Exception ex)
				{
					_logger.LogError(ex, "Error occurred while deleting old battle reports or base upgrades. Rolling back transaction.");
					await transaction.RollbackAsync();
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while establishing the database connection or transaction.");
			}
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
					_logger.LogWarning($"Failed to fetch exchange rates for CAD: {response.StatusCode}");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, $"Error fetching exchange rates for CAD.");
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
                WHERE timestamp >= NOW() - INTERVAL 6 HOUR";

					using (var checkCmd = new MySqlCommand(checkSql, connection))
					{
						var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
						if (count > 0)
						{
							_logger.LogInformation("Exchange rates not added as entries exist in the last 6 hours.");
							return;
						}
					}

					// Delete old entries (older than 10 years)
					var deleteSql = @"
                DELETE FROM exchange_rates 
                WHERE timestamp < NOW() - INTERVAL 10 YEAR";

					using (var deleteCmd = new MySqlCommand(deleteSql, connection))
					{
						await deleteCmd.ExecuteNonQueryAsync();
					}

					// Insert new exchange rates
					foreach (var rate in exchangeData.Rates)
					{
						var insertSql = @"
                    INSERT INTO exchange_rates (base_currency, target_currency, rate, timestamp) 
                    VALUES (@base, @target, @rate, NOW())";

						using (var insertCmd = new MySqlCommand(insertSql, connection))
						{
							insertCmd.Parameters.AddWithValue("@base", exchangeData.Base);
							insertCmd.Parameters.AddWithValue("@target", rate.Key);
							insertCmd.Parameters.AddWithValue("@rate", rate.Value);

							await insertCmd.ExecuteNonQueryAsync();
						}
					}

					_logger.LogInformation("Exchange rates stored successfully.");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while storing exchange rates.");
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
                        AND (last_seen < (NOW() - INTERVAL 10 DAY));";

					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_logger.LogInformation($"Deleted {affectedRows} guest accounts older than 10 days.");
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while deleting old guest accounts.");
			}
		}


		private async Task DeleteOldSearchResults()
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					// SQL statement to delete from nexus_reports_deleted and nexus_battles in one go
					var deleteSql = @"
                        DELETE FROM search_results 
												WHERE (title IS NULL OR title = '') 
												AND (description IS NULL OR description = '') 
												AND (author IS NULL OR author = '') 
												AND (keywords IS NULL OR keywords = '') 
												AND (image_url IS NULL OR image_url = '') 
												AND response_code IS NULL
												AND last_crawled < NOW() - INTERVAL 1 DAY;
 
												DELETE s FROM search_results s
												JOIN (
														SELECT id FROM (
																SELECT id, 
																				ROW_NUMBER() OVER (
																						PARTITION BY  
																								CASE 
																										WHEN url LIKE 'http://www.%' THEN SUBSTRING(url, 12) 
																										WHEN url LIKE 'https://www.%' THEN SUBSTRING(url, 13) 
																										WHEN url LIKE 'http://%' THEN SUBSTRING(url, 8) 
																										WHEN url LIKE 'https://%' THEN SUBSTRING(url, 9) 
																										ELSE url 
																								END 
																						ORDER BY  
																								(url LIKE 'https://%') DESC,   
																								(title IS NOT NULL AND title != '') DESC, 
																								(description IS NOT NULL AND description != '') DESC, 
																								(author IS NOT NULL AND author != '') DESC, 
																								(keywords IS NOT NULL AND keywords != '') DESC, 
																								(image_url IS NOT NULL AND image_url != '') DESC, 
																								(response_code IS NOT NULL) DESC,
																								last_crawled DESC
																				) AS RowNum 
																FROM search_results
														) RankedResults 
														WHERE RankedResults.RowNum > 1
												) duplicates 
												ON s.id = duplicates.id
												WHERE s.last_crawled < NOW() - INTERVAL 1 DAY;";

					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
						_logger.LogInformation($"Deleted {affectedRows} search results older than 1 day.");
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while deleting old search results.");
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

					_logger.LogInformation($"Trophies assigned successfully. Total trophies awarded: {trophiesAssigned}");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while assigning trophies.");
			}
		}


		private async Task FetchAndStoreCoinValues()
		{
			var body = new
			{
				currency = "CAD",
				sort = "rank",
				order = "ascending",
				offset = 0,
				limit = 8,
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
					var coinData = JsonConvert.DeserializeObject<CoinResponse[]>(responseContent);
					if (coinData != null)
					{
						await StoreCoinValues(coinData);
					}
				}
				else
				{
					_logger.LogError("Failed to fetch coin values: {statusCode}", response.StatusCode);
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while fetching coin values.");
			}
		}
		private async Task StoreCoinValues(CoinResponse[] coinData)
		{
			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					var checkSql = "SELECT COUNT(*) FROM coin_value WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)";
					using (var checkCmd = new MySqlCommand(checkSql, conn))
					{
						var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
						if (count > 0)
						{
							_logger.LogInformation("Coin values not added as entries were added in the last 1 hour.");
							return;
						}
					}

					// Delete entries older than 10 years
					var deleteSql = "DELETE FROM coin_value WHERE timestamp < DATE_SUB(NOW(), INTERVAL 10 YEAR)";
					using (var deleteCmd = new MySqlCommand(deleteSql, conn))
					{
						await deleteCmd.ExecuteNonQueryAsync();
					}

					// Insert new coin data
					foreach (var coin in coinData)
					{
						var sql = "INSERT INTO coin_value (symbol, name, value_cad, timestamp) VALUES (@Symbol, @Name, @ValueCAD, NOW())";
						using (var cmd = new MySqlCommand(sql, conn))
						{
							cmd.Parameters.AddWithValue("@Symbol", coin.symbol);
							cmd.Parameters.AddWithValue("@Name", coin.name);
							cmd.Parameters.AddWithValue("@ValueCAD", coin.rate);

							await cmd.ExecuteNonQueryAsync();
						}
					}

					_logger.LogInformation("Coin values stored successfully.");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred while storing coin values.");
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
