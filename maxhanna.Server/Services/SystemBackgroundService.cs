using System.Text;
using maxhanna.Server.Controllers.DataContracts.Crypto;
using MySqlConnector;
using Newtonsoft.Json;

namespace maxhanna.Server.Services
{
	public class SystemBackgroundService : BackgroundService
	{
		private readonly ILogger<SystemBackgroundService> _logger;
		private readonly string _apiKey;
		private readonly string _coinwatchUrl = "https://api.livecoinwatch.com/coins/list";
		private readonly string _connectionString;
		private readonly HttpClient _httpClient;
		private DateTime _lastDailyTaskRun = DateTime.MinValue;
		private DateTime _lastCoinFetchRun = DateTime.MinValue; // Track the last execution time for FetchAndStoreCoinValues
		private DateTime _lastExchangeRateFetchRun = DateTime.MinValue; // Track the last execution time for FetchAndStoreCoinValues

		public SystemBackgroundService(ILogger<SystemBackgroundService> logger, IConfiguration config)
		{
			_logger = logger;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
			_apiKey = config.GetValue<string>("CoinWatch:ApiKey")!;
			_httpClient = new HttpClient();
		}

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			while (!stoppingToken.IsCancellationRequested)
			{
				_logger.LogInformation("Refreshing system information: {time}", DateTimeOffset.Now);

				// Run tasks that need to execute every 5 minutes
				await UpdateLastBTCWalletInfo();

				// Check if 1 hour has passed since the last coin fetch
				if ((DateTime.Now - _lastCoinFetchRun).TotalHours >= 1)
				{
					await FetchAndStoreCoinValues(); 
					_lastCoinFetchRun = DateTime.Now;
				}

				// Check if 6 hour has passed since the last exchange rate fetch
				if ((DateTime.Now - _lastExchangeRateFetchRun).TotalHours >= 6)
				{ 
					await FetchExchangeRates();
					_lastExchangeRateFetchRun = DateTime.Now;
				}

				// Check and run daily tasks only once every 24 hours
				if ((DateTime.Now - _lastDailyTaskRun).TotalHours >= 24)
				{
					await DeleteOldBattleReports();
					await DeleteOldGuests();
					_lastDailyTaskRun = DateTime.Now;
				}

				// Delay for 5 minutes before repeating
				await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
			}
		}
		private async Task UpdateLastBTCWalletInfo()
		{
			try
			{
				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				// Fetch the most recently updated BTC wallet
				string fetchWalletSql = @"
            SELECT id, user_id, btc_address 
            FROM user_btc_wallet_info 
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
					_logger.LogInformation("No BTC wallets found to update.");
					return;
				}

				// Fetch wallet data from Blockchain.com API
				var walletData = await FetchBTCWalletData(wallet.BtcAddress);
				if (walletData == null)
				{
					_logger.LogWarning($"Failed to update wallet info for address: {wallet.BtcAddress}");
					return;
				}

				// Update the database with the new wallet data
				string updateSql = @"
            INSERT INTO user_btc_wallet_info (user_id, btc_address, final_balance, total_received, total_sent, last_fetched)
            VALUES (@UserId, @BtcAddress, @FinalBalance, @TotalReceived, @TotalSent, NOW())
            ON DUPLICATE KEY UPDATE
                final_balance = VALUES(final_balance),
                total_received = VALUES(total_received),
                total_sent = VALUES(total_sent),
                last_fetched = NOW();";

				using (var updateCmd = new MySqlCommand(updateSql, conn))
				{
					updateCmd.Parameters.AddWithValue("@UserId", wallet.UserId);
					updateCmd.Parameters.AddWithValue("@BtcAddress", wallet.BtcAddress);
					updateCmd.Parameters.AddWithValue("@FinalBalance", walletData.FinalBalance);
					updateCmd.Parameters.AddWithValue("@TotalReceived", walletData.TotalReceived);
					updateCmd.Parameters.AddWithValue("@TotalSent", walletData.TotalSent);
					updateCmd.Parameters.AddWithValue("@Id", wallet.Id);

					await updateCmd.ExecuteNonQueryAsync();
				}

				_logger.LogInformation($"Successfully updated wallet info for address: {wallet.BtcAddress}");
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
