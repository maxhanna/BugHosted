using MySqlConnector;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;
using System.Diagnostics;
using System.Threading;
using System.Linq;

namespace maxhanna.Server.Services
{
	public class TradeIndicatorService
	{
		private readonly string _connectionString;
		private readonly IConfiguration _config;
		private readonly Log _log;
		private const int MaxRetries = 3;
		private const int RetryDelayMs = 1000;
		private const int InterCoinDelayMinutes = 1; // Delay between coins in minutes

		// Supported coin pairs matching your volume data
		private readonly List<(string pair, string fromCoin, string toCoin, string coinName)> _coinPairs = new()
		{
			("XBTUSDC", "XBT", "USDC", "Bitcoin"),
			("XRPUSDC", "XRP", "USDC", "XRP"),
			("XDGUSDC", "XDG", "USDC", "Dogecoin"),
			("ETHUSDC", "ETH", "USDC", "Ethereum"),
			("SOLUSDC", "SOL", "USDC", "Solana")
		};

		private readonly SemaphoreSlim _updateLock = new SemaphoreSlim(1, 1);
		private bool _isUpdating = false;
		public bool IsUpdating => _isUpdating;

		// Command timeout for long-running DB operations (seconds)
		private const int DbCommandTimeoutSeconds = 120;

		public TradeIndicatorService(IConfiguration config, Log log)
		{
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;
			_log = log;
		}

		public async Task<bool> UpdateIndicators()
		{
			// Check if already updating
			if (!_updateLock.Wait(0))
			{
				_ = _log.Db("UpdateIndicators is already running, skipping this execution", null, "TISVC", outputToConsole: true);
				return false;
			}

			try
			{
				_isUpdating = true;
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();

				bool overallSuccess = true;

				foreach (var coin in _coinPairs)
				{
					if (!await CanUpdateIndicators(connection, coin.fromCoin, coin.toCoin))
					{
						continue;
					}

					bool success = true;
					success &= await ExecuteStep(() => Update200DMA(connection, coin.fromCoin, coin.toCoin, coin.coinName), "Update200DMA", coin.pair);
					success &= await ExecuteStep(() => Update14DMA(connection, coin.fromCoin, coin.toCoin, coin.coinName), "Update14DMA", coin.pair);
					success &= await ExecuteStep(() => Update21DMA(connection, coin.fromCoin, coin.toCoin, coin.coinName), "Update21DMA", coin.pair);
					success &= await ExecuteStep(() => UpdateRSI(connection, coin.fromCoin, coin.toCoin, coin.coinName), "UpdateRSI", coin.pair);
					success &= await ExecuteStep(() => UpdateVWAP(connection, coin.pair, coin.fromCoin, coin.toCoin), "UpdateVWAP", coin.pair);
					success &= await ExecuteStep(() => UpdateRetracementFromHigh(connection, coin.fromCoin, coin.toCoin, coin.coinName), "UpdateRetracementFromHigh", coin.pair);
					success &= await ExecuteStep(() => UpdateMACD(connection, coin.fromCoin, coin.toCoin, coin.coinName), "UpdateMACD", coin.pair);
					success &= await ExecuteStep(() => UpdateVolumeAbove20DayAvg(connection, coin.pair, coin.fromCoin, coin.toCoin), "UpdateVolumeAbove20DayAvg", coin.pair);
					success &= await ExecuteStep(() => RecordSignalInterval(connection, coin.fromCoin, coin.toCoin), "RecordSignalInterval", coin.pair);
					success &= await ExecuteStep(() => UpdateAllCoinsMonthlyPerformance(connection), "UpdateAllCoinsMonthlyPerformance", coin.pair);

					overallSuccess &= success;

					_ = _log.Db($"Trade indicators updated for {coin.pair}: {(success ? "success" : "failed")}",
							   null, "TISVC", outputToConsole: true);

					if (coin != _coinPairs[^1])
					{
						await Task.Delay(TimeSpan.FromMinutes(InterCoinDelayMinutes));
					}
				}

				return overallSuccess;
			}
			catch (MySqlException ex) when (ex.Number == 2013)
			{
				_ = _log.Db($"Lost connection to MySQL during UpdateIndicators: {ex.Message}", null, "TISVC", outputToConsole: true);
				return false;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error updating trade indicators: {ex.Message}", null, "TISVC", outputToConsole: true);
				return false;
			}
			finally
			{
				_isUpdating = false;
				_updateLock.Release();
			}
		}
		private async Task<bool> UpdateAllCoinsMonthlyPerformance(MySqlConnection connection)
		{
			var coins = new HashSet<string> { "Bitcoin", "Solana", "Dogecoin", "XRP", "Ethereum" }; // Unique coins
			bool success = true;
			foreach (var coinName in coins)
			{
				success &= await UpdateCoinMonthlyPerformance(connection, coinName);
			}
			return success;
		}

		private async Task<bool> CanUpdateIndicators(MySqlConnection connection, string fromCoin, string toCoin)
		{
			var sql = @"
                SELECT updated
                FROM trade_indicators
                WHERE from_coin = @fromCoin AND to_coin = @toCoin
                AND updated >= UTC_TIMESTAMP() - INTERVAL 5 MINUTE";

			using var cmd = new MySqlCommand(sql, connection);
			cmd.CommandTimeout = DbCommandTimeoutSeconds;
			cmd.Parameters.AddWithValue("@fromCoin", fromCoin);
			cmd.Parameters.AddWithValue("@toCoin", toCoin);

			var result = await cmd.ExecuteScalarAsync();

			if (result != null && result != DBNull.Value)
			{
				// _ = _log.Db($"Trade indicators for {fromCoin}/{toCoin} updated within last 5 minutes, skipping update",
				// 		   null, "TISVC", outputToConsole: true);
				return false;
			}
			return true;
		}

		// Helper to execute a named step with timing and detailed logging.
		private async Task<bool> ExecuteStep(Func<Task<bool>> stepFunc, string stepName, string pair)
		{
			var sw = Stopwatch.StartNew();
			try
			{
				_ = _log.Db($"TISVC: Starting {stepName} for {pair}", null, "TISVC", true);
				bool result = await stepFunc();
				sw.Stop();
				_ = _log.Db($"TISVC: Completed {stepName} for {pair} in {sw.ElapsedMilliseconds}ms (success={result})", null, "TISVC", true);
				return result;
			}
			catch (Exception ex)
			{
				sw.Stop();
				// Log full exception to capture timeout details and stack
				_ = _log.Db($"TISVC: Exception in {stepName} for {pair}: {ex.Message}. Elapsed {sw.ElapsedMilliseconds}ms. Exception: {ex}", null, "TISVC", true);
				return false;
			}
		}

		// Upsert today's daily average for the given coin into the daily averages table.
		private async Task UpsertTodayDailyAverage(MySqlConnection connection, string coinName)
		{
			var sql = @"
				INSERT INTO daily_price_averages (`name`, price_date, daily_usd_price, updated_at)
				SELECT
					@coinName                         AS `name`,
					UTC_DATE()                        AS price_date,       -- today's UTC date
					AVG(cv.value_usd)                 AS daily_usd_price,
					UTC_TIMESTAMP()                   AS updated_at
				FROM coin_value AS cv FORCE INDEX (ix_coin_value_name_ts)
				WHERE cv.name = @coinName
					AND cv.`timestamp` >= UTC_DATE()                           -- 00:00:00 UTC today
					AND cv.`timestamp` <  UTC_DATE() + INTERVAL 1 DAY          -- 00:00:00 UTC tomorrow
				ON DUPLICATE KEY UPDATE
					daily_usd_price = VALUES(daily_usd_price),
					updated_at      = VALUES(updated_at);";

			using var cmd = new MySqlCommand(sql, connection);
			cmd.CommandTimeout = DbCommandTimeoutSeconds;
			cmd.Parameters.AddWithValue("@coinName", coinName);
			await cmd.ExecuteNonQueryAsync();
		}

		// Compute a moving average using the daily averages table.
		private async Task<decimal?> ComputeMovingAverageFromDailyAverages(MySqlConnection connection, string coinName, int days)
		{
			var sql = @"
			SELECT AVG(daily_usd_price) AS moving_average
			FROM daily_price_averages
			WHERE `name` = @coinName
			  AND price_date >= DATE_SUB(DATE(UTC_TIMESTAMP()), INTERVAL @days DAY)";

			using var cmd = new MySqlCommand(sql, connection);
			cmd.CommandTimeout = DbCommandTimeoutSeconds;
			cmd.Parameters.AddWithValue("@coinName", coinName);
			cmd.Parameters.AddWithValue("@days", days);

			object? result = await cmd.ExecuteScalarAsync();
			if (result == null || result == DBNull.Value)
				return null;
			return Convert.ToDecimal(result);
		}

		private async Task<bool> Update200DMA(MySqlConnection connection, string fromCoin, string toCoin, string coinName)
		{
			// Ensure the daily averages table exists, upsert today's average and then compute the 200-day average
			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
 					await UpsertTodayDailyAverage(connection, coinName);

					var maValueNullable = await ComputeMovingAverageFromDailyAverages(connection, coinName, 200);
					if (maValueNullable == null)
					{
						_ = _log.Db($"No data for 200-DMA calc for {fromCoin}/{toCoin}", null, "TISVC", true);
						return false;
					}

					decimal maValue = maValueNullable.Value;
					bool isAboveMovingAvg = await IsPriceAboveMovingAverage(connection, coinName, maValue);

					const string updateSql = @"
						INSERT INTO trade_indicators
							   (from_coin, to_coin,
								`200_day_moving_average`, `200_day_moving_average_value`, updated)
						VALUES (@from, @to, @flag, @val, UTC_TIMESTAMP())
						ON DUPLICATE KEY UPDATE
								`200_day_moving_average`        = @flag,
								`200_day_moving_average_value`  = @val,
								updated                         = UTC_TIMESTAMP();";

					using var upd = new MySqlCommand(updateSql, connection);
					upd.CommandTimeout = DbCommandTimeoutSeconds;
					upd.Parameters.AddWithValue("@from", fromCoin);
					upd.Parameters.AddWithValue("@to", toCoin);
					upd.Parameters.AddWithValue("@flag", isAboveMovingAvg ? 1 : 0);
					upd.Parameters.AddWithValue("@val", maValue);

					await upd.ExecuteNonQueryAsync();

					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 200-DMA for {fromCoin}/{toCoin} (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update 200-DMA for {fromCoin}/{toCoin} after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<bool> Update14DMA(MySqlConnection connection, string fromCoin, string toCoin, string coinName)
		{
			const string sql = @"
                SELECT AVG(daily_usd_price) AS moving_average
                FROM (
                    SELECT  DATE(cv.timestamp)          AS price_date,
                            AVG(cv.value_usd)           AS daily_usd_price
                    FROM    coin_value cv
                    WHERE   cv.name      = @coinName
                    AND   cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 14 DAY)
                    GROUP BY DATE(cv.timestamp)
                ) daily_prices;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					cmd.CommandTimeout = DbCommandTimeoutSeconds;
					cmd.Parameters.AddWithValue("@coinName", coinName);

					object? result = await cmd.ExecuteScalarAsync();

					if (result is null or DBNull)
					{
						_ = _log.Db($"No data for 14-DMA calc for {fromCoin}/{toCoin}", null, "TISVC", true);
						return false;
					}

					decimal maValue = Convert.ToDecimal(result);
					bool isAboveMovingAvg = await IsPriceAboveMovingAverage(connection, coinName, maValue);

					const string updateSql = @"
                        INSERT INTO trade_indicators
                               (from_coin, to_coin,
                                `14_day_moving_average`, `14_day_moving_average_value`, updated)
                        VALUES (@from, @to, @flag, @val, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE
                                `14_day_moving_average`        = @flag,
                                `14_day_moving_average_value`  = @val,
                                updated                         = UTC_TIMESTAMP();";

					using var upd = new MySqlCommand(updateSql, connection);
					upd.CommandTimeout = DbCommandTimeoutSeconds;
					upd.Parameters.AddWithValue("@from", fromCoin);
					upd.Parameters.AddWithValue("@to", toCoin);
					upd.Parameters.AddWithValue("@flag", isAboveMovingAvg ? 1 : 0);
					upd.Parameters.AddWithValue("@val", maValue);

					await upd.ExecuteNonQueryAsync();

					//_ = _log.Db($"{fromCoin}/{toCoin} 14-DMA flag={isAboveMovingAvg}, value={maValue:F2}", null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 14-DMA for {fromCoin}/{toCoin} (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update 14-DMA for {fromCoin}/{toCoin} after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<bool> Update21DMA(MySqlConnection connection, string fromCoin, string toCoin, string coinName)
		{
			const string sql = @"
                SELECT AVG(daily_usd_price) AS moving_average
                FROM (
                    SELECT  DATE(cv.timestamp)          AS price_date,
                            AVG(cv.value_usd)           AS daily_usd_price
                    FROM    coin_value cv
                    WHERE   cv.name      = @coinName
                    AND   cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 21 DAY)
                    GROUP BY DATE(cv.timestamp)
                ) daily_prices;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					cmd.CommandTimeout = DbCommandTimeoutSeconds;
					cmd.Parameters.AddWithValue("@coinName", coinName);

					object? result = await cmd.ExecuteScalarAsync();

					if (result is null or DBNull)
					{
						_ = _log.Db($"No data for 21-DMA calc for {fromCoin}/{toCoin}", null, "TISVC", true);
						return false;
					}

					decimal maValue = Convert.ToDecimal(result);
					bool isAboveMovingAvg = await IsPriceAboveMovingAverage(connection, coinName, maValue);

					const string updateSql = @"
                        INSERT INTO trade_indicators
                               (from_coin, to_coin,
                                `21_day_moving_average`, `21_day_moving_average_value`, updated)
                        VALUES (@from, @to, @flag, @val, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE
                                `21_day_moving_average`        = @flag,
                                `21_day_moving_average_value`  = @val,
                                updated                         = UTC_TIMESTAMP();";

					using var upd = new MySqlCommand(updateSql, connection);
					upd.CommandTimeout = DbCommandTimeoutSeconds;
					upd.Parameters.AddWithValue("@from", fromCoin);
					upd.Parameters.AddWithValue("@to", toCoin);
					upd.Parameters.AddWithValue("@flag", isAboveMovingAvg ? 1 : 0);
					upd.Parameters.AddWithValue("@val", maValue);

					await upd.ExecuteNonQueryAsync();

					//_ = _log.Db($"{fromCoin}/{toCoin} 21-DMA flag={isAboveMovingAvg}, value={maValue:F2}", null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 21-DMA for {fromCoin}/{toCoin} (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update 21-DMA for {fromCoin}/{toCoin} after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<bool> UpdateRSI(MySqlConnection connection, string fromCoin, string toCoin, string coinName)
		{
			var sql = @"
                WITH DailyPrices AS (
                    SELECT 
                        DATE(cv.timestamp) as price_date,
                        AVG(cv.value_usd) as usd_price
                    FROM coin_value cv
                    WHERE cv.name = @coinName
                    AND cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 14 DAY)
                    GROUP BY DATE(cv.timestamp)
                ),
                PriceData AS (
                    SELECT 
                        usd_price as price,
                        LAG(usd_price) OVER (ORDER BY price_date) as prev_price,
                        price_date
                    FROM DailyPrices
                    ORDER BY price_date
                )
                SELECT 
                    AVG(CASE WHEN price > prev_price THEN price - prev_price ELSE 0 END) as avg_gain,
                    AVG(CASE WHEN price < prev_price THEN prev_price - price ELSE 0 END) as avg_loss
                FROM PriceData
                WHERE prev_price IS NOT NULL";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					cmd.CommandTimeout = DbCommandTimeoutSeconds;
					cmd.Parameters.AddWithValue("@coinName", coinName);

					using var reader = await cmd.ExecuteReaderAsync();

					if (!await reader.ReadAsync() || reader.IsDBNull(0) || reader.IsDBNull(1))
					{
						_ = _log.Db($"Insufficient data for RSI calculation for {fromCoin}/{toCoin}", null, "TISVC", true);
						await reader.CloseAsync();
						return false;
					}

					decimal avgGain = reader.GetDecimal(0);
					decimal avgLoss = reader.GetDecimal(1);
					await reader.CloseAsync();

					decimal rsi = avgLoss == 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

					var updateSql = @"
                        INSERT INTO trade_indicators (from_coin, to_coin, rsi_14_day, updated)
                        VALUES (@fromCoin, @toCoin, @rsi, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE 
                        rsi_14_day = @rsi,
                        updated = UTC_TIMESTAMP();";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.CommandTimeout = DbCommandTimeoutSeconds;
					updateCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
					updateCmd.Parameters.AddWithValue("@toCoin", toCoin);
					updateCmd.Parameters.AddWithValue("@rsi", rsi);

					await updateCmd.ExecuteNonQueryAsync();
					//_ = _log.Db($"RSI updated for {fromCoin}/{toCoin}: rsi_14_day = {rsi:F2}", null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt <= MaxRetries)
				{
					_ = _log.Db($"Lost connection during RSI for {fromCoin}/{toCoin} (attempt {attempt}): {ex.Message}. Retrying...",
							   null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update RSI for {fromCoin}/{toCoin} after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<bool> UpdateVWAP(MySqlConnection connection, string pair, string fromCoin, string toCoin)
		{
			var sql = @"
                SELECT 
                    SUM(volume_usdc * (volume_usdc / volume_coin)) / SUM(volume_usdc) as vwap_usd
                FROM trade_market_volumes
                WHERE pair = @pair
                AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					cmd.CommandTimeout = DbCommandTimeoutSeconds;
					cmd.Parameters.AddWithValue("@pair", pair);

					var result = await cmd.ExecuteScalarAsync();

					if (result == null || result == DBNull.Value)
					{
						_ = _log.Db($"No data available for VWAP calculation for {pair}", null, "TISVC", true);
						return false;
					}

					decimal vwap = Convert.ToDecimal(result);
					bool isAboveVWAP = await IsPriceAboveMovingAverage(connection, GetCoinNameFromPair(pair), vwap);

					var updateSql = @"
                        INSERT INTO trade_indicators (from_coin, to_coin, vwap_24_hour, vwap_24_hour_value, updated)
                        VALUES (@fromCoin, @toCoin, @isAboveVWAP, @vwap, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE 
                        vwap_24_hour = @isAboveVWAP,
                        vwap_24_hour_value = @vwap,
                        updated = UTC_TIMESTAMP();";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.CommandTimeout = DbCommandTimeoutSeconds;
					updateCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
					updateCmd.Parameters.AddWithValue("@toCoin", toCoin);
					updateCmd.Parameters.AddWithValue("@isAboveVWAP", isAboveVWAP ? 1 : 0);
					updateCmd.Parameters.AddWithValue("@vwap", vwap);

					await updateCmd.ExecuteNonQueryAsync();
					//_ = _log.Db($"VWAP updated for {pair}: vwap_24_hour = {isAboveVWAP}, vwap_24_hour_value = {vwap:F2}",
					//		   null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during VWAP for {pair} (attempt {attempt}): {ex.Message}. Retrying...",
							   null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update VWAP for {pair} after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<bool> UpdateRetracementFromHigh(MySqlConnection connection, string fromCoin, string toCoin, string coinName)
		{
			const decimal RetracementThreshold = 0.15m;   // 0.15 = 15%
			const int HighLookbackDays = 365;             // 0 = use ALL data

			var highSql = $@"	
				SELECT MAX(cv.value_usd)
				FROM coin_value AS cv FORCE INDEX (ix_coin_value_name_ts_val)
				WHERE cv.name = @coinName
					AND cv.`timestamp` >= UTC_TIMESTAMP() - INTERVAL 365 DAY;";

			const string curSql = @"
				SELECT value_usd
				FROM   coin_value
				WHERE  name = @coinName
				ORDER  BY timestamp DESC
				LIMIT  1;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					decimal priorHigh;
					decimal currentPrice;

					using (var cmdHigh = new MySqlCommand(highSql, connection))
					{
						cmdHigh.CommandTimeout = DbCommandTimeoutSeconds;
						cmdHigh.Parameters.AddWithValue("@coinName", coinName);
						if (HighLookbackDays > 0)
							cmdHigh.Parameters.AddWithValue("@Days", HighLookbackDays);

						object? resHigh = await cmdHigh.ExecuteScalarAsync();
						if (resHigh == null || resHigh == DBNull.Value)
						{
							_ = _log.Db($"No data for prior-high calc for {fromCoin}/{toCoin}", null, "TISVC", true);
							return false;
						}
						priorHigh = Convert.ToDecimal(resHigh);
					}

					using (var cmdCur = new MySqlCommand(curSql, connection))
					{
						cmdCur.CommandTimeout = DbCommandTimeoutSeconds;
						cmdCur.Parameters.AddWithValue("@coinName", coinName);
						object? resCur = await cmdCur.ExecuteScalarAsync();
						if (resCur == null || resCur == DBNull.Value)
						{
							_ = _log.Db($"No data for current-price calc for {fromCoin}/{toCoin}", null, "TISVC", true);
							return false;
						}
						currentPrice = Convert.ToDecimal(resCur);
					}

					if (priorHigh <= 0)
						return false;

					decimal retracement = (priorHigh - currentPrice) / priorHigh;
					bool withinBand = retracement <= RetracementThreshold;

					const string updateSql = @"
                        INSERT INTO trade_indicators
                            (from_coin, to_coin,
                            retracement_from_high, retracement_from_high_value, updated)
                        VALUES
                            (@from, @to, @flag, @val, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE
                            retracement_from_high       = @flag,
                            retracement_from_high_value = @val,
							high_price_value 			= @highPrice,
                            updated                     = UTC_TIMESTAMP();";

					using var upd = new MySqlCommand(updateSql, connection);
						upd.CommandTimeout = DbCommandTimeoutSeconds;
					upd.Parameters.AddWithValue("@from", fromCoin);
					upd.Parameters.AddWithValue("@to", toCoin);
					upd.Parameters.AddWithValue("@flag", withinBand ? 1 : 0);
					upd.Parameters.AddWithValue("@val", retracement);
					upd.Parameters.AddWithValue("@highPrice", priorHigh);

					await upd.ExecuteNonQueryAsync(); 

					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during Retracement for {fromCoin}/{toCoin} (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update Retracement for {fromCoin}/{toCoin} after max retries", null, "TISVC", true);
			return false;
		}
		private async Task<bool> UpdateMACD(MySqlConnection connection, string fromCoin, string toCoin, string coinName)
		{
			const int fastPeriod = 12;  // Fast EMA: 12 intervals (60 minutes)
			const int slowPeriod = 26;  // Slow EMA: 26 intervals (130 minutes)
			const int signalPeriod = 9; // Signal line: 9 intervals (45 minutes)

			// Step 1: Fetch historical prices for the last 30 hours (360 intervals of 5 minutes)
			var sql = @"
        SELECT price_date, usd_price
        FROM (
            SELECT 
                DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:00') - 
                INTERVAL (MINUTE(timestamp) % 5) MINUTE as price_date,
                AVG(value_usd) as usd_price
            FROM coin_value
            WHERE name = @coinName
            AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1800 MINUTE)
            AND timestamp < CURRENT_TIMESTAMP
            GROUP BY 
                DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:00') - 
                INTERVAL (MINUTE(timestamp) % 5) MINUTE
            ORDER BY price_date ASC
            LIMIT 360
        ) as subquery
        ORDER BY price_date ASC;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					// Fetch data
					using var cmd = new MySqlCommand(sql, connection);
					cmd.CommandTimeout = DbCommandTimeoutSeconds;
					cmd.Parameters.AddWithValue("@coinName", coinName);
					using var reader = await cmd.ExecuteReaderAsync();

					var prices = new List<decimal>();
					while (await reader.ReadAsync())
					{
						prices.Add(reader.GetDecimal("usd_price"));
					}
					await reader.CloseAsync();

					if (prices.Count < slowPeriod + signalPeriod)
					{
						_ = _log.Db($"Insufficient data for MACD calculation for {fromCoin}/{toCoin} ({prices.Count} 5-minute intervals, need at least {slowPeriod + signalPeriod})",
								   null, "TISVC", true);
						return false;
					}

					// Step 2: Calculate MACD components
					var emaFast = CalculateEMA(prices, fastPeriod);
					var emaSlow = CalculateEMA(prices, slowPeriod);
					var macdLine = emaFast.Skip(slowPeriod - fastPeriod).Select((x, i) => x - emaSlow[i]).ToList();
					var signalLine = CalculateEMA(macdLine, signalPeriod);
					decimal latestMacdLine = macdLine.Last();
					decimal latestSignalLine = signalLine.Last();
					decimal latestHistogram = latestMacdLine - latestSignalLine; // Direct calculation
					bool isBullish = latestMacdLine > latestSignalLine;

					// Step 3: Update database
					const string updateSql = @"
                INSERT INTO trade_indicators
                    (from_coin, to_coin, macd_histogram, macd_bullish, macd_line_value, macd_signal_value, updated)
                VALUES (@fromCoin, @toCoin, @histogram, @isBullish, @macdLine, @signalLine, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE
                    macd_histogram = @histogram,
                    macd_bullish = @isBullish,
                    macd_line_value = @macdLine,
                    macd_signal_value = @signalLine,
                    updated = UTC_TIMESTAMP();";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.CommandTimeout = DbCommandTimeoutSeconds;
					updateCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
					updateCmd.Parameters.AddWithValue("@toCoin", toCoin);
					updateCmd.Parameters.AddWithValue("@histogram", latestHistogram);
					updateCmd.Parameters.AddWithValue("@isBullish", isBullish ? 1 : 0);
					updateCmd.Parameters.AddWithValue("@macdLine", latestMacdLine);
					updateCmd.Parameters.AddWithValue("@signalLine", latestSignalLine);

					await updateCmd.ExecuteNonQueryAsync();

					// _ = _log.Db($"MACD (5-minute intervals) updated for {fromCoin}/{toCoin}: MACD Line={latestMacdLine:F8}, Signal Line={latestSignalLine:F8}, Histogram={latestHistogram:F8}, Bullish={isBullish}",
					// 		   null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during MACD for {fromCoin}/{toCoin} (attempt {attempt}): {ex.Message}. Retrying...",
							   null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error calculating MACD for {fromCoin}/{toCoin}: {ex.Message}", null, "TISVC", true);
					return false;
				}
			}

			_ = _log.Db($"Failed to update MACD for {fromCoin}/{toCoin} after max retries", null, "TISVC", true);
			return false;
		}

		private List<decimal> CalculateEMA(List<decimal> prices, int period)
		{
			var ema = new List<decimal>();
			decimal multiplier = 2m / (period + 1);
			decimal initialSma = prices.Take(period).Average();
			ema.Add(initialSma);

			for (int i = period; i < prices.Count; i++)
			{
				decimal currentEma = (prices[i] - ema.Last()) * multiplier + ema.Last();
				ema.Add(currentEma);
			}
			return ema;
		}
		private async Task<bool> IsPriceAboveMovingAverage(MySqlConnection connection, string coinName, decimal referencePrice)
		{
			var sql = @"
                SELECT AVG(cv.value_usd) as current_price
                FROM coin_value cv
                WHERE cv.name = @coinName
                AND cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
                AND cv.timestamp = (
                    SELECT MAX(timestamp)
                    FROM coin_value
                    WHERE name = @coinName
                    AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
                )";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					cmd.Parameters.AddWithValue("@coinName", coinName);

					var result = await cmd.ExecuteScalarAsync();

					if (result == null || result == DBNull.Value)
					{
						_ = _log.Db($"No data available for current price calculation for {coinName}", null, "TISVC", true);
						return false;
					}

					decimal currentPrice = Convert.ToDecimal(result);
					return currentPrice > referencePrice;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during price check for {coinName} (attempt {attempt}): {ex.Message}. Retrying...",
							   null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to check price for {coinName} after max retries", null, "TISVC", true);
			return false;
		}
		private async Task<bool> UpdateVolumeAbove20DayAvg(MySqlConnection connection, string pair, string fromCoin, string toCoin)
		{
			const string sql = @"
				WITH DailyVolumes AS (
					SELECT 
						DATE(timestamp) AS volume_date,
						SUM(volume_usdc) AS daily_volume
					FROM trade_market_volumes
					WHERE pair = @pair
					AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 21 DAY) -- 21 days to get 20 full days
					GROUP BY DATE(timestamp)
					ORDER BY volume_date DESC
					LIMIT 20
				),
				CurrentVolume AS (
					SELECT 
						SUM(volume_usdc) AS current_volume
					FROM trade_market_volumes
					WHERE pair = @pair
					AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)
				)
				SELECT 
					AVG(daily_volume) AS avg_20_day_volume,
					(SELECT current_volume FROM CurrentVolume) AS current_volume
				FROM DailyVolumes;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					cmd.CommandTimeout = DbCommandTimeoutSeconds;
					cmd.Parameters.AddWithValue("@pair", pair);

					using var reader = await cmd.ExecuteReaderAsync();

					if (!await reader.ReadAsync() || reader.IsDBNull(0) || reader.IsDBNull(1))
					{
						_ = _log.Db($"No data available for 20-day volume average calculation for {pair}",
								   null, "TISVC", true);
						await reader.CloseAsync();
						return false;
					}

					decimal avg20DayVolume = reader.GetDecimal(0);
					decimal currentVolume = reader.GetDecimal(1);
					await reader.CloseAsync();

					bool isAboveAverage = currentVolume > avg20DayVolume;

					const string updateSql = @"
						INSERT INTO trade_indicators
							(from_coin, to_coin, 
							volume_above_20_day_avg, volume_20_day_avg_value, current_volume_value, updated)
						VALUES (@fromCoin, @toCoin, @isAbove, @avgValue, @currentValue, UTC_TIMESTAMP())
						ON DUPLICATE KEY UPDATE
							volume_above_20_day_avg = @isAbove,
							volume_20_day_avg_value = @avgValue,
							current_volume_value = @currentValue,
							updated = UTC_TIMESTAMP();";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.CommandTimeout = DbCommandTimeoutSeconds;
					updateCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
					updateCmd.Parameters.AddWithValue("@toCoin", toCoin);
					updateCmd.Parameters.AddWithValue("@isAbove", isAboveAverage ? 1 : 0);
					updateCmd.Parameters.AddWithValue("@avgValue", avg20DayVolume);
					updateCmd.Parameters.AddWithValue("@currentValue", currentVolume);

					await updateCmd.ExecuteNonQueryAsync();

					// _ = _log.Db($"Volume indicator updated for {pair}: " +
					// 		   $"Current={currentVolume:F2}, 20-day Avg={avg20DayVolume:F2}, " +
					// 		   $"Above Avg={(isAboveAverage ? "Yes" : "No")}",
					// 		   null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during Volume20DayAvg for {pair} (attempt {attempt}): {ex.Message}. Retrying...",
							   null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db($"Failed to update Volume20DayAvg for {pair} after max retries", null, "TISVC", true);
			return false;
		}
		private async Task<bool> RecordSignalInterval(MySqlConnection connection, string fromCoin, string toCoin)
		{
			try
			{
				// Fetch latest indicator values
				var selectSql = @"
					SELECT 200_day_moving_average, 14_day_moving_average, 21_day_moving_average,
						rsi_14_day, macd_bullish, vwap_24_hour, retracement_from_high
					FROM trade_indicators
					WHERE from_coin = @fromCoin AND to_coin = @toCoin
					ORDER BY updated DESC
					LIMIT 1";

				using var selectCmd = new MySqlCommand(selectSql, connection);
				selectCmd.CommandTimeout = DbCommandTimeoutSeconds;
				selectCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
				selectCmd.Parameters.AddWithValue("@toCoin", toCoin);

				using var reader = await selectCmd.ExecuteReaderAsync();
				if (!await reader.ReadAsync())
				{
					_ = _log.Db($"No indicator data for {fromCoin}/{toCoin}", null, "TISVC", true);
					return false;
				}

				bool twoHundredDayMA = reader.GetInt32("200_day_moving_average") == 1;
				bool fourteenDayMA = reader.GetInt32("14_day_moving_average") == 1;
				bool twentyOneDayMA = reader.GetInt32("21_day_moving_average") == 1;
				decimal rsi = reader.GetDecimal("rsi_14_day");
				bool macdBullish = reader.GetInt32("macd_bullish") == 1;
				bool vwap24Hour = reader.GetInt32("vwap_24_hour") == 1;
				bool retracement = reader.GetInt32("retracement_from_high") == 0;
				await reader.CloseAsync();

				bool rsiBullish = rsi < 30 || (rsi >= 50 && rsi <= 70);
				bool hasSignal = twoHundredDayMA && fourteenDayMA && twentyOneDayMA && rsiBullish && macdBullish && vwap24Hour && retracement;

				// Check the latest signal interval
				var checkSql = @"
					SELECT end_time
					FROM signal_intervals
					WHERE from_coin = @fromCoin AND to_coin = @toCoin
					ORDER BY start_time DESC
					LIMIT 1";

				using var checkCmd = new MySqlCommand(checkSql, connection);
				checkCmd.CommandTimeout = DbCommandTimeoutSeconds;
				checkCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
				checkCmd.Parameters.AddWithValue("@toCoin", toCoin);

				using var checkReader = await checkCmd.ExecuteReaderAsync();
				bool hasActiveInterval = false;
				DateTime? endTime = null;
				if (await checkReader.ReadAsync())
				{
					if (!checkReader.IsDBNull(0)) // Check if end_time is not NULL
					{
						endTime = checkReader.GetDateTime(0);
					}
					hasActiveInterval = !endTime.HasValue; // True if end_time is NULL
				}
				await checkReader.CloseAsync();

				if (hasSignal)
				{
					if (!hasActiveInterval)
					{
						// Insert new interval
						var insertSql = @"
							INSERT INTO signal_intervals (from_coin, to_coin, start_time, created_at)
							VALUES (@fromCoin, @toCoin, UTC_TIMESTAMP(), UTC_TIMESTAMP())";

						using var insertCmd = new MySqlCommand(insertSql, connection);
						insertCmd.CommandTimeout = DbCommandTimeoutSeconds;
						insertCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
						insertCmd.Parameters.AddWithValue("@toCoin", toCoin);
						await insertCmd.ExecuteNonQueryAsync();
						_ = _log.Db($"Started new signal interval for {fromCoin}/{toCoin}", null, "TISVC", true);
						return true;
					}
					else
					{
						// Interval is already active, do nothing
						_ = _log.Db($"Signal interval currently active. No update necessary. {fromCoin}/{toCoin}", null, "TISVC", true);
						return true;
					}
				}
				else if (hasActiveInterval)
				{
					// Close the active interval
					var updateSql = @"
						UPDATE signal_intervals
						SET end_time = UTC_TIMESTAMP()
						WHERE from_coin = @fromCoin AND to_coin = @toCoin AND end_time IS NULL";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.CommandTimeout = DbCommandTimeoutSeconds;
					updateCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
					updateCmd.Parameters.AddWithValue("@toCoin", toCoin);
					int rowsAffected = await updateCmd.ExecuteNonQueryAsync();
					if (rowsAffected > 0)
					{
						_ = _log.Db($"Closed signal interval for {fromCoin}/{toCoin}", null, "TISVC", true);
					}
					else
					{
						//_ = _log.Db($"No open signal interval found to close for {fromCoin}/{toCoin}", null, "TISVC", true);
					}
					return true;
				}
				else
				{
					//_ = _log.Db($"No signal and no active interval for {fromCoin}/{toCoin}. No action taken.", null, "TISVC", true);
					return true;
				}
			}
			catch (MySqlException ex)
			{
				_ = _log.Db($"Error recording signal interval for {fromCoin}/{toCoin}: {ex.Message}", null, "TISVC", true);
				return false;
			}
		}
		private async Task<bool> UpdateCoinMonthlyPerformance(MySqlConnection connection, string coinName)
		{
			var currentDate = DateTime.UtcNow;

			// Only process previous months (not current month)
			var processingDate = currentDate.AddMonths(-1);
			var processingYear = processingDate.Year;
			var processingMonth = processingDate.Month;

			// Check if we've already processed this month for this coin
			var checkSql = @"
                SELECT 1 FROM coin_monthly_performance 
                WHERE coin = @coinName AND year = @year AND month = @month
                LIMIT 1;";

			using (var checkCmd = new MySqlCommand(checkSql, connection))
			{
				checkCmd.CommandTimeout = 60; // Increase timeout as safety net
				checkCmd.Parameters.AddWithValue("@coinName", coinName);
				checkCmd.Parameters.AddWithValue("@year", processingYear);
				checkCmd.Parameters.AddWithValue("@month", processingMonth);

				var result = await checkCmd.ExecuteScalarAsync();
				if (result != null)
				{
					return true; // Already processed
				}
			}

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					// Get price data - use full month range
					var startDate = new DateTime(processingYear, processingMonth, 1);
					var endDate = new DateTime(processingYear, processingMonth, DateTime.DaysInMonth(processingYear, processingMonth), 23, 59, 59);

					// Get first day price
					var (startPrice, endPrice) = await GetMonthlyPriceData(connection, coinName, startDate, endDate);
					var (startCap, endCap) = await GetMonthlyMarketCapData(connection, coinName, startDate, endDate);

					if (startPrice == 0 || endPrice == 0)
					{
						_ = _log.Db($"Incomplete price data for {coinName} monthly performance {processingMonth}/{processingYear}",
								   null, "TISVC", true);
						return false;
					}

					// Calculate percentages
					decimal priceChangePct = ((endPrice - startPrice) / startPrice) * 100;
					decimal marketCapChangePct = (startCap > 0 && endCap > 0) ?
						((endCap - startCap) / startCap) * 100 : 0;

					// Insert or update the record
					var updateSql = @"
                        INSERT INTO coin_monthly_performance 
                            (coin, year, month, 
                            start_price_usd, end_price_usd,
                            start_market_cap_usd, end_market_cap_usd,
                            price_change_percentage, market_cap_change_percentage, 
                            last_updated)
                        VALUES (@coinName, @year, @month, 
                                @startPrice, @endPrice,
                                @startCap, @endCap,
                                @priceChangePct, @marketCapChangePct, 
                                UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE 
                            start_price_usd = @startPrice,
                            end_price_usd = @endPrice,
                            start_market_cap_usd = @startCap,
                            end_market_cap_usd = @endCap,
                            price_change_percentage = @priceChangePct,
                            market_cap_change_percentage = @marketCapChangePct,
                            last_updated = UTC_TIMESTAMP()";

					using (var updateCmd = new MySqlCommand(updateSql, connection))
					{
						updateCmd.CommandTimeout = 60; // Increase timeout as safety net
						updateCmd.Parameters.AddWithValue("@coinName", coinName);
						updateCmd.Parameters.AddWithValue("@year", processingYear);
						updateCmd.Parameters.AddWithValue("@month", processingMonth);
						updateCmd.Parameters.AddWithValue("@startPrice", startPrice);
						updateCmd.Parameters.AddWithValue("@endPrice", endPrice);
						updateCmd.Parameters.AddWithValue("@startCap", startCap);
						updateCmd.Parameters.AddWithValue("@endCap", endCap);
						updateCmd.Parameters.AddWithValue("@priceChangePct", priceChangePct);
						updateCmd.Parameters.AddWithValue("@marketCapChangePct", marketCapChangePct);

						await updateCmd.ExecuteNonQueryAsync();
					}

					_ = _log.Db($"Updated {coinName} monthly performance for {processingMonth}/{processingYear}: " +
							   $"Price {startPrice:F2}→{endPrice:F2} ({priceChangePct:F2}%), " +
							   $"Market Cap {(startCap > 0 ? startCap.ToString("F2") : "N/A")}→" +
							   $"{(endCap > 0 ? endCap.ToString("F2") : "N/A")} " +
							   $"({(startCap > 0 && endCap > 0 ? marketCapChangePct.ToString("F2") : "N/A")}%)",
							   null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during monthly performance for {coinName} (attempt {attempt}): {ex.Message}. Retrying...",
							   null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error updating {coinName} monthly performance: {ex.Message}", null, "TISVC", true);
					return false;
				}
			}

			_ = _log.Db($"Failed to update monthly performance for {coinName} after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<(decimal startPrice, decimal endPrice)> GetMonthlyPriceData(MySqlConnection connection, string coinName, DateTime startDate, DateTime endDate)
		{
			decimal startPrice = 0, endPrice = 0;

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{ 
					var firstDaySql = @"
						SELECT value_usd FROM coin_value 
						WHERE name = @coinName 
						AND timestamp BETWEEN @startDate AND @startDateEnd
						ORDER BY timestamp ASC LIMIT 1";
 
					var lastDaySql = @"
						SELECT value_usd FROM coin_value 
						WHERE name = @coinName 
						AND timestamp BETWEEN @endDateStart AND @endDate
						ORDER BY timestamp DESC LIMIT 1";
 
					var startDateEnd = startDate.AddDays(1).AddSeconds(-1); // End of first day
					var endDateStart = endDate.AddDays(-1); // Start of last day

					using (var firstDayCmd = new MySqlCommand(firstDaySql, connection))
					{
						firstDayCmd.CommandTimeout = 60; // Increase timeout as safety net
						firstDayCmd.Parameters.AddWithValue("@coinName", coinName);
						firstDayCmd.Parameters.AddWithValue("@startDate", startDate);
						firstDayCmd.Parameters.AddWithValue("@startDateEnd", startDateEnd);
						var result = await firstDayCmd.ExecuteScalarAsync();
						if (result != null && result != DBNull.Value)
							startPrice = Convert.ToDecimal(result);
					}

					using (var lastDayCmd = new MySqlCommand(lastDaySql, connection))
					{
						lastDayCmd.CommandTimeout = 60; // Increase timeout as safety net
						lastDayCmd.Parameters.AddWithValue("@coinName", coinName);
						lastDayCmd.Parameters.AddWithValue("@endDateStart", endDateStart);
						lastDayCmd.Parameters.AddWithValue("@endDate", endDate);
						var result = await lastDayCmd.ExecuteScalarAsync();
						if (result != null && result != DBNull.Value)
							endPrice = Convert.ToDecimal(result);
					}

					return (startPrice, endPrice);
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during GetMonthlyPriceData for {coinName} (attempt {attempt}): {ex.Message}. Retrying...", null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error in GetMonthlyPriceData for {coinName}: {ex.Message}", null, "TISVC", true);
					return (0, 0);
				}
			}

			_ = _log.Db($"Failed GetMonthlyPriceData for {coinName} after max retries", null, "TISVC", true);
			return (0, 0);
		}

		private async Task<(decimal startCap, decimal endCap)> GetMonthlyMarketCapData(MySqlConnection connection, string coinName, DateTime startDate, DateTime endDate)
		{
			decimal startCap = 0, endCap = 0;

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{ 
					var firstDaySql = @"
						SELECT market_cap_usd FROM coin_market_caps 
						WHERE name = @coinName 
						AND recorded_at BETWEEN @startDate AND @startDateEnd
						ORDER BY recorded_at ASC LIMIT 1";
 
					var lastDaySql = @"
						SELECT market_cap_usd FROM coin_market_caps 
						WHERE name = @coinName 
						AND recorded_at BETWEEN @endDateStart AND @endDate
						ORDER BY recorded_at DESC LIMIT 1";
 
					var startDateEnd = startDate.AddDays(1).AddSeconds(-1); // End of first day
					var endDateStart = endDate.AddDays(-1); // Start of last day

					using (var firstDayCmd = new MySqlCommand(firstDaySql, connection))
					{
						firstDayCmd.CommandTimeout = 60; // Increase timeout as safety net
						firstDayCmd.Parameters.AddWithValue("@coinName", coinName);
						firstDayCmd.Parameters.AddWithValue("@startDate", startDate);
						firstDayCmd.Parameters.AddWithValue("@startDateEnd", startDateEnd);
						var result = await firstDayCmd.ExecuteScalarAsync();
						if (result != null && result != DBNull.Value)
							startCap = Convert.ToDecimal(result);
					}

					using (var lastDayCmd = new MySqlCommand(lastDaySql, connection))
					{
						lastDayCmd.CommandTimeout = 60; // Increase timeout as safety net
						lastDayCmd.Parameters.AddWithValue("@coinName", coinName);
						lastDayCmd.Parameters.AddWithValue("@endDateStart", endDateStart);
						lastDayCmd.Parameters.AddWithValue("@endDate", endDate);
						var result = await lastDayCmd.ExecuteScalarAsync();
						if (result != null && result != DBNull.Value)
							endCap = Convert.ToDecimal(result);
					}

					return (startCap, endCap);
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during GetMonthlyMarketCapData for {coinName} (attempt {attempt}): {ex.Message}. Retrying...", null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Error in GetMonthlyMarketCapData for {coinName}: {ex.Message}", null, "TISVC", true);
					return (0, 0);
				}
			}

			_ = _log.Db($"Failed GetMonthlyMarketCapData for {coinName} after max retries", null, "TISVC", true);
			return (0, 0);
		}

		private string GetCoinNameFromPair(string pair)
		{
			foreach (var coin in _coinPairs)
			{
				if (coin.pair == pair)
					return coin.coinName;
			}
			return string.Empty;
		}
	}
}