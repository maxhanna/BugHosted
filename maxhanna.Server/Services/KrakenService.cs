using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

public class KrakenService
{
	private const decimal _MaximumTradeBalanceRatio = 0.9m;
	private const decimal _TradeThreshold = 0.007m;
	private const decimal _MinimumBTCTradeAmount = 0.00005m;
	private const decimal _ValueTradePercentage = 0.15m;
	private const decimal _BTCPriceDiscrepencyStopPercentage = 0.10m;
	private const decimal _InitialMinimumBTCAmountToStart = 0.001999m;
	private readonly HttpClient _httpClient;
	private static IConfiguration? _config;
	private readonly string _apiKey;
	private readonly string _privateKey;
	private readonly string _baseAddr = "https://api.kraken.com/";
	private readonly byte[] _privateKeyBytes; // Store as bytes
	private long _lastNonce;

	public KrakenService(IConfiguration config)
	{
		_config = config;
		_httpClient = new HttpClient();
		_apiKey = _config.GetValue<string>("Kraken:ApiKey")?.Trim() ?? "";
		_privateKey = _config.GetValue<string>("Kraken:PrivateKey")?.Trim() ?? "";
		_privateKeyBytes = ValidateAndDecodePrivateKey(_privateKey); // Store decoded bytes

	}

	public async Task<bool> MakeATrade(int userId = 1)
	{
		// 1. Cooldown and system check
		int? minutesSinceLastTrade = await GetMinutesSinceLastTrade(userId);
		if (minutesSinceLastTrade != null && minutesSinceLastTrade < 15)
		{
			Console.WriteLine($"User is in cooldown for another {(15 - minutesSinceLastTrade)} minutes. Trade Cancelled.");
			return false;
		}
		decimal? lastBTCValueCad = await IsSystemUpToDate();
		if (lastBTCValueCad == null)
		{
			Console.WriteLine("System is not up to date. Cancelling trade");
			return false;
		}

		// 2. Get last trade
		bool forceEqualizationCauseNoLastTrade = false;
		TradeRecord? lastTrade = await GetLastTradeJSONDeserialized(userId, lastBTCValueCad);
		if (lastTrade == null)
		{
			forceEqualizationCauseNoLastTrade = true;
		}

		// 3. If no last trade, we must equalize — get balances now
		if (forceEqualizationCauseNoLastTrade || lastTrade == null)
		{
			await TradeHalfBTCForUSDC(userId);
			return false;
		}

		// 4. Calculate spread
		decimal.TryParse(lastTrade.btc_price_cad, out decimal lastPrice);
		decimal currentPrice = lastBTCValueCad.Value;
		decimal spread = (currentPrice - lastPrice) / lastPrice; 

		if (Math.Abs(spread) >= _TradeThreshold)
		{
			// 5. Now we know a trade is needed — fetch balances
			var balances = await GetBalance();
			if (balances == null)
			{
				Console.WriteLine("Failed to get wallet balances");
				return false;
			}
			Console.WriteLine("Balances: ");
			foreach (var pair in balances)
			{
				Console.WriteLine($"{pair.Key}: {pair.Value}");
			}

			var btcPriceToCad = await GetBtcPriceToCad();
			if (!ValidatePriceDiscrepency(currentPrice, btcPriceToCad))
			{
				return false;
			}

			decimal btcBalance = balances.ContainsKey("XXBT") ? balances["XXBT"] : 0;
			decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;

			if (spread >= _TradeThreshold)
			{
				decimal btcToTrade = btcBalance * _ValueTradePercentage;
				decimal? usdToCadRate = await GetUsdToCadRate();
				Console.WriteLine("USD to CAD rate: " + usdToCadRate.Value + "; btcPriceToCad: " + btcPriceToCad);
				if (usdToCadRate.HasValue && btcPriceToCad.HasValue && (btcToTrade > 0))
				{
					// Convert the BTC price to USD
					decimal btcPriceInUsd = btcPriceToCad.Value / usdToCadRate.Value;

					// Now you can get the value of btcToTrade in USDC (1 USDC = 1 USD) 
					decimal btcValueInUsdc = btcToTrade * btcPriceInUsd; 
					Console.WriteLine($"BTC to trade in USDC: {btcValueInUsdc}");
					if (Is90PercentOfTotalWorth(btcValueInUsdc, usdcBalance)) 
					{
						Console.WriteLine($"Trade to USDC is prevented. 90% of wallet is already in USDC. {btcValueInUsdc}/{usdcBalance}");
						return false;
					}
				 
					Console.WriteLine($"Spread is +{spread:P}, selling {btcToTrade} BTC for USDC");
					await ExecuteXBTtoUSDCTrade(userId, btcToTrade.ToString("0.00000000"), "sell"); 
				}
				else
				{
					Console.WriteLine("Error fetching USDC exchange rates.");
					return false;
				} 
			}
			else if (spread <= -_TradeThreshold)
			{
				decimal usdcValueToTrade = usdcBalance * _ValueTradePercentage;
				if (Is90PercentOfTotalWorth(usdcBalance, usdcValueToTrade))
				{
					Console.WriteLine($"Trade to XBT is prevented. 90% of wallet is already in XBT. {usdcBalance}/{usdcValueToTrade}");
					return false;
				}
				if (btcPriceToCad == null)
				{
					Console.WriteLine("BTC price in CAD is unavailable.");
					return false;
				}

				decimal usdcToUse = usdcBalance * _ValueTradePercentage;
				if (usdcToUse > 0)
				{
					decimal? usdToCadRate = await GetUsdToCadRate();
					if (usdToCadRate == null)
					{
						Console.WriteLine("USD to CAD rate is unavailable.");
						return false;
					}
					Console.WriteLine("USD to CAD rate: " + usdToCadRate.Value);
					decimal usdAmount = usdcToUse;
					decimal cadAmount = usdAmount * usdToCadRate.Value;
					decimal btcAmount = cadAmount / btcPriceToCad.Value;

					Console.WriteLine($"Spread is {spread:P}, buying BTC with {btcAmount.ToString("0.00000000")} BTC worth of USDC(${usdcToUse})");
					await ExecuteXBTtoUSDCTrade(userId, btcAmount.ToString("0.00000000"), "buy");
				}
			}
		}
		else
		{
			decimal thresholdDifference = (Math.Abs(_TradeThreshold) - Math.Abs(spread)) * 100;
			Console.WriteLine($"Spread is {spread:P} ({currentPrice}-{lastPrice}), within threshold. No trade executed. It was {thresholdDifference:P} away from breaking the threshold.");
		}
		return true;
	}

	private bool ValidatePriceDiscrepency(decimal currentPrice, decimal? btcPriceToCad)
	{
		Console.WriteLine("btcPriceCad:" + btcPriceToCad);
		if (btcPriceToCad == null || !btcPriceToCad.HasValue)
		{
			Console.WriteLine("BTC price in CAD is unavailable.");
			return false;
		}
		decimal priceDiscrepancy = Math.Abs(currentPrice - btcPriceToCad.Value) / btcPriceToCad.Value;
		if (priceDiscrepancy >= _BTCPriceDiscrepencyStopPercentage)
		{
			Console.WriteLine($"⚠️ Price discrepancy too high ({priceDiscrepancy:P2}) between currentPrice: {currentPrice} and liveBtcPriceCad: {btcPriceToCad.Value}. Aborting trade.");
			return false;
		}
		return true;
	}

	private static bool Is90PercentOfTotalWorth(decimal fromBalance, decimal targetCurrencyBalance)
	{
		decimal totalBalance = fromBalance + targetCurrencyBalance;
		if (targetCurrencyBalance >= totalBalance * _MaximumTradeBalanceRatio)
		{ // Prevent trade to USDC if 90% of wallet is already in USDC
			return true;
		}
		return false;
	}

	private async Task<Dictionary<string, decimal>?> GetBalance()
	{
		try
		{
			// Fetch the balance response as a dictionary
			var balanceResponse = await MakeRequestAsync("/Balance", "private", new Dictionary<string, string>());

			// Check if the response contains the "result" key
			if (balanceResponse == null || !balanceResponse.ContainsKey("result"))
			{
				Console.WriteLine("Failed to get wallet balances: 'result' not found.");
				return null;
			}

			// Extract the result part of the response
			var result = (JObject)balanceResponse["result"];

			// Convert the result into a Dictionary<string, decimal> to store the balances
			var balanceDictionary = result.ToObject<Dictionary<string, decimal>>();

			return balanceDictionary;
		}
		catch (Exception ex)
		{
			// Handle any errors that occur during the request
			Console.WriteLine($"Error fetching balance: {ex.Message}");
			return null;
		}
	}
	private async Task<decimal?> GetBtcPriceToCad()
	{
		try
		{
			var pair = "XXBTZCAD";
			var response = await MakeRequestAsync("/Ticker", "public", new Dictionary<string, string> { ["pair"] = pair });
			//Console.WriteLine("Response: " + response.ToString()); 
			// Check if the response contains the expected "result" key
			if (response == null || !response.ContainsKey("result"))
			{
				Console.WriteLine("Failed to get BTC price in CAD: 'result' not found.");
				return null;
			}
			var result = (JObject)response["result"];
			if (!result.ContainsKey(pair))
			{
				Console.WriteLine("Failed to find XXBTZCAD pair in the response.");
				return null;
			}

			// Extract the ask price from the 'a' key (ask prices are in the array)
			var askArray = result[pair]["a"]?.ToObject<JArray>();
			if (askArray == null || askArray.Count < 1)
			{
				Console.WriteLine("Failed to extract ask price from response.");
				return null;
			}
			// The ask price is the first value in the array
			var askPrice = askArray[0].ToObject<decimal>();
			return askPrice;
		}
		catch (Exception ex)
		{
			Console.WriteLine($"Error fetching BTC price to CAD: {ex.Message}");
			return null;
		}
	}


	private async Task<decimal?> GetBtcPriceToUSDC()
	{
		try
		{
			var pair = "XXBTZUSD";
			var response = await MakeRequestAsync("/Ticker", "public", new Dictionary<string, string> { ["pair"] = pair });
			//Console.WriteLine("Response: " + response.ToString()); 
			// Check if the response contains the expected "result" key
			if (response == null || !response.ContainsKey("result"))
			{
				Console.WriteLine("Failed to get BTC price in USD: 'result' not found.");
				return null;
			}
			var result = (JObject)response["result"];
			if (!result.ContainsKey(pair))
			{
				Console.WriteLine("Failed to find XXBTZUSD pair in the response.");
				return null;
			}

			// Extract the ask price from the 'a' key (ask prices are in the array)
			var askArray = result[pair]["a"]?.ToObject<JArray>();
			if (askArray == null || askArray.Count < 1)
			{
				Console.WriteLine("Failed to extract ask price from response.");
				return null;
			}
			// The ask price is the first value in the array
			var askPrice = askArray[0].ToObject<decimal>();
			return askPrice;
		}
		catch (Exception ex)
		{
			Console.WriteLine($"Error fetching BTC price to USD: {ex.Message}");
			return null;
		}
	}

	private async Task TradeHalfBTCForUSDC(int userId)
	{
		decimal minBtc = _InitialMinimumBTCAmountToStart;
		var balances = await GetBalance();
		if (balances == null)
		{
			Console.WriteLine("Failed to get wallet balances");
			return;
		}
		decimal btcBalance = balances.ContainsKey("XXBT") ? balances["XXBT"] : 0;
		decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;

		Console.WriteLine($"Insufficient funds (BTC: {btcBalance}, USDC: {usdcBalance})");
		if (btcBalance > minBtc)
		{
			//Trade 50% of BTC balance TO USDC
			decimal halfTradePercentage = 0.5m;
			decimal btcToTrade = btcBalance * halfTradePercentage;
			if (btcToTrade > 0)
			{
				Console.WriteLine($"Starting user off with some USDC reserves");
				await ExecuteXBTtoUSDCTrade(userId, btcToTrade.ToString("0.00000000"), "sell");
			}
		}
		else
		{
			Console.WriteLine("Not enough BTC to trade.");
		}
	}

	private async Task ExecuteXBTtoUSDCTrade(int userId, string amount, string buyOrSell)
	{
		string from = "XBT";
		string to = "USDC";
		amount = amount.Trim();
		if (!await SaveTradeFootprint(userId, from, to, amount))
		{
			Console.WriteLine("Failed to save trade footprint. System likely not up-to-date. Cancelling trade.");
			return;
		}
		if (await GetLast3Of5WereSame(userId, from, to))
		{
			Console.WriteLine($"User has traded {from} {to} too many times in the last 5 trades. Cancelling trade.");
			return;
		}
		if (Convert.ToDecimal(amount) < _MinimumBTCTradeAmount)
		{
			Console.WriteLine($"Trade amount is too small. Cancelling trade.");
			return;
		}

		// fee is 0.25%; 
		var pair = $"{from}{to}";
		var parameters = new Dictionary<string, string>
		{
			["pair"] = pair,
			["type"] = buyOrSell,           // "buy" or "sell"
			["ordertype"] = "market",       // "market" or "limit"
			["volume"] = amount
		};

		Console.WriteLine($"Executing trade: {buyOrSell} {from}->{to}/{amount}");
		var response = await MakeRequestAsync("/AddOrder", "private", parameters);

		string? orderId = null;
		if (response.ContainsKey("result"))
		{
			var result = (JObject)response["result"];
			orderId = result["orderId"]?.ToString();
		} 
		// If we have an orderId, check its status.
		var statusResponse = await CheckOrderStatus(orderId);
		Console.WriteLine($"Order status: {statusResponse}");
		if (statusResponse != null)
		{
			if (statusResponse["status"]?.ToString() == "closed")
			{
				Console.WriteLine($"Trade successful: {from}->{to}/{amount}");
			}
			else
			{
				Console.WriteLine("Trade response: " + statusResponse["status"]);
			}
		} 
	}


	private async Task<dynamic> CheckOrderStatus(string orderId)
	{
		var parameters = new Dictionary<string, string>
		{
			["orderId"] = orderId
		};

		// Make the request to check the order status
		var response = await MakeRequestAsync("/QueryOrders", "private", parameters);

		// Check if the response contains "result"
		if (response != null && response.ContainsKey("result"))
		{
			var result = response["result"] as JObject;
			if (result != null)
			{
				// Check if the result contains the orderId key and return its value
				if (result[orderId] != null)
				{
					return result[orderId];  // Returns the status of the specific order
				}
			}
		}

		// Return null if no valid result was found
		return null;
	}
	private async Task<string> QueryOpenOrdersForPair(string pair)
	{
		// Build parameters to query open orders.
		// This is an example; adjust the endpoint and parameters per Kraken's API documentation.
		var parameters = new Dictionary<string, string>
		{
			["pair"] = pair
		};

		// Assume MakeRequestAsync returns a Dictionary<string, object>
		var response = await MakeRequestAsync("/OpenOrders", "private", parameters);
		// Convert the response to a JSON string for logging (or format as desired)
		return response != null ? JsonConvert.SerializeObject(response) : "No response";
	}


	private async Task DeleteTradeFootprint(int userId, string from, string to, string amount)
	{
		// Implement logic to delete trade footprint from your database
		Console.WriteLine($"Deleted trade footprint for {from} -> {to} {amount}");
		var deleteSql = @"
			DELETE FROM maxhanna.trade_history 
			WHERE user_id = @UserId 
			AND from_currency = @From 
			AND to_currency = @To  
			ORDER BY id DESC LIMIT 1;";
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var dltCmd = new MySqlCommand(deleteSql, conn);
			dltCmd.Parameters.AddWithValue("@UserId", userId);
			dltCmd.Parameters.AddWithValue("@From", from);
			dltCmd.Parameters.AddWithValue("@To", to);
			dltCmd.Parameters.AddWithValue("@Value", amount);

			using var reader = await dltCmd.ExecuteReaderAsync();
		}
		catch (Exception ex)
		{
			Console.WriteLine("Error deleting trade footprint: " + ex.Message);
		}
	}
	private async Task<decimal?> GetUsdToCadRate()
	{
		// SQL query to get the latest rate for CAD -> USD
		var selectSql = @"
        SELECT rate 
        FROM exchange_rates 
        WHERE base_currency = 'CAD' AND target_currency = 'USD' 
        ORDER BY timestamp DESC 
        LIMIT 1;";

		try
		{
			// Open connection to the database
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// Execute the query
			using var cmd = new MySqlCommand(selectSql, conn);
			var result = await cmd.ExecuteScalarAsync();

			// If result is not null, return it, otherwise return null
			return result != DBNull.Value ? (decimal?)(1 / Convert.ToDecimal(result)) : null;
		}
		catch (Exception ex)
		{
			// Handle any exceptions
			Console.WriteLine("Error fetching latest exchange rate: " + ex.Message);
			return null;
		}
	}

	private async Task<bool> SaveTradeFootprint(int userId, string from, string to, string valueCad)
	{
		decimal? lastBTCValueCad = await IsSystemUpToDate();
		if (lastBTCValueCad == null)
		{
			Console.WriteLine("System is not up to date. Cancelling trade");
			return false;
		}
		await CreateTradeHistory((decimal)lastBTCValueCad, valueCad, userId, from, to);
		return true;
	}

	private async Task<bool> GetLast3Of5WereSame(int userId, string from, string to)
	{
		var checkSql = @"
        SELECT from_currency
        FROM maxhanna.trade_history
        WHERE user_id = @UserId 
        ORDER BY timestamp DESC
        LIMIT 5;";
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@From", from);
			checkCmd.Parameters.AddWithValue("@To", to);

			using var reader = await checkCmd.ExecuteReaderAsync();

			// Store the last 5 'from_currency' values
			var fromCurrencies = new List<string>();

			int matches = 0;
			while (await reader.ReadAsync())
			{
				fromCurrencies.Add(reader.GetString(0));
				if (reader.GetString(0) == from)
				{
					matches++;
				}
			}
			return matches > 3;
		}
		catch (Exception ex)
		{
			Console.WriteLine("Error checking trades: " + ex.Message);
			return false;
		}
	}


	private async Task<TradeRecord?> GetLastTradeJSONDeserialized(int userId, decimal? lastBTCValueCad)
	{
		if (lastBTCValueCad == null)
		{
			Console.WriteLine("No trade history and no last BTC value. Cannot proceed.");
			return null;
		}
		TradeRecord? lastTrade = await GetLastTrade(userId);
		return lastTrade;
	}

	private async Task CreateTradeHistory(decimal currentBtcPrice, string valueCad, int userId, string from, string to)
	{
		var checkSql = @"
			INSERT INTO maxhanna.trade_history (user_id, from_currency, to_currency, value, timestamp, btc_price_cad) 
			VALUES (@UserId, @From, @To,  @Value, UTC_TIMESTAMP(), @BtcValueCad);";
		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@From", from);
			checkCmd.Parameters.AddWithValue("@To", to);
			checkCmd.Parameters.AddWithValue("@BtcValueCad", currentBtcPrice);
			checkCmd.Parameters.AddWithValue("@Value", valueCad);
			await checkCmd.ExecuteNonQueryAsync();
		}
		catch (Exception ex)
		{
			Console.WriteLine("Error creating trade history: " + ex.Message);
		}
	}

	private async Task<int?> GetMinutesSinceLastTrade(int userId)
	{
		var checkSql = @"
        SELECT TIMESTAMPDIFF(MINUTE, MAX(timestamp), UTC_TIMESTAMP()) 
        FROM maxhanna.trade_history 
        WHERE user_id = @UserId;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);

			// Execute the query and get the difference in minutes
			var result = await checkCmd.ExecuteScalarAsync();

			// Return the result as an integer, or null if no trade history is found
			return result != DBNull.Value ? Convert.ToInt32(result) : (int?)null;
		}
		catch (Exception ex)
		{
			Console.WriteLine("Error checking trade history: " + ex.Message);
			return null; // Return null in case of an error or no record
		}
	}



	private async Task<decimal?> IsSystemUpToDate()
	{
		var checkSql = @"
			SELECT value_cad 
			FROM maxhanna.coin_value 
			WHERE name = 'Bitcoin'
			AND timestamp >= UTC_TIMESTAMP() - INTERVAL 50 MINUTE
			ORDER BY ID DESC LIMIT 1;";
		// This query returns the last BTC value within the last 50 minutes
		try
		{
			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					var result = await checkCmd.ExecuteScalarAsync();
					if (result != null && decimal.TryParse(result.ToString(), out var valueCad))
					{
						//Console.WriteLine($"System is up-to-date");
						return valueCad;
					}
				}
			}
		}
		catch (MySqlException ex)
		{
			Console.WriteLine("Error checking IsSystemUpToDate : " + ex.Message);
		}
		return null;
	}

	public async Task<TradeRecord?> GetLastTrade(int userId)
	{
		var checkSql = @"SELECT * FROM maxhanna.trade_history WHERE user_id = @UserId ORDER BY id DESC LIMIT 1;";
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);

			using var reader = await checkCmd.ExecuteReaderAsync();
			if (await reader.ReadAsync())
			{
				// Map database result directly to TradeRecord
				var tradeRecord = new TradeRecord
				{
					id = reader.GetInt32(reader.GetOrdinal("id")),
					user_id = reader.GetInt32(reader.GetOrdinal("user_id")),
					from_currency = reader.GetString(reader.GetOrdinal("from_currency")),
					to_currency = reader.GetString(reader.GetOrdinal("to_currency")),
					value = reader.GetFloat(reader.GetOrdinal("value")),
					timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp")),
					btc_price_cad = reader.GetString(reader.GetOrdinal("btc_price_cad"))
				};

				return tradeRecord;
			}
		}
		catch (Exception ex)
		{
			Console.WriteLine("Error fetching trade history: " + ex.Message);
		}
		return null;
	}

	public async Task<List<TradeRecord>> GetWalletBalances(int userId)
	{
		var tradeRecords = new List<TradeRecord>();
		var checkSql = @"SELECT * FROM maxhanna.trade_history WHERE user_id = @UserId ORDER BY id DESC LIMIT 100;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);

			using var reader = await checkCmd.ExecuteReaderAsync();
			while (await reader.ReadAsync())
			{
				var tradeRecord = new TradeRecord
				{
					id = reader.GetInt32(reader.GetOrdinal("id")),
					user_id = reader.GetInt32(reader.GetOrdinal("user_id")),
					from_currency = reader.GetString(reader.GetOrdinal("from_currency")),
					to_currency = reader.GetString(reader.GetOrdinal("to_currency")),
					value = reader.GetFloat(reader.GetOrdinal("value")),
					timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp")),
					btc_price_cad = reader.GetString(reader.GetOrdinal("btc_price_cad"))
				};

				tradeRecords.Add(tradeRecord);
			}
		}
		catch (Exception ex)
		{
			Console.WriteLine("Error fetching trade history: " + ex.Message);
		}

		return tradeRecords;
	}


	public async Task<Dictionary<string, object>> MakeRequestAsync(string endpoint, string publicOrPrivate, Dictionary<string, string> postData = null)
	{
		try
		{
			// 1. Prepare request components
			var urlPath = $"/0/{publicOrPrivate}/{endpoint.TrimStart('/')}";
			//Console.WriteLine("Making api request..." + urlPath);
			var nonce = GenerateNonce();

			// 2. Prepare and validate post data
			postData ??= new Dictionary<string, string>();
			postData["nonce"] = nonce.ToString();

			// 3. Create and validate form content
			var formContent = new FormUrlEncodedContent(postData);
			string postBody = await formContent.ReadAsStringAsync();

			if (string.IsNullOrWhiteSpace(postBody))
				throw new InvalidOperationException("Post body cannot be empty");

			// 4. Generate signature
			var signature = CreateSignature(urlPath, postBody, nonce.ToString());

			// 5. Create and send request
			//Console.WriteLine("API Request: " + _baseAddr + urlPath);
			var request = new HttpRequestMessage(HttpMethod.Post, _baseAddr + urlPath)
			{
				Content = formContent
			};

			request.Headers.Add("API-Key", _apiKey);
			request.Headers.Add("API-Sign", signature);

			// 6. Execute and validate response
			var response = await _httpClient.SendAsync(request);
			var responseContent = await response.Content.ReadAsStringAsync();
			//Console.WriteLine("API Response Content: " + responseContent);

			if (!response.IsSuccessStatusCode)
			{
				Console.WriteLine("Failed to make API request: " + responseContent);
			}

			var responseObject = JsonConvert.DeserializeObject<Dictionary<string, object>>(responseContent);

			// Check for any error messages in the response
			if (responseObject.ContainsKey("error") && ((JArray)responseObject["error"]).Count > 0)
			{
				var errorMessages = string.Join(", ", ((JArray)responseObject["error"]).ToObject<List<string>>());
				Console.WriteLine($"Kraken API error: {errorMessages}");
				return responseObject;
			}

			// If no errors, return the response content
			return responseObject;
		}
		catch (Exception ex)
		{
			// Enhanced error logging
			Console.WriteLine($"⚠️ Kraken API request failed: {ex}");
			throw;
		}
	}

	private string CreateSignature(string urlPath, string postData, string nonce)
	{
		// 1. SHA256(nonce + POST data)
		byte[] sha256Hash;
		using (var sha256 = SHA256.Create())
		{
			sha256Hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(nonce + postData));
		}

		// 2. Concatenate urlPath + sha256 hash
		var pathBytes = Encoding.UTF8.GetBytes(urlPath);
		var buffer = new byte[pathBytes.Length + sha256Hash.Length];
		Buffer.BlockCopy(pathBytes, 0, buffer, 0, pathBytes.Length);
		Buffer.BlockCopy(sha256Hash, 0, buffer, pathBytes.Length, sha256Hash.Length);

		// 3. HMAC-SHA512 using private key (convert key to bytes first)
		byte[] signatureHash;
		using (var hmac = new HMACSHA512(_privateKeyBytes)) // Use the byte[] version
		{
			signatureHash = hmac.ComputeHash(buffer);
		}

		// 4. Return base64 encoded signature
		return Convert.ToBase64String(signatureHash);
	}

	private long GenerateNonce()
	{
		long nonce = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
		if (nonce <= _lastNonce) nonce = _lastNonce + 1;
		_lastNonce = nonce;
		return nonce;
	}

	private static byte[] ValidateAndDecodePrivateKey(string base64PrivateKey)
	{
		if (string.IsNullOrWhiteSpace(base64PrivateKey))
			throw new ArgumentException("Private key cannot be empty", nameof(base64PrivateKey));

		try
		{
			// Clean the key by removing any whitespace
			var cleanKey = base64PrivateKey.Trim();
			return Convert.FromBase64String(cleanKey);
		}
		catch (FormatException ex)
		{
			throw new ArgumentException("Invalid base64 private key format", nameof(base64PrivateKey), ex);
		}
	}

	public class TradeRecord
	{
		public int id { get; set; }
		public int user_id { get; set; }
		public string from_currency { get; set; }
		public string to_currency { get; set; }
		public float value { get; set; }
		public DateTime timestamp { get; set; }
		public string btc_price_cad { get; set; }
	}
}
public class KrakenApiException : Exception
{
	public HttpStatusCode StatusCode { get; }
	public string ResponseContent { get; }

	public KrakenApiException(string message, HttpStatusCode statusCode, string responseContent)
			: base(message)
	{
		StatusCode = statusCode;
		ResponseContent = responseContent;
	}
}
public class BalanceResponse
{
	[JsonPropertyName("result")]
	public Dictionary<string, string>? Result { get; set; }
}