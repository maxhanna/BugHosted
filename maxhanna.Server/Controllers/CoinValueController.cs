using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CoinValueController : ControllerBase
	{
		private Log _log;
		private readonly IConfiguration _config;

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

		[HttpPost("/CoinValue/GetAllForGraph", Name = "GetAllCoinValuesForGraph")]
		public async Task<List<CoinValue>> GetAllCoinValuesForGraph([FromBody] GraphRangeRequest request)
		{
			var coinValues = new List<CoinValue>();
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			if (request.From == null) { request.From = new DateTime(); }
			try
			{
				await conn.OpenAsync();

				// Split the range in half (handle odd numbers by flooring one side, ceiling the other)
			 
				var actualFrom = request.From.Value.AddHours(-1 * (request.HourRange ?? 24));
				var actualTo = request.From.Value.AddHours(request.HourRange ?? 24);

				string sql = @$"
					SELECT id, symbol, name, value_cad, timestamp
					FROM coin_value
					{(request.HourRange != 0 ? " WHERE timestamp >= @From AND timestamp <= @To " : "")}
					ORDER BY timestamp ASC;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@From", actualFrom);
				cmd.Parameters.AddWithValue("@To", actualTo);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var coinValue = new CoinValue
						{
							Id = reader.GetInt32("id"),
							Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
							Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
							ValueCAD =  reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
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

				string sql = $@" 
					SELECT id, base_currency, target_currency, rate, timestamp
					FROM maxhanna.exchange_rates 
					{(request.HourRange != 0 ? " WHERE timestamp >= @From AND timestamp <= @To " : "")}
					ORDER BY timestamp ASC;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@From", actualFrom);
				cmd.Parameters.AddWithValue("@To", actualTo); 
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
            SELECT id, symbol, name, value_cad, timestamp
						FROM coin_value
						WHERE (name, timestamp) IN (
								SELECT name, MAX(timestamp)
								FROM coin_value
								GROUP BY name
						) LIMIT 100;";

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
					string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value WHERE LOWER(name) = LOWER(@name) AND timestamp = @latestTimestamp LIMIT 1";
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
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

			try
			{
				// Call the private method to get wallet info from the database
				CryptoWallet? btcWallet = await GetWalletFromDb(userId, "btc");
				CryptoWallet? usdcWallet = await GetWalletFromDb(userId, "usdc");
				List<CryptoWallet> returns = new List<CryptoWallet>();
				if (btcWallet != null)
				{
					returns.Add(btcWallet);
				}
				if (usdcWallet != null)
				{
					returns.Add(usdcWallet);
				}

				bool check1 = (btcWallet != null && btcWallet.currencies != null && btcWallet.currencies.Count > 0);
				bool check2 = (usdcWallet != null && usdcWallet.currencies != null && usdcWallet.currencies.Count > 0);

				if ((check1 || check2) && returns.Count > 0)
				{
					return Ok(returns);
				}
				else
				{
					return NotFound("No wallet addresses found for the user.");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing GetWalletData. " + ex.Message, userId, "USER", true);
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

		private async Task<CryptoWallet?> GetWalletFromDb(int? userId, string type)
		{
			if (userId == null) { return null; }
			if (type != "btc" && type != "usdc") return null;
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

					string sql = $@"
					SELECT 
						wi.{type}_address, 
						wb.balance,  
						wb.fetched_at
					FROM user_{type}_wallet_info wi
					LEFT JOIN user_{type}_wallet_balance wb ON wi.id = wb.wallet_id
					WHERE wi.user_id = @UserId 
					AND wb.fetched_at = (
						SELECT MAX(fetched_at) 
						FROM user_{type}_wallet_balance 
						WHERE wallet_id = wi.id
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
									fiatRate = null,
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
