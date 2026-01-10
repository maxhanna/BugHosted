using System.Data;
using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class CoinValueController : ControllerBase
  {
    private Log _log;
    private readonly IConfiguration _config;
    private const int TRUNCATE_WEEK = 900; // 15 minutes for > 1 day and <= 1 week
    private const int TRUNCATE_MONTH = 3600; // 1 hour for > 1 week and <= 1 month
    private const int TRUNCATE_YEAR = 14400; // 4 hours for > 1 month and <= 1 year
    private const int TRUNCATE_LONG_TERM = 86400; // 1 day for > 1 year
    private const double HOURS_IN_WEEK = 168; // 7 days * 24 hours
    private const double HOURS_IN_MONTH = 720; // 30 days * 24 hours
    private const double HOURS_IN_YEAR = 8760; // 365 days * 24 hours
    private static readonly Dictionary<string, string> CoinNameMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { { "BTC", "Bitcoin" }, { "XBT", "Bitcoin" }, { "ETH", "Ethereum" }, { "XDG", "Dogecoin" }, { "SOL", "Solana" } };

    private static readonly HashSet<string> AllowedWalletTypes =
    new HashSet<string>(
        KrakenService.CoinMappingsForDB.Values
            .Select(v => v.ToLowerInvariant())
            .Distinct(),
        StringComparer.OrdinalIgnoreCase
    );

    public CoinValueController(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
    }

    [HttpPost("/CoinValue/GetWalletBalanceData", Name = "GetWalletBalanceData")]
    public async Task<List<CoinValue>> GetWalletBalanceData([FromBody] GetWalletDataRequest req)
    {
      var coinValues = new List<CoinValue>();

      MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();

        string currency = req.Currency.ToLower();
        if (currency == "xbt") { currency = "btc"; }

        string sql = $@"
					SELECT 
							wi.id AS wallet_id,
							wi.{currency}_address,
							wb.balance, 
							wb.fetched_at
					FROM user_{currency}_wallet_info wi
					LEFT JOIN user_{currency}_wallet_balance wb 
							ON wi.id = wb.wallet_id
					WHERE wi.{currency}_address = @WalletAddress";
        MySqlCommand cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@WalletAddress", req.WalletAddress);

        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            var coinValue = new CoinValue
            {
              Id = reader.GetInt32(reader.GetOrdinal("wallet_id")),
              Name = req.Currency,
              ValueCAD = reader.IsDBNull(reader.GetOrdinal("balance")) ? 0 : reader.GetDecimal(reader.GetOrdinal("balance")),
              Timestamp = reader.GetDateTime(reader.GetOrdinal("fetched_at"))
            };
            coinValues.Add(coinValue);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to GetWalletBalanceData. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return coinValues;
    }

    [HttpPost("/CoinValue/GetAllForGraph", Name = "GetAllCoinValuesForGraph")]
    public async Task<List<CoinValue>> GetAllCoinValuesForGraph([FromBody] GraphRangeRequest request)
    {
      var coinValues = new List<CoinValue>();
      MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      if (request.From == null) { request.From = new DateTime(); }

      try
      {
        await conn.OpenAsync();

        var actualFrom = request.From.Value.AddHours(-1 * (request.HourRange ?? 24));
        var actualTo = request.From.Value.AddHours(request.HourRange ?? 24);
        double hourRange = request.HourRange ?? 24;
        string sql;

        if (hourRange > HOURS_IN_YEAR) // More than one year
        {
          sql = @$"
						SELECT 
							MIN(id) as id, 
							symbol, 
							name, 
							AVG(value_cad) as value_cad, 
							AVG(value_usd) as value_usd, 
							FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_LONG_TERM}) * {TRUNCATE_LONG_TERM}) as timestamp
						FROM coin_value
						WHERE timestamp >= @From 
						AND timestamp <= @To
						{(request.Currency != null ? " AND name = @Name " : "")}
						GROUP BY symbol, name, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_LONG_TERM}) * {TRUNCATE_LONG_TERM})
						ORDER BY timestamp ASC;";
        }
        else if (hourRange > HOURS_IN_MONTH) // More than one month but less than or equal to one year
        {
          sql = @$"
						SELECT 
							MIN(id) as id, 
							symbol, 
							name, 
							AVG(value_cad) as value_cad, 
							AVG(value_usd) as value_usd, 
							FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_YEAR}) * {TRUNCATE_YEAR}) as timestamp
						FROM coin_value
						WHERE timestamp >= @From 
						AND timestamp <= @To
						{(request.Currency != null ? " AND name = @Name " : "")} 
						GROUP BY symbol, name, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_YEAR}) * {TRUNCATE_YEAR})
						ORDER BY timestamp ASC;";
        }
        else if (hourRange > HOURS_IN_WEEK) // More than one week but less than or equal to one month
        {
          sql = @$"
						SELECT 
							MIN(id) as id, 
							symbol, 
							name, 
							AVG(value_cad) as value_cad, 
							AVG(value_usd) as value_usd, 
							FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_MONTH}) * {TRUNCATE_MONTH}) as timestamp
						FROM coin_value
						WHERE timestamp >= @From 
						AND timestamp <= @To						
						{(request.Currency != null ? " AND name = @Name " : "")} 
						GROUP BY symbol, name, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_MONTH}) * {TRUNCATE_MONTH})
						ORDER BY timestamp ASC;";
        }
        else if (hourRange > 24) // More than one day but less than or equal to one week
        {
          sql = @$"
						SELECT 
							MIN(id) as id, 
							symbol, 
							name, 
							AVG(value_cad) as value_cad, 
							AVG(value_usd) as value_usd, 
							FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_WEEK}) * {TRUNCATE_WEEK}) as timestamp
						FROM coin_value
						WHERE timestamp >= @From 
						AND timestamp <= @To						
						{(request.Currency != null ? " AND name = @Name " : "")} 
						GROUP BY symbol, name, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_WEEK}) * {TRUNCATE_WEEK})
						ORDER BY timestamp ASC;";
        }
        else // One day or less
        {
          sql = @$"
						SELECT 
							id, 
							symbol, 
							name, 
							value_cad, 
							value_usd, 
							timestamp
						FROM coin_value
						WHERE 1=1 
						{(request.HourRange != 0 ? " AND timestamp >= @From AND timestamp <= @To " : "")}
						{(request.Currency != null ? " AND name = @Name " : "")} 
						ORDER BY timestamp ASC;";
        }

        MySqlCommand cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@From", actualFrom);
        cmd.Parameters.AddWithValue("@To", actualTo);
        if (!string.IsNullOrEmpty(request.Currency))
        {
          cmd.Parameters.AddWithValue("@Name", request.Currency);
        }

        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            var coinValue = new CoinValue
            {
              Id = reader.GetInt32("id"),
              Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
              Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
              ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
              ValueUSD = reader.IsDBNull(reader.GetOrdinal("value_usd")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_usd")),
              Timestamp = reader.GetDateTime("timestamp")
            };
            coinValues.Add(coinValue);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get all coin values. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return coinValues;
    }

    [HttpPost("/CurrencyValue/GetAllForGraph", Name = "GetAllCurrencyValuesForGraph")]
    public async Task<List<ExchangeRate>> GetAllCurrencyValuesForGraph([FromBody] GraphRangeRequest request)
    {
      var exchangeRates = new List<ExchangeRate>();
      if (request.From == null) { request.From = new DateTime(); }

      var actualFrom = request.From.Value.AddHours(-1 * (request.HourRange ?? 24));
      var actualTo = request.From.Value.AddHours(request.HourRange ?? 24);
      MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();

        double hourRange = request.HourRange ?? 24;
        string sql;

        if (hourRange > HOURS_IN_YEAR) // More than one year
        {
          sql = @$"
                SELECT 
                    MIN(id) as id, 
                    base_currency, 
                    target_currency, 
                    AVG(rate) as rate, 
                    FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_LONG_TERM}) * {TRUNCATE_LONG_TERM}) as timestamp
                FROM maxhanna.exchange_rates
                WHERE timestamp >= @From AND timestamp <= @To
				{(request.Currency != null ? " AND target_currency = @Currency " : "")}
                GROUP BY base_currency, target_currency, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_LONG_TERM}) * {TRUNCATE_LONG_TERM})
                ORDER BY timestamp ASC;";
        }
        else if (hourRange > HOURS_IN_MONTH) // More than one month but less than or equal to one year
        {
          sql = @$"
                SELECT 
                    MIN(id) as id, 
                    base_currency, 
                    target_currency, 
                    AVG(rate) as rate, 
                    FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_YEAR}) * {TRUNCATE_YEAR}) as timestamp
                FROM maxhanna.exchange_rates
                WHERE timestamp >= @From AND timestamp <= @To
				{(request.Currency != null ? " AND target_currency = @Currency " : "")}
                GROUP BY base_currency, target_currency, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_YEAR}) * {TRUNCATE_YEAR})
                ORDER BY timestamp ASC;";
        }
        else if (hourRange > HOURS_IN_WEEK) // More than one week but less than or equal to one month
        {
          sql = @$"
                SELECT 
                    MIN(id) as id, 
                    base_currency, 
                    target_currency, 
                    AVG(rate) as rate, 
                    FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_MONTH}) * {TRUNCATE_MONTH}) as timestamp
                FROM maxhanna.exchange_rates
                WHERE timestamp >= @From AND timestamp <= @To
				{(request.Currency != null ? " AND target_currency = @Currency " : "")}
                GROUP BY base_currency, target_currency, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_MONTH}) * {TRUNCATE_MONTH})
                ORDER BY timestamp ASC;";
        }
        else if (hourRange > 24) // More than one day but less than or equal to one week
        {
          sql = @$"
                SELECT 
                    MIN(id) as id, 
                    base_currency, 
                    target_currency, 
                    AVG(rate) as rate, 
                    FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_WEEK}) * {TRUNCATE_WEEK}) as timestamp
                FROM maxhanna.exchange_rates
                WHERE timestamp >= @From AND timestamp <= @To
				{(request.Currency != null ? " AND target_currency = @Currency " : "")}
                GROUP BY base_currency, target_currency, FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(timestamp) / {TRUNCATE_WEEK}) * {TRUNCATE_WEEK})
                ORDER BY timestamp ASC;";
        }
        else // One day or less
        {
          sql = @$"
                SELECT 
                    id, 
                    base_currency, 
                    target_currency, 
                    rate, 
                    timestamp
                FROM maxhanna.exchange_rates 
				WHERE 1=1 
                {(request.HourRange != 0 ? " AND timestamp >= @From AND timestamp <= @To " : "")}
				{(request.Currency != null ? " AND target_currency = @Currency " : "")}
                ORDER BY timestamp ASC;";
        }

        MySqlCommand cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@From", actualFrom);
        cmd.Parameters.AddWithValue("@To", actualTo);
        if (request.Currency != null)
        {
          cmd.Parameters.AddWithValue("@Currency", request.Currency);
        }

        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            var exchangeRate = new ExchangeRate
            {
              Id = reader.GetInt32(reader.GetOrdinal("id")),
              BaseCurrency = reader.IsDBNull(reader.GetOrdinal("base_currency")) ? null : reader.GetString(reader.GetOrdinal("base_currency")),
              TargetCurrency = reader.IsDBNull(reader.GetOrdinal("target_currency")) ? null : reader.GetString(reader.GetOrdinal("target_currency")),
              Rate = reader.IsDBNull(reader.GetOrdinal("rate")) ? 0 : reader.GetDecimal(reader.GetOrdinal("rate")),
              Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
            };
            exchangeRates.Add(exchangeRate);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get all exchange rate values. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return exchangeRates;
    }


    [HttpGet("/CurrencyValue/GetCurrencyNames", Name = "GetCurrencyNames")]
    public async Task<List<string>> GetCurrencyNames(CancellationToken ct = default)
    {
      var currencies = new List<string>(64);

      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      try
      {
        await conn.OpenAsync(ct);

        // 1) Primary: read from latest_exchange_rate (fast, small table)
        const string latestSql = @"
SELECT target_currency
FROM latest_exchange_rate
ORDER BY target_currency;";

        await using (var latestCmd = new MySqlCommand(latestSql, conn) { CommandTimeout = 15 })
        await using (var latestReader = await latestCmd.ExecuteReaderAsync(ct))
        {
          while (await latestReader.ReadAsync(ct))
          {
            var ord = latestReader.GetOrdinal("target_currency");
            if (!latestReader.IsDBNull(ord))
              currencies.Add(latestReader.GetString(ord));
          }
        }

        // If latest table had data, return it
        if (currencies.Count > 0)
          return currencies;

        // 2) Fallback: get distinct from legacy table
        const string fallbackSql = @"
SELECT DISTINCT target_currency
FROM exchange_rates
WHERE target_currency IS NOT NULL
ORDER BY target_currency;";

        await using var fallbackCmd = new MySqlCommand(fallbackSql, conn) { CommandTimeout = 30 };
        await using var fallbackReader = await fallbackCmd.ExecuteReaderAsync(ct);
        while (await fallbackReader.ReadAsync(ct))
        {
          var ord = fallbackReader.GetOrdinal("target_currency");
          if (!fallbackReader.IsDBNull(ord))
            currencies.Add(fallbackReader.GetString(ord));
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get all exchange rate names. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return currencies;
    }



    [HttpPost("/CoinValue/GetLatest/", Name = "GetLatestCoinValues")]
    public async Task<List<CoinValue>> GetLatestCoinValues(CancellationToken ct = default)
    {
      var coinValues = new List<CoinValue>(128);

      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      try
      {
        await conn.OpenAsync(ct);

        // 1) Fast path: read directly from latest_coin_value (one row per coin)
        const string latestSql = @"
SELECT id, symbol, name, value_cad, value_usd, `timestamp`
FROM latest_coin_value
ORDER BY name
LIMIT 100;";

        await using (var latestCmd = new MySqlCommand(latestSql, conn) { CommandTimeout = 8 })
        await using (var reader = await latestCmd.ExecuteReaderAsync(ct))
        {
          while (await reader.ReadAsync(ct))
          {
            coinValues.Add(new CoinValue
            {
              Id = reader.GetInt32(reader.GetOrdinal("id")),
              Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
              Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
              ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0m : reader.GetDecimal(reader.GetOrdinal("value_cad")),
              ValueUSD = reader.IsDBNull(reader.GetOrdinal("value_usd")) ? 0m : reader.GetDecimal(reader.GetOrdinal("value_usd")),
              Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
            });
          }
        }

        // If the latest table had rows, return them
        if (coinValues.Count > 0)
          return coinValues;

        // 2) Fallback: compute latest per coin from historical table
        const string fallbackSql = @"
SELECT cv.id, cv.symbol, cv.name, cv.value_cad, cv.value_usd, cv.`timestamp`
FROM coin_value cv
JOIN (
    SELECT name, MAX(`timestamp`) AS max_ts
    FROM coin_value
    GROUP BY name
) mx
  ON mx.name = cv.name
 AND mx.max_ts = cv.`timestamp`
LEFT JOIN coin_value tie
  ON tie.name = cv.name
 AND tie.`timestamp` = cv.`timestamp`
 AND tie.id > cv.id
WHERE tie.id IS NULL
ORDER BY cv.name
LIMIT 100;";

        await using var fallbackCmd = new MySqlCommand(fallbackSql, conn) { CommandTimeout = 15 };
        await using var fbReader = await fallbackCmd.ExecuteReaderAsync(ct);
        while (await fbReader.ReadAsync(ct))
        {
          coinValues.Add(new CoinValue
          {
            Id = fbReader.GetInt32(fbReader.GetOrdinal("id")),
            Symbol = fbReader.IsDBNull(fbReader.GetOrdinal("symbol")) ? null : fbReader.GetString(fbReader.GetOrdinal("symbol")),
            Name = fbReader.IsDBNull(fbReader.GetOrdinal("name")) ? null : fbReader.GetString(fbReader.GetOrdinal("name")),
            ValueCAD = fbReader.IsDBNull(fbReader.GetOrdinal("value_cad")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("value_cad")),
            ValueUSD = fbReader.IsDBNull(fbReader.GetOrdinal("value_usd")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("value_usd")),
            Timestamp = fbReader.GetDateTime(fbReader.GetOrdinal("timestamp"))
          });
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get the latest coin values. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return coinValues;
    }




    [HttpPost("/CurrencyValue/GetLatest/", Name = "GetLatestCurrencyValues")]
    public async Task<List<ExchangeRate>> GetLatestCurrencyValues(CancellationToken ct = default)
    {
      var exchangeRates = new List<ExchangeRate>(256);

      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      try
      {
        await conn.OpenAsync(ct);

        // 1) Primary: new 'latest' table (fast, small, already deduped)
        const string latestSql = @"
SELECT id, base_currency, target_currency, rate, `timestamp`
FROM latest_exchange_rate
ORDER BY target_currency;";

        await using (var latestCmd = new MySqlCommand(latestSql, conn) { CommandTimeout = 15 })
        await using (var latestReader = await latestCmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess, ct))
        {
          while (await latestReader.ReadAsync(ct))
          {
            var idOrdinal = latestReader.GetOrdinal("id");
            var baseOrdinal = latestReader.GetOrdinal("base_currency");
            var targetOrdinal = latestReader.GetOrdinal("target_currency");
            var rateOrdinal = latestReader.GetOrdinal("rate");
            var tsOrdinal = latestReader.GetOrdinal("timestamp");

            exchangeRates.Add(new ExchangeRate
            {
              Id = latestReader.GetInt32(idOrdinal),
              BaseCurrency = latestReader.IsDBNull(baseOrdinal) ? null : latestReader.GetString(baseOrdinal),
              TargetCurrency = latestReader.IsDBNull(targetOrdinal) ? null : latestReader.GetString(targetOrdinal),
              Rate = latestReader.IsDBNull(rateOrdinal) ? 0 : latestReader.GetDecimal(rateOrdinal),
              Timestamp = latestReader.GetDateTime(tsOrdinal)
            });
          }
        }

        // If we found rows in latest table, return them
        if (exchangeRates.Count > 0)
          return exchangeRates;

        // 2) Fallback: legacy table — all rows at the global MAX(timestamp)
        // (Matches your current behavior; keeps id as tiebreaker ordering)
        const string fallbackSql = @"
SELECT id, base_currency, target_currency, rate, `timestamp`
FROM exchange_rates
WHERE `timestamp` = (SELECT MAX(`timestamp`) FROM exchange_rates)
ORDER BY `timestamp` DESC, id DESC;";

        await using var fallbackCmd = new MySqlCommand(fallbackSql, conn) { CommandTimeout = 30 };
        await using var reader = await fallbackCmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess, ct);
        while (await reader.ReadAsync(ct))
        {
          var idOrdinal = reader.GetOrdinal("id");
          var baseOrdinal = reader.GetOrdinal("base_currency");
          var targetOrdinal = reader.GetOrdinal("target_currency");
          var rateOrdinal = reader.GetOrdinal("rate");
          var tsOrdinal = reader.GetOrdinal("timestamp");

          exchangeRates.Add(new ExchangeRate
          {
            Id = reader.GetInt32(idOrdinal),
            BaseCurrency = reader.IsDBNull(baseOrdinal) ? null : reader.GetString(baseOrdinal),
            TargetCurrency = reader.IsDBNull(targetOrdinal) ? null : reader.GetString(targetOrdinal),
            Rate = reader.IsDBNull(rateOrdinal) ? 0 : reader.GetDecimal(rateOrdinal),
            Timestamp = reader.GetDateTime(tsOrdinal)
          });
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get the latest currency values. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return exchangeRates;
    }



    [HttpPost("/CurrencyValue/GetUniqueNames/", Name = "GetUniqueCurrencyValueNames")]
    public async Task<List<string>> GetUniqueCurrencyValueNames()
    {
      var currencies = new List<string>();

      MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();

        string sql = @"SELECT DISTINCT target_currency FROM latest_exchange_rate;";
        MySqlCommand cmd = new MySqlCommand(sql, conn);
        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {

            currencies.Add(reader.GetString("target_currency"));
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get the currency values." + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return currencies;
    }

    [HttpPost("/CurrencyValue/UpdateUserCurrency/", Name = "UpdateUserCurrency")]
    public async Task<IActionResult> UpdateUserCurrency([FromBody] UserCurrencyUpdateRequest req)
    {
      string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

      using (MySqlConnection conn = new MySqlConnection(connectionString))
      {
        try
        {
          await conn.OpenAsync();

          string sql = @"
                INSERT INTO maxhanna.user_about (user_id, currency)
                VALUES (@userId, @currency)
                ON DUPLICATE KEY UPDATE currency = @currency;";

          using (MySqlCommand cmd = new MySqlCommand(sql, conn))
          {
            cmd.Parameters.AddWithValue("@userId", req.UserId);
            cmd.Parameters.AddWithValue("@currency", req.Currency);

            await cmd.ExecuteNonQueryAsync();
          }
        }
        catch (Exception ex)
        {
          _ = _log.Db($"Error updating user currency: {ex.Message}", req.UserId, "COIN", true);
          BadRequest(ex);
        }
      }

      return Ok("Updated user currency"); // Return the updated list of unique currencies
    }


    [HttpPost("/CurrencyValue/GetUserCurrency/", Name = "GetUserCurrency")]
    public async Task<IActionResult> GetUserCurrency([FromBody] int userId)
    {
      string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

      using (MySqlConnection conn = new MySqlConnection(connectionString))
      {
        try
        {
          await conn.OpenAsync();

          string sql = @"
                SELECT currency FROM maxhanna.user_about WHERE user_id = @userId LIMIT 1;";

          using (MySqlCommand cmd = new MySqlCommand(sql, conn))
          {
            cmd.Parameters.AddWithValue("@userId", userId);

            object? result = await cmd.ExecuteScalarAsync();

            if (result != null)
            {
              return Ok(result.ToString());
            }
            else
            {
              return NotFound("Currency not found for this user.");
            }
          }
        }
        catch (Exception ex)
        {
          _ = _log.Db($"Error retrieving user currency: {ex.Message}", userId, "COIN", true);
          return StatusCode(500, "An error occurred while fetching the user currency.");
        }
      }
    }


    [HttpPost("/CoinValue/GetLatestByName/{name}", Name = "GetLatestCoinValuesByName")]
    public async Task<CoinValue> GetLatestCoinValuesByName(string name, CancellationToken ct = default)
    {
      // Prefer returning null/404 in APIs, but keeping your current contract:
      CoinValue? result = null;

      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      try
      {
        await conn.OpenAsync(ct);
        const string latestSql = @"
          SELECT id, symbol, name, value_cad, value_usd, `timestamp`
          FROM latest_coin_value
          WHERE name = @name
          LIMIT 1;";

        await using (var latestCmd = new MySqlCommand(latestSql, conn) { CommandTimeout = 8 })
        {
          latestCmd.Parameters.Add("@name", MySqlDbType.VarChar, 100).Value = name; // size aligned with latest table PK
          latestCmd.Prepare();

          await using var latestReader = await latestCmd.ExecuteReaderAsync(System.Data.CommandBehavior.SingleRow, ct);
          if (await latestReader.ReadAsync(ct))
          {
            result = new CoinValue
            {
              Id = latestReader.GetInt32(latestReader.GetOrdinal("id")),
              Symbol = latestReader.IsDBNull(latestReader.GetOrdinal("symbol")) ? null : latestReader.GetString(latestReader.GetOrdinal("symbol")),
              Name = latestReader.IsDBNull(latestReader.GetOrdinal("name")) ? null : latestReader.GetString(latestReader.GetOrdinal("name")),
              ValueCAD = latestReader.IsDBNull(latestReader.GetOrdinal("value_cad")) ? 0m : latestReader.GetDecimal(latestReader.GetOrdinal("value_cad")),
              ValueUSD = latestReader.IsDBNull(latestReader.GetOrdinal("value_usd")) ? 0m : latestReader.GetDecimal(latestReader.GetOrdinal("value_usd")),
              Timestamp = latestReader.GetDateTime(latestReader.GetOrdinal("timestamp"))
            };

            return result; // Early return if found in latest
          }
        }

        // 2) Fallback: historical coin_value — latest by timestamp with id DESC tie-breaker
        const string legacySql = @"
          SELECT id, symbol, name, value_cad, value_usd, `timestamp`
          FROM coin_value
          WHERE name = @name
          ORDER BY `timestamp` DESC, id DESC
          LIMIT 1;";

        await using var cmd = new MySqlCommand(legacySql, conn) { CommandTimeout = 10 };
        cmd.Parameters.Add("@name", MySqlDbType.VarChar, 100).Value = name; // size aligned with writes
        cmd.Prepare();

        await using var reader = await cmd.ExecuteReaderAsync(System.Data.CommandBehavior.SingleRow, ct);
        if (await reader.ReadAsync(ct))
        {
          result = new CoinValue
          {
            Id = reader.GetInt32(reader.GetOrdinal("id")),
            Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
            Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
            ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0m : reader.GetDecimal(reader.GetOrdinal("value_cad")),
            ValueUSD = reader.IsDBNull(reader.GetOrdinal("value_usd")) ? 0m : reader.GetDecimal(reader.GetOrdinal("value_usd")),
            Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
          };
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get the latest coin values by name. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      // If your API should 404 when not found, change the return type to ActionResult<CoinValue> and return NotFound().
      return result ?? new CoinValue();
    }


    [HttpPost("/CoinValue/IsBTCRising", Name = "IsBTCRising")]
    public async Task<bool> IsBTCRising(CancellationToken ct = default)
    {
      var (latest, previous, diff) = await GetOrUpdateBTCPriceAsync();
      return latest > previous;
    }


    public async Task<(decimal latestPrice, decimal previousPrice, decimal difference)> GetOrUpdateBTCPriceAsync(CancellationToken ct = default)
    {
      var connString = _config.GetConnectionString("maxhanna");
      await using var conn = new MySqlConnection(connString);
      await conn.OpenAsync(ct);

      // Step 1: Check cache freshness
      const string selectCacheSql = @"
        SELECT latest_price, previous_price, difference, updated_at
        FROM btc_current_velocity_cache
        WHERE id = 1;";
      await using (var selectCmd = new MySqlCommand(selectCacheSql, conn) { CommandTimeout = 8 })
      await using (var reader = await selectCmd.ExecuteReaderAsync(ct))
      {
        decimal latestPrice = 0, previousPrice = 0, difference = 0;
        DateTime updatedAt = DateTime.MinValue;

        if (await reader.ReadAsync(ct))
        {
          latestPrice = reader.IsDBNull(reader.GetOrdinal("latest_price")) ? 0m : reader.GetDecimal(reader.GetOrdinal("latest_price"));
          previousPrice = reader.IsDBNull(reader.GetOrdinal("previous_price")) ? 0m : reader.GetDecimal(reader.GetOrdinal("previous_price"));
          difference = reader.IsDBNull(reader.GetOrdinal("difference")) ? 0m : reader.GetDecimal(reader.GetOrdinal("difference"));
          updatedAt = reader.IsDBNull(reader.GetOrdinal("updated_at")) ? DateTime.MinValue : reader.GetDateTime(reader.GetOrdinal("updated_at"));
        }
        reader.Close();

        if ((DateTime.UtcNow - updatedAt).TotalMinutes < 30 && latestPrice > 0m && previousPrice > 0m)
        {
          return (latestPrice, previousPrice, difference);
        }
      }

      // Step 2a: Latest price — FAST PATH: latest_coin_value
      decimal latest;
      {
        const string latestSql = @"
            SELECT value_cad
            FROM latest_coin_value
            WHERE name = 'Bitcoin'
            LIMIT 1;";
        await using var latestCmd = new MySqlCommand(latestSql, conn) { CommandTimeout = 6 };
        var latestObj = await latestCmd.ExecuteScalarAsync(ct);
        if (latestObj != null && latestObj != DBNull.Value)
        {
          latest = Convert.ToDecimal(latestObj);
        }
        else
        {
          // Step 2b: Fallback to historical table
          const string fallbackLatestSql = @"
                SELECT value_cad
                FROM coin_value
                WHERE name = 'Bitcoin'
                ORDER BY `timestamp` DESC, id DESC
                LIMIT 1;";
          await using var fbCmd = new MySqlCommand(fallbackLatestSql, conn) { CommandTimeout = 10 };
          var fbObj = await fbCmd.ExecuteScalarAsync(ct);
          latest = (fbObj != null && fbObj != DBNull.Value) ? Convert.ToDecimal(fbObj) : 0m;
        }
      }

      // Step 3: Previous price (historical, day-ago) — separate query
      decimal previous;
      {
        const string prevSql = @"
            SELECT value_cad
            FROM coin_value
            WHERE name = 'Bitcoin'
              AND `timestamp` <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)
            ORDER BY `timestamp` DESC, id DESC
            LIMIT 1;";
        await using var prevCmd = new MySqlCommand(prevSql, conn) { CommandTimeout = 10 };
        var prevObj = await prevCmd.ExecuteScalarAsync(ct);
        previous = (prevObj != null && prevObj != DBNull.Value) ? Convert.ToDecimal(prevObj) : 0m;
      }

      var diff = latest - previous;

      // Step 4: Update cache table (store difference too so we can short-circuit next time)
      const string updateSql = @"
        UPDATE btc_current_velocity_cache
        SET latest_price = @latest,
            previous_price = @previous, 
            updated_at = UTC_TIMESTAMP()
        WHERE id = 1;";
      await using (var updateCmd = new MySqlCommand(updateSql, conn) { CommandTimeout = 6 })
      {
        updateCmd.Parameters.Add("@latest", MySqlDbType.NewDecimal).Value = latest;
        updateCmd.Parameters.Add("@previous", MySqlDbType.NewDecimal).Value = previous;
        await updateCmd.ExecuteNonQueryAsync(ct);
      }

      return (latest, previous, diff);
    }

    [HttpPost("/CurrencyValue/GetLatestByName/{name}", Name = "GetLatestCurrencyValuesByName")]
    public async Task<ExchangeRate> GetLatestCurrencyValuesByName(string name, CancellationToken ct = default)
    {
      // If you prefer null when not found, change the return type to ExchangeRate? and return null.
      var exchangeRate = new ExchangeRate();

      // Basic guard: avoid empty/whitespace names
      if (string.IsNullOrWhiteSpace(name))
        return exchangeRate;

      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      try
      {
        await conn.OpenAsync(ct);

        // 1) Primary: look up in latest_exchange_rate (fast, small, PK on target_currency)
        const string latestSql = @"
SELECT id, base_currency, target_currency, rate, `timestamp`
FROM latest_exchange_rate
WHERE target_currency = @name
LIMIT 1;";

        await using (var latestCmd = new MySqlCommand(latestSql, conn) { CommandTimeout = 8 })
        {
          latestCmd.Parameters.Add("@name", MySqlDbType.VarChar, 45).Value = name;
          latestCmd.Prepare();

          await using var latestReader = await latestCmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
          if (await latestReader.ReadAsync(ct))
          {
            var idOrdinal = latestReader.GetOrdinal("id");
            var baseOrdinal = latestReader.GetOrdinal("base_currency");
            var targetOrdinal = latestReader.GetOrdinal("target_currency");
            var rateOrdinal = latestReader.GetOrdinal("rate");
            var tsOrdinal = latestReader.GetOrdinal("timestamp");

            return new ExchangeRate
            {
              Id = latestReader.IsDBNull(idOrdinal) ? 0 : latestReader.GetInt32(idOrdinal),
              BaseCurrency = latestReader.IsDBNull(baseOrdinal) ? null : latestReader.GetString(baseOrdinal),
              TargetCurrency = latestReader.IsDBNull(targetOrdinal) ? null : latestReader.GetString(targetOrdinal),
              Rate = latestReader.IsDBNull(rateOrdinal) ? 0 : latestReader.GetDecimal(rateOrdinal),
              Timestamp = latestReader.IsDBNull(tsOrdinal) ? DateTime.UtcNow : latestReader.GetDateTime(tsOrdinal)
            };
          }
        }

        // 2) Fallback: legacy table — latest by timestamp with id DESC tiebreaker
        const string fallbackSql = @"
SELECT id, base_currency, target_currency, rate, `timestamp`
FROM exchange_rates FORCE INDEX (ix_exchange_rates_target_ts_id)
WHERE target_currency = @name
ORDER BY `timestamp` DESC, id DESC
LIMIT 1;";

        await using var fallbackCmd = new MySqlCommand(fallbackSql, conn) { CommandTimeout = 8 };
        fallbackCmd.Parameters.Add("@name", MySqlDbType.VarChar, 45).Value = name;
        fallbackCmd.Prepare();

        await using var reader = await fallbackCmd.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
        if (await reader.ReadAsync(ct))
        {
          var idOrdinal = reader.GetOrdinal("id");
          var baseOrdinal = reader.GetOrdinal("base_currency");
          var targetOrdinal = reader.GetOrdinal("target_currency");
          var rateOrdinal = reader.GetOrdinal("rate");
          var tsOrdinal = reader.GetOrdinal("timestamp");

          exchangeRate = new ExchangeRate
          {
            Id = reader.IsDBNull(idOrdinal) ? 0 : reader.GetInt32(idOrdinal),
            BaseCurrency = reader.IsDBNull(baseOrdinal) ? null : reader.GetString(baseOrdinal),
            TargetCurrency = reader.IsDBNull(targetOrdinal) ? null : reader.GetString(targetOrdinal),
            Rate = reader.IsDBNull(rateOrdinal) ? 0 : reader.GetDecimal(rateOrdinal),
            Timestamp = reader.IsDBNull(tsOrdinal) ? DateTime.UtcNow : reader.GetDateTime(tsOrdinal)
          };
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get the latest currency values by name. " + ex.Message, null, "COIN", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return exchangeRate;
    }




    /// <summary>
    /// Return the CoinMarketCap Fear & Greed index values for the last N days.
    /// Defaults to the last 7 days if no daysBack is supplied.
    /// </summary>
    [HttpPost("/CoinValue/FearGreedIndex", Name = "GetFearGreedIndex")]
    public async Task<IActionResult> GetFearGreedIndex(
      [FromQuery] int daysBack = 364,   // how many days to look backwards (inclusive)
      [FromQuery] int? limit = null)  // optional hard row cap
    {
      try
      {
        await using var conn = new MySqlConnection(
          _config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        var sql = @"
					SELECT
						timestamp_utc,
						value,
						classification
					FROM crypto_fear_greed
					WHERE timestamp_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @DaysBack DAY)";

        if (limit is not null && limit > 0)
          sql += " ORDER BY timestamp_utc DESC LIMIT @Limit;";
        else
          sql += " ORDER BY timestamp_utc DESC;";

        var results = new List<FearGreedResponse>();

        await using (var cmd = new MySqlCommand(sql, conn))
        {
          cmd.Parameters.AddWithValue("@DaysBack", daysBack);
          if (limit is not null && limit > 0)
            cmd.Parameters.AddWithValue("@Limit", limit);

          await using var rdr = await cmd.ExecuteReaderAsync();
          while (await rdr.ReadAsync())
          {
            results.Add(new FearGreedResponse
            {
              TimestampUtc = rdr.GetDateTime("timestamp_utc"),
              Value = rdr.GetInt32("value"),
              Classification = rdr.IsDBNull(rdr.GetOrdinal("classification"))
                        ? null
                        : rdr.GetString("classification")
            });
          }
        }

        return Ok(new
        {
          Success = true,
          Count = results.Count,
          Indices = results
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error fetching Fear & Greed index: {ex.Message}",
               0, "FEAR_GREED", true);
        return StatusCode(500, new
        {
          Success = false,
          Message = "An error occurred while fetching Fear & Greed index data"
        });
      }
    }

    [HttpPost("/CoinValue/CryptoCalendarEvents", Name = "GetCryptoCalendarEvents")]
    public async Task<IActionResult> GetCryptoCalendarEvents(
      [FromQuery] int daysAhead = 7,
      [FromQuery] int limit = 50,
      [FromQuery] string? coinSymbol = null)
    {
      try
      {
        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        var query = @"
					SELECT 
						event_id,
						title,
						coin_symbol,
						coin_name,
						event_date,
						created_date,
						source,
						description,
						is_hot,
						proof_url
					FROM crypto_calendar_events
					WHERE event_date >= UTC_DATE() 
  					AND event_date <  DATE_ADD(UTC_DATE(), INTERVAL @DaysAhead + 1 DAY);
				";

        // Add coin filter if specified
        if (!string.IsNullOrEmpty(coinSymbol))
        {
          query += " AND coin_symbol = @CoinSymbol ";
        }

        query += " ORDER BY event_date ASC LIMIT @Limit ";

        var events = new List<CryptoCalendarEventResponse>();

        using (var cmd = new MySqlCommand(query.ToString(), conn))
        {
          cmd.Parameters.AddWithValue("@DaysAhead", daysAhead);
          cmd.Parameters.AddWithValue("@Limit", limit);

          if (!string.IsNullOrEmpty(coinSymbol))
          {
            cmd.Parameters.AddWithValue("@CoinSymbol", coinSymbol.ToUpper());
          }

          await using (var reader = await cmd.ExecuteReaderAsync())
          {
            while (await reader.ReadAsync())
            {
              events.Add(new CryptoCalendarEventResponse
              {
                EventId = reader.GetString("event_id"),
                Title = reader.GetString("title"),
                CoinSymbol = reader.GetString("coin_symbol"),
                CoinName = reader.GetString("coin_name"),
                EventDate = reader.GetDateTime("event_date"),
                CreatedDate = reader.GetDateTime("created_date"),
                Source = reader.IsDBNull(reader.GetOrdinal("source")) ? null : reader.GetString("source"),
                Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description"),
                IsHot = reader.GetBoolean("is_hot"),
                ProofUrl = reader.IsDBNull(reader.GetOrdinal("proof_url")) ? null : reader.GetString("proof_url")
              });
            }
          }
        }

        return Ok(new
        {
          Success = true,
          Count = events.Count,
          Events = events
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error fetching crypto calendar events: {ex.Message}", 0, "CRYPTO_CALENDAR", true);
        return StatusCode(500, new
        {
          Success = false,
          Message = "An error occurred while fetching crypto calendar events"
        });
      }
    }

    [HttpGet("/CoinValue/GlobalMetrics", Name = "GetLatestGlobalMetrics")]
    public async Task<IActionResult> GetLatestGlobalMetrics()
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();

        // Query for the latest metrics
        const string latestSql = @"
            SELECT 
                timestamp_utc,
                btc_dominance,
                eth_dominance,
                active_cryptocurrencies,
                active_exchanges,
                active_market_pairs,
                total_market_cap,
                total_volume_24h,
                total_volume_24h_reported,
                altcoin_market_cap,
                altcoin_volume_24h,
                altcoin_volume_24h_reported,
                defi_market_cap,
                defi_volume_24h,
                stablecoin_market_cap,
                stablecoin_volume_24h,
                derivatives_volume_24h,
                last_updated
            FROM crypto_global_metrics
            ORDER BY timestamp_utc DESC
            LIMIT 1;";

        // Query for 7-day historical data
        const string historicalSql = @"
					SELECT 
						DATE(timestamp_utc) as date,
						AVG(total_market_cap) as total_market_cap,
						AVG(total_volume_24h) as total_volume_24h
					FROM crypto_global_metrics
					WHERE timestamp_utc >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
					GROUP BY DATE(timestamp_utc)
					ORDER BY date ASC;";
        const string dominanceSql = @"
					SELECT
						DATE(timestamp_utc)               AS date,
						AVG(btc_dominance)                AS btc_dominance,
						AVG((altcoin_market_cap / total_market_cap) * 100)
														AS altcoin_dominance,
						AVG((stablecoin_market_cap / total_market_cap) * 100)
														AS stablecoin_dominance
					FROM crypto_global_metrics
					WHERE timestamp_utc >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
					GROUP BY DATE(timestamp_utc)
					ORDER BY date ASC;";
        // Fetch latest metrics
        Object? latestMetrics = null;
        await using (var cmd = new MySqlCommand(latestSql, conn))
        {
          await using var reader = await cmd.ExecuteReaderAsync();
          if (await reader.ReadAsync())
          {
            latestMetrics = new
            {
              TimestampUtc = reader.GetDateTime("timestamp_utc"),
              BtcDominance = reader.GetDecimal("btc_dominance"),
              EthDominance = reader.GetDecimal("eth_dominance"),
              ActiveCryptocurrencies = reader.GetInt32("active_cryptocurrencies"),
              ActiveExchanges = reader.GetInt32("active_exchanges"),
              ActiveMarketPairs = reader.GetInt32("active_market_pairs"),
              TotalMarketCap = reader.GetDecimal("total_market_cap"),
              TotalVolume24h = reader.GetDecimal("total_volume_24h"),
              TotalVolume24hReported = reader.GetDecimal("total_volume_24h_reported"),
              AltcoinMarketCap = reader.GetDecimal("altcoin_market_cap"),
              AltcoinVolume24h = reader.GetDecimal("altcoin_volume_24h"),
              AltcoinVolume24hReported = reader.GetDecimal("altcoin_volume_24h_reported"),
              DefiMarketCap = reader.GetDecimal("defi_market_cap"),
              DefiVolume24h = reader.GetDecimal("defi_volume_24h"),
              StablecoinMarketCap = reader.GetDecimal("stablecoin_market_cap"),
              StablecoinVolume24h = reader.GetDecimal("stablecoin_volume_24h"),
              DerivativesVolume24h = reader.GetDecimal("derivatives_volume_24h"),
              LastUpdated = reader.GetDateTime("last_updated")
            };
          }
          await reader.CloseAsync();
        }

        if (latestMetrics == null)
        {
          return NotFound("No global metrics data available");
        }

        // Fetch historical data
        var historicalData = new List<object>();
        await using (var cmd = new MySqlCommand(historicalSql, conn))
        {
          await using var reader = await cmd.ExecuteReaderAsync();
          while (await reader.ReadAsync())
          {
            historicalData.Add(new
            {
              Date = reader.GetDateTime("date").ToString("yyyy-MM-dd"),
              TotalMarketCap = reader.GetDecimal("total_market_cap"),
              TotalVolume24h = reader.GetDecimal("total_volume_24h")
            });
          }
        }

        // Fetch dominance data
        var dominanceData = new List<object>();
        await using (var cmd = new MySqlCommand(dominanceSql, conn))
        {
          await using var reader = await cmd.ExecuteReaderAsync();
          while (await reader.ReadAsync())
          {
            dominanceData.Add(new
            {
              Date = reader.GetDateTime("date").ToString("yyyy-MM-dd"),
              BtcDominance = reader.GetDecimal("btc_dominance"),
              AltcoinDominance = reader.GetDecimal("altcoin_dominance"),
              StablecoinDominance = reader.GetDecimal("stablecoin_dominance")
            });
          }
        }

        // Combine latest metrics and historical data
        var response = new
        {
          Latest = latestMetrics,
          Historical = historicalData,
          Dominance = dominanceData
        };

        return Ok(response);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error fetching global metrics: " + ex.Message, 0, "GLOBAL", true);
        return StatusCode(500, "An error occurred while fetching global metrics");
      }
      finally
      {
        await conn.CloseAsync();
      }
    }

    [HttpPost("/CoinValue/BTCWalletAddresses/Update", Name = "UpdateBTCWalletAddresses")]
    public async Task<IActionResult> UpdateBTCWalletAddresses([FromBody] AddBTCWalletRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (request.UserId == 0)
      {
        return BadRequest("User missing from AddBTCWalletAddress request");
      }

      if (request.Wallets == null || request.Wallets.Length == 0)
      {
        return BadRequest("Wallets missing from AddBTCWalletAddress request");
      }

      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();
        int rowsAffected = 0;

        using (var transaction = await conn.BeginTransactionAsync())
        {
          using (var cmd = conn.CreateCommand())
          {
            cmd.Transaction = transaction;

            // Define the base SQL command with parameters for insertion
            cmd.CommandText = @"
							INSERT INTO user_btc_wallet_info 
							(user_id, btc_address, last_fetched) 
							VALUES (@UserId, @BtcAddress, UTC_TIMESTAMP())
							ON DUPLICATE KEY UPDATE 
								btc_address = VALUES(btc_address),
								last_fetched = VALUES(last_fetched);";

            // Add parameters
            cmd.Parameters.AddWithValue("@UserId", request.UserId);
            cmd.Parameters.Add("@BtcAddress", MySqlDbType.VarChar);

            // Execute the insert for each wallet address
            foreach (string wallet in request.Wallets)
            {
              cmd.Parameters["@BtcAddress"].Value = wallet;
              rowsAffected += await cmd.ExecuteNonQueryAsync();
            }

            // Commit the transaction
            await transaction.CommitAsync();
          }
        }

        return Ok(new { Message = $"{rowsAffected} wallet(s) added or updated successfully." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error adding or updating BTC wallet addresses. " + ex.Message, request.UserId, "USER", true);
        return StatusCode(500, "An error occurred while adding wallet addresses");
      }
      finally
      {
        await conn.CloseAsync();
      }
    }

    [HttpPost("/CoinValue/BTCWallet/GetBTCWalletData", Name = "GetBTCWalletData")]
    public async Task<IActionResult> GetBTCWalletData([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      try
      {
        // Call the private method to get wallet info from the database
        CryptoWallet? btcWallet = await GetWalletFromDb(userId, "btc");

        if (btcWallet != null && btcWallet.currencies != null && btcWallet.currencies.Count > 0)
        {
          return Ok(btcWallet); // Return the MiningWallet object as the response
        }
        else
        {
          return NotFound("No BTC wallet addresses found for the user."); // Return NotFound if no addresses found
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while processing GetBTCWalletAddresses. " + ex.Message, userId, "USER", true);
        return StatusCode(500, "An error occurred while processing the request.");
      }
    }

    [HttpPost("/CoinValue/BTCWallet/GetWalletData", Name = "GetWalletData")]
    public async Task<IActionResult> GetWalletData([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader))
        return StatusCode(500, "Access Denied.");

      try
      {
        // Parallel database calls
        var btcTask = GetWalletFromDb(userId, "btc");
        var usdcTask = GetWalletFromDb(userId, "usdc");
        var xrpTask = GetWalletFromDb(userId, "xrp");
        var solTask = GetWalletFromDb(userId, "sol");
        var dogeTask = GetWalletFromDb(userId, "xdg");
        var ethTask = GetWalletFromDb(userId, "eth");
        await Task.WhenAll(btcTask, usdcTask, xrpTask, solTask, dogeTask);

        var btcWallet = await btcTask;
        var usdcWallet = await usdcTask;
        var xrpWallet = await xrpTask;
        var solWallet = await solTask;
        var dogeWallet = await dogeTask;
        var ethWallet = await ethTask;

        // Early exit if no valid wallets
        if (btcWallet?.currencies?.Count == 0
          && usdcWallet?.currencies?.Count == 0
          && xrpWallet?.currencies?.Count == 0
          && solWallet?.currencies?.Count == 0
          && dogeWallet?.currencies?.Count == 0
          && ethWallet?.currencies?.Count == 0)
        {
          return NotFound("No wallet addresses found for the user.");
        }

        // Build response
        var returns = new List<CryptoWallet>();
        if (btcWallet?.currencies?.Count > 0) returns.Add(btcWallet);
        if (usdcWallet?.currencies?.Count > 0) returns.Add(usdcWallet);
        if (xrpWallet?.currencies?.Count > 0) returns.Add(xrpWallet);
        if (solWallet?.currencies?.Count > 0) returns.Add(solWallet);
        if (dogeWallet?.currencies?.Count > 0) returns.Add(dogeWallet);
        if (ethWallet?.currencies?.Count > 0) returns.Add(ethWallet);

        return returns.Count > 0 ? Ok(returns) : NotFound("No valid wallet data found.");
      }
      catch (Exception ex)
      {
        _ = _log.Db($"GetWalletData error: {ex.Message}", userId, "USER", true);
        return StatusCode(500, "An error occurred while processing the request.");
      }
    }

    [HttpPost("/CoinValue/BTCWallet/DeleteBTCWalletAddress", Name = "DeleteBTCWalletAddress")]
    public async Task<IActionResult> DeleteBTCWalletAddress([FromBody] DeleteCryptoWalletAddress request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request.UserId == 0)
      {
        return BadRequest("You must be logged in");
      }
      if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();
        int rowsAffected = 0;

        using (var transaction = await conn.BeginTransactionAsync())
        {
          using (var cmd = conn.CreateCommand())
          {
            cmd.Transaction = transaction;

            // Define the base SQL command with parameters for insertion
            cmd.CommandText = @"DELETE FROM maxhanna.user_btc_wallet_info WHERE user_id = @UserId AND btc_address = @Address LIMIT 1;";

            // Add parameters
            cmd.Parameters.AddWithValue("@UserId", request.UserId);
            cmd.Parameters.AddWithValue("@Address", request.Address);

            rowsAffected += await cmd.ExecuteNonQueryAsync();


            // Commit the transaction
            await transaction.CommitAsync();
          }
        }

        return Ok(new { Message = $"{rowsAffected} wallet addresses(s) deleted successfully." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error adding or updating BTC wallet addresses. " + ex.Message, request.UserId, "USER", true);
        return StatusCode(500, "An error occurred while adding wallet addresses");
      }
      finally
      {
        await conn.CloseAsync();
      }
    }

    [HttpPost("/CoinValue/BitcoinMonthlyPerformance/", Name = "GetBitcoinMonthlyPerformance")]
    public async Task<List<CoinMonthlyPerformance>> GetBitcoinMonthlyPerformance([FromBody] string coin)
    {
      var performanceData = new List<CoinMonthlyPerformance>();

      MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      try
      {
        await conn.OpenAsync();

        string sql = @"
					SELECT *
					FROM coin_monthly_performance
					WHERE coin = @Name
					ORDER BY year DESC, month DESC";

        MySqlCommand cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@Name", coin);
        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            var performance = new CoinMonthlyPerformance
            {
              Id = reader.GetInt32(reader.GetOrdinal("id")),
              Year = reader.GetInt32(reader.GetOrdinal("year")),
              Month = reader.GetInt32(reader.GetOrdinal("month")),
              StartPriceUSD = reader.IsDBNull(reader.GetOrdinal("start_price_usd")) ? null : (decimal?)reader.GetDecimal(reader.GetOrdinal("start_price_usd")),
              EndPriceUSD = reader.IsDBNull(reader.GetOrdinal("end_price_usd")) ? null : (decimal?)reader.GetDecimal(reader.GetOrdinal("end_price_usd")),
              StartMarketCapUSD = reader.IsDBNull(reader.GetOrdinal("start_market_cap_usd")) ? null : (decimal?)reader.GetDecimal(reader.GetOrdinal("start_market_cap_usd")),
              EndMarketCapUSD = reader.IsDBNull(reader.GetOrdinal("end_market_cap_usd")) ? null : (decimal?)reader.GetDecimal(reader.GetOrdinal("end_market_cap_usd")),
              PriceChangePercentage = reader.IsDBNull(reader.GetOrdinal("price_change_percentage")) ? null : (decimal?)reader.GetDecimal(reader.GetOrdinal("price_change_percentage")),
              MarketCapChangePercentage = reader.IsDBNull(reader.GetOrdinal("market_cap_change_percentage")) ? null : (decimal?)reader.GetDecimal(reader.GetOrdinal("market_cap_change_percentage")),
              LastUpdated = reader.GetDateTime(reader.GetOrdinal("last_updated"))
            };
            performanceData.Add(performance);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while trying to get Bitcoin monthly performance data. " + ex.Message, null, "BITCOIN_PERF", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return performanceData;
    }


    [HttpGet("/CoinValue/GetLatestCoinMarketCaps", Name = "GetLatestCoinMarketCaps")]
    public async Task<List<CoinMarketCap>> GetLatestCoinMarketCaps(CancellationToken ct = default)
    {
      var coinMarketCaps = new List<CoinMarketCap>(64);

      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      try
      {
        await conn.OpenAsync(ct);

        // 1) Fast path: latest market caps + latest prices (from latest_coin_value)
        const string latestFirstSql = @"
WITH latest_market_caps AS (
    SELECT
        c1.coin_id,
        c1.symbol,
        c1.name,
        c1.market_cap_usd,
        c1.market_cap_cad,
        c1.price_usd AS mc_price_usd,
        c1.price_cad AS mc_price_cad,
        c1.price_change_percentage_24h,
        c1.inflow_change_24h,
        c1.recorded_at
    FROM coin_market_caps c1
    INNER JOIN (
        SELECT coin_id, MAX(recorded_at) AS max_time
        FROM coin_market_caps
        GROUP BY coin_id
    ) c2
      ON c1.coin_id = c2.coin_id AND c1.recorded_at = c2.max_time
    ORDER BY c1.market_cap_usd DESC
    LIMIT 30
)
SELECT
    mc.coin_id,
    mc.symbol,
    mc.name,
    mc.market_cap_usd,
    mc.market_cap_cad,
    COALESCE(lcv.value_usd, mc.mc_price_usd) AS price_usd,
    COALESCE(lcv.value_cad, mc.mc_price_cad) AS price_cad,
    mc.price_change_percentage_24h,
    mc.inflow_change_24h,
    mc.recorded_at,
    lcv.`timestamp` AS price_timestamp
FROM latest_market_caps mc
LEFT JOIN latest_coin_value lcv
  ON mc.name = lcv.name
ORDER BY mc.market_cap_usd DESC;";

        await using (var cmd = new MySqlCommand(latestFirstSql, conn) { CommandTimeout = 12 })
        await using (var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess, ct))
        {
          while (await reader.ReadAsync(ct))
          {
            coinMarketCaps.Add(new CoinMarketCap
            {
              CoinId = reader.IsDBNull(reader.GetOrdinal("coin_id")) ? null : reader.GetString(reader.GetOrdinal("coin_id")),
              Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
              Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
              MarketCapUSD = reader.IsDBNull(reader.GetOrdinal("market_cap_usd")) ? 0m : reader.GetDecimal(reader.GetOrdinal("market_cap_usd")),
              MarketCapCAD = reader.IsDBNull(reader.GetOrdinal("market_cap_cad")) ? 0m : reader.GetDecimal(reader.GetOrdinal("market_cap_cad")),
              PriceUSD = reader.IsDBNull(reader.GetOrdinal("price_usd")) ? 0m : reader.GetDecimal(reader.GetOrdinal("price_usd")),
              PriceCAD = reader.IsDBNull(reader.GetOrdinal("price_cad")) ? 0m : reader.GetDecimal(reader.GetOrdinal("price_cad")),
              PriceChangePercentage24h = reader.IsDBNull(reader.GetOrdinal("price_change_percentage_24h")) ? 0m : reader.GetDecimal(reader.GetOrdinal("price_change_percentage_24h")),
              InflowChange24h = reader.IsDBNull(reader.GetOrdinal("inflow_change_24h")) ? 0m : reader.GetDecimal(reader.GetOrdinal("inflow_change_24h")),
              RecordedAt = reader.GetDateTime(reader.GetOrdinal("recorded_at")),
              PriceTimestamp = reader.IsDBNull(reader.GetOrdinal("price_timestamp")) ? (DateTime?)null : reader.GetDateTime(reader.GetOrdinal("price_timestamp"))
            });
          }
        }

        // If we got rows (which we almost always will), return
        if (coinMarketCaps.Count > 0)
          return coinMarketCaps;

        // 2) Fallback: compute latest prices from historical coin_value (your current approach)
        const string fallbackSql = @"
WITH latest_market_caps AS (
    SELECT
        c1.coin_id,
        c1.symbol,
        c1.name,
        c1.market_cap_usd,
        c1.market_cap_cad,
        c1.price_usd AS mc_price_usd,
        c1.price_cad AS mc_price_cad,
        c1.price_change_percentage_24h,
        c1.inflow_change_24h,
        c1.recorded_at
    FROM coin_market_caps c1
    INNER JOIN (
        SELECT coin_id, MAX(recorded_at) AS max_time
        FROM coin_market_caps
        GROUP BY coin_id
    ) c2
      ON c1.coin_id = c2.coin_id AND c1.recorded_at = c2.max_time
    ORDER BY c1.market_cap_usd DESC
    LIMIT 30
),
latest_coin_values AS (
    SELECT
        v1.name,
        v1.value_usd,
        v1.value_cad,
        v1.`timestamp`
    FROM coin_value v1
    INNER JOIN (
        SELECT name, MAX(`timestamp`) AS max_time
        FROM coin_value
        GROUP BY name
    ) v2
      ON v1.name = v2.name AND v1.`timestamp` = v2.max_time
)
SELECT
    mc.coin_id,
    mc.symbol,
    mc.name,
    mc.market_cap_usd,
    mc.market_cap_cad,
    COALESCE(cv.value_usd, mc.mc_price_usd) AS price_usd,
    COALESCE(cv.value_cad, mc.mc_price_cad) AS price_cad,
    mc.price_change_percentage_24h,
    mc.inflow_change_24h,
    mc.recorded_at,
    cv.`timestamp` AS price_timestamp
FROM latest_market_caps mc
LEFT JOIN latest_coin_values cv
  ON mc.name = cv.name
ORDER BY mc.market_cap_usd DESC;";

        coinMarketCaps.Clear(); // just in case
        await using var fbCmd = new MySqlCommand(fallbackSql, conn) { CommandTimeout = 15 };
        await using var fbReader = await fbCmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess, ct);
        while (await fbReader.ReadAsync(ct))
        {
          coinMarketCaps.Add(new CoinMarketCap
          {
            CoinId = fbReader.IsDBNull(fbReader.GetOrdinal("coin_id")) ? null : fbReader.GetString(fbReader.GetOrdinal("coin_id")),
            Symbol = fbReader.IsDBNull(fbReader.GetOrdinal("symbol")) ? null : fbReader.GetString(fbReader.GetOrdinal("symbol")),
            Name = fbReader.IsDBNull(fbReader.GetOrdinal("name")) ? null : fbReader.GetString(fbReader.GetOrdinal("name")),
            MarketCapUSD = fbReader.IsDBNull(fbReader.GetOrdinal("market_cap_usd")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("market_cap_usd")),
            MarketCapCAD = fbReader.IsDBNull(fbReader.GetOrdinal("market_cap_cad")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("market_cap_cad")),
            PriceUSD = fbReader.IsDBNull(fbReader.GetOrdinal("price_usd")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("price_usd")),
            PriceCAD = fbReader.IsDBNull(fbReader.GetOrdinal("price_cad")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("price_cad")),
            PriceChangePercentage24h = fbReader.IsDBNull(fbReader.GetOrdinal("price_change_percentage_24h")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("price_change_percentage_24h")),
            InflowChange24h = fbReader.IsDBNull(fbReader.GetOrdinal("inflow_change_24h")) ? 0m : fbReader.GetDecimal(fbReader.GetOrdinal("inflow_change_24h")),
            RecordedAt = fbReader.GetDateTime(fbReader.GetOrdinal("recorded_at")),
            PriceTimestamp = fbReader.IsDBNull(fbReader.GetOrdinal("price_timestamp")) ? (DateTime?)null : fbReader.GetDateTime(fbReader.GetOrdinal("price_timestamp"))
          });
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"An error occurred while trying to get the latest coin market caps: {ex.Message}", null, "MCS", true);
      }
      finally
      {
        await conn.CloseAsync();
      }

      return coinMarketCaps;
    }

    private async Task<CryptoWallet?> GetWalletFromDb(int? userId, string type, CancellationToken ct = default)
    {
      if (userId == null) return null;

      var typeNorm = type?.Trim();
      if (string.IsNullOrWhiteSpace(typeNorm) || !AllowedWalletTypes.Contains(typeNorm))
        throw new ArgumentException($"Unsupported wallet type: '{type}'", nameof(type));

      var typeUpper = typeNorm.ToUpperInvariant();
      var typeLower = typeNorm.ToLowerInvariant();

      var wallet = new CryptoWallet
      {
        total = new Total
        {
          currency = typeUpper,
          totalBalance = "0",
          available = "0",
          debt = "0",
          pending = "0"
        },
        currencies = new List<Currency>()
      };

      try
      {
        await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
        await conn.OpenAsync(ct);

        // 1) User currency (default CAD if not set)
        string userCurrency = "CAD";
        const string userCurrencySql = "SELECT currency FROM user_about WHERE user_id = @UserId LIMIT 1;";
        await using (var currencyCmd = new MySqlCommand(userCurrencySql, conn) { CommandTimeout = 8 })
        {
          currencyCmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId.Value;
          var result = await currencyCmd.ExecuteScalarAsync(ct);
          if (result != null && result != DBNull.Value)
            userCurrency = Convert.ToString(result)!.Trim();
        }

        // Normalize the coin name for price lookups (e.g., BTC/XBT -> 'Bitcoin', ETH -> 'Ethereum', etc.)
        string normalizedCoinName = CoinNameMap.TryGetValue(typeUpper, out var toName) ? toName : typeUpper;

        // 2) Coin → CAD rate (prefer latest_coin_value, fallback to coin_value)
        decimal coinToCad = 0m;

        // 2a) FAST PATH: latest_coin_value
        const string latestCoinSql = @"
SELECT value_cad
FROM latest_coin_value
WHERE name = @Name
LIMIT 1;";
        await using (var latestCoinCmd = new MySqlCommand(latestCoinSql, conn) { CommandTimeout = 6 })
        {
          latestCoinCmd.Parameters.Add("@Name", MySqlDbType.VarChar, 100).Value = normalizedCoinName;
          var coinResult = await latestCoinCmd.ExecuteScalarAsync(ct);
          if (coinResult != null && coinResult != DBNull.Value)
          {
            coinToCad = Convert.ToDecimal(coinResult);
          }
          else
          {
            // 2b) Fallback: historical table
            const string coinSql = @"
SELECT value_cad
FROM coin_value
WHERE name = @Name
ORDER BY `timestamp` DESC, id DESC
LIMIT 1;";
            await using var coinCmd = new MySqlCommand(coinSql, conn) { CommandTimeout = 8 };
            coinCmd.Parameters.Add("@Name", MySqlDbType.VarChar, 100).Value = normalizedCoinName;
            var legacyCoinResult = await coinCmd.ExecuteScalarAsync(ct);
            if (legacyCoinResult != null && legacyCoinResult != DBNull.Value)
              coinToCad = Convert.ToDecimal(legacyCoinResult);
          }
        }

        // 3) CAD → user currency (prefer latest_exchange_rate, fallback to exchange_rates)
        decimal cadToUserCurrency = 1m; // Identity if userCurrency == CAD or rate missing
        if (!userCurrency.Equals("CAD", StringComparison.OrdinalIgnoreCase))
        {
          // Primary: latest_exchange_rate (fast, small)
          const string latestFxSql = @"
SELECT rate
FROM latest_exchange_rate
WHERE base_currency = 'CAD' AND target_currency = @Target
LIMIT 1;";
          bool gotLatest = false;
          await using (var latestFxCmd = new MySqlCommand(latestFxSql, conn) { CommandTimeout = 8 })
          {
            latestFxCmd.Parameters.Add("@Target", MySqlDbType.VarChar, 10).Value = userCurrency;
            var fxResult = await latestFxCmd.ExecuteScalarAsync(ct);
            if (fxResult != null && fxResult != DBNull.Value)
            {
              cadToUserCurrency = Convert.ToDecimal(fxResult);
              gotLatest = true;
            }
          }

          // Fallback: exchange_rates (ordered for determinism)
          if (!gotLatest)
          {
            const string legacyFxSql = @"
SELECT rate
FROM exchange_rates FORCE INDEX (ix_exchange_rates_target_ts_id)
WHERE base_currency = 'CAD' AND target_currency = @Target
ORDER BY `timestamp` DESC, id DESC
LIMIT 1;";
            await using var legacyFxCmd = new MySqlCommand(legacyFxSql, conn) { CommandTimeout = 8 };
            legacyFxCmd.Parameters.Add("@Target", MySqlDbType.VarChar, 10).Value = userCurrency;
            var legacyFxResult = await legacyFxCmd.ExecuteScalarAsync(ct);
            if (legacyFxResult != null && legacyFxResult != DBNull.Value)
              cadToUserCurrency = Convert.ToDecimal(legacyFxResult);
          }
        }

        // 4) Compute coin → user's fiat rate
        decimal fiatRate = coinToCad * cadToUserCurrency;

        // 5) Latest balances per wallet for this user & type (dynamic tables limited by whitelist)
        string walletSql = $@"
SELECT
    wi.{typeLower}_address AS address,
    wb.balance,
    wb.fetched_at
FROM user_{typeLower}_wallet_info wi
JOIN (
    SELECT wallet_id, MAX(fetched_at) AS latest_fetch
    FROM user_{typeLower}_wallet_balance
    GROUP BY wallet_id
) latest ON wi.id = latest.wallet_id
JOIN user_{typeLower}_wallet_balance wb
  ON wb.wallet_id = latest.wallet_id
 AND wb.fetched_at = latest.latest_fetch
WHERE wi.user_id = @UserId;";

        await using var cmd = new MySqlCommand(walletSql, conn) { CommandTimeout = 15 };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId.Value;

        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess, ct);

        decimal totalBalance = 0m;
        decimal totalAvailable = 0m;

        int addressOrdinal = reader.GetOrdinal("address");
        int balanceOrdinal = reader.GetOrdinal("balance");
        int fetchedAtOrdinal = reader.GetOrdinal("fetched_at");

        while (await reader.ReadAsync(ct))
        {
          decimal finalBalance = reader.IsDBNull(balanceOrdinal) ? 0m : reader.GetDecimal(balanceOrdinal);
          string address = reader.IsDBNull(addressOrdinal) ? "" : reader.GetString(addressOrdinal);

          var currency = new Currency
          {
            active = true,
            address = address,
            currency = typeUpper,
            totalBalance = finalBalance.ToString("F8", System.Globalization.CultureInfo.InvariantCulture),
            available = finalBalance.ToString("F8", System.Globalization.CultureInfo.InvariantCulture),
            debt = "0",
            pending = "0",
            btcRate = 1, // if 'type' is BTC; otherwise adjust if you need cross-coin rates
            fiatRate = Convert.ToDouble(fiatRate),
            status = "active"
          };

          wallet.currencies.Add(currency);
          totalBalance += finalBalance;
          totalAvailable += finalBalance;
        }

        wallet.total.totalBalance = totalBalance.ToString("F8", System.Globalization.CultureInfo.InvariantCulture);
        wallet.total.available = totalAvailable.ToString("F8", System.Globalization.CultureInfo.InvariantCulture);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"An error occurred while fetching {typeUpper} wallet data from the database. " + ex.Message, userId, "USER", true);
        throw;
      }

      return wallet;
    }
  }


  public class CoinValue
  {
    public int Id { get; set; }
    public string? Symbol { get; set; }
    public string? Name { get; set; }
    public decimal ValueCAD { get; set; }
    public decimal? ValueUSD { get; set; }
    public DateTime Timestamp { get; set; }
  }

  public class ExchangeRate
  {
    public int Id { get; set; }
    public string? BaseCurrency { get; set; }
    public string? TargetCurrency { get; set; }
    public decimal Rate { get; set; }
    public DateTime Timestamp { get; set; }
  }
  public class FearGreedResponse
  {
    public DateTime TimestampUtc { get; set; }
    public int Value { get; set; }
    public string? Classification { get; set; }
  }
}