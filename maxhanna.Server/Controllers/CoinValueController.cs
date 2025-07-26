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
		private const int TRUNCATE_DAY = 120; // 2 minutes for <= 1 day
		private const int TRUNCATE_WEEK = 900; // 15 minutes for > 1 day and <= 1 week
		private const int TRUNCATE_MONTH = 3600; // 1 hour for > 1 week and <= 1 month
		private const int TRUNCATE_YEAR = 14400; // 4 hours for > 1 month and <= 1 year
		private const int TRUNCATE_LONG_TERM = 86400; // 1 day for > 1 year
		private const double HOURS_IN_WEEK = 168; // 7 days * 24 hours
		private const double HOURS_IN_MONTH = 720; // 30 days * 24 hours
		private const double HOURS_IN_YEAR = 8760; // 365 days * 24 hours

		public CoinValueController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/CoinValue/", Name = "GetAllCoinValues")]
		public async Task<List<CoinValue>> GetAllCoinValues()
		{
			var coinValues = new List<CoinValue>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var coinValue = new CoinValue
						{
							Id = reader.GetInt32(reader.GetOrdinal("id")),
							Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
							Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
							ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
							Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
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

		[HttpPost("/CoinValue/GetWalletBalanceData", Name = "GetWalletBalanceData")]
		public async Task<List<CoinValue>> GetWalletBalanceData([FromBody] string walletAddress)
		{
			var coinValues = new List<CoinValue>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"
					SELECT 
							wi.id AS wallet_id,
							wi.btc_address,
							wb.balance, 
							wb.fetched_at
					FROM user_btc_wallet_info wi
					LEFT JOIN user_btc_wallet_balance wb 
							ON wi.id = wb.wallet_id
					WHERE wi.btc_address = @WalletAddress";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@WalletAddress", walletAddress);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var coinValue = new CoinValue
						{
							Id = reader.GetInt32(reader.GetOrdinal("wallet_id")),
							Symbol = "BTC",
							Name = "Bitcoin",
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


		[HttpPost("/CurrencyValue/", Name = "GetAllCurrencyValues")]
		public async Task<List<ExchangeRate>> GetAllCurrencyValues()
		{
			var exchangeRates = new List<ExchangeRate>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"SELECT id, base_currency, target_currency, rate, timestamp FROM maxhanna.exchange_rates";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
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

		[HttpPost("/CurrencyValue/GetCurrencyNames", Name = "GetCurrencyNames")]
		public async Task<List<string>> GetCurrencyNames()
		{
			List<string> currencies = new List<string>();
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				string sql = "SELECT DISTINCT target_currency FROM maxhanna.exchange_rates";

				MySqlCommand cmd = new MySqlCommand(sql, conn);


				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						currencies.Add(reader.GetString(reader.GetOrdinal("target_currency")));
					}
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
		public async Task<List<CoinValue>> GetLatestCoinValues()
		{
			var coinValues = new List<CoinValue>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// SQL query to get the latest values for each coin by symbol (or id)
				string sql = @"
					SELECT cv.id, cv.symbol, cv.name, cv.value_cad, cv.value_usd, cv.timestamp
					FROM coin_value cv
					JOIN (
						SELECT name, MAX(timestamp) as max_timestamp
						FROM coin_value
						GROUP BY name
					) latest ON cv.name = latest.name AND cv.timestamp = latest.max_timestamp
					LIMIT 100;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var coinValue = new CoinValue
						{
							Id = reader.GetInt32(reader.GetOrdinal("id")),
							Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
							Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
							ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
							ValueUSD = reader.IsDBNull(reader.GetOrdinal("value_usd")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_usd")),
							Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
						};
						coinValues.Add(coinValue);
					}
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
		public async Task<List<ExchangeRate>> GetLatestCurrencyValues()
		{
			var exchangeRates = new List<ExchangeRate>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// Get the latest timestamp
				string timestampSql = @"SELECT MAX(timestamp) FROM maxhanna.exchange_rates";
				MySqlCommand timestampCmd = new MySqlCommand(timestampSql, conn);
				var latestTimestamp = await timestampCmd.ExecuteScalarAsync() as DateTime?;

				if (latestTimestamp != null)
				{
					string sql = @"SELECT id, base_currency, target_currency, rate, timestamp FROM exchange_rates WHERE timestamp = @latestTimestamp";
					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
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
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while trying to get the latest coin values. " + ex.Message, null, "COIN", true);
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

				string sql = @"SELECT DISTINCT target_currency FROM exchange_rates;";
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
		public async Task<CoinValue> GetLatestCoinValuesByName(string name)
		{
			var coinValue = new CoinValue();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// Get the latest timestamp
				string timestampSql = @"SELECT MAX(timestamp) FROM coin_value WHERE LOWER(name) = LOWER(@name)";
				MySqlCommand timestampCmd = new MySqlCommand(timestampSql, conn);
				timestampCmd.Parameters.AddWithValue("@name", name);
				var latestTimestamp = await timestampCmd.ExecuteScalarAsync() as DateTime?;

				if (latestTimestamp != null)
				{
					string sql = @"SELECT id, symbol, name, value_cad, value_usd, timestamp FROM coin_value WHERE LOWER(name) = LOWER(@name) AND timestamp = @latestTimestamp LIMIT 1";
					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@name", name);
					cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
					using (var reader = await cmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							var tmpCoinValue = new CoinValue
							{
								Id = reader.GetInt32(reader.GetOrdinal("id")),
								Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
								Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
								ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
								ValueUSD = reader.IsDBNull(reader.GetOrdinal("value_usd")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_usd")),
								Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
							};
							return tmpCoinValue;
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while trying to get the latest coin values by name." + ex.Message, null, "COIN", true);
			}
			finally
			{
				await conn.CloseAsync();
			}

			return coinValue;
		}

		[HttpPost("/CoinValue/IsBTCRising", Name = "IsBTCRising")]
		public async Task<bool> IsBTCRising()
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// Single query to get both latest price and price from one day ago
				string sql = @"
            SELECT  
							(SELECT value_cad 
							 FROM coin_value 
							 WHERE name = 'Bitcoin' 
							 ORDER BY timestamp DESC 
							 LIMIT 1) AS latest_price,
 
							(SELECT value_cad 
							 FROM coin_value 
							 WHERE name = 'Bitcoin' 
								 AND timestamp <= DATE_SUB(NOW(), INTERVAL 1 DAY)
							 ORDER BY timestamp DESC 
							 LIMIT 1) AS previous_price;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						var latestPrice = reader.IsDBNull(0) ? (decimal?)null : reader.GetDecimal(0);
						var previousPrice = reader.IsDBNull(1) ? (decimal?)null : reader.GetDecimal(1);

						if (latestPrice.HasValue && previousPrice.HasValue)
						{
							return latestPrice.Value > previousPrice.Value;
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while checking if BTC is rising." + ex.Message, null, "COIN", true);
			}
			finally
			{
				await conn.CloseAsync();
			}

			return false;
		}



		[HttpPost("/CurrencyValue/GetLatestByName/{name}", Name = "GetLatestCurrencyValuesByName")]
		public async Task<ExchangeRate> GetLatestCurrencyValuesByName(string name)
		{
			var exchangeRates = new ExchangeRate();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// Get the latest timestamp
				string timestampSql = @"SELECT MAX(timestamp) FROM maxhanna.exchange_rates WHERE LOWER(target_currency) = LOWER(@name)";
				MySqlCommand timestampCmd = new MySqlCommand(timestampSql, conn);
				timestampCmd.Parameters.AddWithValue("@name", name);
				var latestTimestamp = await timestampCmd.ExecuteScalarAsync() as DateTime?;

				if (latestTimestamp != null)
				{
					string sql = @"SELECT id, base_currency, target_currency, rate, timestamp FROM maxhanna.exchange_rates WHERE LOWER(target_currency) = LOWER(@name) AND timestamp = @latestTimestamp LIMIT 1";
					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@name", name);
					cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
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
							return exchangeRate;
						}
					}
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

			return exchangeRates;
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

		[HttpGet("/CoinValue/GetLatestCoinMarketCaps", Name = "GetLatestCoinMarketCaps")]
		public async Task<List<CoinMarketCap>> GetLatestCoinMarketCaps()
		{
			var coinMarketCaps = new List<CoinMarketCap>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// Get the latest 30 coin market caps, ensuring distinct coins by coin_id
				string sql = @"
					SELECT coin_id, symbol, name, market_cap_usd, market_cap_cad, price_usd, price_cad, 
						price_change_percentage_24h, inflow_change_24h, recorded_at
					FROM coin_market_caps
					WHERE recorded_at IN (
						SELECT MAX(recorded_at)
						FROM coin_market_caps
						GROUP BY coin_id
					)
					ORDER BY market_cap_usd DESC
					LIMIT 30";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var coinMarketCap = new CoinMarketCap
						{
							CoinId = reader.IsDBNull(reader.GetOrdinal("coin_id")) ? null : reader.GetString(reader.GetOrdinal("coin_id")),
							Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
							Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
							MarketCapUSD = reader.IsDBNull(reader.GetOrdinal("market_cap_usd")) ? 0 : reader.GetDecimal(reader.GetOrdinal("market_cap_usd")),
							MarketCapCAD = reader.IsDBNull(reader.GetOrdinal("market_cap_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("market_cap_cad")),
							PriceUSD = reader.IsDBNull(reader.GetOrdinal("price_usd")) ? 0 : reader.GetDecimal(reader.GetOrdinal("price_usd")),
							PriceCAD = reader.IsDBNull(reader.GetOrdinal("price_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("price_cad")),
							PriceChangePercentage24h = reader.IsDBNull(reader.GetOrdinal("price_change_percentage_24h")) ? 0 : reader.GetDecimal(reader.GetOrdinal("price_change_percentage_24h")),
							InflowChange24h = reader.IsDBNull(reader.GetOrdinal("inflow_change_24h")) ? 0 : reader.GetDecimal(reader.GetOrdinal("inflow_change_24h")),
							RecordedAt = reader.GetDateTime(reader.GetOrdinal("recorded_at"))
						};
						coinMarketCaps.Add(coinMarketCap);
					}
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

		private async Task<CryptoWallet?> GetWalletFromDb(int? userId, string type)
		{
			if (userId == null) { return null; }
			type = type.ToLower();
			if (type != "btc" && type != "usdc" && type != "xrp" && type != "sol" && type != "xdg" && type != "eth") return null;

			var wallet = new CryptoWallet
			{
				total = new Total
				{
					currency = type.ToUpper(),
					totalBalance = "0",
					available = "0",
					debt = "0",
					pending = "0"
				},
				currencies = new List<Currency>()
			};

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();


					string userCurrency = "CAD"; // fallback
					decimal coinToCad = 0;
					decimal cadToUserCurrency = 1;

					using (var currencyCmd = new MySqlCommand("SELECT currency FROM user_about WHERE user_id = @UserId", conn))
					{
						currencyCmd.Parameters.AddWithValue("@UserId", userId);
						var result = await currencyCmd.ExecuteScalarAsync();
						if (result != null && result != DBNull.Value)
							userCurrency = result.ToString()!;
					}
					using (var coinCmd = new MySqlCommand(@"
						SELECT value_cad 
						FROM coin_value 
						WHERE symbol = @Symbol 
						ORDER BY timestamp DESC 
						LIMIT 1", conn))
					{
						coinCmd.Parameters.AddWithValue("@Symbol", type.ToUpper());
						var coinResult = await coinCmd.ExecuteScalarAsync();
						if (coinResult != null && coinResult != DBNull.Value)
							coinToCad = Convert.ToDecimal(coinResult);
					}
					if (userCurrency != "CAD")
					{
						using (var rateCmd = new MySqlCommand(@"
							SELECT rate 
							FROM exchange_rates 
							WHERE base_currency = 'CAD' AND target_currency = @Target 
							ORDER BY timestamp DESC 
							LIMIT 1", conn))
						{
							rateCmd.Parameters.AddWithValue("@Target", userCurrency);
							var rateResult = await rateCmd.ExecuteScalarAsync();
							if (rateResult != null && rateResult != DBNull.Value)
								cadToUserCurrency = Convert.ToDecimal(rateResult);
						}
					}

					decimal fiatRate = coinToCad * cadToUserCurrency;

					string sql = $@"
						SELECT DISTINCT
							wi.{type}_address, 
							wb.balance,  
							wb.fetched_at
						FROM user_{type}_wallet_info wi
						JOIN (
							SELECT wallet_id, MAX(fetched_at) as latest_fetch
							FROM user_{type}_wallet_balance
							GROUP BY wallet_id
						) latest ON wi.id = latest.wallet_id
						JOIN user_{type}_wallet_balance wb ON latest.wallet_id = wb.wallet_id 
							AND latest.latest_fetch = wb.fetched_at
						WHERE wi.user_id = @UserId;
						);";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);

						using (var reader = await cmd.ExecuteReaderAsync())
						{
							decimal totalBalance = 0;
							decimal totalAvailable = 0;

							while (await reader.ReadAsync())
							{
								// Retrieve the final balance as Int64 and convert to decimal
								decimal finalBalance = reader.GetDecimal("balance");
								string address = reader.GetString($"{type}_address");
								var currency = new Currency
								{
									active = true,
									address = address,
									currency = type.ToUpper(),
									totalBalance = finalBalance.ToString("F8"),
									available = finalBalance.ToString("F8"),
									debt = "0",
									pending = "0",
									btcRate = 1,
									fiatRate = Convert.ToDouble(fiatRate),
									status = "active"
								};

								wallet.currencies.Add(currency);

								// Accumulate totals
								totalBalance += finalBalance;
								totalAvailable += finalBalance;
							}

							// Update totals in MiningWallet
							wallet.total.totalBalance = totalBalance.ToString("F8");
							wallet.total.available = totalAvailable.ToString("F8");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while fetching {type.ToUpper()} wallet data from the database. " + ex.Message, userId, "USER", true);
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
