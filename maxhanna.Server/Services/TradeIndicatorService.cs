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
				success &= await UpdateXBTUSDCRSI(connection);
				success &= await UpdateXBTUSDCVWAP(connection);
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
			var sql = @"
                SELECT AVG(daily_usd_price) as moving_average
                FROM (
                    SELECT 
                        DATE(cv.timestamp) as price_date,
                        AVG(cv.value_usd) as daily_usd_price
                    FROM coin_value cv
                    WHERE cv.name = 'Bitcoin'
                    AND cv.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 200 DAY)
                    GROUP BY DATE(cv.timestamp)
                ) daily_prices";

			for (int attempt = 1; attempt <= MaxRetries; attempt++)
			{
				try
				{
					using var cmd = new MySqlCommand(sql, connection);
					var result = await cmd.ExecuteScalarAsync();

					if (result == null || result == DBNull.Value)
					{
						_ = _log.Db("No data available for 200-day moving average calculation", null, "TISVC", outputToConsole: true);
						return false;
					}

					decimal movingAverage = Convert.ToDecimal(result);
					bool isAboveMovingAverage = await IsPriceAboveMovingAverage(connection, movingAverage);

					var updateSql = @"
                        INSERT INTO trade_indicators (from_coin, to_coin, 200_day_moving_average, updated)
                        VALUES (@fromCoin, @toCoin, @movingAverage, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE 
                        200_day_moving_average = @movingAverage,
                        updated = UTC_TIMESTAMP();";

					using var updateCmd = new MySqlCommand(updateSql, connection);
					updateCmd.Parameters.AddWithValue("@fromCoin", "XBT");
					updateCmd.Parameters.AddWithValue("@toCoin", "USDC");
					updateCmd.Parameters.AddWithValue("@movingAverage", isAboveMovingAverage ? 1 : 0);

					await updateCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"Updated trade indicators for XBT/USDC: 200_day_moving_average = {isAboveMovingAverage}", null, "TISVC", outputToConsole: true);
					return true;
				}
				catch (MySqlException ex) when (ex.Number == 2013 && attempt < MaxRetries)
				{
					_ = _log.Db($"Lost connection during 200DMA (attempt {attempt}): {ex.Message}. Retrying...", null, "TISVC", outputToConsole: true);
					await Task.Delay(RetryDelayMs);
				}
			}

			_ = _log.Db("Failed to update 200DMA after max retries", null, "TISVC", outputToConsole: true);
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