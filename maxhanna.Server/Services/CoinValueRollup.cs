using MySqlConnector;

namespace maxhanna.Server.Services
{
  /// <summary>
  /// Builds and maintains pre-aggregated coin_value rollup tables so long-range
  /// graph queries (1 week+) read a few thousand rows instead of scanning the
  /// huge raw coin_value table (which grows unbounded at fine granularity).
  ///
  /// Two tables, both keyed by (name, bucket-start):
  ///  - coin_value_1h — one row per coin per hour (AVG of value_cad/value_usd).
  ///  - coin_value_1d — one row per coin per day, derived from coin_value_1h.
  ///
  /// Aggregation is idempotent (ON DUPLICATE KEY UPDATE), so a day can be
  /// safely re-aggregated as its raw rows grow.
  /// </summary>
  public static class CoinValueRollup
  { 

    /// Aggregates one UTC day of raw coin_value rows into coin_value_1h, then
    /// derives that day's coin_value_1d rows from the hourly rollup. Idempotent.
    /// Returns the number of hourly rollup rows written.
    public static async Task<int> AggregateDayAsync(MySqlConnection conn, DateTime dayStartUtc)
    {
      DateTime dayEndUtc = dayStartUtc.Date.AddDays(1);
      int rows = 0;
      await using (var cmd = new MySqlCommand(@"
        INSERT INTO maxhanna.coin_value_1h (name, symbol, ts_hour, min_id, avg_cad, avg_usd, row_count)
        SELECT name, MAX(symbol),
               FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(`timestamp`) / 3600) * 3600),
               MIN(id), AVG(value_cad), AVG(value_usd), COUNT(*)
        FROM maxhanna.coin_value
        WHERE `timestamp` >= @DayStart AND `timestamp` < @DayEnd
        GROUP BY name, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(`timestamp`) / 3600) * 3600)
        ON DUPLICATE KEY UPDATE
          symbol = VALUES(symbol), min_id = VALUES(min_id),
          avg_cad = VALUES(avg_cad), avg_usd = VALUES(avg_usd),
          row_count = VALUES(row_count);", conn))
      {
        cmd.Parameters.AddWithValue("@DayStart", dayStartUtc);
        cmd.Parameters.AddWithValue("@DayEnd", dayEndUtc);
        cmd.CommandTimeout = 300;
        rows = await cmd.ExecuteNonQueryAsync();
      }
      await using (var cmd = new MySqlCommand(@"
        INSERT INTO maxhanna.coin_value_1d (name, symbol, ts_day, min_id, avg_cad, avg_usd, row_count)
        SELECT name, MAX(symbol),
               FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(ts_hour) / 86400) * 86400),
               MIN(min_id), AVG(avg_cad), AVG(avg_usd), SUM(row_count)
        FROM maxhanna.coin_value_1h
        WHERE ts_hour >= @DayStart AND ts_hour < @DayEnd
        GROUP BY name, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(ts_hour) / 86400) * 86400)
        ON DUPLICATE KEY UPDATE
          symbol = VALUES(symbol), min_id = VALUES(min_id),
          avg_cad = VALUES(avg_cad), avg_usd = VALUES(avg_usd),
          row_count = VALUES(row_count);", conn))
      {
        cmd.Parameters.AddWithValue("@DayStart", dayStartUtc);
        cmd.Parameters.AddWithValue("@DayEnd", dayEndUtc);
        cmd.CommandTimeout = 300;
        await cmd.ExecuteNonQueryAsync();
      }
      return rows;
    }

     

    /// Aggregates one UTC day of exchange_rates rows into exchange_rates_1h,
    /// then derives that day's exchange_rates_1d. Idempotent.
    public static async Task<int> AggregateExchangeRateDayAsync(MySqlConnection conn, DateTime dayStartUtc)
    {
      DateTime dayEndUtc = dayStartUtc.Date.AddDays(1);
      int rows = 0;
      await using (var cmd = new MySqlCommand(@"
        INSERT INTO maxhanna.exchange_rates_1h (base_currency, target_currency, ts_hour, min_id, avg_rate, row_count)
        SELECT base_currency, target_currency,
               FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(`timestamp`) / 3600) * 3600),
               MIN(id), AVG(rate), COUNT(*)
        FROM maxhanna.exchange_rates
        WHERE `timestamp` >= @DayStart AND `timestamp` < @DayEnd
        GROUP BY base_currency, target_currency, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(`timestamp`) / 3600) * 3600)
        ON DUPLICATE KEY UPDATE
          min_id = VALUES(min_id), avg_rate = VALUES(avg_rate), row_count = VALUES(row_count);", conn))
      {
        cmd.Parameters.AddWithValue("@DayStart", dayStartUtc);
        cmd.Parameters.AddWithValue("@DayEnd", dayEndUtc);
        cmd.CommandTimeout = 300;
        rows = await cmd.ExecuteNonQueryAsync();
      }
      await using (var cmd = new MySqlCommand(@"
        INSERT INTO maxhanna.exchange_rates_1d (base_currency, target_currency, ts_day, min_id, avg_rate, row_count)
        SELECT base_currency, target_currency,
               FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(ts_hour) / 86400) * 86400),
               MIN(min_id), AVG(avg_rate), SUM(row_count)
        FROM maxhanna.exchange_rates_1h
        WHERE ts_hour >= @DayStart AND ts_hour < @DayEnd
        GROUP BY base_currency, target_currency, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(ts_hour) / 86400) * 86400)
        ON DUPLICATE KEY UPDATE
          min_id = VALUES(min_id), avg_rate = VALUES(avg_rate), row_count = VALUES(row_count);", conn))
      {
        cmd.Parameters.AddWithValue("@DayStart", dayStartUtc);
        cmd.Parameters.AddWithValue("@DayEnd", dayEndUtc);
        cmd.CommandTimeout = 300;
        await cmd.ExecuteNonQueryAsync();
      }
      return rows;
    }
  }
}
