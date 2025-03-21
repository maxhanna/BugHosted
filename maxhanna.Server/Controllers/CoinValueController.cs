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
		private readonly ILogger<CoinValueController> _logger;
		private readonly IConfiguration _config;

		public CoinValueController(ILogger<CoinValueController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
		}

		[HttpPost("/CoinValue/", Name = "GetAllCoinValues")]
		public async Task<List<CoinValue>> GetAllCoinValues()
		{
			_logger.LogInformation("GET /CoinValue/GetAll");
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
				_logger.LogError(ex, "An error occurred while trying to get all coin values.");
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
			_logger.LogInformation("GET /CoinValue/GetWalletBalanceData");
			var coinValues = new List<CoinValue>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"
					SELECT 
							wi.id AS wallet_id,
							wi.btc_address,
							wb.final_balance,
							wb.total_received,
							wb.total_sent,
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
							ValueCAD = reader.IsDBNull(reader.GetOrdinal("final_balance")) ? 0 : reader.GetDecimal(reader.GetOrdinal("final_balance")),
							Timestamp = reader.GetDateTime(reader.GetOrdinal("fetched_at"))
						};
						coinValues.Add(coinValue);
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while trying to get all coin values.");
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
			_logger.LogInformation("GET /CurrencyValue");
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
				_logger.LogError(ex, "An error occurred while trying to get all exchange rate values.");
			}
			finally
			{
				await conn.CloseAsync();
			}

			return exchangeRates;
		}

		[HttpPost("/CoinValue/GetLatest/", Name = "GetLatestCoinValues")]
		public async Task<List<CoinValue>> GetLatestCoinValues()
		{
			_logger.LogInformation("POST /CoinValue/GetLatest");
			var coinValues = new List<CoinValue>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				// Get the latest timestamp
				string timestampSql = @"SELECT MAX(timestamp) FROM coin_value";
				MySqlCommand timestampCmd = new MySqlCommand(timestampSql, conn);
				var latestTimestamp = await timestampCmd.ExecuteScalarAsync() as DateTime?;

				if (latestTimestamp != null)
				{
					string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value WHERE timestamp = @latestTimestamp";
					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
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
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while trying to get the latest coin values.");
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
			_logger.LogInformation("POST /CurrencyValue/GetLatest");
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
				_logger.LogError(ex, "An error occurred while trying to get the latest coin values.");
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
			_logger.LogInformation("POST /CurrencyValue/GetUniqueNames");
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
				_logger.LogError(ex, "An error occurred while trying to get the currency values.");
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
			_logger.LogInformation("POST /CurrencyValue/UpdateUserCurrency");
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
						cmd.Parameters.AddWithValue("@userId", req.User.Id);
						cmd.Parameters.AddWithValue("@currency", req.Currency);

						await cmd.ExecuteNonQueryAsync();
					}
				}
				catch (Exception ex)
				{
					_logger.LogError($"Error updating user currency: {ex.Message}");
					BadRequest(ex);
				}
			}

			return Ok("Updated user currency"); // Return the updated list of unique currencies
		}


		[HttpPost("/CurrencyValue/GetUserCurrency/", Name = "GetUserCurrency")]
		public async Task<IActionResult> GetUserCurrency([FromBody] User user)
		{
			_logger.LogInformation("POST /CurrencyValue/GetUserCurrency");

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
						cmd.Parameters.AddWithValue("@userId", user.Id);

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
					_logger.LogError($"Error retrieving user currency: {ex.Message}");
					return StatusCode(500, "An error occurred while fetching the user currency.");
				}
			}
		}



		[HttpPost("/CoinValue/GetLatestByName/{name}", Name = "GetLatestCoinValuesByName")]
		public async Task<CoinValue> GetLatestCoinValuesByName(string name)
		{
			_logger.LogInformation($"POST /CoinValue/GetLatestByName/{name}");
			var coinValues = new CoinValue();

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
					string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value WHERE LOWER(name) = LOWER(@name) AND timestamp = @latestTimestamp LIMIT 1";
					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@name", name);
					cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
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
							return coinValue;
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while trying to get the latest coin values by name.");
			}
			finally
			{
				await conn.CloseAsync();
			}

			return coinValues;
		}

		[HttpPost("/CoinValue/IsBTCRising", Name = "IsBTCRising")]
		public async Task<bool> IsBTCRising()
		{
			_logger.LogInformation("POST /CoinValue/IsBTCRising");

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
						//Console.WriteLine($"latestPrice : {latestPrice} versus previousPrice: {previousPrice}");

						if (latestPrice.HasValue && previousPrice.HasValue)
						{
							return latestPrice.Value > previousPrice.Value;
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while checking if BTC is rising.");
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
			_logger.LogInformation($"POST /CurrencyValue/GetLatestCurrencyValuesByName/{name}");
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
				_logger.LogError(ex, "An error occurred while trying to get the latest coin values by name.");
			}
			finally
			{
				await conn.CloseAsync();
			}

			return exchangeRates;
		}
	}

	public class CoinValue
	{
		public int Id { get; set; }
		public string? Symbol { get; set; }
		public string? Name { get; set; }
		public decimal ValueCAD { get; set; }
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
}
