using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization; 

public class KrakenService
{
	private const decimal _MaximumTradeBalanceRatio = 0.9m;
	private const decimal _TradeThreshold = 0.007m;
	private const decimal _MinimumBTCTradeAmount = 0.00005m;
	private const decimal _MaximumBTCTradeAmount = 0.00005m;
	private const decimal _MaximumUSDCTradeAmount = 2000m;
	private const decimal _ValueTradePercentage = 0.15m;
	private const decimal _BTCPriceDiscrepencyStopPercentage = 0.10m;
	private const decimal _InitialMinimumBTCAmountToStart = 0.001999m;
	private const decimal _MinimumBTCReserves = 0.0004m;
	private const decimal _MinimumUSDCReserves = 20m;
	private readonly HttpClient _httpClient;
	private static IConfiguration? _config; 
	private readonly string _baseAddr = "https://api.kraken.com/"; 
	private long _lastNonce;
	private readonly Log _log;

	public KrakenService(IConfiguration config, Log log)
	{
		_config = config;
		_log = log;
		_httpClient = new HttpClient();  
	}

	public async Task<bool> MakeATrade(int userId = 1)
	{
		// 1. Cooldown and system check
		int? minutesSinceLastTrade = await GetMinutesSinceLastTrade(userId);
		if (minutesSinceLastTrade != null && minutesSinceLastTrade < 15)
		{
			_ = _log.Db("User is in cooldown for another " + (15 - minutesSinceLastTrade) + " minutes. Trade Cancelled.", userId, "TRADE"); 
			return false;
		}
		UserKrakenApiKey? keys = await GetApiKey(userId);
		if (keys == null || string.IsNullOrEmpty(keys.ApiKey) || string.IsNullOrEmpty(keys.PrivateKey))
		{ 
			_ = _log.Db("No API keys found for this user", userId, "TRADE"); 
			return false;
		}
		decimal? lastBTCValueCad = await IsSystemUpToDate();
		if (lastBTCValueCad == null)
		{
			_ = _log.Db("System is not up to date. Cancelling trade.", userId, "TRADE");
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
			await TradeHalfBTCForUSDC(userId, keys);
			return false;
		}

		// 4. Calculate spread
		decimal.TryParse(lastTrade.btc_price_cad, out decimal lastPrice);
		decimal currentPrice = lastBTCValueCad.Value;
		decimal spread = (currentPrice - lastPrice) / lastPrice;
		//_ = _log.Db($"Current Price: {currentPrice}. Last Price: {lastPrice}.", userId, "TRADE", true); 

		if (Math.Abs(spread) >= _TradeThreshold)
		{
			// 5. Now we know a trade is needed — fetch balances
			var balances = await GetBalance(userId, keys);
			if (balances == null)
			{
				_ = _log.Db("Failed to get wallet balances", userId, "TRADE");
				return false;
			}  

			var btcPriceToCad = await GetBtcPriceToCad(userId, keys);
			_ = _log.Db("btcPriceCad:" + btcPriceToCad, userId, "TRADE", true);
			if (!ValidatePriceDiscrepency(currentPrice, btcPriceToCad))
			{
				return false;
			}

			decimal btcBalance = balances.ContainsKey("XXBT") ? balances["XXBT"] : 0;
			decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0; 
			_ = _log.Db("USDC Balance: " + usdcBalance + "; Btc Balance: " + btcBalance, userId, "TRADE", true);
			if (spread >= _TradeThreshold)
			{
				decimal btcToTrade = Math.Min(btcBalance * _ValueTradePercentage, _MaximumBTCTradeAmount);
				decimal? usdToCadRate = await GetUsdToCadRate();
				_ = _log.Db("USD to CAD rate: " + usdToCadRate.Value + "; btcPriceToCad: " + btcPriceToCad, userId, "TRADE", true); 
				if (usdToCadRate.HasValue && btcPriceToCad.HasValue && (btcToTrade > 0))
				{ 
					// Convert the BTC price to USD;  Now you can get the value of btcToTrade in USDC (1 USDC = 1 USD) 
					decimal btcValueInUsdc = ConvertBTCToUSDC(btcToTrade, btcPriceToCad.Value, usdToCadRate.Value);
					decimal btcBalanceConverted = ConvertBTCToUSDC(btcBalance, btcPriceToCad.Value, usdToCadRate.Value);
					_ = _log.Db($"BTC trade value in USDC: {btcValueInUsdc}; Converted btcBalanceValue in USDC: {btcBalanceConverted}", userId, "TRADE", true); 
					if (Is90PercentOfTotalWorth(btcBalanceConverted, usdcBalance))
					{
						_ = _log.Db($"Trade to USDC is prevented. 90% of wallet is already in USDC. {btcBalanceConverted}/{usdcBalance}", userId, "TRADE", true); 
						return false;
					}
					_ = _log.Db($"Spread is +{spread:P} ({currentPrice}-{lastPrice}), selling {btcToTrade} BTC for USDC ({btcValueInUsdc})", userId, "TRADE", true); 
					await ExecuteXBTtoUSDCTrade(userId, keys, FormatBTC(btcToTrade), "sell", btcBalance, false);
				}
				else
				{
					_ = _log.Db("Error fetching USDC exchange rates.", userId, "TRADE", true); 
					return false;
				}
			}
			else if (spread <= -_TradeThreshold)
			{
				decimal usdcValueToTrade = Math.Min(usdcBalance * _ValueTradePercentage, _MaximumUSDCTradeAmount);
				if (Is90PercentOfTotalWorth(usdcBalance, usdcValueToTrade))
				{
					_ = _log.Db($"Trade to XBT is prevented. 90% of wallet is already in XBT. {usdcBalance}/{btcBalance}", userId, "TRADE", true); 
					return false;
				}
				if (btcPriceToCad == null)
				{
					_ = _log.Db("BTC price in CAD is unavailable.", userId, "TRADE", true); 
					return false;
				}

				decimal usdcToUse = usdcBalance * _ValueTradePercentage;
				if (usdcToUse > 0)
				{
					decimal? usdToCadRate = await GetUsdToCadRate();
					if (usdToCadRate == null)
					{
						_ = _log.Db("USD to CAD rate is unavailable.", userId, "TRADE", true); 
						return false;
					}
					_ = _log.Db("USD to CAD rate: " + usdToCadRate.Value, userId, "TRADE", true); 
					decimal usdAmount = usdcToUse;
					decimal cadAmount = usdAmount * usdToCadRate.Value;
					decimal btcAmount = cadAmount / btcPriceToCad.Value;

					_ = _log.Db($"Spread is {spread:P} ({currentPrice}-{lastPrice}), buying BTC with {FormatBTC(btcAmount)} BTC worth of USDC(${usdcToUse})", userId, "TRADE", true); 
					await ExecuteXBTtoUSDCTrade(userId, keys, FormatBTC(btcAmount), "buy", usdcBalance, false);
				}
			}
		}
		else
		{
			decimal thresholdDifference = (Math.Abs(_TradeThreshold) - Math.Abs(spread)) * 100;
			_ = _log.Db($"Spread is {spread:P} ({currentPrice}-{lastPrice}), within threshold. No trade executed. It was {thresholdDifference:P} away from breaking the threshold.", userId, "TRADE", true); 
		}
		return true;
	}

	private bool ValidatePriceDiscrepency(decimal currentPrice, decimal? btcPriceToCad)
	{ 
		if (btcPriceToCad == null || !btcPriceToCad.HasValue)
		{
			_ = _log.Db("BTC price in CAD is unavailable.", null, "TRADE", true); 
			return false;
		}
		decimal priceDiscrepancy = Math.Abs(currentPrice - btcPriceToCad.Value) / btcPriceToCad.Value;
		if (priceDiscrepancy >= _BTCPriceDiscrepencyStopPercentage)
		{
			_ = _log.Db($"⚠️ Price discrepancy too high ({priceDiscrepancy:P2}) between currentPrice: {currentPrice} and liveBtcPriceCad: {btcPriceToCad.Value}. Aborting trade.", null, "TRADE", true);
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

	private async Task<Dictionary<string, decimal>?> GetBalance(int userId, UserKrakenApiKey keys)
	{
		try
		{
			// Fetch the balance response as a dictionary
			var balanceResponse = await MakeRequestAsync(userId, keys, "/Balance", "private", new Dictionary<string, string>());

			// Check if the response contains the "result" key
			if (balanceResponse == null || !balanceResponse.ContainsKey("result"))
			{ 
				_ = _log.Db("Failed to get wallet balances: 'result' not found.", userId, "TRADE", true);
				return null;
			}

			// Extract the result part of the response
			var result = (JObject)balanceResponse["result"];

			// Convert the result into a Dictionary<string, decimal> to store the balances
			var balanceDictionary = result.ToObject<Dictionary<string, decimal>>();

			 
			_ = CreateWalletEntryFromFetchedDictionary(balanceDictionary, userId);


			return balanceDictionary;
		}
		catch (Exception ex)
		{
			// Handle any errors that occur during the request
			_ = _log.Db($"Error fetching balance: {ex.Message}", null, "TRADE", true); 
			return null;
		}
	}
	private async Task TradeHalfBTCForUSDC(int userId, UserKrakenApiKey keys)
	{
		decimal minBtc = _InitialMinimumBTCAmountToStart;
		var balances = await GetBalance(userId, keys);
		if (balances == null)
		{ 
			_ = _log.Db("Failed to get wallet balances", userId, "TRADE", true);
			return;
		}
		decimal btcBalance = balances.ContainsKey("XXBT") ? balances["XXBT"] : 0;
		decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;
		 
		_ = _log.Db($"Insufficient funds (BTC: {btcBalance}, USDC: {usdcBalance})", userId, "TRADE", true);
		if (btcBalance > minBtc)
		{
			//Trade 50% of BTC balance TO USDC
			decimal halfTradePercentage = 0.5m;
			decimal btcToTrade = btcBalance * halfTradePercentage;
			if (btcToTrade > 0)
			{  
				_ = _log.Db("Starting user off with some USDC reserves", userId, "TRADE", true);
				await ExecuteXBTtoUSDCTrade(userId, keys, FormatBTC(btcToTrade), "sell", btcBalance, true);
			}
		}
		else
		{ 
			_ = _log.Db("Not enough BTC to trade.", userId, "TRADE", true);
		}
	}

	private async Task ExecuteXBTtoUSDCTrade(int userId, UserKrakenApiKey keys, string amount, string buyOrSell, decimal balance, bool IsFirstTradeEver)
	{
		string from = "XBT";
		string to = "USDC";
		amount = amount.Trim();
		decimal? lastBTCValueCad = null;
		try
		{
			lastBTCValueCad = await IsSystemUpToDate();
			if (lastBTCValueCad == null)
			{
				_ = _log.Db("System is not up to date. Cancelling trade", userId, "TRADE", true);
				return; //TODO instead of returning, update the system.
			}
			if (Convert.ToDecimal(amount) < _MinimumBTCTradeAmount)
			{
				_ = _log.Db("Trade amount is too small. Cancelling trade.", userId, "TRADE", true);
				return;
			}

			//Contextual Adjustments: If you’re trading based on certain market conditions(e.g., high volatility or low reserves), you might want to adjust the range dynamically. For example
			//If reserves are low, you may want a larger range to avoid too many trades.
			//If there is high market volatility, you could reduce the range to act more cautiously.
			if (!IsFirstTradeEver)
			{
				int tradeRange = 5;
				bool shouldTradeBasedOnReserves = await ShouldTradeBasedOnRangeAndReserve(userId, from, to, buyOrSell, tradeRange, balance);
				if (!shouldTradeBasedOnReserves)
				{
					_ = _log.Db($"User has {buyOrSell} {from} {to} too many times in the last {tradeRange} trades (Based on reserves or half the trades were the same). Cancelling trade.", userId, "TRADE", true);
					return;
				}
				int tradeRangeLimit = 5;
				int daySpanCheck = 1;
				bool withinLimit = await CheckTradeFrequency(userId, "XTC", "USDC", buyOrSell, tradeRangeLimit, TimeSpan.FromDays(daySpanCheck));
				if (!withinLimit)
				{
					_ = _log.Db($"User has {buyOrSell} {from} {to} too frequently ({tradeRangeLimit}) in the last {daySpanCheck} days. Cancelling trade.", userId, "TRADE", true);
					return;
				}
			} 
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Exception while validating trade! Cancelling Trade. " + ex.Message, userId, "TRADE", true);
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
		 
		_ = _log.Db($"Executing trade: {buyOrSell} {from}->{to}/{amount}", userId, "TRADE", true);
		var response = await MakeRequestAsync(userId, keys, "/AddOrder", "private", parameters);
		await GetOrderResults(userId, keys, amount, from, to, response);
		await SaveTradeFootprint(userId, from, to, amount, lastBTCValueCad.Value, buyOrSell);
	}

	private async Task GetOrderResults(int userId, UserKrakenApiKey keys, string amount, string from, string to, Dictionary<string, object> response)
	{
		string? orderId = null;
		if (response.ContainsKey("result"))
		{
			var result = (JObject)response["result"];
			orderId = result["orderId"]?.ToString();
		}
		if (orderId == null) { }
		else
		{
			var statusResponse = await CheckOrderStatus(userId, keys, orderId); 
			_ = _log.Db($"Order status: {statusResponse}", userId, "TRADE", true); 
			if (statusResponse != null)
			{
				if (statusResponse["status"]?.ToString() == "closed")
				{ 
					_ = _log.Db($"Trade successful: {from}->{to}/{amount}", userId, "TRADE", true);
				}
				else
				{
					_ = _log.Db("Trade response: " + statusResponse["status"], userId, "TRADE", true); 
				}
			}
		}
	}

	private async Task<dynamic> CheckOrderStatus(int userId, UserKrakenApiKey keys, string orderId)
	{
		var parameters = new Dictionary<string, string>
		{
			["orderId"] = orderId
		};

		// Make the request to check the order status
		var response = await MakeRequestAsync(userId, keys, "/QueryOrders", "private", parameters);

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
	private async Task<string> QueryOpenOrdersForPair(int userId, UserKrakenApiKey keys, string pair)
	{
		// Build parameters to query open orders.
		// This is an example; adjust the endpoint and parameters per Kraken's API documentation.
		var parameters = new Dictionary<string, string>
		{
			["pair"] = pair
		};

		// Assume MakeRequestAsync returns a Dictionary<string, object>
		var response = await MakeRequestAsync(userId, keys, "/OpenOrders", "private", parameters);
		// Convert the response to a JSON string for logging (or format as desired)
		return response != null ? JsonConvert.SerializeObject(response) : "No response";
	}


	private async Task DeleteTradeFootprint(int userId, string from, string to, string amount)
	{
		// Implement logic to delete trade footprint from your database
		_ = _log.Db($"Deleted trade footprint for {from} -> {to} {amount}", userId, "TRADE", true);
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
			_ = _log.Db("Error deleting trade footprint: " + ex.Message, userId, "TRADE", true); 
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
			_ = _log.Db("Error fetching latest exchange rate: " + ex.Message, null, "TRADE", true); 
			return null;
		}
	}

	private async Task<bool> SaveTradeFootprint(int userId, string from, string to, string valueCad, decimal lastBTCValueCad, string buyOrSell)
	{
		string tmpFrom = "";
		string tmpTo = "";
		if (buyOrSell == "buy")
		{
			tmpFrom = to;
			tmpTo = from;
		}
		else
		{
			tmpFrom = from;
			tmpTo = to;
		}

		await CreateTradeHistory(lastBTCValueCad, valueCad, userId, tmpFrom, tmpTo);
		return true;
	}
	private async Task<bool> CheckTradeFrequency(int userId, string from, string to, string buyOrSell, int maxTrades, TimeSpan timeWindow)
	{
		string tmpFrom = from;
		if (buyOrSell == "buy")
		{
			tmpFrom = to;
		}

		var checkSql = @"
			SELECT COUNT(*) 
			FROM maxhanna.trade_history
			WHERE user_id = @UserId
			AND from_currency = @FromCurrency
			AND timestamp > @TimeWindowStart;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@FromCurrency", tmpFrom);
			checkCmd.Parameters.AddWithValue("@TimeWindowStart", DateTime.UtcNow - timeWindow);  // Time window parameter

			int tradeCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

			return tradeCount < maxTrades;  // Allow the trade only if the count is below the max allowed
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error checking trade frequency: " + ex.Message, userId, "TRADE", true);
			return true; // Default action in case of error.
		}
	}
	private async Task<bool> ShouldTradeBasedOnRangeAndReserve(int userId, string from, string to, string buyOrSell, int range, decimal balance)
	{
		bool isRepeatedTrade = await IsRepeatedTradesInRange(userId, from, to, buyOrSell, range); 
		if (isRepeatedTrade)
		{
			_ = _log.Db($"Repeated too many trades ({buyOrSell} {from} {to} {range})", userId, "TRADE", true);
		}
		// Define threshold based on currency
		decimal threshold = 0;
		if (buyOrSell == "sell")
		{
			threshold = _MinimumBTCReserves;
		}
		else if (buyOrSell == "buy")
		{
			threshold = _MinimumUSDCReserves;
		}
		else
		{
			// If the currency is unsupported, throw an exception and make sure parent handles exceptions with returning false.
			throw new ArgumentException("Unsupported currency type for balance check");
		}
		bool reservesLow = balance < threshold;
		_ = _log.Db($"[reservesLow]={reservesLow} (Balance={balance}, Threshold={threshold})", userId, "TRADE", true); 
		if (reservesLow) {
			_ = _log.Db($"Reserves Are Low ({balance} < {threshold})", userId, "TRADE", true); 
		}

		// If the reserves are not low and not repeating too many trades, allow trade
		return !isRepeatedTrade && !reservesLow;
	}
	private async Task<bool> IsRepeatedTradesInRange(int userId, string from, string to, string buyOrSell, int range = 3)
	{
		// SELL BTC  -> USDC -> from = BTC
		// BUY  USDC -> BTC  -> from = USDC
		string expectedFrom = (buyOrSell == "buy") ? to : from;

		var checkSql = $@"
			SELECT from_currency 
			FROM maxhanna.trade_history
			WHERE user_id = @UserId 
			ORDER BY timestamp DESC
			LIMIT @Range;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Range", range);

			using var reader = await checkCmd.ExecuteReaderAsync();

			int count = 0;
			while (await reader.ReadAsync())
			{
				var actualFrom = reader.GetString(0);
				if (!actualFrom.Equals(expectedFrom, StringComparison.OrdinalIgnoreCase))
				{
					// Break early if any trade does not match
					//_ = _log.Db($"[ConsecutiveCheck] Mismatch at position {count}: Expected {expectedFrom}, Got {actualFrom}", userId, "TRADE", true);
					return false;
				}
				count++;
			}

			// Only return true if we got enough matches
			bool result = (count == range);
			_ = _log.Db($"[ConsecutiveCheck] Consecutive Matches={count}, Range={range}, Result={result}", userId, "TRADE", true);
			return result;
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error checking consecutive trades: " + ex.Message, userId, "TRADE", true);
			return true; // Fail safe: prevent trade
		}
	}
  
	private async Task<TradeRecord?> GetLastTradeJSONDeserialized(int userId, decimal? lastBTCValueCad)
	{
		if (lastBTCValueCad == null)
		{
			_ = _log.Db("No trade history and no last BTC value. Cannot proceed.", null, "TRADE", true); 
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
			_ = _log.Db("Error creating trade history: " + ex.Message, userId, "TRADE", true); 
		}
	}
	private async Task CreateWalletEntryFromFetchedDictionary(Dictionary<string, decimal>? balanceDictionary, int userId)
	{
		if (balanceDictionary == null)
		{
			_ = _log.Db("Balance dictionary is null. Cannot create wallet entry.", userId, "TRADE", true); 
			return;
		}

		decimal btcBalance = balanceDictionary.TryGetValue("XXBT", out var btc) ? btc : 0;
		decimal usdcBalance = balanceDictionary.TryGetValue("USDC", out var usdc) ? usdc : 0;

		const string ensureBtcWalletSql = @"
		INSERT INTO user_btc_wallet_info (user_id, btc_address, last_fetched)
		VALUES (@UserId, 'Kraken', UTC_TIMESTAMP())
		ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
		SELECT LAST_INSERT_ID();";

		const string ensureUsdcWalletSql = @"
		INSERT INTO user_usdc_wallet_info (user_id, usdc_address, last_fetched)
		VALUES (@UserId, 'Kraken', UTC_TIMESTAMP())
		ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
		SELECT LAST_INSERT_ID();";

		const string checkRecentBtcSql = @"
		SELECT COUNT(*) FROM user_btc_wallet_balance 
		WHERE wallet_id = @WalletId AND fetched_at > (UTC_TIMESTAMP() - INTERVAL 10 MINUTE);";

		const string checkRecentUsdcSql = @"
		SELECT COUNT(*) FROM user_usdc_wallet_balance 
		WHERE wallet_id = @WalletId AND fetched_at > (UTC_TIMESTAMP() - INTERVAL 10 MINUTE);";

		const string insertBtcSql = "INSERT INTO user_btc_wallet_balance (wallet_id, balance, fetched_at) VALUES (@WalletId, @Balance, UTC_TIMESTAMP());";
		const string insertUsdcSql = "INSERT INTO user_usdc_wallet_balance (wallet_id, balance, fetched_at) VALUES (@WalletId, @Balance, UTC_TIMESTAMP());";

		const string updateBtcFetchedSql = "UPDATE user_btc_wallet_info SET last_fetched = UTC_TIMESTAMP() WHERE id = @WalletId;";
		const string updateUsdcFetchedSql = "UPDATE user_usdc_wallet_info SET last_fetched = UTC_TIMESTAMP() WHERE id = @WalletId;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// BTC Wallet
			if (btcBalance > 0)
			{
				int btcWalletId;
				using (var cmd = new MySqlCommand(ensureBtcWalletSql, conn))
				{
					cmd.Parameters.AddWithValue("@UserId", userId);
					using var reader = await cmd.ExecuteReaderAsync();
					await reader.ReadAsync();
					btcWalletId = reader.GetInt32(0);
				}

				using (var checkCmd = new MySqlCommand(checkRecentBtcSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@WalletId", btcWalletId);
					var recentCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
					if (recentCount == 0)
					{
						using var insertCmd = new MySqlCommand(insertBtcSql, conn);
						insertCmd.Parameters.AddWithValue("@WalletId", btcWalletId);
						insertCmd.Parameters.AddWithValue("@Balance", btcBalance);
						await insertCmd.ExecuteNonQueryAsync();

						using var updateCmd = new MySqlCommand(updateBtcFetchedSql, conn);
						updateCmd.Parameters.AddWithValue("@WalletId", btcWalletId);
						await updateCmd.ExecuteNonQueryAsync();
					}
				}
			}

			// USDC Wallet
			if (usdcBalance > 0)
			{
				int usdcWalletId;
				using (var cmd = new MySqlCommand(ensureUsdcWalletSql, conn))
				{
					cmd.Parameters.AddWithValue("@UserId", userId);
					using var reader = await cmd.ExecuteReaderAsync();
					await reader.ReadAsync();
					usdcWalletId = reader.GetInt32(0);
				}

				using (var checkCmd = new MySqlCommand(checkRecentUsdcSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@WalletId", usdcWalletId);
					var recentCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
					if (recentCount == 0)
					{
						using var insertCmd = new MySqlCommand(insertUsdcSql, conn);
						insertCmd.Parameters.AddWithValue("@WalletId", usdcWalletId);
						insertCmd.Parameters.AddWithValue("@Balance", usdcBalance);
						await insertCmd.ExecuteNonQueryAsync();

						using var updateCmd = new MySqlCommand(updateUsdcFetchedSql, conn);
						updateCmd.Parameters.AddWithValue("@WalletId", usdcWalletId);
						await updateCmd.ExecuteNonQueryAsync();
					}
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error creating wallet balance entry: " + ex.Message, userId, "TRADE", true); 
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
			_ = _log.Db("Error checking trade history: " + ex.Message, userId, "TRADE", true); 
			return null;
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
						return valueCad;
					}
				}
			}
		}
		catch (MySqlException ex)
		{
			_ = _log.Db("Error checking IsSystemUpToDate : " + ex.Message, null, "TRADE", true); 
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
			_ = _log.Db("Error fetching last trade: " + ex.Message, null, "TRADE", true); 
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
			_ = _log.Db("Error fetching wallet balances: " + ex.Message, null, "TRADE", true); 
		}

		return tradeRecords;
	}

	public async Task UpdateApiKey(UpdateApiKeyRequest request)
	{
		try
		{
			// If ApiKey or PrivateKey is empty, delete the record for the user
			if (string.IsNullOrWhiteSpace(request.ApiKey) || string.IsNullOrWhiteSpace(request.PrivateKey))
			{
				using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();

					// Delete the record for the user
					var deleteCmd = new MySqlCommand("DELETE FROM user_kraken_api_keys WHERE user_id = @userId", connection);
					deleteCmd.Parameters.AddWithValue("@userId", request.UserId);

					await deleteCmd.ExecuteNonQueryAsync();
				}
				return; // Exit early as the record has been deleted
			}

			// Otherwise, process the API key update 

			using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				// Check if a record already exists for this user
				var checkCmd = new MySqlCommand("SELECT COUNT(*) FROM user_kraken_api_keys WHERE user_id = @userId", connection);
				checkCmd.Parameters.AddWithValue("@userId", request.UserId);

				var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

				if (exists)
				{
					// Update existing
					var updateCmd = new MySqlCommand(@"
                    UPDATE user_kraken_api_keys
                    SET api_key = @apiKey,
                        private_key = @privateKey, 
                    WHERE user_id = @userId", connection);

					updateCmd.Parameters.AddWithValue("@apiKey", request.ApiKey);
					updateCmd.Parameters.AddWithValue("@privateKey", request.PrivateKey); 
					updateCmd.Parameters.AddWithValue("@userId", request.UserId);

					await updateCmd.ExecuteNonQueryAsync();
				}
				else
				{
					// Insert new
					var insertCmd = new MySqlCommand(@"
                    INSERT INTO user_kraken_api_keys (user_id, api_key, private_key)
                    VALUES (@userId, @apiKey, @privateKey)", connection);

					insertCmd.Parameters.AddWithValue("@userId", request.UserId);
					insertCmd.Parameters.AddWithValue("@apiKey", request.ApiKey);
					insertCmd.Parameters.AddWithValue("@privateKey", request.PrivateKey); 

					await insertCmd.ExecuteNonQueryAsync();
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error updating API keys: " + ex.Message, request.UserId, "TRADE", true); 
		}
	}

	public async Task<UserKrakenApiKey?> GetApiKey(int userId)
	{
		try
		{
			using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				// Check if a record exists for this user
				var checkCmd = new MySqlCommand("SELECT id, user_id, api_key, private_key FROM user_kraken_api_keys WHERE user_id = @userId", connection);
				checkCmd.Parameters.AddWithValue("@userId", userId);

				using var reader = await checkCmd.ExecuteReaderAsync();

				if (await reader.ReadAsync())
				{
					// Create a UserKrakenApiKey object from the result
					var apiKey = new UserKrakenApiKey
					{
						Id = reader.GetInt32(0),
						UserId = reader.GetInt32(1),
						ApiKey = reader.IsDBNull(2) ? null : reader.GetString(2),
						PrivateKey = reader.IsDBNull(3) ? null : reader.GetString(3)
					};

					return apiKey;
				}

				return null; // Return null if no record was found
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error getting API keys: " + ex.Message, userId, "TRADE", true);
			return null; // Return null in case of an error
		}
	}


	public async Task<bool> CheckIfUserHasApiKey(int userId)
	{
		try
		{
			using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				// Check if a record exists for this user
				var checkCmd = new MySqlCommand("SELECT COUNT(*) FROM user_kraken_api_keys WHERE user_id = @userId", connection);
				checkCmd.Parameters.AddWithValue("@userId", userId);

				var result = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
				return result > 0; // Returns true if record exists, false otherwise
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error getting API keys: " + ex.Message, userId, "TRADE", true);
			return false; // Return false in case of error
		}
	} 
	private async Task<decimal?> GetBtcPriceToCad(int userId, UserKrakenApiKey keys)
	{
		try
		{
			var pair = "XXBTZCAD";
			var response = await MakeRequestAsync(userId, keys, "/Ticker", "public", new Dictionary<string, string> { ["pair"] = pair });
			if (response == null || !response.ContainsKey("result"))
			{
				_ = _log.Db("Failed to get BTC price in CAD: 'result' not found.", userId, "TRADE", true);
				return null;
			}
			var result = (JObject)response["result"];
			if (!result.ContainsKey(pair))
			{
				_ = _log.Db("Failed to find XXBTZCAD pair in the response.", userId, "TRADE", true);
				return null;
			}

			// Extract the ask price from the 'a' key (ask prices are in the array)
			var askArray = result[pair]["a"]?.ToObject<JArray>();
			if (askArray == null || askArray.Count < 1)
			{
				_ = _log.Db("Failed to extract ask price from response.", userId, "TRADE", true);
				return null;
			}
			// The ask price is the first value in the array
			var askPrice = askArray[0].ToObject<decimal>();
			return askPrice;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error fetching BTC price to CAD: {ex.Message}", userId, "TRADE", true);
			return null;
		}
	} 
	private async Task<decimal?> GetBtcPriceToUSDC(int userId, UserKrakenApiKey keys)
	{
		try
		{
			var pair = "XXBTZUSD";
			var response = await MakeRequestAsync(userId, keys, "/Ticker", "public", new Dictionary<string, string> { ["pair"] = pair });
			if (response == null || !response.ContainsKey("result"))
			{
				_ = _log.Db("Failed to get BTC price in USD: 'result' not found.", userId, "TRADE", true);
				return null;
			}
			var result = (JObject)response["result"];
			if (!result.ContainsKey(pair))
			{
				_ = _log.Db("Failed to find XXBTZUSD pair in the response.", userId, "TRADE", true);
				return null;
			}

			// Extract the ask price from the 'a' key (ask prices are in the array)
			var askArray = result[pair]["a"]?.ToObject<JArray>();
			if (askArray == null || askArray.Count < 1)
			{
				_ = _log.Db("Failed to extract ask price from response.", userId, "TRADE", true);
				return null;
			}
			// The ask price is the first value in the array
			var askPrice = askArray[0].ToObject<decimal>();
			return askPrice;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error fetching BTC price to USD: {ex.Message}", userId, "TRADE", true);
			return null;
		}
	}

	public async Task<Dictionary<string, object>> MakeRequestAsync(int userId, UserKrakenApiKey keys, string endpoint, string publicOrPrivate, Dictionary<string, string> postData = null)
	{
		try
		{
			// 1. Prepare request components
			var urlPath = $"/0/{publicOrPrivate}/{endpoint.TrimStart('/')}"; 
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
			var signature = CreateSignature(urlPath, postBody, nonce.ToString(), keys.PrivateKey);

			// 5. Create and send request 
			var request = new HttpRequestMessage(HttpMethod.Post, _baseAddr + urlPath)
			{
				Content = formContent
			}; 
			request.Headers.Add("API-Key", keys.ApiKey);
			request.Headers.Add("API-Sign", signature);

			// 6. Execute and validate response
			var response = await _httpClient.SendAsync(request);
			var responseContent = await response.Content.ReadAsStringAsync(); 

			if (!response.IsSuccessStatusCode)
			{
				_ = _log.Db("Failed to make API request: " + responseContent, userId, "TRADE", true); 
			}

			var responseObject = JsonConvert.DeserializeObject<Dictionary<string, object>>(responseContent);

			// Check for any error messages in the response
			if (responseObject.ContainsKey("error") && ((JArray)responseObject["error"]).Count > 0)
			{
				var errorMessages = string.Join(", ", ((JArray)responseObject["error"]).ToObject<List<string>>());
				_ = _log.Db($"Kraken API error: {errorMessages}", userId, "TRADE", true); 
				return responseObject;
			} 
			return responseObject;
		}
		catch (Exception ex)
		{ 
			_ = _log.Db($"⚠️ Kraken API request failed: {ex}", userId, "TRADE", true); 
			throw;
		}
	}
	private string FormatBTC(decimal amount) => amount.ToString("0.00000000", CultureInfo.InvariantCulture);

	private decimal ConvertBTCToUSDC(decimal btcAmount, decimal btcPriceCAD, decimal usdToCad)
	{
		decimal btcPriceUsd = btcPriceCAD / usdToCad;
		return btcAmount * btcPriceUsd;
	}
	private string CreateSignature(string urlPath, string postData, string nonce, string privateKey)
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

		byte[] privateKeyBytes = ValidateAndDecodePrivateKey(privateKey); 
		using (var hmac = new HMACSHA512(privateKeyBytes)) // Use the byte[] version
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
	private string GenerateSalt()
	{
		byte[] saltBytes = new byte[16];
		using (var rng = RandomNumberGenerator.Create())
		{
			rng.GetBytes(saltBytes);
		}
		return Convert.ToBase64String(saltBytes);
	}
	private string Hash(string key, string salt)
	{
		using (SHA256 sha256 = SHA256.Create())
		{
			byte[] inputBytes = Encoding.UTF8.GetBytes(key + salt);
			byte[] hashedBytes = sha256.ComputeHash(inputBytes);
			return Convert.ToBase64String(hashedBytes);
		}
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