using MySqlConnector;
namespace maxhanna.Server.Services
{
	public class ProfitCalculationService
	{
		private readonly string _connectionString;
		private readonly IConfiguration _config;
		private readonly Log _log;
		private readonly KrakenService _krakenService;

		public ProfitCalculationService(IConfiguration config, Log log, KrakenService krakenService)
		{
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;
			_log = log;
			_krakenService = krakenService;
		}

		public async Task CalculateDailyProfits() =>
			await CalculateProfits(ProfitInterval.Daily);

		public async Task CalculateWeeklyProfits() =>
			await CalculateProfits(ProfitInterval.Weekly);

		public async Task CalculateMonthlyProfits() =>
			await CalculateProfits(ProfitInterval.Monthly);

		private async Task CalculateProfits(ProfitInterval interval)
		{
			try
			{
				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				if (await IsNewPeriod(conn, interval))
				{
					var activeUsers = await GetActiveTradeBotUsers(conn);
					var (periodStart, _) = GetPeriodRange(interval);
					await ProcessPeriodTransitions(conn, activeUsers, interval, periodStart);
				}
			}
			catch (Exception ex)
			{
				await _log.Db($"Error in {interval} profit calculation: {ex.Message}", type: "PROFIT", outputToConsole: true);
			}
		}

		private async Task<bool> IsNewPeriod(MySqlConnection conn, ProfitInterval interval)
		{
			var now = DateTime.UtcNow;
			var (currentPeriodStart, _) = GetPeriodRange(interval);

			// First check if we're actually in a new period time-wise
			if (now <= currentPeriodStart)
			{
				return false;
			}

			// Then check if we've already processed this period
			var tableName = GetTableName(interval);
			var periodColumn = GetPeriodColumn(interval);

			var sql = $@"
				SELECT COUNT(*) 
				FROM {tableName} 
				WHERE DATE({periodColumn}) = @currentPeriodStart";

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@currentPeriodStart", currentPeriodStart.Date);

			var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
			return count == 0; // Only new if no records exist for this period
		}

		private async Task ProcessPeriodTransitions(MySqlConnection conn, List<int> userIds, ProfitInterval interval, DateTime newPeriodStart)
		{
			// Process first user immediately
			if (userIds.Count > 0)
			{
				await ProcessUserWithErrorHandling(conn, userIds[0], interval, newPeriodStart);
			}

			// Process remaining users with delay
			for (int i = 1; i < userIds.Count; i++)
			{
				await Task.Delay(3000); // Wait before starting next user
				await ProcessUserWithErrorHandling(conn, userIds[i], interval, newPeriodStart);
			}
		}

		private async Task ProcessUserWithErrorHandling(MySqlConnection conn, int userId,
			ProfitInterval interval, DateTime newPeriodStart)
		{
			try
			{
				// Get the previous period record that needs closing
				var previousRecord = await GetOpenPreviousPeriodRecord(conn, userId, interval, newPeriodStart);

				// Get current balances and prices
				var keys = await _krakenService.GetApiKey(userId);
				if (keys == null) return;

				var balances = await _krakenService.GetBalance(userId, "BTC", keys);
				if (balances == null) return;

				var btcBalance = balances.GetValueOrDefault("XXBT", 0);
				var usdcBalance = balances.GetValueOrDefault("USDC", 0);
				var btcPrice = await _krakenService.GetCoinPriceToUSDC(userId, "BTC", keys);
				if (btcPrice == null) return;

				// Close previous period if exists
				if (previousRecord != null)
				{
					var cumulativeProfit = await CalculateCumulativeProfit(conn, previousRecord.Id, interval,
						btcBalance, usdcBalance, btcPrice.Value, previousRecord);

					await UpdateClosingValues(conn, previousRecord.Id, interval,
						usdcBalance, btcBalance, btcPrice.Value, cumulativeProfit);
				}

				// Open new period
				var recordId = await GetOrCreateProfitRecord(conn, userId, interval, newPeriodStart);
				if (recordId == null) return;

				await UpdateOpeningValues(conn, userId, recordId.Value, interval,
					usdcBalance, btcBalance, btcPrice.Value);
			}
			catch (Exception ex)
			{
				await _log.Db($"Error processing {interval} period transition for user {userId}: {ex.Message}", type: "PROFIT", outputToConsole: true);
			}
		}
		private async Task<OpeningValues?> GetOpenPreviousPeriodRecord(MySqlConnection conn,
			int userId, ProfitInterval interval, DateTime newPeriodStart)
		{
			var tableName = GetTableName(interval);
			var periodColumn = GetPeriodColumn(interval);
			var periodEndColumn = GetPeriodEndColumn(interval);

			var sql = $@"
                SELECT id, start_usdc, start_btc, start_btc_price_usdc
                FROM {tableName}
                WHERE user_id = @userId
                AND {periodColumn} < @newPeriodStart
                AND {periodEndColumn} IS NULL
                ORDER BY {periodColumn} DESC
                LIMIT 1";

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@userId", userId);
			cmd.Parameters.AddWithValue("@newPeriodStart", newPeriodStart);

			using var reader = await cmd.ExecuteReaderAsync();
			if (await reader.ReadAsync())
			{
				return new OpeningValues
				{
					Id = reader.GetInt32("id"),
					StartUsdc = reader.GetDecimal("start_usdc"),
					StartBtc = reader.GetDecimal("start_btc"),
					StartBtcPriceUsdc = reader.GetDecimal("start_btc_price_usdc")
				};
			}

			return null;
		}

		private (DateTime Start, DateTime End) GetPeriodRange(ProfitInterval interval)
		{
			var now = DateTime.UtcNow;
			return interval switch
			{
				ProfitInterval.Daily => (now.Date, now.Date.AddDays(1).AddTicks(-1)),
				ProfitInterval.Weekly => (
					now.Date.AddDays(-(int)now.DayOfWeek),
					now.Date.AddDays(-(int)now.DayOfWeek).AddDays(7).AddTicks(-1)),
				ProfitInterval.Monthly => (
					new DateTime(now.Year, now.Month, 1),
					new DateTime(now.Year, now.Month, 1).AddMonths(1).AddTicks(-1)),
				_ => throw new ArgumentOutOfRangeException(nameof(interval), interval, null)
			};
		}

		private async Task<int?> GetOrCreateProfitRecord(MySqlConnection conn, int userId,
	ProfitInterval interval, DateTime periodStart)
		{
			var tableName = GetTableName(interval);
			var periodColumn = GetPeriodColumn(interval);

			// First try to get existing record
			var selectSql = $@"
        SELECT id FROM {tableName} 
        WHERE user_id = @userId 
        AND DATE({periodColumn}) = @periodStart 
        LIMIT 1";

			using var selectCmd = new MySqlCommand(selectSql, conn);
			selectCmd.Parameters.AddWithValue("@userId", userId);
			selectCmd.Parameters.AddWithValue("@periodStart", periodStart);

			var existingId = await selectCmd.ExecuteScalarAsync();
			if (existingId != null)
			{
				return Convert.ToInt32(existingId);
			}

			// If not found, insert new record
			var insertSql = $@"
        INSERT INTO {tableName} (user_id, {periodColumn})
        VALUES (@userId, @periodStart);
        SELECT LAST_INSERT_ID();";

			using var insertCmd = new MySqlCommand(insertSql, conn);
			insertCmd.Parameters.AddWithValue("@userId", userId);
			insertCmd.Parameters.AddWithValue("@periodStart", periodStart);

			var newId = await insertCmd.ExecuteScalarAsync();
			return newId != null ? Convert.ToInt32(newId) : null;
		}

		private async Task UpdateOpeningValues(MySqlConnection conn, int userId, int recordId,
			ProfitInterval interval, decimal usdcBalance, decimal btcBalance, decimal btcPrice)
		{
			var tableName = GetTableName(interval);

			var sql = $@"
                UPDATE {tableName} 
                SET 
                    start_usdc = @usdcBalance,
                    start_btc = COALESCE((
                        SELECT balance 
                        FROM user_btc_wallet_balance 
                        WHERE wallet_id = (
                            SELECT id 
                            FROM user_btc_wallet_info 
                            WHERE btc_address = 'Kraken' 
                            AND user_id = @userId
                        ) 
                        ORDER BY fetched_at DESC 
                        LIMIT 1
                    ), 0),
                    start_btc_price_usdc = @btcPrice
                WHERE id = @recordId";

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@recordId", recordId);
			cmd.Parameters.AddWithValue("@userId", userId);
			cmd.Parameters.AddWithValue("@usdcBalance", usdcBalance);
			cmd.Parameters.AddWithValue("@btcBalance", btcBalance);
			cmd.Parameters.AddWithValue("@btcPrice", btcPrice);

			await cmd.ExecuteNonQueryAsync();
			await _log.Db($"Updated {interval} opening values for record {recordId}", type: "PROFIT", outputToConsole: true);
		}

		private async Task UpdateClosingValues(MySqlConnection conn, int recordId,
			ProfitInterval interval, decimal usdcBalance, decimal btcBalance,
			decimal btcPrice, decimal cumulativeProfit)
		{
			var tableName = GetTableName(interval);
			var periodEndColumn = GetPeriodEndColumn(interval);

			var sql = $@"
                UPDATE {tableName} 
                SET 
                    {periodEndColumn} = UTC_TIMESTAMP(),
                    end_usdc = @usdcBalance,
                    end_btc = @btcBalance,
                    end_btc_price_usdc = @btcPrice, 
                    cumulative_profit_usdc = @cumulativeProfit
                WHERE id = @recordId";

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@recordId", recordId);
			cmd.Parameters.AddWithValue("@usdcBalance", usdcBalance);
			cmd.Parameters.AddWithValue("@btcBalance", btcBalance);
			cmd.Parameters.AddWithValue("@btcPrice", btcPrice);
			cmd.Parameters.AddWithValue("@cumulativeProfit", cumulativeProfit);

			await cmd.ExecuteNonQueryAsync();
			await _log.Db($"Updated {interval} closing values for record {recordId}", type: "PROFIT", outputToConsole: true);
		}

		private async Task<decimal> CalculateCumulativeProfit(MySqlConnection conn, int recordId,
			ProfitInterval interval, decimal btcBalance, decimal usdcBalance,
			decimal btcPrice, OpeningValues openingValues)
		{
			var tableName = GetTableName(interval);

			decimal currentProfit = usdcBalance + (btcBalance * btcPrice) -
				(openingValues.StartUsdc + (openingValues.StartBtc * btcPrice));

			var sqlCumulative = $@"
                SELECT COALESCE(SUM(absolute_profit_usdc), 0)
                FROM {tableName}
                WHERE user_id = (SELECT user_id FROM {tableName} WHERE id = @recordId)
                AND id < @recordId";

			using var cmd = new MySqlCommand(sqlCumulative, conn);
			cmd.Parameters.AddWithValue("@recordId", recordId);

			decimal priorCumulativeProfit = Convert.ToDecimal(await cmd.ExecuteScalarAsync());
			return priorCumulativeProfit + currentProfit;
		}

		public async Task<List<int>> GetActiveTradeBotUsers(MySqlConnection? conn = null)
		{
			bool shouldDisposeConnection = conn == null;
			var activeUsers = new List<int>();
			const string sql = @"
                SELECT u.id 
                FROM users u
                JOIN trade_bot_status tbs ON u.id = tbs.user_id AND tbs.is_running_btc_usdc = 1
                JOIN user_kraken_api_keys ukak ON u.id = ukak.user_id
                WHERE ukak.api_key IS NOT NULL 
                AND ukak.api_key != ''
                AND ukak.private_key IS NOT NULL
                AND ukak.private_key != ''";

			try
			{
				conn ??= new MySqlConnection(_connectionString);
				if (conn.State != System.Data.ConnectionState.Open)
				{
					await conn.OpenAsync();
				}
				using var cmd = new MySqlCommand(sql, conn);
				using var reader = await cmd.ExecuteReaderAsync();

				while (await reader.ReadAsync())
				{
					activeUsers.Add(reader.GetInt32("id"));
				}

				_ = _log.Db($"Found {activeUsers.Count} active trade bot users");
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error fetching active trade bot users: {ex.Message}");
			}
			finally
			{
				if (shouldDisposeConnection && conn != null)
				{
					await conn.DisposeAsync();
				}
			}
			return activeUsers;
		}

		private string GetTableName(ProfitInterval interval) => interval switch
		{
			ProfitInterval.Daily => "trade_daily_profit",
			ProfitInterval.Weekly => "trade_weekly_profit",
			ProfitInterval.Monthly => "trade_monthly_profit",
			_ => throw new ArgumentOutOfRangeException(nameof(interval), interval, null)
		};

		private string GetPeriodColumn(ProfitInterval interval) => interval switch
		{
			ProfitInterval.Daily => "date_start",
			ProfitInterval.Weekly => "week_start",
			ProfitInterval.Monthly => "month_start",
			_ => throw new ArgumentOutOfRangeException(nameof(interval), interval, null)
		};

		private string GetPeriodEndColumn(ProfitInterval interval) => interval switch
		{
			ProfitInterval.Daily => "date_end",
			ProfitInterval.Weekly => "week_end",
			ProfitInterval.Monthly => "month_end",
			_ => throw new ArgumentOutOfRangeException(nameof(interval), interval, null)
		};
	}

	public enum ProfitInterval
	{
		Daily,
		Weekly,
		Monthly
	}

	public class OpeningValues
	{
		public int Id { get; set; }
		public decimal StartUsdc { get; set; }
		public decimal StartBtc { get; set; }
		public decimal StartBtcPriceUsdc { get; set; }
	}
}