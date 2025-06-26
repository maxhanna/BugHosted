using MySqlConnector;

namespace maxhanna.Server.Services
{
	public class TradeIndicatorService
	{
		private readonly string _connectionString;
		private readonly IConfiguration _config;
		private readonly Log _log;
		private const int MaxRetries = 3;
		private const int RetryDelayMs = 1000;

		public TradeIndicatorService(IConfiguration config, Log log)
		{
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;
			_log = log;
		}

		public async Task<bool> UpdateIndicators()
		{
			try
			{
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				if (!await CanUpdateIndicators(connection))
				{
					return true;
				}
				bool success = true;
				success &= await UpdateXBTUSDC200DMA(connection);
				success &= await UpdateXBTUSDC14DMA(connection);
				success &= await UpdateXBTUSDC21DMA(connection);
				success &= await UpdateXBTUSDCRSI(connection);
				success &= await UpdateXBTUSDCVWAP(connection);
				success &= await UpdateXBTUSDCRetracementFromHigh(connection);
				_ = _log.Db("Trade indicators updated successfully.", null, "TISVC", outputToConsole: true);
				return success;
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
		}
		private async Task<bool> UpdateXBTUSDCRetracementFromHigh(MySqlConnection connection)
		{
			// 15 % below the high ⇒ flag still “close”
			const decimal RetracementThreshold = 0.15m;   // 0.15 = 15 %

			// How far back we search for “prior high” (all‑time = comment this out)
			const int HighLookbackDays = 365;             // 0 = use ALL data
														  // 1. Highest daily close in look‑back window
			var highSql = $@"
				SELECT MAX(daily_price) FROM (
					SELECT DATE(timestamp) AS d,
						AVG(value_usd)  AS daily_price
					FROM   coin_value
					WHERE  name       = 'Bitcoin'
					{(HighLookbackDays > 0
									? "AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL @Days DAY)"
									: string.Empty)}
					GROUP  BY DATE(timestamp)
				) t;";

			// 2. Latest price (same query used in IsPriceAboveMovingAverage)
			const string curSql = @"
				SELECT AVG(value_usd)
				FROM   coin_value
				WHERE  name = 'Bitcoin'
				AND  timestamp = (
						SELECT MAX(timestamp)
						FROM   coin_value
						WHERE  name = 'Bitcoin'
					);";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					decimal priorHigh;
					decimal currentPrice;

					// -- prior high
					using (var cmdHigh = new MySqlCommand(highSql, connection))
					{
						if (HighLookbackDays > 0)
							cmdHigh.Parameters.AddWithValue("@Days", HighLookbackDays);

						object? resHigh = await cmdHigh.ExecuteScalarAsync();
						if (resHigh == null || resHigh == DBNull.Value)
						{
							_ = _log.Db("No data for prior‑high calc", null, "TISVC", true);
							return false;
						}
						priorHigh = Convert.ToDecimal(resHigh);
					}

					// -- current price
					using (var cmdCur = new MySqlCommand(curSql, connection))
					{
						object? resCur = await cmdCur.ExecuteScalarAsync();
						if (resCur == null || resCur == DBNull.Value)
						{
							_ = _log.Db("No data for current‑price calc", null, "TISVC", true);
							return false;
						}
						currentPrice = Convert.ToDecimal(resCur);
					}

					if (priorHigh <= 0)   // should never happen but be safe
						return false;

					decimal retracement = (priorHigh - currentPrice) / priorHigh; // e.g. 0.27 =‑27 %
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
							updated                     = UTC_TIMESTAMP();";

					using var upd = new MySqlCommand(updateSql, connection);
					upd.Parameters.AddWithValue("@from", "XBT");
					upd.Parameters.AddWithValue("@to", "USDC");
					upd.Parameters.AddWithValue("@flag", withinBand ? 1 : 0);
					upd.Parameters.AddWithValue("@val", retracement);

					await upd.ExecuteNonQueryAsync();

					_ = _log.Db(
						$"Retracement updated: −{retracement:P2} " +
						$"({(withinBand ? "within" : "outside")} {RetracementThreshold:P0} band)",
						null, "TISVC", true);

					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during Retracement (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update Retracement after max retries", null, "TISVC", true);
			return false;
		}
		private async Task<bool> CanUpdateIndicators(MySqlConnection connection)
		{
			var sql = @"
                SELECT updated
                FROM trade_indicators
                WHERE from_coin = 'XBT' AND to_coin = 'USDC'
                AND updated >= UTC_TIMESTAMP() - INTERVAL 5 MINUTE";

			using var cmd = new MySqlCommand(sql, connection);
			var result = await cmd.ExecuteScalarAsync();

			if (result != null && result != DBNull.Value)
			{
				_ = _log.Db("Trade indicators for XBT/USDC updated within last 5 minutes, skipping update", null, "TISVC", outputToConsole: true);
				return false;
			}
			return true;
		}

		private async Task<bool> UpdateXBTUSDC200DMA(MySqlConnection connection)
		{
			const string sql = @"
				SELECT AVG(daily_usd_price) AS moving_average
				FROM (
					SELECT  DATE(cv.timestamp)          AS price_date,
							AVG(cv.value_usd)           AS daily_usd_price
					FROM    coin_value cv
					WHERE   cv.name      = 'Bitcoin'
					AND   cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 200 DAY)
					GROUP BY DATE(cv.timestamp)
				) daily_prices;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					object? result = await cmd.ExecuteScalarAsync();

					if (result is null or DBNull)
					{
						_ = _log.Db("No data for 200-DMA calc", null, "TISVC", true);
						return false;
					}

					decimal maValue = Convert.ToDecimal(result);   // the numeric 200‑DMA
					bool isAboveMovingAvg = await IsPriceAboveMovingAverage(connection, maValue);

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
					upd.Parameters.AddWithValue("@from", "XBT");
					upd.Parameters.AddWithValue("@to", "USDC");
					upd.Parameters.AddWithValue("@flag", isAboveMovingAvg ? 1 : 0);
					upd.Parameters.AddWithValue("@val", maValue);

					await upd.ExecuteNonQueryAsync();

					_ = _log.Db($"200-DMA flag={isAboveMovingAvg}, value={maValue:F2}", null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 200-DMA (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update 200-DMA after max retries", null, "TISVC", true);
			return false;
		}


		private async Task<bool> UpdateXBTUSDC14DMA(MySqlConnection connection)
		{
			const string sql = @"
				SELECT AVG(daily_usd_price) AS moving_average
				FROM (
					SELECT  DATE(cv.timestamp)          AS price_date,
							AVG(cv.value_usd)           AS daily_usd_price
					FROM    coin_value cv
					WHERE   cv.name      = 'Bitcoin'
					AND   cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 14 DAY)
					GROUP BY DATE(cv.timestamp)
				) daily_prices;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					object? result = await cmd.ExecuteScalarAsync();

					if (result is null or DBNull)
					{
						_ = _log.Db("No data for 14 day MA calc", null, "TISVC", true);
						return false;
					}

					decimal maValue = Convert.ToDecimal(result);   // the numeric 200‑DMA
					bool isAboveMovingAvg = await IsPriceAboveMovingAverage(connection, maValue);

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
					upd.Parameters.AddWithValue("@from", "XBT");
					upd.Parameters.AddWithValue("@to", "USDC");
					upd.Parameters.AddWithValue("@flag", isAboveMovingAvg ? 1 : 0);
					upd.Parameters.AddWithValue("@val", maValue);

					await upd.ExecuteNonQueryAsync();

					_ = _log.Db($"14-DMA flag={isAboveMovingAvg}, value={maValue:F2}", null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 14-DMA (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update 14-DMA after max retries", null, "TISVC", true);
			return false;
		}


		private async Task<bool> UpdateXBTUSDC21DMA(MySqlConnection connection)
		{
			const string sql = @"
				SELECT AVG(daily_usd_price) AS moving_average
				FROM (
					SELECT  DATE(cv.timestamp)          AS price_date,
							AVG(cv.value_usd)           AS daily_usd_price
					FROM    coin_value cv
					WHERE   cv.name      = 'Bitcoin'
					AND   cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 21 DAY)
					GROUP BY DATE(cv.timestamp)
				) daily_prices;";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					object? result = await cmd.ExecuteScalarAsync();

					if (result is null or DBNull)
					{
						_ = _log.Db("No data for 21 day MA calc", null, "TISVC", true);
						return false;
					}

					decimal maValue = Convert.ToDecimal(result);   // the numeric 200‑DMA
					bool isAboveMovingAvg = await IsPriceAboveMovingAverage(connection, maValue);

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
					upd.Parameters.AddWithValue("@from", "XBT");
					upd.Parameters.AddWithValue("@to", "USDC");
					upd.Parameters.AddWithValue("@flag", isAboveMovingAvg ? 1 : 0);
					upd.Parameters.AddWithValue("@val", maValue);

					await upd.ExecuteNonQueryAsync();

					_ = _log.Db($"21-DMA flag={isAboveMovingAvg}, value={maValue:F2}", null, "TISVC", true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 21-DMA (attempt {attempt}): {ex.Message}. Retrying…",
								 null, "TISVC", true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update 21-DMA after max retries", null, "TISVC", true);
			return false;
		}

		private async Task<bool> UpdateXBTUSDCRSI(MySqlConnection connection)
		{
			var sql = @"
                WITH DailyPrices AS (
                    SELECT 
                        DATE(cv.timestamp) as price_date,
                        AVG(cv.value_usd) as usd_price
                    FROM coin_value cv
                    WHERE cv.name = 'Bitcoin'
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
					using var reader = await cmd.ExecuteReaderAsync();

					if (!await reader.ReadAsync() || reader.IsDBNull(0) || reader.IsDBNull(1))
					{
						_ = _log.Db("Insufficient data for RSI calculation", null, "TISVC", outputToConsole: true);
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
                        updated = UTC_TIMESTAMP;";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.Parameters.AddWithValue("@fromCoin", "XBT");
					updateCmd.Parameters.AddWithValue("@toCoin", "USDC");
					updateCmd.Parameters.AddWithValue("@rsi", rsi);

					await updateCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"RSI updated for XBT/USDC: rsi_14_day = {rsi:F2}", null, "TISVC", outputToConsole: true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt <= MaxRetries)
				{
					_ = _log.Db($"Lost connection during RSI (attempt {attempt}): {ex.Message}. Retrying...", null, "TISVC", outputToConsole: true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update RSI after max retries", null, "TISVC", outputToConsole: true);
			return false;
		}

		private async Task<bool> UpdateXBTUSDCVWAP(MySqlConnection connection)
		{
			var sql = @"
				SELECT 
					SUM(volume_usdc * (volume_usdc / volume_coin)) / SUM(volume_usdc) as vwap_usd
				FROM trade_market_volumes
				WHERE pair = 'XBTUSDC'
				AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 24 HOUR)";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					var result = await cmd.ExecuteScalarAsync();

					if (result == null || result == DBNull.Value)
					{
						_ = _log.Db("No data available for VWAP calculation", null, "TISVC", outputToConsole: true);
						return false;
					}

					decimal vwap = Convert.ToDecimal(result);
					bool isAboveVWAP = await IsPriceAboveMovingAverage(connection, vwap);

					var updateSql = @"
						INSERT INTO trade_indicators (from_coin, to_coin, vwap_24_hour, vwap_24_hour_value, updated)
						VALUES (@fromCoin, @toCoin, @isAboveVWAP, @vwap, UTC_TIMESTAMP())
						ON DUPLICATE KEY UPDATE 
						vwap_24_hour = @isAboveVWAP,
						vwap_24_hour_value = @vwap,
						updated = UTC_TIMESTAMP;";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.Parameters.AddWithValue("@fromCoin", "XBT");
					updateCmd.Parameters.AddWithValue("@toCoin", "USDC");
					updateCmd.Parameters.AddWithValue("@isAboveVWAP", isAboveVWAP ? 1 : 0);
					updateCmd.Parameters.AddWithValue("@vwap", vwap);

					await updateCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"VWAP updated for XBT/USDC: vwap_24_hour = {isAboveVWAP}, vwap_24_hour_value = {vwap:F2}", null, "TISVC", outputToConsole: true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during VWAP (attempt {attempt}): {ex.Message}. Retrying...", null, "TISVC", outputToConsole: true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update VWAP after max retries", null, "TISVC", outputToConsole: true);
			return false;
		}

		private async Task<bool> IsPriceAboveMovingAverage(MySqlConnection connection, decimal referencePrice)
		{
			var sql = @"
                SELECT AVG(cv.value_usd) as current_price
                FROM coin_value cv
                WHERE cv.name = 'Bitcoin'
                AND cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
                AND cv.timestamp = (
                    SELECT MAX(timestamp)
                    FROM coin_value
                    WHERE name = 'Bitcoin'
                    AND timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)
                )";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					var result = await cmd.ExecuteScalarAsync();

					if (result == null || result == DBNull.Value)
					{
						_ = _log.Db("No data available for current price calculation", null, "TISVC", outputToConsole: true);
						return false;
					}

					decimal currentPrice = Convert.ToDecimal(result);
					return currentPrice > referencePrice;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during price check (attempt {attempt}): {ex.Message}. Retrying...", null, "TISVC", outputToConsole: true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to check price after max retries", null, "TISVC", outputToConsole: true);
			return false;
		}
	}
}