using maxhanna.Server.Controllers.DataContracts.Crypto;
using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Globalization; 
using System.Security.Cryptography;
using System.Text;

public class KrakenService
{
	private static decimal _MaximumTradeBalanceRatio = 0.9m;
	private static decimal _TradeThreshold = 0.0084m;
	private static decimal _MinimumBTCTradeAmount = 0.00005m;
	private static decimal _MaximumBTCTradeAmount = 0.005m;
	private static decimal _MaximumUSDCTradeAmount = 2000m;
	private static decimal _ValueTradePercentage = 0.15m;
	private static decimal _ValueSellPercentage = 0.04m;
	private static decimal _ValueTradePercentagePremium = 0.05m;
	private static decimal _InitialMinimumBTCAmountToStart = 0.001999m;
	private static decimal _InitialMinimumUSDCAmountToStart = 200;
	private static decimal _InitialMaximumUSDCAmountToStart = 0;
	private static decimal _MinimumBTCReserves = 0.0004m;
	private static decimal _MinimumUSDCReserves = 20m;
	private static decimal _TradeStopLoss = 0;
	private static int _MaxTradeTypeOccurances = 5;
	private static int _VolumeSpikeMaxTradeOccurance = 1;
	private readonly HttpClient _httpClient;
	private static IConfiguration? _config;
	private readonly string _baseAddr = "https://api.kraken.com/";
	private long _lastNonce;
	private readonly Log _log;
	private static readonly Dictionary<string, string> CoinMappingsForDB = new Dictionary<string, string> { { "XBT", "btc" }, { "XXBT", "btc" }, { "BTC", "btc" }, { "USDC", "usdc" }, { "XRP", "xrp" }, { "XXRP", "xrp" }, { "XXDG", "xdg" }, { "XETH", "eth" }, { "ETH", "eth" }, { "ETH.F", "eth" }, { "SOL.F", "sol" }, { "SOL", "sol" }, { "SUI", "sui" }, { "WIF", "wif" }, { "WIF.F", "wif" }, { "PENGU", "pengu" }, { "PEPE", "pepe" }, { "DOT", "dot" }, { "DOT.F", "dot" }, { "ADA", "ada" }, { "ADA.F", "ada" }, { "LTC", "ltc" }, { "LTC.F", "ltc" }, { "LINK", "link" }, { "LINK.F", "link" }, { "MATIC", "matic" }, { "MATIC.F", "matic" }, { "XLM", "xlm" }, { "XLM.F", "xlm" }, { "TRX", "trx" }, { "TRX.F", "trx" }, { "AVAX", "avax" }, { "AVAX.F", "avax" }, { "ATOM", "atom" }, { "ATOM.F", "atom" }, { "ALGO", "algo" }, { "ALGO.F", "algo" }, { "NEAR", "near" }, { "NEAR.F", "near" }, { "XMR", "xmr" }, { "XMR.F", "xmr" }, { "BCH", "bch" }, { "BCH.F", "bch" }, { "ZEC", "zec" }, { "ZEC.F", "zec" }, { "SHIB", "shib" }, { "SHIB.F", "shib" }, { "UNI", "uni" }, { "UNI.F", "uni" }, { "AAVE", "aave" }, { "AAVE.F", "aave" } };

	public KrakenService(IConfiguration config, Log log)
	{
		_config = config;
		_log = log;
		_httpClient = new HttpClient();
	} 
	
	public async Task<bool> MakeATrade(int userId, string coin, UserKrakenApiKey keys, string strategy)
	{
		// 1. Cooldown and system check
		bool? updatedFeeResult = await UpdateFees(userId, coin, keys, strategy);
		if (updatedFeeResult == null)
		{
			_ = _log.Db($"Unable to update fees. API Error most likely culprit. Trade Cancelled.", userId, "TRADE", true);
			return false;
		}
		DateTime? started = await IsTradebotStarted(userId, coin, strategy);
		if (started == null)
		{
			_ = _log.Db($"User has stopped the {coin}({strategy}) tradebot. Trade Cancelled.", userId, "TRADE", true);
			return false;
		}
		int? minutesSinceLastTrade = await GetMinutesSinceLastTrade(userId, coin, strategy);
		if (minutesSinceLastTrade != null && minutesSinceLastTrade < 15)
		{
			_ = _log.Db($"User is in cooldown for another {(15 - minutesSinceLastTrade)} minutes. {coin}({strategy}) Trade Cancelled.", userId, "TRADE", true);
			return false;
		}

		string tmpCoin = coin.ToUpper().Trim();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		TradeConfiguration? tc = await GetTradeConfiguration(userId, fromCoin: tmpCoin, toCoin: "USDC", strategy);
		if (!ValidateTradeConfiguration(tc, userId) || tc == null)
		{
			return false;
		}
		if (!ApplyTradeConfiguration(tc))
		{
			_ = _log.Db($"Null {coin} trade configuration. Trade Cancelled.", userId, "TRADE", true);
			return false;
		}
 
		// 2. Get last trade info
		bool isFirstTradeEver = false;
		TradeRecord? lastTrade = await GetLastTradeJSONDeserialized(userId, coin, strategy);
		if (lastTrade == null)
		{
			isFirstTradeEver = true;
		}
		var coinPriceUSDC = await GetCoinPriceToUSDC(userId, coin, keys);
		if (coinPriceUSDC == null)
		{
			_ = _log.Db($"No {coin}/USDC price found. Trade Cancelled.", userId, "TRADE", true);
			return false;
		}
		decimal? coinPriceCAD = await IsSystemUpToDate(userId, coin, coinPriceUSDC.Value);
		if (coinPriceCAD == null)
		{
			_ = _log.Db("System is not up to date. Trade Cancelled.", userId, "TRADE", true);
			return false;
		}

		if (coinPriceUSDC < _TradeStopLoss)
		{
			_ = _log.Db($"{strategy} Stop Loss ({_TradeStopLoss}) threshold breached (current price: {coinPriceUSDC}). Liquidating {coin} for USDC.", userId, "TRADE", true);
			return await ExitPosition(userId, coin, keys, strategy);
		}

		decimal? firstPriceToday = await GetFirstCoinPriceTodayIfNoRecentTrades(coin, userId, strategy);

		// 3. Calculate spread
		decimal.TryParse(lastTrade?.coin_price_usdc, out decimal lastPrice);
		decimal currentPrice = coinPriceUSDC.Value;
		decimal spread = isFirstTradeEver ? 0 : (currentPrice - lastPrice) / lastPrice;
		decimal spread2 = firstPriceToday != null ? (currentPrice - firstPriceToday.Value) / firstPriceToday.Value : 0;
		//_ = _log.Db($"Current Price: {currentPrice}. Last Price: {lastPrice}. Spread: {spread}. Evaluating first price today? {(firstPriceToday != null ? $"true. Spread2: {spread2}." : "false.")}", userId, "TRADE", true);

		//Check the upwards momentum strategy before proceeding.
		//if trying to sell, get momentum from btc to usdc.
		MomentumStrategy? UpwardsMomentum = await GetMomentumStrategy(userId, tmpCoin, "USDC", strategy);
		if (UpwardsMomentum != null && UpwardsMomentum.Timestamp != null)
		{
			return await ExecuteUpwardsMomentumStrategy(userId, tmpCoin, keys, coinPriceCAD.Value, coinPriceUSDC.Value, firstPriceToday, lastPrice, currentPrice, spread, spread2, UpwardsMomentum, strategy);
		}

		//check the downards momentum strategy
		MomentumStrategy? DownwardsMomentum = await GetMomentumStrategy(userId, "USDC", tmpCoin, strategy); //if trying to buy, its because downwards trend.
		if (DownwardsMomentum != null && DownwardsMomentum.Timestamp != null)
		{
			return await ExecuteDownwardsMomentumStrategy(userId, tmpCoin, keys, coinPriceCAD.Value, coinPriceUSDC.Value, firstPriceToday, lastPrice, currentPrice, spread, spread2, DownwardsMomentum, strategy);
		}

		if (strategy == "IND")
        {
            return await HandleIndicatorStrategy(userId, coin, strategy, tmpCoin, currentPrice);
        }

        // NO MOMENTUM DETECTED AS OF YET, Check if trade crosses spread thresholds
        if (Math.Abs(spread) >= _TradeThreshold || Math.Abs(spread2) >= _TradeThreshold)
		{
			// // 4. Now we know a trade is needed - fetch balances 
			var balances = await GetBalance(userId, tmpCoin, keys);
			if (balances == null)
			{
				_ = _log.Db("Failed to get wallet balances", userId, "TRADE");
				return false;
			}
			decimal coinBalance = balances.ContainsKey($"X{tmpCoin}") ? balances[$"X{tmpCoin}"] : 0;
			decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;
			_ = _log.Db("USDC Balance: " + usdcBalance + "; Coin Balance: " + coinBalance, userId, "TRADE", true);
			_ = _log.Db($"coinPriceCad: {coinPriceCAD}, coinPriceUSDC {coinPriceUSDC:F2}", userId, "TRADE", true);
			_ = _log.Db($"spread1: {spread:P} || spread2 {spread2:P}. (currentPrice:{currentPrice}), (lastPrice:{lastPrice}), (firstPriceToday:{firstPriceToday.GetValueOrDefault()})", userId, "TRADE", true);

			if (spread >= _TradeThreshold || (firstPriceToday != null && spread2 >= _TradeThreshold))
			{
				string triggeredBy = spread >= _TradeThreshold ? "spread" : "spread2";
				_ = _log.Db($"({tmpCoin}:{userId}) Trade triggered by: {triggeredBy} ({(triggeredBy == "spread2" ? spread2 : spread):P})", userId, "TRADE", true);

				// If no last trade, check if we must equalize
				if (isFirstTradeEver || lastTrade == null)
				{
					bool isBTC = tmpCoin == "XBT" || tmpCoin == "BTC";

					if (isBTC)
					{
						if (usdcBalance <= _MinimumUSDCReserves)
						{
							return await TradeHalfCoinForUSDC(userId, tmpCoin, keys, coinBalance, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value, strategy);
						}

						_ = _log.Db($"No need to equalize funds. USDC Balance ({usdcBalance}) over minimum reserves ({_MinimumUSDCReserves}).", userId, "TRADE", true);
					}
					else
					{
						if (coinBalance <= _MinimumBTCReserves)
						{
							return await TradeHalfUSDCForCoin(userId, tmpCoin, keys, coinBalance, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value, strategy);
						}

						_ = _log.Db($"No need to equalize funds. {tmpCoin} Balance ({coinBalance}) over minimum reserves ({_MinimumBTCReserves}).", userId, "TRADE", true);
					}
				}

				decimal? coinToTrade;
				var isPremiumCondition = await IsInPremiumWindow(tmpCoin);
				var tmpTradePerc = firstPriceToday != null ? _ValueTradePercentage - _ValueTradePercentagePremium : _ValueTradePercentage;
				if (isPremiumCondition)
				{ // Increase sell amount for premium opportunity  // take off a premium if the bot used a fallback trade price value.
					coinToTrade = Math.Min(coinBalance * (tmpTradePerc + _ValueTradePercentagePremium), _MaximumBTCTradeAmount);
					_ = _log.Db($"PREMIUM SELL OPPORTUNITY - Increasing trade size by 5%", userId, "TRADE", true);
				}
				else
				{ // Normal trade amount // take off a premium if the bot used a fallback trade price value.
					coinToTrade = Math.Min(coinBalance * tmpTradePerc, _MaximumBTCTradeAmount);
				}
				if (coinToTrade.HasValue && coinToTrade > 0)
				{
					// Convert the Coin price to USD;  Now you can get the value of coinToTrade in USDC (1 USDC = 1 USD) 
					decimal coinBalanceConverted = coinBalance * coinPriceUSDC.Value;
					_ = _log.Db($"Converted coinBalanceValue in USDC: {coinBalanceConverted}", userId, "TRADE", true);
					if (Is90PercentOfTotalWorth(coinBalanceConverted, coinToTrade.Value))
					{
						_ = _log.Db($"Trade to USDC is prevented. 90% of wallet is already in USDC. {coinToTrade} >= {(coinBalanceConverted + coinToTrade) * _MaximumTradeBalanceRatio}", userId, "TRADE", true);
						return false;
					}
					var spread2Message = firstPriceToday != null ? $"Spread2 : {spread2:P} " : "";
					bool isValidTrade = await ValidateTrade(userId, tmpCoin, tmpCoin, "USDC", "sell", usdcBalance, strategy, coinToTrade);
					if (isValidTrade)
					{
						_ = _log.Db($"Spread is +{spread:P}, {spread2Message}(c:{currentPrice}-l:{lastPrice}), selling {coinToTrade} {tmpCoin} for USDC possibility opened. Switching to momentum strategy.", userId, "TRADE", true);
						int? matchingBuyOrderId = await FindMatchingBuyOrder(userId, tmpCoin, strategy, coinPriceUSDC.Value);
						if (matchingBuyOrderId == null)
						{
							_ = _log.Db("⚠️Cannot sell at this rate. No matching buy orders for this price range. Trade Cancelled.", userId, "TRADE", true);
							return false;
						}
						await AddMomentumEntry(userId, tmpCoin, "USDC", strategy, coinPriceUSDC.Value, matchingBuyOrderId);
						return false;
					}
				}
				else
				{
					_ = _log.Db("⚠️Error fetching USDC exchange rates.", userId, "TRADE", true);
					return false;
				}
			}
			if (spread <= -_TradeThreshold || (firstPriceToday != null && spread2 <= -_TradeThreshold))
			{
				string triggeredBy = spread <= -_TradeThreshold ? "spread" : "spread2";
				_ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Trade triggered by: {triggeredBy} {(triggeredBy == "spread2" ? spread2 : spread):P}", userId, "TRADE", true);
				decimal tmpTradePerc = firstPriceToday != null ? _ValueTradePercentage - _ValueTradePercentagePremium : _ValueTradePercentage;
				decimal usdcValueToTrade = Math.Min(usdcBalance * tmpTradePerc, _MaximumUSDCTradeAmount);
				decimal coinAmount = usdcValueToTrade / coinPriceUSDC.Value;

				bool isValidTrade = await ValidateTrade(userId, tmpCoin, "USDC", tmpCoin, "buy", usdcBalance, strategy, coinAmount);
				if (isValidTrade)
				{
					if (usdcValueToTrade > 0)
					{
						var spread2Message = firstPriceToday != null ? $"Spread2: {spread2:P} " : "";
						_ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread is {spread:P} {spread2Message} (c:{currentPrice}-l:{lastPrice}), buying {tmpCoin} with {FormatBTC(coinAmount)} {tmpCoin} worth of USDC(${usdcValueToTrade})", userId, "TRADE", true);

						await AddMomentumEntry(userId, "USDC", tmpCoin, strategy, coinPriceUSDC.Value, null);
						return false;
					}
				}
			}
		}
		if (spread > -_TradeThreshold && spread < _TradeThreshold && (firstPriceToday == null || (spread2 > -_TradeThreshold && spread2 < _TradeThreshold)))
		{
			decimal thresholdDifference = (Math.Abs(_TradeThreshold) - Math.Abs(spread)) * 100;
			decimal thresholdDifference2 = firstPriceToday != null
				? (Math.Abs(_TradeThreshold) - Math.Abs(spread2)) * 100
				: 0;

			var spread2Message = firstPriceToday != null ? $"Spread2: {spread2:P}" : "";
			var thresh2Message = firstPriceToday != null ? $"/{thresholdDifference2:P} " : " ";
			var lp2Message = firstPriceToday != null ? $"/{firstPriceToday:F2}" : "";
			var timeSince = _log.GetTimeSince(lastTrade?.timestamp, true);

			_ = _log.Db(
				$@"({tmpCoin}:{userId}) Spread within threshold: {spread:P} {spread2Message} (c:{currentPrice:F2}{lp2Message}-l:{lastPrice:F2}|{timeSince}). {thresholdDifference:P}{thresh2Message}away from breaking threshold.",
				userId, "TRADE", true);
		}
		return false;
	}

    private async Task<bool> HandleIndicatorStrategy(int userId, string coin, string strategy, string tmpCoin, decimal currentPrice)
    { 
        // Check if indicators are bullish.
        bool? isBullish = await CheckIfBullishSignalExists(tmpCoin, "USDC");
        if (!isBullish.HasValue)
        {
            _ = _log.Db($"⚠️Error fetching bullish signal for {tmpCoin}({strategy}). Trade Cancelled.", userId, "TRADE", true);
            return false;
        }
        if (!isBullish.Value)
        {
            _ = _log.Db($"No bullish signal for {tmpCoin}({strategy}). Trade Cancelled.", userId, "TRADE", true);
            return false;
        }

        // Indicator strategy can only have 1 active trade at a time.
        int? activeTrades = await GetActiveTradeCount(userId, coin, strategy);
        if (activeTrades == null || activeTrades > 0)
        {
            string message = activeTrades == null
                ? $"⚠️Error fetching active trades for {coin}({strategy}). Trade Cancelled."
                : $"User already has an active {coin}({strategy}) trade. Trade Cancelled.";
            _ = _log.Db(message, userId, "TRADE", true);
            return false;
        }
        // Indicator strategy can only have 1 trade during this "bull" cycle.
        bool? anyBullTrades = await CheckIfTradedInCurrentInterval(userId, coin, "USDC", strategy);
        if (anyBullTrades == null)
        {
            _ = _log.Db($"⚠️Error fetching active trades for {coin}({strategy}). Trade Cancelled.", userId, "TRADE", true);
            return false;
        }
        if (anyBullTrades.Value)
        {
            _ = _log.Db($"User already has an active {coin}({strategy}) trade in this bull cycle. Trade Cancelled.", userId, "TRADE", true);
            return false;
        }

		//create momentum strategy and set a configured stoploss.
		await SetIndicatorTradeStopLoss(userId, tmpCoin, "USDC", 0.5m, currentPrice);
		await AddMomentumEntry(userId, tmpCoin, "USDC", strategy, currentPrice, null);

		return false;
    }

    private async Task<bool> ExecuteDownwardsMomentumStrategy(int userId, string coin, UserKrakenApiKey keys, decimal coinPriceCAD, decimal coinPriceUSDC, decimal? firstPriceToday, decimal lastPrice, decimal currentPrice, decimal spread, decimal spread2, MomentumStrategy DownwardsMomentum, string strategy)
	{
		_ = _log.Db($"{DownwardsMomentum.FromCurrency}|{DownwardsMomentum.ToCurrency} Downwards momentum ({strategy})strategy detected. Verifying momentum data.", userId, "TRADE", true);
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		//is spread still respected?
		if (Math.Abs(spread) >= _TradeThreshold || Math.Abs(spread2) >= _TradeThreshold)
		{   //Spread is still respected. Is price over threshold? (new - old) >= 50$ or (new - best) >= 50$
			decimal triggeredBySpread = Math.Abs(spread) >= _TradeThreshold ? spread : spread2;

			decimal baseThreshold, maxThreshold, premiumThreshold;
			const decimal spreadSensitivity = 1.5m;
			const decimal volatilityFactor = 1.5m;
			const decimal volumeSpikeSensitivity = 0.7m; // Reduce threshold by 30% when volume spikes

			if (tmpCoin == "XBT")
			{
				baseThreshold = Math.Max(40.0m, coinPriceUSDC * 0.00025m); // e.g., $100 at $200,000
				maxThreshold = baseThreshold * 3.0m; // e.g., $600
				premiumThreshold = baseThreshold * 2.0m; // e.g., $400
			}
			else if (tmpCoin == "XRP" || coinPriceUSDC < 10m)
			{ 
				// Percentage-based threshold for low-priced coins
				decimal pricePercentage = 0.0025m; // 0.25% 
				baseThreshold = Math.Max(coinPriceUSDC * pricePercentage, 0.005m); // Minimum $0.005
				maxThreshold = baseThreshold * 3.0m;
				premiumThreshold = baseThreshold * 2.0m;
			}
			else
			{
				// // Elastic band: Volatility-based threshold using spread as proxy
				decimal volatility = coinPriceUSDC * Math.Abs(triggeredBySpread) * 2.0m; // Scale spread impact
				baseThreshold = Math.Max(volatility, 0.01m); // Minimum $0.01 for low-priced coins
				maxThreshold = baseThreshold * 3.0m; // 3x for upper bound
				premiumThreshold = baseThreshold * 2.0m; // 2x for premium
			}

			bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, tmpCoin, "USDC", userId);
			decimal volumeAdjustment = isVolumeSpiking ? volumeSpikeSensitivity : 1.0m; 
			if (isVolumeSpiking)
			{
				_ = _log.Db($"Volume spike detected for {tmpCoin}. Reducing threshold sensitivity by {volumeSpikeSensitivity:P}.", userId, "TRADE", true);
			}

			decimal spreadImpact = Math.Abs(triggeredBySpread) * spreadSensitivity;
			decimal volatilityImpact = (Math.Abs(triggeredBySpread) / _TradeThreshold) * volatilityFactor;
			decimal dynamicThreshold = baseThreshold * Math.Max(1, spreadImpact + volatilityImpact) * volumeAdjustment;
			dynamicThreshold = Math.Min(dynamicThreshold, maxThreshold);

			bool priceAboveInitial = (coinPriceUSDC - DownwardsMomentum.CoinPriceUsdc) >= dynamicThreshold;
			bool priceAboveBest = (coinPriceUSDC - DownwardsMomentum.BestCoinPriceUsdc) >= dynamicThreshold;

			if (priceAboveInitial || priceAboveBest)
            {
                _ = _log.Db($"Executing momentum entry from USDC to {tmpCoin}({strategy}): {coinPriceUSDC}. triggeredBySpread: {triggeredBySpread:P}, {(spread > 0 ? $"spread:{spread:P}" : "")} {(spread2 > 0 ? $"spread2:{spread2:P}" : "")}", userId, "TRADE", true);
                _ = _log.Db($"Threshold ({dynamicThreshold:F2}). (coinPriceUSDC:{coinPriceUSDC} - DownwardsMomentum.CoinPriceUsdc:{DownwardsMomentum.CoinPriceUsdc} >= {dynamicThreshold} ({priceAboveInitial}:{(coinPriceUSDC - DownwardsMomentum.CoinPriceUsdc)}) || coinPriceUSDC:{coinPriceUSDC} - DownwardsMomentum.BestCoinPriceUsdc:{DownwardsMomentum.BestCoinPriceUsdc} >= {dynamicThreshold} ({priceAboveBest}:{(coinPriceUSDC - DownwardsMomentum.BestCoinPriceUsdc)})).", userId, "TRADE", true);

                // buy at this point
                var balances = await GetBalance(userId, tmpCoin, keys);
                if (balances == null)
                {
                    _ = _log.Db("Failed to get wallet balances", userId, "TRADE");
                    return false;
                }
                decimal coinBalance = balances.ContainsKey($"X{tmpCoin}") ? balances[$"X{tmpCoin}"] : 0;
                decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;
                decimal usdcValueToTrade = 0;
                var isPremiumCondition = dynamicThreshold > premiumThreshold;
                var tmpTradePerc = firstPriceToday != null ? _ValueTradePercentage - _ValueTradePercentagePremium : _ValueTradePercentage;

                if (isPremiumCondition)
                { // Increase trade amount for premium opportunity
                    usdcValueToTrade = Math.Min(usdcBalance * (tmpTradePerc + _ValueTradePercentagePremium), _MaximumUSDCTradeAmount);
                    _ = _log.Db($"[PREMIUM BUY OPPORTUNITY] dynamicThreshold:{dynamicThreshold} > {premiumThreshold}. Increasing trade size by 5%", userId, "TRADE", true);
                }
                else
                { // Normal trade amount
                    usdcValueToTrade = Math.Min(usdcBalance * tmpTradePerc, _MaximumUSDCTradeAmount);
                }
                usdcValueToTrade = await AdjustToPriors(userId, tmpCoin, usdcValueToTrade, "buy", strategy);

                if (usdcValueToTrade > 0)
                {
                    //_ = _log.Db("USD to CAD rate: " + usdToCadRate.Value, userId, "TRADE", true);
                    decimal coinAmount = usdcValueToTrade / coinPriceUSDC;
                    var spread2Message = firstPriceToday != null ? $"Spread2: {spread2:P} " : "";
                    _ = _log.Db($"Spread is {spread:P} {spread2Message} (c:{currentPrice:F2}-l:{lastPrice:F2}){(firstPriceToday != null ? $" [First price today: {firstPriceToday}] " : "")}, buying {tmpCoin} with {FormatBTC(coinAmount)} {coin} worth of USDC(${usdcValueToTrade})", userId, "TRADE", true);

                    await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinAmount), "buy", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, null);
                    if (await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy))
                    {
                        _ = _log.Db($"Deleted {tmpCoin}({strategy}) Momentum strategy.", userId, "TRADE", true);
                    }
                    else
                    {
                        _ = _log.Db($"⚠️Error deleting {tmpCoin}({strategy}) momentum strategy!", userId, "TRADE", true);
                    }
                    return true;
                }
                else
                {
                    _ = _log.Db($"⚠️Error executing {tmpCoin} momentum strategy! usdcValueToTrade:{usdcValueToTrade} < 0. Trade Cancelled.", userId, "TRADE", true);
                    if (await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy))
                    {
                        _ = _log.Db($"Deleted {tmpCoin}({strategy}) Momentum strategy.", userId, "TRADE", true);
                    }
                    else
                    {
                        _ = _log.Db($"⚠️Error deleting {tmpCoin}({strategy}) momentum strategy!", userId, "TRADE", true);
                    }
                    return false;
                }
            }
            else
			{
				await UpdateMomentumEntry(userId, tmpCoin, "USDC", tmpCoin, coinPriceUSDC, strategy);
				//_ = _log.Db($"Updated momentum entry from USDC to {tmpCoin}({strategy}): {coinPriceUSDC:F2}. triggeredBySpread: {triggeredBySpread:P}, {(spread > 0 ? $"spread:{spread:P}" : "")} {(spread2 > 0 ? $"spread2:{spread2:P}" : "")}", userId, "TRADE", true);
				_ = _log.Db($"Threshold ({dynamicThreshold:F2}) still respected. Waiting. (priceAboveInitial:{priceAboveInitial}? : coinPriceUSDC:{coinPriceUSDC:F2} - DownwardsMomentum.CoinPriceUsdc:{DownwardsMomentum.CoinPriceUsdc} >= {dynamicThreshold:F2} ({priceAboveInitial}:{(coinPriceUSDC - DownwardsMomentum.CoinPriceUsdc):F2}) || priceAboveBest:{priceAboveBest}?: coinPriceUSDC:{coinPriceUSDC:F2} - DownwardsMomentum.BestCoinPriceUsdc:{DownwardsMomentum.BestCoinPriceUsdc} >= {dynamicThreshold:F2} ({priceAboveBest}:{(coinPriceUSDC - DownwardsMomentum.BestCoinPriceUsdc):F2})) Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
		}
		else
		{
			//Delete momentum strategy and return;
			if (await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy))
			{
				_ = _log.Db($"Spread (spread:{spread:P},spread2:{spread2:P}) no longer respected. Deleted {tmpCoin} Momentum strategy. Trade Cancelled.", userId, "TRADE", true);
			}
			else
			{
				_ = _log.Db($"⚠️Error deleting {tmpCoin} momentum strategy! Spread (spread:{spread:P},spread2:{spread2:P}) no longer respected. Trade Cancelled.", userId, "TRADE", true);
			}
			return false;
		}
	}

	private async Task<decimal> AdjustToPriors(int userId, string tmpCoin, decimal valueToTrade, string buyOrSell, string strategy)
	{
		int priorTradeCount = await GetOppositeTradeCount(userId, tmpCoin, buyOrSell, strategy, lookbackCount: 5);
		decimal adjustmentFactor = 1m;

		if (priorTradeCount > 0)
		{
			if (buyOrSell.ToLower() == "buy")
			{
				decimal adjustmentPerTrade = 0.05m; // Increase buy amount by 5% per prior sell
				adjustmentFactor = 1m + (priorTradeCount * adjustmentPerTrade);
				adjustmentFactor = Math.Min(1.5m, adjustmentFactor); // Cap increase at 150%
				valueToTrade = valueToTrade * adjustmentFactor;
				_ = _log.Db($"Increased buy amount by {adjustmentFactor:P} due to {priorTradeCount} prior sells. New amount: {valueToTrade}", userId, "TRADE", true);
			}
			else if (buyOrSell.ToLower() == "sell")
			{
				decimal adjustmentPerTrade = 0.05m;  // Reduce sell amount by 5% per prior buy
				adjustmentFactor = 1m - (priorTradeCount * adjustmentPerTrade);
				adjustmentFactor = Math.Max(0.8m, adjustmentFactor); // Cap reduction at 20% (minimum 80% of original)
				valueToTrade = valueToTrade * adjustmentFactor;
				decimal reductionPercentage = 1m - adjustmentFactor; // Calculate the reduction percentage
				_ = _log.Db($"Reduced sell amount by {reductionPercentage:P0} due to {priorTradeCount} prior buys. New amount: {valueToTrade}", userId, "TRADE", true);
			}
		} 

		return valueToTrade;
	}

	private async Task<bool> ExecuteUpwardsMomentumStrategy(int userId, string coin, UserKrakenApiKey keys, decimal coinPriceCAD, decimal coinPriceUSDC, decimal? firstPriceToday, decimal lastPrice, decimal currentPrice, decimal spread, decimal spread2, MomentumStrategy upwardsMomentum, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		_ = _log.Db($"{upwardsMomentum.FromCurrency}|{upwardsMomentum.ToCurrency} Upwards momentum strategy detected. Verifying momentum data.", userId, "TRADE", true);
		//is spread still respected?
		if (Math.Abs(spread) >= _TradeThreshold || Math.Abs(spread2) >= _TradeThreshold)
		{   //Spread is still respected. Is price over threshold? (new - old) >= 50$ or (new - best) >= 50$
			decimal triggeredBySpread = Math.Abs(spread) >= _TradeThreshold ? spread : spread2;

			decimal baseThreshold, maxThreshold, premiumThreshold;
			const decimal spreadSensitivity = 1.5m;
			const decimal volatilityFactor = 1.5m;
			const decimal volumeSpikeSensitivity = 0.7m; // Reduce threshold by 30% when volume spikes

			if (tmpCoin == "XBT")
			{
				baseThreshold = Math.Max(40.0m, coinPriceUSDC * 0.00025m); // e.g., $100 at $200,000
				maxThreshold = baseThreshold * 3.0m; // e.g., $600
				premiumThreshold = baseThreshold * 2.0m; // e.g., $400
			}
			else
			{
				// Elastic band: Volatility-based threshold using spread as proxy
				decimal volatility = coinPriceUSDC * Math.Abs(triggeredBySpread) * 2.0m; // Scale spread impact
				baseThreshold = Math.Max(volatility, 0.01m); // Minimum $0.01 for low-priced coins
				maxThreshold = baseThreshold * 3.0m; // 3x for upper bound
				premiumThreshold = baseThreshold * 2.0m; // 2x for premium
			}

			bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, tmpCoin, "USDC", userId);
			decimal volumeAdjustment = isVolumeSpiking ? volumeSpikeSensitivity : 1.0m;
			if (isVolumeSpiking)
			{
				_ = _log.Db($"Volume spike detected for {tmpCoin}. Reducing threshold sensitivity by {volumeSpikeSensitivity:P}.", userId, "TRADE", true);
			}

			decimal spreadImpact = Math.Abs(triggeredBySpread) * spreadSensitivity;
			decimal volatilityImpact = (Math.Abs(triggeredBySpread) / _TradeThreshold) * volatilityFactor;
			decimal dynamicThreshold = baseThreshold * Math.Max(1, spreadImpact + volatilityImpact) * volumeAdjustment;
			dynamicThreshold = Math.Min(dynamicThreshold, maxThreshold); 
			bool priceAboveInitial = (coinPriceUSDC - upwardsMomentum.CoinPriceUsdc) >= -dynamicThreshold;
			bool priceAboveBest = (coinPriceUSDC - upwardsMomentum.BestCoinPriceUsdc) >= -dynamicThreshold;

			if (priceAboveInitial && priceAboveBest)
			{   //we gotta wait here. Return false;
				await UpdateMomentumEntry(userId, tmpCoin, tmpCoin, "USDC", coinPriceUSDC, strategy);
				//_ = _log.Db($"Updated momentum entry from {tmpCoin}({strategy}) to USDC: {coinPriceUSDC:F2}. triggeredBySpread: {triggeredBySpread:P}, {(spread > 0 ? $"spread:{spread:P}" : "")} {(spread2 > 0 ? $"spread2:{spread2:P}" : "")}", userId, "TRADE", true);
				_ = _log.Db($"Threshold ({-dynamicThreshold:F2}) still respected. Waiting. (priceAboveInitial:{priceAboveInitial}? : coinPriceUSDC:{coinPriceUSDC:F2} - UpwardsMomentum.CoinPriceUsdc:{upwardsMomentum.CoinPriceUsdc} >= {-dynamicThreshold:F2} && priceAboveBest:{priceAboveBest}?: coinPriceUSDC:{coinPriceUSDC:F2} - UpwardsMomentum.BestCoinPriceUsdc:{upwardsMomentum.BestCoinPriceUsdc} >= {-dynamicThreshold:F2}) Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
			else
			{
				_ = _log.Db($"Executing momentum entry from {tmpCoin}({strategy}) to USDC: {coinPriceUSDC:F2}. triggeredBySpread: {triggeredBySpread:P}, {(spread > 0 ? $"spread:{spread:P}" : "")} {(spread2 > 0 ? $"spread2:{spread2:P}" : "")}", userId, "TRADE", true);
				_ = _log.Db($"Threshold ({dynamicThreshold:F2}). (coinPriceUSDC:{coinPriceUSDC:F2} - UpwardsMomentum.CoinPriceUsdc:{upwardsMomentum.CoinPriceUsdc:F2} >= {-dynamicThreshold:F2} ({priceAboveInitial}:{(coinPriceUSDC - upwardsMomentum.CoinPriceUsdc):F2}) || coinPriceUSDC:{coinPriceUSDC:F2} - UpwardsMomentum.BestCoinPriceUsdc:{upwardsMomentum.BestCoinPriceUsdc} >= {-dynamicThreshold:F2} ({priceAboveBest}:{(coinPriceUSDC - upwardsMomentum.BestCoinPriceUsdc):F2})).", userId, "TRADE", true);

				//sell at this point
				var balances = await GetBalance(userId, tmpCoin, keys);
				if (balances == null)
				{
					_ = _log.Db("Failed to get wallet balances", userId, "TRADE");
					return false;
				}
				decimal coinBalance = balances.ContainsKey($"X{tmpCoin}") ? balances[$"X{tmpCoin}"] : 0;
				decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;
				_ = _log.Db("USDC Balance: " + usdcBalance + "; Btc Balance: " + coinBalance, userId, "TRADE", true);

				decimal? coinToTrade;
				var isPremiumCondition = dynamicThreshold > premiumThreshold; //A Ratio depending on how far we are from the price.
				if (isPremiumCondition)
				{ // Increase sell amount for premium opportunity  // take off a premium if the bot used a fallback trade price value.
					coinToTrade = Math.Min(coinBalance * (_ValueSellPercentage + _ValueTradePercentagePremium), _MaximumBTCTradeAmount);
					_ = _log.Db($"[PREMIUM SELL OPPORTUNITY] dynamicThreshold:{dynamicThreshold:F2} > {premiumThreshold:F2}. Increasing trade size by {_ValueTradePercentagePremium:P}", userId, "TRADE", true);
				}
				else
				{ // Normal trade amount // take off a premium if the bot used a fallback trade price value.
					coinToTrade = Math.Min(coinBalance * _ValueSellPercentage, _MaximumBTCTradeAmount);
				} 
				coinToTrade = await AdjustToPriors(userId, tmpCoin, coinToTrade.Value, "sell", strategy);

				decimal coinValueMatchingLastBuyPrice = await GetLowestBuyPriceInXTradesAsync(userId, tmpCoin, strategy, 5, upwardsMomentum.MatchingTradeId);
				if (coinValueMatchingLastBuyPrice == 0)
				{
					_ = _log.Db($"⚠️No matching buy price at this depth!", userId, "TRADE", true);
				}
				else
				{
					if (coinValueMatchingLastBuyPrice < coinToTrade)
					{
						_ = _log.Db($"⚠️Set {coinToTrade} to match buy price at this depth : {coinValueMatchingLastBuyPrice}", userId, "TRADE", true); 
						coinToTrade = coinValueMatchingLastBuyPrice;
					}
				}

				decimal coinValueInUsdc = coinToTrade.Value * coinPriceUSDC;
				var spread2Message = firstPriceToday != null ? $"Spread2 : {spread2:P} " : "";
				_ = _log.Db($"Spread is +{spread:P}, {spread2Message}(c:{currentPrice}-l:{lastPrice}), selling {coinToTrade} {tmpCoin} for USDC ({coinValueInUsdc}) matching trade ID: {upwardsMomentum.MatchingTradeId}.", userId, "TRADE", true);
				await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinToTrade.Value), "sell", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, upwardsMomentum.MatchingTradeId);
				if (await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy))
				{
					_ = _log.Db($"Deleted {tmpCoin} Momentum ({strategy})strategy.", userId, "TRADE", true);
				}
				else
				{
					_ = _log.Db($"⚠️Error deleting {tmpCoin} momentum ({strategy})strategy!", userId, "TRADE", true);
				}
				return true;
			}
		}
		else
		{
			//Delete momentum strategy and return;
			if (await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy))
			{
				_ = _log.Db($"Spread (spread:{spread:P},spread2:{spread2:P}) no longer respected. Deleted {tmpCoin} Momentum ({strategy})strategy. Trade Cancelled.", userId, "TRADE", true);
			}
			else
			{
				_ = _log.Db($"⚠️Error deleting {tmpCoin} momentum ({strategy})strategy! Spread (spread:{spread:P},spread2:{spread2:P}) no longer respected. Trade Cancelled.", userId, "TRADE", true);
			}
			return false;
		}
	}

	private async Task<bool> ValidateTrade(int userId, string coin, string from, string to, string buyOrSell, decimal usdcBalance, string strategy, decimal? coinToTrade)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		_ = _log.Db($"ValidateTrade from:{from}, to: {to}, {buyOrSell}, usdcBalance:{usdcBalance}, coinToTrade:{coinToTrade}.", userId, "TRADE", true);

		try
		{
			if (Convert.ToDecimal(coinToTrade) < _MinimumBTCTradeAmount)
			{
				_ = _log.Db($"Trade amount:{coinToTrade} < {_MinimumBTCTradeAmount} is too small. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}

			if (await IsRepeatingTradesInDay(userId, from, to, buyOrSell, strategy, 5))
			{
				_ = _log.Db($"TRADE CANCELLED: Too many repeated ({strategy}) {buyOrSell} trades in the same day.", userId, "TRADE", outputToConsole: true);
				return false;
			} 

			//Contextual Adjustments: If you’re trading based on certain market conditions(e.g., high volatility or low reserves), you might want to adjust the range dynamically. For example
			//If reserves are low, you may want a larger range to avoid too many trades.
			//If there is high market volatility, you could reduce the range to act more cautiously.  
			bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, from, to, userId);
			int tradeRange = isVolumeSpiking ? _VolumeSpikeMaxTradeOccurance : _MaxTradeTypeOccurances;
			bool shouldTradeBasedOnReserves = await ShouldTradeBasedOnRangeAndReserve(userId, from, to, buyOrSell, strategy, tradeRange, usdcBalance);
			if (!shouldTradeBasedOnReserves)
			{
				_ = _log.Db($"User has {buyOrSell} {from} {to} too many times in the last {tradeRange} trades (Based on {tmpCoin}/USDC reserves {(isVolumeSpiking ? " and volume spike": "")}). ({strategy})Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
			int tradeRangeLimit = _MaxTradeTypeOccurances;
			int daySpanCheck = 1;
			bool withinLimit = await HasExceededTradeLimitInTimeWindow(userId, from, to, buyOrSell, strategy, tradeRangeLimit, TimeSpan.FromDays(daySpanCheck));
			if (!withinLimit)
			{
				_ = _log.Db($"User has {buyOrSell} {from} {to} too frequently ({tradeRangeLimit}) in the last {daySpanCheck} day{((daySpanCheck > 1 || daySpanCheck == 0) ? "s" : "")}. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
			bool withinTradeSequenceLimit = await CheckTradeFrequencyOccurance(userId, buyOrSell, strategy, _MaxTradeTypeOccurances);
			if (!withinTradeSequenceLimit)
			{
				_ = _log.Db($"User has {buyOrSell} {from} {to} too frequently ({_MaxTradeTypeOccurances - 1}) in the last {_MaxTradeTypeOccurances} occurances. Trade Cancelled.", userId, "TRADE", true);
				return false;
			} 
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Exception while validating {tmpCoin} trade! Trade Cancelled. " + ex.Message, userId, "TRADE", true);
			return false;
		}

		return true;
	}

	private static bool Is90PercentOfTotalWorth(decimal fromBalance, decimal coinToTrade)
	{
		decimal totalBalance = fromBalance + coinToTrade;
		if (coinToTrade >= totalBalance * _MaximumTradeBalanceRatio)
		{ // Prevent trade to USDC if 90% of wallet is already in USDC
			return true;
		}
		return false;
	}

	public async Task<Dictionary<string, decimal>?> GetBalance(int userId, string coin, UserKrakenApiKey keys)
	{
		try
		{
			// Fetch the balance response as a dictionary
			var balanceResponse = await MakeRequestAsync(userId, keys, "/Balance", "private", new Dictionary<string, string>());

			// Check if the response contains the "result" key
			if (balanceResponse == null || !balanceResponse.ContainsKey("result"))
			{
				_ = _log.Db("⚠️Failed to get wallet balances: 'result' not found.", userId, "TRADE", true);
				return null;
			}

			// Extract the result part of the response
			var result = (JObject)balanceResponse["result"];

			// Convert the result into a Dictionary<string, decimal> to store the balances
			Dictionary<string, decimal>? balanceDictionary = result.ToObject<Dictionary<string, decimal>>();
			if (balanceDictionary == null)
			{
				_ = _log.Db("⚠️Failed to convert balance response to dictionary.", userId, "TRADE", true);
				return null;
			}
			//_ = _log.Db(string.Join(Environment.NewLine, balanceDictionary.Select(x => $"{x.Key}: {x.Value}")), userId, "TRADE", true);
			_ = CreateWalletEntriesFromFetchedDictionary(balanceDictionary, userId);

			return balanceDictionary;
		}
		catch (Exception ex)
		{
			// Handle any errors that occur during the request
			_ = _log.Db($"⚠️Error fetching balance: {ex.Message}", null, "TRADE", true);
			return null;
		}
	}
	private async Task<bool> TradeHalfCoinForUSDC(int userId, string coin, UserKrakenApiKey keys, decimal coinBalance, decimal usdcBalance, decimal coinPriceCAD, decimal coinPriceUSDC, string strategy = "XXX")
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		decimal minCoinToStart = _InitialMinimumBTCAmountToStart;

		if (usdcBalance > _MinimumUSDCReserves)
		{
			_ = _log.Db($"No need to equalize funds. USDC Balance ({usdcBalance}) over minimum reserves ({_MinimumUSDCReserves}).", userId, "TRADE", true);
			return false;
		}

		_ = _log.Db($"Equalizing funds ({tmpCoin}: {coinBalance}, USDC: {usdcBalance})", userId, "TRADE", true);
		if (coinBalance > minCoinToStart)
		{
			//Trade 50% of BTC balance TO USDC
			decimal halfTradePercentage = 0.5m;
			decimal coinToTrade = coinBalance * halfTradePercentage;
			if (coinToTrade > 0)
			{
				_ = _log.Db($"Starting user off with some ({coinToTrade}) USDC reserves.", userId, "TRADE", true);
				await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinToTrade), "sell", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, null);
			}
		}
		else
		{
			_ = _log.Db($"⚠️Not enough BTC to trade({strategy}) ({coinBalance}<{minCoinToStart})", userId, "TRADE", true);
			return false;
		}
		return true;
	}


	private async Task<bool> TradeHalfUSDCForCoin(int userId, string coin, UserKrakenApiKey keys, decimal coinBalance, decimal usdcBalance, decimal coinPriceCAD, decimal coinPriceUSDC, string strategy = "XXX")
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		decimal minUSDCToStart = _InitialMinimumUSDCAmountToStart;

		if (coinBalance > _MinimumBTCReserves)
		{
			_ = _log.Db($"No need to equalize funds. {tmpCoin} Balance ({coinBalance}) over minimum reserves ({_MinimumBTCReserves}).", userId, "TRADE", true);
			return false;
		}

		_ = _log.Db($"{(_InitialMaximumUSDCAmountToStart > 0 ? "Starting fund" : "Equalizing funds")} ({tmpCoin}: {coinBalance}, USDC: {usdcBalance})", userId, "TRADE", true);
		if (usdcBalance > minUSDCToStart)
		{
			decimal halfTradePercentage = 0.5m; // 50%
			decimal usdcAmount = _InitialMaximumUSDCAmountToStart > 0 ? Math.Min(usdcBalance * halfTradePercentage, _InitialMaximumUSDCAmountToStart) : (usdcBalance * halfTradePercentage);
			usdcAmount = usdcAmount / coinPriceUSDC;
			if (usdcAmount > 0)
			{
				_ = _log.Db($"Starting user off with some ({usdcAmount}$USDC) {tmpCoin} reserves", userId, "TRADE", true);
				await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(usdcAmount), "buy", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, null);
			}
		}
		else
		{
			_ = _log.Db($"⚠️Not enough USDC to trade({strategy}) ({usdcBalance}<{minUSDCToStart})", userId, "TRADE", true);
			return false;
		}
		return true;
	}

	private async Task ExecuteTrade(int userId, string coin, UserKrakenApiKey keys, string amount, string buyOrSell, decimal coinBalance, decimal usdcBalance, decimal coinPriceCAD, decimal coinPriceUSDC, string strategy, int? matchingTradeId)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		string from = tmpCoin;
		string to = "USDC";
		amount = amount.Trim();

		// fee is 0.4%; 
		var pair = $"{from}{to}";
		var parameters = new Dictionary<string, string>
		{
			["pair"] = pair,
			["type"] = buyOrSell,           // "buy" or "sell"
			["ordertype"] = "market",       // "market" or "limit"
			["volume"] = amount
		};

		_ = _log.Db($"Executing ({strategy}) trade: {buyOrSell} {from}->{to}/{amount}", userId, "TRADE", true);
		Dictionary<string, Object>? response = await MakeRequestAsync(userId, keys, "/AddOrder", "private", parameters);
		await GetOrderResults(userId, keys, amount, from, to, response);
		await SaveTradeFootprint(userId, from, to, amount, coinPriceCAD, coinPriceUSDC, buyOrSell, coinBalance, usdcBalance, strategy, matchingTradeId);
	}

	private async Task GetOrderResults(int userId, UserKrakenApiKey keys, string amount, string from, string to, Dictionary<string, object>? response)
	{
		string? orderId = null;
		if (response != null && response.ContainsKey("result"))
		{
			var result = (JObject)response["result"];
			orderId = result["orderId"]?.ToString();
		}
		if (!string.IsNullOrEmpty(orderId))
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

	private async Task<dynamic?> CheckOrderStatus(int userId, UserKrakenApiKey keys, string orderId)
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
	private async Task<bool> UpdateTradeFee(int tradeId, float fee, decimal usdcPrice, int userId)
	{
		const string logPrefix = "UpdateTradeFee";
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// 1. First verify the trade exists and get current fee
			var verifySql = @"SELECT user_id, fees FROM trade_history WHERE id = @tradeId";
			float currentFee = -1;
			int tradeUserId = 0;

			using (var verifyCmd = new MySqlCommand(verifySql, conn))
			{
				verifyCmd.Parameters.AddWithValue("@tradeId", tradeId);
				using var reader = await verifyCmd.ExecuteReaderAsync();
				if (await reader.ReadAsync())
				{
					tradeUserId = reader.GetInt32("user_id");
					currentFee = reader.GetFloat("fees");
				}
			}

			// Trade not found
			if (tradeUserId == 0)
			{
				_ = _log.Db($"{logPrefix}: Trade ID {tradeId} not found", userId, "TRADE", true);
				return false;
			}

			// Fee already set and matches
			if (currentFee == fee)
			{
				//_ = _log.Db($"{logPrefix}: Trade ID {tradeId} already has fee {fee}", userId, "TRADE", false);
				return true;
			}

			// 2. Update the fee
			var updateSql = @"
				UPDATE trade_history 
				SET 
					fees = @fee,
					fee_updated_at = UTC_TIMESTAMP(),
					coin_price_usdc = CASE 
						WHEN coin_price_usdc IS NULL OR coin_price_usdc = '0' THEN @BTCPriceUSDC 
						ELSE coin_price_usdc 
					END
				WHERE 
					id = @tradeId";


			using var updateCmd = new MySqlCommand(updateSql, conn);
			updateCmd.Parameters.AddWithValue("@fee", fee);
			updateCmd.Parameters.AddWithValue("@tradeId", tradeId);
			updateCmd.Parameters.AddWithValue("@BTCPriceUSDC", usdcPrice);

			int rowsAffected = await updateCmd.ExecuteNonQueryAsync();

			if (rowsAffected > 0)
			{
				_ = _log.Db($"{logPrefix}: Updated trade ID {tradeId} fee from {currentFee} to {fee}.", userId, "TRADE", false);

				// You could add additional logging or history tracking here
				return true;
			}

			return false;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️{logPrefix}: Failed to update trade ID {tradeId}: {ex.Message}",
						userId, "TRADE", true);
			return false;
		}
	}
	public async Task<bool?> UpdateFees(int userId, string coin, UserKrakenApiKey keys, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		bool updated = false;

		// 0. First check if there are any trades needing fee updates (top 20 recent trades)
		bool hasMissingFees = await CheckForMissingFees(userId, tmpCoin, strategy);
		if (!hasMissingFees)
		{
			//_ = _log.Db($"No trades with missing fees found for {tmpCoin}", userId, "TRADE", true);
			return false; // No work needed
		}
		try
		{
			// 1. Get all trades from Kraken for both XBTUSDC and USDCXBT pairs
			var krakenTradesBuySide = await GetUserTrades(userId, keys, $"{tmpCoin}USDC");
			if (krakenTradesBuySide == null || krakenTradesBuySide.Count == 0) return null;
			var krakenTradesSellSide = await GetUserTrades(userId, keys, $"USDC{tmpCoin}");

			// Combine both sets of trades
			var allKrakenTrades = krakenTradesBuySide.Concat(krakenTradesSellSide).ToList();
			var today = DateTime.UtcNow.Date;
			var yesterday = today.AddDays(-1);
			allKrakenTrades = allKrakenTrades.Where(x =>
				x.Timestamp.Date == today ||
				x.Timestamp.Date == yesterday)
			.ToList();
			// 2. Get trades from our database that are missing fees
			var allTrades = await GetTradeHistory(userId, tmpCoin, "DCA");
			allTrades = allTrades.Where(x => x.timestamp.Date == today ||
				x.timestamp.Date == yesterday).ToList();
			// 3. Match and update
			foreach (var dbTrade in allTrades)
			{
				var matchingTrade = FindMatchingKrakenTrade(tmpCoin, allKrakenTrades, dbTrade);
				if (matchingTrade != null)
				{
					await UpdateTradeFee(dbTrade.id, matchingTrade.Fee, matchingTrade.Price, userId);
					updated = true;
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error updating {tmpCoin} missing fees: {ex.Message}", userId, "TRADE", true);
			return null;
		}
		return updated;
	}

	private async Task<List<KrakenTrade>> GetUserTrades(int userId, UserKrakenApiKey keys, string pair)
	{
		var parameters = new Dictionary<string, string>
		{
			["type"] = "all",
			["pair"] = pair,
			["trades"] = "true"
		};

		var response = await MakeRequestAsync(userId, keys, "/TradesHistory", "private", parameters);
		var trades = new List<KrakenTrade>();

		if (response != null && response.TryGetValue("result", out var resultObj) && resultObj is JObject result)
		{
			var tradesData = result["trades"] as JObject;
			if (tradesData != null)
			{
				foreach (var trade in tradesData)
				{
					var tradeInfo = trade.Value;
					if (tradeInfo != null)
					{
						// Parse Unix timestamp to DateTime 
						if (!decimal.TryParse(tradeInfo["time"]?.ToString(), out var unixTimestampDecimal))
						{
							_ = _log.Db($"Failed to parse timestamp for trade {trade.Key}", userId, "TRADE", true);
							continue;
						}

						DateTimeOffset dateTimeOffset = DateTimeOffset.FromUnixTimeSeconds((long)unixTimestampDecimal);
						DateTime tradeTime = dateTimeOffset.UtcDateTime;

						trades.Add(new KrakenTrade
						{
							TradeId = trade.Key,
							OrderId = tradeInfo["ordertxid"]?.ToString() ?? "",
							Pair = tradeInfo["pair"]?.ToString() ?? "",
							Type = tradeInfo["type"]?.ToString() ?? "",
							Price = decimal.Parse(tradeInfo["price"]?.ToString() ?? "0"),
							Volume = decimal.Parse(tradeInfo["vol"]?.ToString() ?? "0"),
							Fee = float.Parse(tradeInfo["fee"]?.ToString() ?? "0"),
							Cost = decimal.Parse(tradeInfo["cost"]?.ToString() ?? "0"),
							Timestamp = tradeTime
						});
					}
				}
			}
		}

		return trades;
	}

	private KrakenTrade? FindMatchingKrakenTrade(string coin, List<KrakenTrade> krakenTrades, TradeRecord dbTrade)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		 
		// _ = _log.Db($"Looking for match for DB trade: " +
		// 			$"ID={dbTrade.id}, " +
		// 			$"Type={(dbTrade.from_currency == "XBT" ? "sell" : "buy")}, " +
		// 			$"Value={dbTrade.value}, " +
		// 			$"Time={dbTrade.timestamp:yyyy-MM-dd HH:mm:ss}",
		// 			dbTrade.user_id, "TRADE_DEBUG", true);
		var filteredTrades = krakenTrades.Where(x => (dbTrade.from_currency == tmpCoin && x.Type == "sell") || (dbTrade.from_currency == "USDC" && x.Type == "buy")).ToList();
		foreach (var krakenTrade in filteredTrades)
		{
			// Calculate the expected value based on trade type
			decimal krakenValue = 0;
			if (tmpCoin == "XBT")
			{
				krakenValue = krakenTrade.Type == "buy"
					? ((krakenTrade.Volume * krakenTrade.Price) / 100000)  // For buys, cost = volume * price
					: krakenTrade.Volume;                     // For sells, volume represents the amount sold
			}
			else
			{
				krakenValue = krakenTrade.Type == "buy"
					? (krakenTrade.Volume * krakenTrade.Price)
					: krakenTrade.Volume;
			}

			// Calculate difference percentage
			decimal difference = Math.Abs(((decimal)dbTrade.value) - krakenValue);
			decimal differencePercent = difference / (decimal)dbTrade.value * 100;
			decimal priceDifference = Math.Abs(krakenTrade.Price - Convert.ToDecimal(dbTrade.coin_price_usdc));

			bool quantityMatch = Math.Abs(krakenTrade.Volume - Convert.ToDecimal(dbTrade.value)) < 0.00000001m;

			const decimal satoshiDifference = 0.00000005m; // 5 satoshis 
			bool potentialMatch = differencePercent <= 2 || priceDifference <= satoshiDifference || quantityMatch || Math.Round(dbTrade.trade_value_usdc) == Math.Round(Convert.ToDouble(krakenTrade.Cost)) || krakenTrade.Price == Convert.ToDecimal(dbTrade.coin_price_usdc); // Within 2% difference

			// Log comparison details for debugging
 
			// _ = _log.Db($"Comparing with Kraken trade {krakenTrade.TradeId}: " +
			// 		$"Type={krakenTrade.Type}, " +
			// 		$"Value={krakenValue}, " +
			// 		$"Time={krakenTrade.Timestamp:yyyy-MM-dd HH:mm:ss}, " +
			// 		$"Diff={difference}; Potential match? : {potentialMatch}",
			// 		dbTrade.user_id, "TRADE_DEBUG", true);

			if (potentialMatch)
			{
				// Additional verification - check timestamp within reasonable window (±24 hours)
				var timeDiff = (dbTrade.timestamp - krakenTrade.Timestamp).Duration();
				if (timeDiff.TotalHours <= 24)
				{
					krakenTrade.HasDifference = difference > 0;
					return krakenTrade;
				}
			}
		}

		_ = _log.Db($"No matching {tmpCoin} Kraken trade found", dbTrade.user_id, "TRADE", true);
		return null;
	}
	  
	private async Task<bool> SaveTradeFootprint(int userId, string from, string to, string amount,
		decimal lastCoinValueCad, decimal lastCoinValueUSDC, string buyOrSell,
		decimal coinBalance, decimal usdcBalance, string strategy, int? matchingTradeId)
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
		//amount here is the amount in Coin(BTC, XRP). so if selling XBT for USDC, amount will be the BTC amount equivalent of the USDC used.
		await CreateTradeHistory(lastCoinValueCad, lastCoinValueUSDC, amount, userId, tmpFrom, tmpTo, coinBalance, usdcBalance, strategy, matchingTradeId);
		return true;
	}
	private async Task<bool> HasExceededTradeLimitInTimeWindow(int userId, string from, string to, string buyOrSell, string strategy, int maxTrades, TimeSpan timeWindow)
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
			AND strategy = @Strategy
			AND from_currency = @FromCurrency
			AND timestamp > @TimeWindowStart;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);
			checkCmd.Parameters.AddWithValue("@FromCurrency", tmpFrom);
			checkCmd.Parameters.AddWithValue("@TimeWindowStart", DateTime.UtcNow - timeWindow);  // Time window parameter

			int tradeCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

			return tradeCount < maxTrades;  // Allow the trade only if the count is below the max allowed
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error checking trade frequency: " + ex.Message, userId, "TRADE", true);
			return true; // Default action in case of error.
		}
	}
	private async Task<bool> ShouldTradeBasedOnRangeAndReserve(int userId, string from, string to, string buyOrSell, string strategy, int range, decimal balance)
	{
		bool isRepeatedTrade = await IsRepeatedTradesInRange(userId, from, to, buyOrSell, strategy, range);
		if (isRepeatedTrade)
		{
			_ = _log.Db($"Repeated too many ({strategy}) trades ({buyOrSell} {from} {to} {range})", userId, "TRADE", true);
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
		_ = _log.Db($"[reservesLow]={reservesLow} (Balance={balance}, Threshold={threshold}, Strategy={strategy})", userId, "TRADE", true);
		if (reservesLow)
		{
			_ = _log.Db($"Reserves Are Low ({balance} < {threshold})", userId, "TRADE", true);
		}

		// If the reserves are not low and not repeating too many trades, allow trade
		return !isRepeatedTrade && !reservesLow;
	}
	public async Task<List<int>> GetActiveTradeBotUsers(string type, string strategy, MySqlConnection? conn = null)
	{
		bool shouldDisposeConnection = conn == null;
		var activeUsers = new List<int>();
		string tmpType = type.ToLower();
		tmpType = tmpType == "xbt" ? "btc" : tmpType;
		if (string.IsNullOrEmpty(tmpType))
		{
			return activeUsers;
		}
		string sql = @$"
				SELECT u.id 
				FROM users u
				JOIN trade_bot_status tbs ON u.id = tbs.user_id AND tbs.is_running_{tmpType}_usdc = 1 and tbs.strategy = @Strategy
				JOIN user_kraken_api_keys ukak ON u.id = ukak.user_id
				WHERE ukak.api_key IS NOT NULL 
				AND ukak.api_key != ''
				AND ukak.private_key IS NOT NULL
				AND ukak.private_key != ''";

		try
		{
			conn ??= new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			if (conn.State != System.Data.ConnectionState.Open)
			{
				await conn.OpenAsync();
			}
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@Strategy", strategy);
			using var reader = await cmd.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				activeUsers.Add(reader.GetInt32("id"));
			}

			_ = _log.Db($"Found {activeUsers.Count} active trade bot users");
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error fetching active trade bot users: {ex.Message}");
		}
		finally
		{
			if (shouldDisposeConnection && conn != null)
			{
				await conn.DisposeAsync();
			}
		}
		return activeUsers;
	}
	public async Task<List<int>> GetActiveXRPTradeBotUsers(MySqlConnection? conn = null)
	{
		bool shouldDisposeConnection = conn == null;
		var activeUsers = new List<int>();
		const string sql = @"
				SELECT u.id 
				FROM users u
				JOIN trade_bot_status tbs ON u.id = tbs.user_id AND tbs.is_running_xrp_usdc = 1
				JOIN user_kraken_api_keys ukak ON u.id = ukak.user_id
				WHERE ukak.api_key IS NOT NULL 
				AND ukak.api_key != ''
				AND ukak.private_key IS NOT NULL
				AND ukak.private_key != ''";

		try
		{
			conn ??= new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			if (conn.State != System.Data.ConnectionState.Open)
			{
				await conn.OpenAsync();
			}
			using var cmd = new MySqlCommand(sql, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				activeUsers.Add(reader.GetInt32("id"));
			}

			_ = _log.Db($"Found {activeUsers.Count} active trade bot users");
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error fetching active trade bot users: {ex.Message}");
		}
		finally
		{
			if (shouldDisposeConnection && conn != null)
			{
				await conn.DisposeAsync();
			}
		}
		return activeUsers;
	}
	public async Task SetIndicatorTradeStopLoss(int userId, string fromCoin, string toCoin, decimal stopLossPercentage, decimal currentPrice)
	{
		const string componentName = "INDICATOR";

		// Validate inputs
		if (string.IsNullOrEmpty(fromCoin) || string.IsNullOrEmpty(toCoin))
		{
			_ = _log.Db($"Invalid input parameters: fromCoin={fromCoin}, toCoin={toCoin}", userId, componentName, true);
			return;
		}
		if (stopLossPercentage < 0)
		{
			_ = _log.Db($"Invalid stopLossPercentage: {stopLossPercentage}. Must be non-negative.", userId, componentName, true);
			return;
		}

		// Validate configuration
		if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
		{
			_ = _log.Db("Configuration or connection string is missing.", userId, componentName, true);
			return;
		} 
		
		try
		{
			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			decimal stopLossValue = currentPrice * (1 - stopLossPercentage / 100);

			const string updateSql = @"
                UPDATE trade_configuration
                SET trade_stop_loss = @StopLossValue
                WHERE user_id = @UserId
                AND from_coin = @FromCoin
                AND to_coin = @ToCoin
                AND strategy = 'IND'";

			await using var updateCmd = new MySqlCommand(updateSql, conn);
			updateCmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
			updateCmd.Parameters.Add("@FromCoin", MySqlDbType.VarChar).Value = fromCoin;
			updateCmd.Parameters.Add("@ToCoin", MySqlDbType.VarChar).Value = toCoin;
			updateCmd.Parameters.Add("@StopLossValue", MySqlDbType.Float).Value = stopLossValue;

			int rowsAffected = await updateCmd.ExecuteNonQueryAsync();
			if (rowsAffected > 0)
			{
				_ = _log.Db($"Set trade_stop_loss to {stopLossValue} for user {userId}, pair {fromCoin}/{toCoin}, strategy IND.", userId, componentName, true);
			}
			else
			{
				_ = _log.Db($"No trade configuration found to set trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND.", userId, componentName, true);
			}
		}
		catch (MySqlException ex)
		{
			_ = _log.Db($"Database error setting trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND: {ex.Message}", userId, componentName, true);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Unexpected error setting trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND: {ex.Message}", userId, componentName, true);
		}
	}
	private async Task<int?> GetActiveTradeCount(int userId, string coin, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		var checkSql = @"
			SELECT COUNT(*) 
			FROM maxhanna.trade_history
			WHERE user_id = @UserId 
			AND strategy = @Strategy
			AND from_currency = @FromCurrency
			AND matching_trade_id IS NULL;"; 
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);
			checkCmd.Parameters.AddWithValue("@FromCurrency", tmpCoin); 

			var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
 
			_ = _log.Db($"[ActiveTradeCount] ({strategy}) Count={count}", userId, "TRADE", true);
			return count;
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error at [ActiveTradeCount]: " + ex.Message, userId, "TRADE", true);
			return null;
		}
	}

	private async Task<bool> IsRepeatingTradesInDay(int userId, string from, string to, string buyOrSell, string strategy, int threshold = 3)
	{
		// Get today's date in UTC
		DateTime todayUtc = DateTime.UtcNow.Date;
		DateTime tomorrowUtc = todayUtc.AddDays(1);

		var checkSql = @"
			SELECT COUNT(*) 
			FROM maxhanna.trade_history
			WHERE user_id = @UserId 
			AND strategy = @Strategy
			AND from_currency = @FromCurrency
			AND timestamp >= @TodayStart 
			AND timestamp < @TomorrowStart;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);
			checkCmd.Parameters.AddWithValue("@FromCurrency", from);
			checkCmd.Parameters.AddWithValue("@TodayStart", todayUtc);
			checkCmd.Parameters.AddWithValue("@TomorrowStart", tomorrowUtc);

			var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

			bool result = count >= threshold;
			_ = _log.Db($"[RepeatingTradesCheck] Today's ({strategy}) {buyOrSell} {from}/{to} count={count}, Threshold={threshold}, Result={result}", userId, "TRADE", true);
			return result;
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error at [RepeatingTradesCheck]: " + ex.Message, userId, "TRADE", true);
			return true;
		}
	}

	private async Task<bool> IsRepeatedTradesInRange(int userId, string from, string to, string buyOrSell, string strategy, int range = 3)
	{
		// SELL BTC  -> USDC -> from = BTC
		// BUY  USDC -> BTC  -> from = USDC
		string expectedFrom = (buyOrSell == "buy") ? to : from;

		var checkSql = $@"
			SELECT from_currency 
			FROM maxhanna.trade_history
			WHERE user_id = @UserId 
			AND strategy = @Strategy
			ORDER BY timestamp DESC
			LIMIT @Range;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);
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
			_ = _log.Db($"[ConsecutiveCheck] Consecutive Matches={count}, Range={range}, Result={result}, Strategy={strategy}", userId, "TRADE", true);
			return result;
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error checking consecutive trades: " + ex.Message, userId, "TRADE", true);
			return true; // Fail safe: prevent trade
		}
	}

	private async Task<TradeRecord?> GetLastTradeJSONDeserialized(int userId, string coin, string strategy)
	{
		TradeRecord? lastTrade = await GetLastTrade(userId, coin, strategy);
		if (lastTrade == null)
		{
			_ = _log.Db($"No {coin} trade history. Cannot proceed.", userId, "TRADE", true);
			return null;
		}
		return lastTrade;
	}

	private async Task CreateTradeHistory(decimal currentCoinPriceInCAD, decimal currentCoinPriceInUSDC, string amount, int userId,
		string from, string to, decimal coinBalance, decimal usdcBalance, string strategy, int? matchingTradeId)
	{
		string componentName = strategy == "DCA" ? "TRADE" : "INDICATOR";

		// Validate inputs
		if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to) || string.IsNullOrEmpty(amount) || string.IsNullOrEmpty(strategy))
		{
			_ = _log.Db($"Invalid input parameters: from={from}, to={to}, amount={amount}, strategy={strategy}", userId, componentName, true);
			return;
		}

		// Validate configuration
		if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
		{
			_ = _log.Db("Configuration or connection string is missing.", userId, componentName, true);
			return;
		}

		// Round CoinValueCad to 2 decimal places if from or to is BTC or XBT
		decimal adjustedCoinPriceInCAD = (from.Equals("BTC", StringComparison.OrdinalIgnoreCase) ||
										 to.Equals("BTC", StringComparison.OrdinalIgnoreCase) ||
										 from.Equals("XBT", StringComparison.OrdinalIgnoreCase) ||
										 to.Equals("XBT", StringComparison.OrdinalIgnoreCase))
			? Math.Round(currentCoinPriceInCAD, 2, MidpointRounding.AwayFromZero)
			: currentCoinPriceInCAD;
 
		var insertSql = $@"
			INSERT INTO maxhanna.trade_history (user_id, from_currency, to_currency, value, timestamp, coin_price_cad, coin_price_usdc, coin_balance, usdc_balance, strategy{(matchingTradeId != null ? ", matching_trade_id" : "")}) 
			VALUES (@UserId, @From, @To, @Value, UTC_TIMESTAMP(), @CoinValueCad, @CoinValueUSDC, @CoinBalance, @UsdcBalance, @Strategy{(matchingTradeId != null ? ", @MatchingTradeId" : "")});
			SELECT LAST_INSERT_ID();"; 

		try
		{
			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// Insert the new trade history record and get its ID
			await using var insertCmd = new MySqlCommand(insertSql, conn);
			insertCmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
			insertCmd.Parameters.Add("@From", MySqlDbType.VarChar).Value = from;
			insertCmd.Parameters.Add("@To", MySqlDbType.VarChar).Value = to;
			insertCmd.Parameters.Add("@CoinValueCad", MySqlDbType.Decimal).Value = adjustedCoinPriceInCAD;
			insertCmd.Parameters.Add("@CoinValueUSDC", MySqlDbType.Decimal).Value = currentCoinPriceInUSDC;
			insertCmd.Parameters.Add("@Value", MySqlDbType.VarChar).Value = amount;
			insertCmd.Parameters.Add("@CoinBalance", MySqlDbType.Decimal).Value = coinBalance;
			insertCmd.Parameters.Add("@UsdcBalance", MySqlDbType.Decimal).Value = usdcBalance;
			insertCmd.Parameters.Add("@Strategy", MySqlDbType.VarChar).Value = strategy;
			if (matchingTradeId != null)
			{
				insertCmd.Parameters.Add("@MatchingTradeId", MySqlDbType.Int32).Value = matchingTradeId;
			}

			var newTradeId = await insertCmd.ExecuteScalarAsync();
			if (newTradeId != null && newTradeId != DBNull.Value)
			{
				int newId = Convert.ToInt32(newTradeId);
				_ = _log.Db($"Created trade history with ID {newId} for user {userId}, pair {from}/{to}, coin_price_cad={adjustedCoinPriceInCAD}.", userId, componentName, true);

				// If there's a matching trade ID, update the original trade's matching_trade_id
				if (matchingTradeId != null)
				{
					const string updateSql = @"
						UPDATE maxhanna.trade_history 
						SET matching_trade_id = @NewTradeId 
						WHERE id = @MatchingTradeId;";
					await using var updateCmd = new MySqlCommand(updateSql, conn);
					updateCmd.Parameters.Add("@NewTradeId", MySqlDbType.Int32).Value = newId;
					updateCmd.Parameters.Add("@MatchingTradeId", MySqlDbType.Int32).Value = matchingTradeId;
					await updateCmd.ExecuteNonQueryAsync();
					_ = _log.Db($"Updated trade ID {matchingTradeId} with matching_trade_id {newId} for user {userId}.", userId, componentName, true);
				}
			}
			else
			{
				_ = _log.Db($"Failed to retrieve new trade ID for user {userId}, pair {from}/{to}.", userId, componentName, true);
			}
		}
		catch (MySqlException ex)
		{
			_ = _log.Db($"Database error creating trade history for user {userId}, pair {from}/{to}: {ex.Message}", userId, componentName, true);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Unexpected error creating trade history for user {userId}, pair {from}/{to}: {ex.Message}", userId, componentName, true);
		}
	}
	private async Task CreateWalletEntriesFromFetchedDictionary(Dictionary<string, decimal>? balanceDictionary, int userId)
	{
		if (balanceDictionary == null)
		{
			_ = _log.Db("Balance dictionary is null. Cannot create wallet entries.", userId, "TRADE", true);
			return;
		} 

		const string ensureWalletSqlTemplate = @"
			INSERT INTO user_{0}_wallet_info (user_id, {0}_address, last_fetched)
			VALUES (@UserId, 'Kraken', UTC_TIMESTAMP())
			ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
			SELECT LAST_INSERT_ID();";

		const string checkRecentBalanceSqlTemplate = @"
			SELECT COUNT(*) FROM user_{0}_wallet_balance 
			WHERE wallet_id = @WalletId AND fetched_at > (UTC_TIMESTAMP() - INTERVAL 10 MINUTE);";

		const string insertBalanceSqlTemplate = "INSERT INTO user_{0}_wallet_balance (wallet_id, balance, fetched_at) VALUES (@WalletId, @Balance, UTC_TIMESTAMP());";
		const string updateFetchedSqlTemplate = "UPDATE user_{0}_wallet_info SET last_fetched = UTC_TIMESTAMP() WHERE id = @WalletId;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			foreach (var entry in balanceDictionary)
			{
				var coinSymbol = entry.Key;
				var balance = entry.Value;
 
				// Check if we have a mapping for this coin
				if (!CoinMappingsForDB.TryGetValue(coinSymbol, out var tableSuffix))
				{
					// Log unknown coins but continue processing others
					_ = _log.Db($"No mapping found for coin symbol: {coinSymbol}", userId, "TRADE", true);
					continue;
				}

				// Process each coin balance
				try
				{
					// Get or create wallet
					int walletId;
					var ensureWalletSql = string.Format(ensureWalletSqlTemplate, tableSuffix);

					using (var cmd = new MySqlCommand(ensureWalletSql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);
						using var reader = await cmd.ExecuteReaderAsync();
						await reader.ReadAsync();
						walletId = reader.GetInt32(0);
					}

					// Check for recent entries
					var checkRecentSql = string.Format(checkRecentBalanceSqlTemplate, tableSuffix);
					using (var checkCmd = new MySqlCommand(checkRecentSql, conn))
					{
						checkCmd.Parameters.AddWithValue("@WalletId", walletId);
						var recentCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
						if (recentCount == 0)
						{
							// Insert new balance record
							var insertSql = string.Format(insertBalanceSqlTemplate, tableSuffix);
							using var insertCmd = new MySqlCommand(insertSql, conn);
							insertCmd.Parameters.AddWithValue("@WalletId", walletId);
							insertCmd.Parameters.AddWithValue("@Balance", balance);
							await insertCmd.ExecuteNonQueryAsync();

							// Update last fetched timestamp
							var updateSql = string.Format(updateFetchedSqlTemplate, tableSuffix);
							using var updateCmd = new MySqlCommand(updateSql, conn);
							updateCmd.Parameters.AddWithValue("@WalletId", walletId);
							await updateCmd.ExecuteNonQueryAsync();
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db($"⚠️Error processing {coinSymbol} balance: {ex.Message}", userId, "TRADE", false);
					// Continue with next coin even if one fails
				}
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error creating wallet balance entries: " + ex.Message, userId, "TRADE", true);
		}
	}

	private async Task<int?> GetMinutesSinceLastTrade(int userId, string coin, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

		var checkSql = @$"
			SELECT TIMESTAMPDIFF(MINUTE, MAX(timestamp), UTC_TIMESTAMP()) 
			FROM maxhanna.trade_history 
			WHERE user_id = @UserId
			AND (from_currency = @Coin OR to_currency = @Coin)
			AND strategy = @Strategy;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Coin", tmpCoin);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);

			// Execute the query and get the difference in minutes
			var result = await checkCmd.ExecuteScalarAsync();

			// Return the result as an integer, or null if no trade history is found
			return result != DBNull.Value ? Convert.ToInt32(result) : (int?)null;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error checking {tmpCoin} trade history: " + ex.Message, userId, "TRADE", true);
			return null;
		}
	}

	private async Task<decimal?> IsSystemUpToDate(int userId, string coin, decimal coinPriceUSDC)
	{
		string tmpCoinName = coin.ToUpper();
		tmpCoinName = coin == "BTC" || coin == "XBT" ? "Bitcoin" : coin;
		var checkSql = @$"
			SELECT value_cad 
			FROM maxhanna.coin_value 
			WHERE name = '{tmpCoinName}'
			AND timestamp >= UTC_TIMESTAMP() - INTERVAL 1 MINUTE
			ORDER BY ID DESC LIMIT 1;";

		try
		{
			using (var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				// Check if there's a recent price in the database
				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					var result = await checkCmd.ExecuteScalarAsync();
					if (result != null && decimal.TryParse(result.ToString(), out var valueCad))
					{
						return valueCad; // Return recent price from database
					}
				}

				// Fetch CAD/USD exchange rate from exchange_rates table
				var exchangeRateSql = @"
					SELECT rate 
					FROM exchange_rates 
					WHERE base_currency = 'CAD' AND target_currency = 'USD' 
					ORDER BY timestamp DESC LIMIT 1;";

				decimal usdToCadRate;
				using (var rateCmd = new MySqlCommand(exchangeRateSql, conn))
				{
					var rateResult = await rateCmd.ExecuteScalarAsync();
					if (rateResult != null && decimal.TryParse(rateResult.ToString(), out var cadToUsdRate))
					{
						usdToCadRate = 1m / cadToUsdRate; // Convert CAD/USD to USD/CAD
					}
					else
					{
						_ = _log.Db("Failed to fetch CAD/USD exchange rate from database.", userId, "TRADE", true);
						return null;
					}
				}

				// Calculate BTC price in CAD
				decimal coinPriceCad = coinPriceUSDC * usdToCadRate;

				// Store the calculated price in the database
				var insertSql = @$"
                INSERT INTO maxhanna.coin_value (symbol, name, value_cad, value_usd, timestamp)
                VALUES ('{(tmpCoinName == "Bitcoin" ? "₿" : "")}', '{tmpCoinName}', @ValueCad, @ValueUsd, UTC_TIMESTAMP());";

				using (var insertCmd = new MySqlCommand(insertSql, conn))
				{
					insertCmd.Parameters.AddWithValue("@ValueCad", coinPriceCad);
					insertCmd.Parameters.AddWithValue("@ValueUsd", coinPriceUSDC);
					await insertCmd.ExecuteNonQueryAsync();
				}

				// _ = _log.Db($"Calculated and stored {coin} price: {coinPriceCad} CAD", userId, "TRADE", true);
				return coinPriceCad;
			}
		}
		catch (MySqlException ex)
		{
			_ = _log.Db("⚠️Error checking IsSystemUpToDate: " + ex.Message, userId, "TRADE", true);
			return null;
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Unexpected error in IsSystemUpToDate: " + ex.Message, userId, "TRADE", true);
			return null;
		}
	}
	public async Task<TradeRecord?> GetLastTrade(int userId, string coin, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		var checkSql = @"SELECT * FROM maxhanna.trade_history WHERE user_id = @UserId AND (from_currency = @Coin OR to_currency = @Coin) AND strategy = @Strategy ORDER BY id DESC LIMIT 1;";
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Coin", tmpCoin);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);

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
					coin_price_cad = reader.GetString(reader.GetOrdinal("coin_price_cad")),
					coin_price_usdc = reader.GetString(reader.GetOrdinal("coin_price_usdc")),
					trade_value_cad = reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
					trade_value_usdc = reader.GetFloat(reader.GetOrdinal("trade_value_usdc"))
				};

				return tradeRecord;
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error fetching last {coin} trade: " + ex.Message, null, "TRADE", true);
		}
		return null;
	}
	public async Task<List<TradeRecord>> GetTradeHistory(int userId, string coin, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

		var tradeRecords = new List<TradeRecord>();
		var checkSql = @"SELECT * FROM maxhanna.trade_history WHERE user_id = @UserId AND (from_currency = @Coin OR to_currency = @Coin) AND strategy = @Strategy ORDER BY id DESC LIMIT 100;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Coin", tmpCoin);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);

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
					coin_price_cad = reader.GetString(reader.GetOrdinal("coin_price_cad")),
					coin_price_usdc = reader.GetString(reader.GetOrdinal("coin_price_usdc")),
					trade_value_cad = reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
					trade_value_usdc = reader.GetFloat(reader.GetOrdinal("trade_value_usdc")),
					fees = reader.GetFloat(reader.GetOrdinal("fees")),
					matching_trade_id = reader.IsDBNull(reader.GetOrdinal("matching_trade_id")) ? null : reader.GetInt32(reader.GetOrdinal("matching_trade_id")),
				};

				tradeRecords.Add(tradeRecord);
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error fetching wallet balances: " + ex.Message, null, "TRADE", true);
		}

		return tradeRecords;
	}
	public async Task<bool> CheckTradeFrequencyOccurance(int userId, string buyOrSell, string strategy, int checkCount)
	{
		if (!new[] { "buy", "sell" }.Contains(buyOrSell.ToLower()))
		{
			throw new ArgumentException("buyOrSell must be 'buy' or 'sell'");
		}
		if (checkCount < 2)
		{
			throw new ArgumentException("checkCount must be at least 2");
		}

		var query = @"
			SELECT from_currency, to_currency
			FROM maxhanna.trade_history
			WHERE user_id = @UserId
			AND strategy = @Strategy
			ORDER BY timestamp DESC
			LIMIT @CheckCount;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(query, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@Strategy", strategy);
			cmd.Parameters.AddWithValue("@CheckCount", checkCount);

			using var reader = await cmd.ExecuteReaderAsync();
			var trades = new List<(string fromCurrency, string toCurrency)>();

			while (await reader.ReadAsync())
			{
				trades.Add((
					reader.GetString("from_currency"),
					reader.GetString("to_currency")
				));
			}

			// Check if we have enough trades
			if (trades.Count < checkCount)
			{
				return true; // Not enough trades, so condition is satisfied
			}

			// Determine trade directions
			var tradeDirections = trades
				.Select(t => t.toCurrency.ToUpper() == "XBT" ? "buy" :
							 t.fromCurrency.ToUpper() == "XBT" ? "sell" : "unknown")
				.ToList();

			// Check the last (X-1) trades
			var targetTrades = tradeDirections.Take(checkCount - 1);
			int matchingTrades = targetTrades.Count(t => t.Equals(buyOrSell, StringComparison.OrdinalIgnoreCase));

			// Return true if not all (X-1) trades are the same type
			return matchingTrades < (checkCount - 1);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error checking ({strategy}) trade sequence: {ex.Message}", null, "TRADE", true);
			throw; // Or handle as needed
		}
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
			_ = _log.Db("⚠️Error updating API keys: " + ex.Message, request.UserId, "TRADE", true);
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
			_ = _log.Db("⚠️Error getting API keys: " + ex.Message, userId, "TRADE", true);
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
			_ = _log.Db("⚠️Error getting API keys: " + ex.Message, userId, "TRADE", true);
			return false; // Return false in case of error
		}
	}
	public async Task<bool> StartBot(int userId, string coin)
	{
		string tmpCoin = coin.ToLower();
		tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;
		if (!System.Text.RegularExpressions.Regex.IsMatch(tmpCoin, @"^[a-z]{2,5}$")) // Only allow 2-5 lowercase letters
		{
			_ = _log.Db("⚠️ Invalid coin name.", userId, "TRADE", true);
			return false;
		}
		try
		{
			using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				var cmd = new MySqlCommand(@$"
					INSERT INTO maxhanna.trade_bot_status (user_id, is_running_{tmpCoin}_usdc, updated_{tmpCoin}_usdc)
					VALUES (@userId, 1, UTC_TIMESTAMP())
					ON DUPLICATE KEY UPDATE is_running_{tmpCoin}_usdc = 1, updated_{tmpCoin}_usdc = UTC_TIMESTAMP()", connection);

				cmd.Parameters.AddWithValue("@userId", userId);
				await cmd.ExecuteNonQueryAsync();
				_ = _log.Db("Bot started.", userId, "TRADE", true);
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error starting the bot: " + ex.Message, userId, "TRADE", true);
			return false;
		}
		return true;
	}
	public async Task<bool> StopBot(int userId, string coin)
	{
		string tmpCoin = coin.ToLower();
		tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;
		if (!System.Text.RegularExpressions.Regex.IsMatch(tmpCoin, @"^[a-z]{2,5}$")) // Only allow 2-5 lowercase letters
		{
			_ = _log.Db("⚠️ Invalid coin name.", userId, "TRADE", true);
			return false;
		}

		try
		{
			using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				var cmd = new MySqlCommand(@$"
					INSERT INTO maxhanna.trade_bot_status (user_id, is_running_{tmpCoin}_usdc, updated_{tmpCoin}_usdc)
					VALUES (@userId, 0, UTC_TIMESTAMP())
					ON DUPLICATE KEY UPDATE is_running_{tmpCoin}_usdc = 0, updated_{tmpCoin}_usdc = UTC_TIMESTAMP()", connection);

				cmd.Parameters.AddWithValue("@userId", userId);
				await cmd.ExecuteNonQueryAsync();
				_ = _log.Db("Bot stopped.", userId, "TRADE", true);
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error stopping the bot: " + ex.Message, userId, "TRADE", true);
			return false;
		}
		return true;
	}
	public async Task<DateTime?> IsTradebotStarted(int userId, string coin, string strategy)
	{
		string tmpCoin = coin.ToLower();
		tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;
		if (!System.Text.RegularExpressions.Regex.IsMatch(tmpCoin, @"^[a-z]{2,5}$")) // Only allow 2-5 lowercase letters
		{
			_ = _log.Db("⚠️ Invalid coin name.", userId, "TRADE", true);
			return null;
		}
		try
		{
			using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				var cmd = new MySqlCommand(@$"
					SELECT updated_{tmpCoin}_usdc 
					FROM maxhanna.trade_bot_status 
					WHERE user_id = @userId 
					AND strategy = @strategy 
					AND is_running_{tmpCoin}_usdc = 1;", connection);
				cmd.Parameters.AddWithValue("@userId", userId);
				cmd.Parameters.AddWithValue("@strategy", strategy);
				var result = await cmd.ExecuteScalarAsync();

				if (result == DBNull.Value || result == null)
					return null;

				return Convert.ToDateTime(result);
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error stopping the bot: " + ex.Message, userId, "TRADE", true);
			return null;
		}
	} 
	public async Task<decimal?> GetCoinPriceToUSDC(int userId, string coin, UserKrakenApiKey keys)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		try
		{
			var pair = $"{tmpCoin}USDC";
			var response = await MakeRequestAsync(userId, keys, "/Ticker", "public", new Dictionary<string, string> { ["pair"] = pair });
			if (response == null || !response.ContainsKey("result"))
			{
				_ = _log.Db($"Failed to get {coin} price in USDC: 'result' not found.", userId, "TRADE", true);
				return null;
			}
			
			var result = (JObject)response["result"];
			if (!result.ContainsKey(pair))
			{
				_ = _log.Db($"Failed to find {pair} pair in the response.", userId, "TRADE", true);
				return null;
			}

			// Extract the ask price from the 'a' key (ask prices are in the array)
			var askArray = result[pair]?["a"]?.ToObject<JArray>();
			if (askArray == null || askArray.Count < 1)
			{
				_ = _log.Db($"Failed to extract {coin} ask price from response.", userId, "TRADE", true);
				return null;
			}
			// The ask price is the first value in the array
			var askPrice = askArray[0].ToObject<decimal>();
			return askPrice;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error fetching {coin} price to USDC: {ex.Message}", userId, "TRADE", true);
			return null;
		}
	}
	public async Task<Dictionary<string, object>?> MakeRequestAsync(int userId, UserKrakenApiKey keys, string endpoint, string publicOrPrivate, Dictionary<string, string>? postData = null)
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
			var signature = CreateSignature(urlPath, postBody, nonce.ToString(), keys.PrivateKey ?? "");

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
			
			// Console.WriteLine("=== RAW KRAKEN RESPONSE ===");
			// Console.WriteLine(JsonConvert.SerializeObject(response, Formatting.Indented));
			// Console.WriteLine("==========================");

			if (!response.IsSuccessStatusCode)
			{
				_ = _log.Db("Failed to make API request: " + responseContent, userId, "TRADE", true);
			}

			Dictionary<string, object>? responseObject = JsonConvert.DeserializeObject<Dictionary<string, object>>(responseContent);

			// Check for any error messages in the response
			if (responseObject != null && responseObject.ContainsKey("error") && ((JArray)responseObject["error"]).Count > 0)
			{
				var errorMessages = responseObject["error"] is JArray errorArray
					? string.Join(", ", errorArray.ToObject<List<string>>() ?? new List<string>())
					: string.Empty;
				_ = _log.Db($"Kraken API error: {errorMessages}. Url: {urlPath}. User: {userId}", userId, "TRADE", true);
				return null;
			}
			return responseObject;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️ Kraken API request failed: {ex}", userId, "TRADE", true);
			throw;
		}
	}
	public async Task<VolumeData?> GetLatest15MinVolumeAsync(int userId, string pair, UserKrakenApiKey keys)
	{
		var postData = new Dictionary<string, string>
		{
				{ "pair", pair },
				{ "interval", "15" }
		};

		Dictionary<string, Object>? result = await MakeRequestAsync(userId, keys, "OHLC", "public", postData);
		if (result == null || !result.ContainsKey("result")) return null;

		var resultData = result["result"] as JObject;
		if (resultData == null || !resultData.Properties().Any()) return null;

		var pairKey = resultData.Properties().First(p => p.Name != "last").Name;
		var ohlcData = resultData[pairKey] as JArray;
		if (ohlcData == null || !ohlcData.Any()) return null;

		var latestCandle = ohlcData.Last as JArray;
		if (latestCandle == null || latestCandle.Count < 7) return null;

		// Index 6 = volume (in BTC)
		decimal volume = decimal.Parse(latestCandle[6].ToString(), CultureInfo.InvariantCulture);
		decimal closePrice = decimal.Parse(latestCandle[4].ToString(), CultureInfo.InvariantCulture);
		decimal volumeInUSDC = volume * closePrice;

		return new VolumeData
		{
			Volume = volume,
			VolumeUSDC = volumeInUSDC,
			ClosePrice = closePrice
		};
	}
	private string FormatBTC(decimal amount) => amount.ToString("0.00000000", CultureInfo.InvariantCulture);
	private decimal ConvertBTCToUSDC(decimal btcAmount, decimal btcPriceCAD, decimal usdToCad)
	{
		decimal btcPriceUsd = btcPriceCAD / usdToCad;
		return btcAmount * btcPriceUsd;
	}
	public async Task<DateTime?> GetTradeConfigurationLastUpdate(int userId, string? from, string? to, string? strategy)
	{
		if ((string.IsNullOrEmpty(from) && !string.IsNullOrEmpty(to)) || (!string.IsNullOrEmpty(from) && string.IsNullOrEmpty(to)))
		{
			return null;
		}

		string tmpFromCoin = (from ?? "").ToUpper();
		tmpFromCoin = tmpFromCoin == "BTC" ? "XBT" : tmpFromCoin;

		string checkSql = @"
			SELECT updated 
			FROM maxhanna.trade_configuration 
			WHERE user_id = @UserId";

		if (!string.IsNullOrEmpty(from))
			checkSql += " AND from_coin = @FromCoin";

		if (!string.IsNullOrEmpty(to))
			checkSql += " AND to_coin = @ToCoin";

		if (!string.IsNullOrEmpty(strategy))
			checkSql += " AND strategy = @Strategy";

		checkSql += " ORDER BY updated DESC LIMIT 1;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(checkSql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);

			if (!string.IsNullOrEmpty(tmpFromCoin))
				cmd.Parameters.AddWithValue("@FromCoin", tmpFromCoin);
			if (!string.IsNullOrEmpty(to))
				cmd.Parameters.AddWithValue("@ToCoin", to);
			if (!string.IsNullOrEmpty(strategy))
				cmd.Parameters.AddWithValue("@Strategy", strategy);

			using var reader = await cmd.ExecuteReaderAsync();

			if (await reader.ReadAsync())
			{
				return reader.GetDateTime("updated");
			}
		}
		catch (Exception ex)
		{
			await _log.Db("⚠️GetTradeConfigurationLastUpdate Exception: " + ex.Message, userId, "TRADE", true);
		}

		return null;
	}
	public async Task<TradeConfiguration?> GetTradeConfiguration(int userId, string fromCoin, string toCoin, string strategy)
	{
		if (string.IsNullOrEmpty(fromCoin) || string.IsNullOrEmpty(toCoin))
		{
			return null;
		}
		const string sql = @"
			SELECT *
			FROM maxhanna.trade_configuration
			WHERE user_id = @UserId AND from_coin = @FromCoin AND to_coin = @ToCoin AND strategy = @Strategy
			LIMIT 1;";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@FromCoin", fromCoin);
			cmd.Parameters.AddWithValue("@ToCoin", toCoin);
			cmd.Parameters.AddWithValue("@Strategy", strategy);

			using var reader = await cmd.ExecuteReaderAsync();
			if (await reader.ReadAsync())
			{
				return new TradeConfiguration
				{
					UserId = reader.GetInt32("user_id"),
					FromCoin = reader.GetString("from_coin"),
					Strategy = reader.GetString("strategy"),
					ToCoin = reader.GetString("to_coin"),
					Updated = reader.GetDateTime("updated"),
					MaximumFromTradeAmount = reader.GetDecimal("maximum_from_trade_amount"),
					MinimumFromTradeAmount = reader.GetDecimal("minimum_from_trade_amount"),
					TradeThreshold = reader.GetDecimal("trade_threshold"),
					MaximumTradeBalanceRatio = reader.GetDecimal("maximum_trade_balance_ratio"),
					MaximumToTradeAmount = reader.GetDecimal("maximum_to_trade_amount"),
					ValueTradePercentage = reader.GetDecimal("value_trade_percentage"),
					ValueSellPercentage = reader.GetDecimal("value_sell_percentage"),
					InitialMinimumFromAmountToStart = reader.GetDecimal("initial_minimum_from_amount_to_start"),
					InitialMinimumUSDCAmountToStart = reader.GetDecimal("initial_minimum_usdc_amount_to_start"),
					InitialMaximumUSDCAmountToStart = reader.GetDecimal("initial_maximum_usdc_amount_to_start"),
					MinimumFromReserves = reader.GetDecimal("minimum_from_reserves"),
					MinimumToReserves = reader.GetDecimal("minimum_to_reserves"),
					MaxTradeTypeOccurances = reader.GetInt32("max_trade_type_occurances"),
					VolumeSpikeMaxTradeOccurance = reader.GetInt32("volume_spike_max_trade_occurances"),
					TradeStopLoss = reader.GetDecimal("trade_stop_loss"),
				};
			}
		}
		catch (Exception ex)
		{
			await _log.Db("⚠️GetTradeConfiguration Exception: " + ex.Message, userId, "TRADE", true);
		}
		await _log.Db($"⚠️GetTradeConfiguration No trade configuration for : {fromCoin}/{toCoin}:{strategy}", userId, "TRADE", true);
		return null;
	}
	public async Task<bool> UpsertTradeConfiguration(int userId, string fromCoin,
		string toCoin, string strategy, decimal maxFromAmount, decimal minFromAmount, decimal threshold,
		decimal maxBalanceRatio, decimal maxToAmount, decimal valuePercentage, decimal valueSellPercentage,
		decimal initialMinFromToStart, decimal initialMinUSDCToStart, decimal initialMaxUSDCToStart,
		decimal minFromReserves, decimal minToReserves,
		int maxtradeTypeOccurances, int volumeSpikeMaxTradeOccurance, decimal tradeStopLoss)
	{
		try
		{
			using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await connection.OpenAsync();

			var cmd = new MySqlCommand(@"
			INSERT INTO maxhanna.trade_configuration (
				user_id, 
				from_coin, 
				to_coin, 
				strategy, 
				updated, 
				maximum_from_trade_amount, 
				minimum_from_trade_amount, 
				trade_threshold, 
				maximum_trade_balance_ratio, 
				maximum_to_trade_amount, 
				value_trade_percentage,  
				value_sell_percentage,  
				initial_minimum_from_amount_to_start, 
				initial_minimum_usdc_amount_to_start, 
				initial_maximum_usdc_amount_to_start, 
				minimum_from_reserves, 
				minimum_to_reserves,
				max_trade_type_occurances,
				volume_spike_max_trade_occurances,
				trade_stop_loss
			)
			VALUES (
				@userId, @fromCoin, @toCoin, @strategy, UTC_TIMESTAMP(),
				@maxFromAmount, @minFromAmount,
				@threshold, @maxBalanceRatio,
				@maxToAmount, @valuePercentage, @valueSellPercentage, @initialMinFromToStart, 
				@initialMinUSDCToStart, @initialMaxUSDCToStart, 
				@minFromReserves, @minToReserves, @maxTradeTypeOccurances, 
				@volumeSpikeMaxTradeOccurance, @tradeStopLoss
			)
			ON DUPLICATE KEY UPDATE 
				updated = UTC_TIMESTAMP(),
				maximum_from_trade_amount = @maxFromAmount,
				minimum_from_trade_amount = @minFromAmount,
				trade_threshold = @threshold,
				maximum_trade_balance_ratio = @maxBalanceRatio,
				maximum_to_trade_amount = @maxToAmount,
				value_trade_percentage = @valuePercentage, 
				value_sell_percentage = @valueSellPercentage, 
				initial_minimum_from_amount_to_start = @initialMinFromToStart,
				initial_minimum_usdc_amount_to_start = @initialMinUSDCToStart,
				initial_maximum_usdc_amount_to_start = @initialMaxUSDCToStart,
				minimum_from_reserves = @minFromReserves,
				minimum_to_reserves = @minToReserves,
				max_trade_type_occurances = @maxTradeTypeOccurances,
				volume_spike_max_trade_occurances = @volumeSpikeMaxTradeOccurance,
				trade_stop_loss = @tradeStopLoss;
				", connection);

			cmd.Parameters.AddWithValue("@userId", userId);
			cmd.Parameters.AddWithValue("@fromCoin", fromCoin);
			cmd.Parameters.AddWithValue("@toCoin", toCoin);
			cmd.Parameters.AddWithValue("@strategy", strategy);
			cmd.Parameters.AddWithValue("@maxFromAmount", maxFromAmount);
			cmd.Parameters.AddWithValue("@minFromAmount", minFromAmount);
			cmd.Parameters.AddWithValue("@threshold", threshold);
			cmd.Parameters.AddWithValue("@maxBalanceRatio", maxBalanceRatio);
			cmd.Parameters.AddWithValue("@maxToAmount", maxToAmount);
			cmd.Parameters.AddWithValue("@valuePercentage", valuePercentage);
			cmd.Parameters.AddWithValue("@valueSellPercentage", valueSellPercentage);
			cmd.Parameters.AddWithValue("@initialMinFromToStart", initialMinFromToStart);
			cmd.Parameters.AddWithValue("@initialMinUSDCToStart", initialMinUSDCToStart);
			cmd.Parameters.AddWithValue("@initialMaxUSDCToStart", initialMaxUSDCToStart);
			cmd.Parameters.AddWithValue("@minFromReserves", minFromReserves);
			cmd.Parameters.AddWithValue("@minToReserves", minToReserves);
			cmd.Parameters.AddWithValue("@maxTradeTypeOccurances", maxtradeTypeOccurances);
			cmd.Parameters.AddWithValue("@volumeSpikeMaxTradeOccurance", volumeSpikeMaxTradeOccurance);
			cmd.Parameters.AddWithValue("@tradeStopLoss", tradeStopLoss);

			await cmd.ExecuteNonQueryAsync();
			return true;
		}
		catch (Exception ex)
		{
			await _log.Db("⚠️Error upserting trade configuration: " + ex.Message, userId, "TRADE", true);
			return false;
		}
	}
	private static bool ApplyTradeConfiguration(TradeConfiguration? tc)
	{
		if (tc == null)
			return false;

		_MaximumBTCTradeAmount = tc.MaximumFromTradeAmount ?? _MaximumBTCTradeAmount;
		_MinimumBTCTradeAmount = tc.MinimumFromTradeAmount ?? _MinimumBTCTradeAmount;
		_MaximumUSDCTradeAmount = tc.MaximumToTradeAmount ?? _MaximumUSDCTradeAmount;
		_TradeThreshold = tc.TradeThreshold ?? _TradeThreshold;
		_MaximumTradeBalanceRatio = tc.MaximumTradeBalanceRatio ?? _MaximumTradeBalanceRatio;
		_ValueTradePercentage = tc.ValueTradePercentage ?? _ValueTradePercentage;
		_ValueSellPercentage = tc.ValueSellPercentage ?? _ValueSellPercentage;
		_InitialMinimumBTCAmountToStart = tc.InitialMinimumFromAmountToStart ?? _InitialMinimumBTCAmountToStart;
		_InitialMinimumUSDCAmountToStart = tc.InitialMinimumUSDCAmountToStart ?? _InitialMinimumUSDCAmountToStart;
		_InitialMaximumUSDCAmountToStart = tc.InitialMaximumUSDCAmountToStart ?? _InitialMaximumUSDCAmountToStart;
		_MinimumBTCReserves = tc.MinimumFromReserves ?? _MinimumBTCReserves;
		_MinimumUSDCReserves = tc.MinimumToReserves ?? _MinimumUSDCReserves;
		_MaxTradeTypeOccurances = tc.MaxTradeTypeOccurances ?? _MaxTradeTypeOccurances;
		_VolumeSpikeMaxTradeOccurance = tc.VolumeSpikeMaxTradeOccurance ?? _VolumeSpikeMaxTradeOccurance;
		_TradeStopLoss = tc.TradeStopLoss ?? _TradeStopLoss;

		return true;
	}

	public async Task<decimal?> GetFirstCoinPriceTodayIfNoRecentTrades(string coin, int userId, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

		string tmpCoinName = coin.ToUpper();
		tmpCoinName = coin == "BTC" ? "Bitcoin" : coin == "XBT" ? "Bitcoin" : coin;
		try
		{
			using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await connection.OpenAsync();

			// 1. First check if user has recent trades
			var checkTradesQuery = @"
				SELECT COUNT(*) 
				FROM maxhanna.trade_history 
				WHERE user_id = @UserId
				AND strategy = @Strategy
				AND (from_currency = @Coin OR to_currency = @Coin) 
				AND timestamp >= UTC_TIMESTAMP() - INTERVAL 24 HOUR;";

			using var checkCmd = new MySqlCommand(checkTradesQuery, connection);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@Coin", tmpCoin);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);

			var tradeCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

			// 2. If no recent trades, get first BTC price today
			if (tradeCount == 0)
			{
				var priceQuery = $@"
                SELECT value_usd 
                FROM maxhanna.coin_value 
                WHERE name = '{tmpCoinName}'
                AND DATE(timestamp) = CURDATE()
                ORDER BY timestamp ASC 
                LIMIT 1;";

				using var priceCmd = new MySqlCommand(priceQuery, connection);
				var result = await priceCmd.ExecuteScalarAsync();

				if (result != null && result != DBNull.Value)
				{
					return Convert.ToDecimal(result);
				}
			}

			return null;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error checking first {tmpCoinName}({strategy}) price with trade condition: {ex.Message}", userId, "TRADE", true);
			return null;
		}
	}

	public async Task<bool> IsInPremiumWindow(string coin)
	{
		var prices = await GetLatestCoinPricesByMinuteAsync(coin, minutes: 240);
		if (prices.Count < 10) return false;

		var peaks = FindPeaks(prices);

		foreach (var peak in peaks)
		{
			if (IsNearPrice(prices.Last().Price, peak.Price, 0.02m) &&
					IsAfterPeakTime(prices.Last().Timestamp, peak.Timestamp, 30, 90))
			{
				// Only make async call if other conditions are met
				_ = _log.Db("Inside After_Peak condition", outputToConsole: true);
				if (await IsVolumeDecliningSince(coin, peak.Timestamp))
				{
					return true;
				}
			}
		}

		return false;
	}
	private List<PriceData> FindPeaks(List<PriceData> prices)
	{
		var peaks = new List<PriceData>();

		// Need at least 3 points to identify a peak
		if (prices.Count < 3) return peaks;

		for (int i = 1; i < prices.Count - 1; i++)
		{
			// A peak is when the current price is higher than both neighbors
			if (prices[i].Price > prices[i - 1].Price && prices[i].Price > prices[i + 1].Price)
			{
				peaks.Add(new PriceData
				{
					Price = prices[i].Price,
					Timestamp = prices[i].Timestamp
				});
			}
		}

		return peaks;
	}
	private async Task<bool> AddMomentumEntry(int userId, string from, string to, string strategy, decimal coinPriceUsdc, int? matchingTradeId)
	{
		var checkSql = @$"
			INSERT INTO maxhanna.trade_momentum_accumulation (user_id, from_currency, to_currency, timestamp, strategy, coin_price_usdc, best_coin_price_usdc{(matchingTradeId != null ? ", matching_trade_id" : "")}) 
			VALUES (@UserId, @From, @To, UTC_TIMESTAMP(), @Strategy, @BtcValueUSDC, @BtcValueUSDC{(matchingTradeId != null ? ", " + matchingTradeId : "")});";
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var checkCmd = new MySqlCommand(checkSql, conn);
			checkCmd.Parameters.AddWithValue("@UserId", userId);
			checkCmd.Parameters.AddWithValue("@From", from);
			checkCmd.Parameters.AddWithValue("@To", to);
			checkCmd.Parameters.AddWithValue("@Strategy", strategy);
			checkCmd.Parameters.AddWithValue("@BtcValueUSDC", coinPriceUsdc);
			await checkCmd.ExecuteNonQueryAsync();
			_ = _log.Db($"({strategy})Momentum entry created: {from}/{to} price : {coinPriceUsdc}.", userId, "TRADE", true);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error creating ({strategy}) momentum entry: " + ex.Message, userId, "TRADE", true);
			return false;
		}
		return true;
	}
	private async Task<bool> DeleteMomentumStrategy(int userId, string from, string to, string strategy, MySqlConnection? conn = null)
	{
		bool shouldDisposeConnection = conn == null;
		bool isDeleted = false;
		const string sql = @"
			DELETE FROM maxhanna.trade_momentum_accumulation 
			WHERE user_id = @UserId 
			AND from_currency = @From 
			AND to_currency = @To
			AND strategy = @Strategy 
			LIMIT 1;";

		try
		{
			conn ??= new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			if (conn.State != System.Data.ConnectionState.Open)
			{
				await conn.OpenAsync();
			}

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@From", from);
			cmd.Parameters.AddWithValue("@To", to);
			cmd.Parameters.AddWithValue("@Strategy", strategy);

			int rowsAffected = await cmd.ExecuteNonQueryAsync();
			isDeleted = rowsAffected > 0;

			if (isDeleted)
			{
				_ = _log.Db($"Deleted momentum strategy for user {userId}({strategy}); From {from}, To {to}.", userId, "TRADE", true);
			}
			else
			{
				_ = _log.Db($"No momentum strategy found to delete for user {userId}({strategy}); From {from}, To {to}.", userId, "TRADE", true);
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error deleting momentum strategy for user {userId}({strategy}); From {from}, To {to}: {ex.Message}", userId, "TRADE", true);
			isDeleted = false;
		}
		finally
		{
			if (shouldDisposeConnection && conn != null)
			{
				await conn.DisposeAsync();
			}
		}

		return isDeleted;
	}
	private async Task<bool> UpdateMomentumEntry(int userId, string coin, string from, string to, decimal coinPriceUsdc, string strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		// Determine if we're buying or selling BTC
		bool isSellingCoin = from.Equals(tmpCoin, StringComparison.OrdinalIgnoreCase) && to.Equals("USDC", StringComparison.OrdinalIgnoreCase);
		bool isBuyingCoin = from.Equals("USDC", StringComparison.OrdinalIgnoreCase) && to.Equals(tmpCoin, StringComparison.OrdinalIgnoreCase);

		var sql = @"
			INSERT INTO maxhanna.trade_momentum_accumulation 
				(user_id, from_currency, to_currency, timestamp, coin_price_usdc, best_coin_price_usdc, strategy)
			VALUES 
				(@UserId, @From, @To, UTC_TIMESTAMP(), @CoinPriceUSDC, @CoinPriceUSDC, @Strategy)
			ON DUPLICATE KEY UPDATE
				timestamp = UTC_TIMESTAMP(),
				coin_price_usdc = @CoinPriceUSDC,
				best_coin_price_usdc = CASE 
					WHEN @IsSellingBtc THEN GREATEST(best_coin_price_usdc, @CoinPriceUSDC)
					WHEN @IsBuyingBtc THEN LEAST(COALESCE(best_coin_price_usdc, @CoinPriceUSDC), @CoinPriceUSDC)
					ELSE best_coin_price_usdc
				END";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@From", from.ToLower());
			cmd.Parameters.AddWithValue("@To", to.ToLower());
			cmd.Parameters.AddWithValue("@CoinPriceUSDC", coinPriceUsdc);
			cmd.Parameters.AddWithValue("@IsSellingBtc", isSellingCoin);
			cmd.Parameters.AddWithValue("@IsBuyingBtc", isBuyingCoin);
			cmd.Parameters.AddWithValue("@Strategy", strategy);

			await cmd.ExecuteNonQueryAsync();
			return true;
		}
		catch (Exception ex)
		{
			_ = _log.Db("⚠️Error updating momentum entry: " + ex.Message, userId, "TRADE", true);
			return false;
		}
	}
	private async Task<MomentumStrategy?> GetMomentumStrategy(int userId, string from, string to, string strategy, MySqlConnection? conn = null)
	{
		bool shouldDisposeConnection = conn == null;
		MomentumStrategy? momentumStrategy = null;
		const string sql = @"
			SELECT * FROM maxhanna.trade_momentum_accumulation 
			WHERE user_id = @UserId 
			AND from_currency = @From 
			AND to_currency = @To 
			AND strategy = @Strategy
			LIMIT 1;";
		try
		{
			conn ??= new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			if (conn.State != System.Data.ConnectionState.Open)
			{
				await conn.OpenAsync();
			}
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@From", from);
			cmd.Parameters.AddWithValue("@To", to);
			cmd.Parameters.AddWithValue("@Strategy", strategy);
			using var reader = await cmd.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				momentumStrategy = new MomentumStrategy
				{
					UserId = reader.GetInt32("user_id"),
					FromCurrency = reader.GetString("from_currency"),
					ToCurrency = reader.GetString("to_currency"),
					Strategy = reader.GetString("strategy"),
					Timestamp = reader.GetDateTime("timestamp"),
					CoinPriceUsdc = reader.GetDecimal("coin_price_usdc"),
					BestCoinPriceUsdc = reader.GetDecimal("best_coin_price_usdc"),
					MatchingTradeId = reader.IsDBNull(reader.GetOrdinal("matching_trade_id")) ? null : reader.GetInt32("matching_trade_id")
				};
			}
			// if (momentumStrategy != null)
			// {
			// 	_ = _log.Db($"Found an active momentum strategy for user {userId}({strategy}); From {from}, To {to}.", userId, "TRADE", true);
			// }
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error fetching active momentum strategy for user {userId}({strategy}); From {from}, To {to}.: {ex.Message}");
		}
		finally
		{
			if (shouldDisposeConnection && conn != null)
			{
				await conn.DisposeAsync();
			}
		}
		return momentumStrategy;
	}
	private async Task<int?> FindMatchingBuyOrder(int userId, string coinSymbol, string strategy, decimal sellPrice, MySqlConnection? conn = null)
	{
		bool shouldDisposeConnection = conn == null;
		int? matchingBuyId = null;

		// Calculate maximum buy price for 0.84% profit
		decimal maxBuyPrice = sellPrice / (1m + _TradeThreshold); // Ensures at least 0.84% profit

		const string sql = @"
			SELECT id 
			FROM trade_history 
			WHERE user_id = @UserId 
			AND strategy = @Strategy 
			AND to_currency = @CoinSymbol 
			AND from_currency = 'USDC'
			AND matching_trade_id IS NULL
			AND timestamp < UTC_TIMESTAMP()
			AND CAST(coin_price_usdc AS DECIMAL(20,10)) <= @MaxBuyPrice 
			ORDER BY CAST(coin_price_usdc AS DECIMAL(20,10)) DESC
			LIMIT 1;";

		try
		{
			conn ??= new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			if (conn.State != System.Data.ConnectionState.Open)
			{
				await conn.OpenAsync();
			}

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@Strategy", strategy);
			cmd.Parameters.AddWithValue("@CoinSymbol", coinSymbol);
			cmd.Parameters.AddWithValue("@MaxBuyPrice", maxBuyPrice);

			var result = await cmd.ExecuteScalarAsync();
			if (result != null && result != DBNull.Value)
			{
				matchingBuyId = Convert.ToInt32(result);
				_ = _log.Db($"Found matching buy order {matchingBuyId} for user {userId} selling {coinSymbol} at {sellPrice} (buy price <= {maxBuyPrice}).", userId, "TRADE", true);
			}
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error finding matching buy order for user {userId} selling {coinSymbol}: {ex.Message}", userId, "TRADE", true);
		}
		finally
		{
			if (shouldDisposeConnection && conn != null)
			{
				await conn.DisposeAsync();
			}
		}

		return matchingBuyId;
	}
	private bool IsNearPrice(decimal currentPrice, decimal peakPrice, decimal thresholdPercent)
	{
		decimal difference = Math.Abs(peakPrice - currentPrice);
		decimal percentageDifference = difference / peakPrice;
		return percentageDifference <= thresholdPercent;
	}
	private bool IsAfterPeakTime(DateTime currentTime, DateTime peakTime, int minMinutes, int maxMinutes)
	{
		TimeSpan timeSincePeak = currentTime - peakTime;
		return timeSincePeak.TotalMinutes >= minMinutes &&
					 timeSincePeak.TotalMinutes <= maxMinutes;
	}
	private async Task<bool> IsVolumeDecliningSince(string coin, DateTime sinceTime)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		// Get volume data since the peak
		var volumes = await GetCoinUSDCTradeMarketVolumesSinceAsync(tmpCoin, sinceTime);

		if (volumes.Count < 3) return false; // Need at least 3 data points

		// Split into thirds to analyze trend
		int segmentSize = volumes.Count / 3;
		if (segmentSize < 1) return false;

		var firstSegment = volumes.Take(segmentSize).Average(v => v.VolumeUSDC);
		var middleSegment = volumes.Skip(segmentSize).Take(segmentSize).Average(v => v.VolumeUSDC);
		var lastSegment = volumes.Skip(2 * segmentSize).Average(v => v.VolumeUSDC);

		// Volume is declining if each segment is lower than previous
		return middleSegment < firstSegment && lastSegment < middleSegment;
	}
	public async Task<List<VolumeData>> GetCoinUSDCTradeMarketVolumesSinceAsync(string coin, DateTime sinceTime)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
		await connection.OpenAsync();

		var query = @"
			SELECT volume_coin, volume_usdc, timestamp
			FROM trade_market_volumes
			WHERE pair = @pair
			AND timestamp >= @sinceTime
			ORDER BY timestamp ASC";  // Oldest first for proper trend analysis

		using var command = new MySqlCommand(query, connection);
		command.Parameters.AddWithValue("@pair", $"{tmpCoin}USDC");
		command.Parameters.AddWithValue("@sinceTime", sinceTime);

		var volumes = new List<VolumeData>();
		using var reader = await command.ExecuteReaderAsync();
		while (await reader.ReadAsync())
		{
			volumes.Add(new VolumeData
			{
				Volume = reader.GetDecimal("volume_coin"),
				VolumeUSDC = reader.GetDecimal("volume_usdc"),
				Timestamp = reader.GetDateTime("timestamp")
			});
		}

		return volumes;
	}
	public async Task<bool> IsSignificantVolumeSpike(string coin, string fromCurrency, string toCurrency, int userId, decimal spikeThresholdPercent = 0.5m)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

			var sinceTime = DateTime.UtcNow.AddHours(-1);
		var volumes = await GetCoinUSDCTradeMarketVolumesSinceAsync(tmpCoin, sinceTime);

		if (volumes == null || volumes.Count == 0)
		{
			_ = _log.Db("No volume data available for spike detection.", null, "TRADE", true);
			return false;
		}

		// Calculate average volume
		var averageVolume = volumes.Average(v => v.VolumeUSDC);

		// Get the latest volume (most recent timestamp)
		var latestVolume = volumes.Last().VolumeUSDC;

		// Calculate the percentage increase over the average
		var volumeIncreasePercent = (latestVolume - averageVolume) / averageVolume;

		// Check if the latest volume is significantly above average
		bool isSpike = volumeIncreasePercent >= spikeThresholdPercent;

		_ = _log.Db($@"[Volume Spike Check]
        Time Range: Last 1 hour (since {sinceTime:u})
        Pair: {fromCurrency}/{toCurrency}
        Volume Points: {volumes.Count}
        Average Volume: {averageVolume:N2} USDC
        Latest Volume: {latestVolume:N2} USDC
        Volume Increase: {volumeIncreasePercent:P2}
        Spike Threshold: {spikeThresholdPercent:P2}
        Significant Spike Detected: {isSpike}", userId, "TRADE", true);
		return isSpike;
	}
	public async Task<List<PriceData>> GetLatestCoinPricesByMinuteAsync(string coin, int? minutes = null)
	{
		string tmpCoinName = coin.ToUpper();
		tmpCoinName = coin == "BTC" ? "Bitcoin" : coin == "XBT" ? "Bitcoin" : coin;

		using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
		await connection.OpenAsync();

		var query = $"SELECT value_cad as price, timestamp FROM maxhanna.coin_value WHERE name = '{tmpCoinName}' ";
		if (minutes.HasValue)
		{
			query += " AND timestamp >= UTC_TIMESTAMP() - INTERVAL @minutes MINUTE";
		}
		query += " ORDER BY timestamp DESC";

		using var command = new MySqlCommand(query, connection);
		if (minutes.HasValue)
		{
			command.Parameters.AddWithValue("@minutes", minutes.Value);
		}

		var prices = new List<PriceData>();
		using var reader = await command.ExecuteReaderAsync();
		while (await reader.ReadAsync())
		{
			prices.Add(new PriceData
			{
				Price = reader.GetDecimal("price"),
				Timestamp = reader.GetDateTime("timestamp")
			});
		}
		return prices;
	}
	public async Task<List<VolumeData>> GetTradeMarketVolumesAsync(string fromCurrency, string toCurrency, int? days = null, int? minutes = null)
	{
		if (days.HasValue && minutes.HasValue)
		{
			throw new ArgumentException("Cannot specify both days and minutes parameters");
		}

		var volumes = new List<VolumeData>();

		using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
		await connection.OpenAsync();

		var query = @"
			SELECT pair, volume_coin, volume_usdc, timestamp
			FROM trade_market_volumes
			WHERE 1=1";

		using var command = new MySqlCommand(query, connection);

		if (days.HasValue)
		{
			query += " AND timestamp >= UTC_TIMESTAMP() - INTERVAL @days DAY";
			command.Parameters.AddWithValue("@days", days.Value);
		}
		else if (minutes.HasValue)
		{
			query += " AND timestamp >= UTC_TIMESTAMP() - INTERVAL @minutes MINUTE";
			command.Parameters.AddWithValue("@minutes", minutes.Value);
		}
		query += $" AND pair = '{fromCurrency}{toCurrency}'";

		command.CommandText = query; // Update command with final query

		using var reader = await command.ExecuteReaderAsync();

		while (await reader.ReadAsync())
		{
			volumes.Add(new VolumeData
			{
				Volume = reader.GetDecimal("volume_coin"),
				VolumeUSDC = reader.GetDecimal("volume_usdc"),
				Timestamp = reader.GetDateTime("timestamp")
			});
		}

		return volumes;
	}

	/// <summary>
	/// Gets trade market volumes for a specific currency pair for graphing purposes.
	/// </summary>
	/// <param name="fromCurrency">The base currency (e.g., "BTC").</param>
	/// <param name="toCurrency">The quote currency (e.g., "USDC").</param>
	/// <param name="request">The request containing the date range and hour range.</param>
	/// <returns>A list of volume data for the specified currency pair.</returns>
	/// <remarks>
	/// This method retrieves trade market volumes for a specific currency pair
	/// within a specified date range and hour range.
	/// The date range is determined by the 'From' property in the request,
	/// and the hour range is specified in the 'HourRange' property.
	/// If the 'From' property is null, it defaults to the current date and time.
	/// If the 'HourRange' property is null, it defaults to 24 hours.
	/// The method returns a list of VolumeData objects containing the volume in the base currency,
	/// the volume in USDC, and the timestamp of each volume entry.
	/// </remarks>
	/// <exception cref="MySqlException">Thrown if there is an error executing the SQL query.</exception>
	/// <exception cref="Exception">Thrown if there is an error during the database operation.</exception> 
	/// <exception cref="ArgumentException">Thrown if the request is invalid.</exception>
	public async Task<List<VolumeData>> GetTradeMarketVolumesForGraphAsync(string fromCurrency, string toCurrency, GraphRangeRequest request)
	{

		List<VolumeData> volumes = new List<VolumeData>();

		try
		{
			if (request.From == null) { request.From = new DateTime(); }
			var actualFrom = request.From.Value.AddHours(-1 * (request.HourRange ?? 24));
			var actualTo = request.From.Value.AddHours(request.HourRange ?? 24);
			using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await connection.OpenAsync();

			var query = @$"
				SELECT pair, volume_coin, volume_usdc, timestamp
				FROM trade_market_volumes
				WHERE pair = @Pair
				{(request.HourRange != 0 ? " AND timestamp >= @From AND timestamp <= @To " : "")} 
				ORDER BY timestamp ASC;";

			using var cmd = new MySqlCommand(query, connection);
			cmd.Parameters.AddWithValue("@From", actualFrom);
			cmd.Parameters.AddWithValue("@To", actualTo);
			cmd.Parameters.AddWithValue("@Pair", fromCurrency + toCurrency);
			using var reader = await cmd.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				volumes.Add(new VolumeData
				{
					Volume = reader.GetDecimal("volume_coin"),
					VolumeUSDC = reader.GetDecimal("volume_usdc"),
					Timestamp = reader.GetDateTime("timestamp")
				});
			}
		}
		catch (Exception e)
		{
			_ = _log.Db("⚠️KrakenService exception GetTradeMarketVolumesForGraphAsync: " + e.Message, outputToConsole: true);
		}
		return volumes;
	}

	/// <summary>
	/// Exits the user's position for the specified coin.
	/// </summary>
	public async Task<bool> ExitPosition(int userId, string coin, UserKrakenApiKey? krakenKeys, string? strategy)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		try
		{
			if (userId == 0) return false;
			//GET USER API KEYS
			UserKrakenApiKey? keys = krakenKeys ?? await GetApiKey(userId);
			if (keys == null) return false;
			//GET TOTAL BTC BALANCE
			var balances = await GetBalance(userId, tmpCoin, keys);
			if (balances == null)
			{
				_ = _log.Db("Failed to get wallet balances", userId, "TRADE");
				return false;
			}
			decimal? coinBalance;
			if (strategy == "IND")
			{
				coinBalance = await GetLastUnmatchedIndicatorTradeValue(userId, tmpCoin, "USDC");
			}
			else
			{
				coinBalance = balances.ContainsKey($"X{tmpCoin}") ? balances[$"X{tmpCoin}"] : 0;
			}
			if (coinBalance == null || !coinBalance.HasValue || coinBalance == 0)
			{ 
				_ = _log.Db($"No {tmpCoin} balance found. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
			decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;
			decimal? coinPriceUSDC = await GetCoinPriceToUSDC(userId, coin, keys);
			if (coinPriceUSDC == null)
			{
				_ = _log.Db("No USDC price found. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}

			decimal? coinPriceCAD = await IsSystemUpToDate(userId, coin, coinPriceUSDC.Value);
			if (coinPriceCAD == null)
			{
				_ = _log.Db("No CAD price found. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}

			_ = _log.Db($"Exiting position. BTC Balance: {coinBalance}", userId, "TRADE", true);
			await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinBalance.Value), "sell", coinBalance.Value, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value, strategy ?? "XXX", null);
			if (strategy == "DCA")
			{ 
				await StopBot(userId, tmpCoin);
			}
			if (strategy == "IND")
			{
				await ClearIndicatorTradeStopLoss(userId, tmpCoin, "USDC");
			}
			return true;
		}
		catch (Exception e)
		{
			_ = _log.Db("⚠️KrakenService exception ExitPosition: " + e.Message, outputToConsole: true);
			return false;
		}
	}

	/// <summary>
	/// Enters a position for the specified coin using the user's trade configuration. 
	/// This method checks the user's balance, trade configuration, and current coin prices before executing the trade.
	/// If the user does not have enough USDC to trade, the method will log an error and return false.
	/// </summary>
	/// <param name="userId">The ID of the user entering the position.</param>
	/// <param name="coin">The coin to enter a position for (e.g., "BTC", "ETH").</param>
	/// <returns>Returns true if the position was successfully entered, otherwise false.</returns>
	public async Task<bool> EnterPosition(int userId, string coin)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		try
		{
			if (userId == 0) return false;
			//GET USER API KEYS, Trade Configuration
			UserKrakenApiKey? keys = await GetApiKey(userId);
			if (keys == null) return false;

			TradeConfiguration? tc = await GetTradeConfiguration(userId, tmpCoin, "USDC", "DCA");
			if (!ValidateTradeConfiguration(tc, userId))
			{
				_ = _log.Db($"Invalid {tmpCoin} configuration. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
			if (!ApplyTradeConfiguration(tc) || tc == null)
			{
				_ = _log.Db($"Null {tmpCoin} trade configuration. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}

			// 1. If user does not have _InitialMinimumFromAmountToStart, cancel entering position.  
			var balances = await GetBalance(userId, tmpCoin, keys);
			if (balances == null)
			{
				_ = _log.Db($"Failed to get {tmpCoin} wallet balances", userId, "TRADE");
				return false;
			}
			decimal coinBalance = balances.ContainsKey($"X{tmpCoin}") ? balances[$"X{tmpCoin}"] : 0;
			decimal usdcBalance = balances.ContainsKey("USDC") ? balances["USDC"] : 0;
			decimal? coinPriceUSDC = await GetCoinPriceToUSDC(userId, tmpCoin, keys); 
			if (coinPriceUSDC == null)
			{
				_ = _log.Db("No USDC price found. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}

			decimal? coinPriceCAD = await IsSystemUpToDate(userId, tmpCoin, coinPriceUSDC.Value);
			if (coinPriceCAD == null)
			{
				_ = _log.Db("No CAD price found. Trade Cancelled.", userId, "TRADE", true);
				return false;
			}
			//Trade configured percentage % of USDC balance TO BTC 
			decimal usdcValueToTrade = Math.Min(usdcBalance * _ValueTradePercentage, _MaximumUSDCTradeAmount);
			if (usdcValueToTrade > 0)
			{ 
				decimal btcAmount = usdcValueToTrade / coinPriceUSDC.Value;

				_ = _log.Db($"Entering Position - Buying {tmpCoin} with {FormatBTC(btcAmount)} {tmpCoin} worth of USDC(${usdcValueToTrade})", userId, "TRADE", true);
				await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(btcAmount), "buy", coinBalance, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value, "XXX", null);

				return true;
			}
			else
			{
				_ = _log.Db($"Not enough USDC to trade! {usdcValueToTrade}. Trade Cancelled.", userId, "TRADE", true);
			}

			return false;
		}
		catch (Exception e)
		{
			_ = _log.Db($"⚠️KrakenService exception EnterPosition {tmpCoin}: " + e.Message, outputToConsole: true);
			return false;
		}
	}

	public async Task<List<PositionData>?> GetOpenOrders(int userId, string coin, UserKrakenApiKey? krakenKeys)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		try
		{
			if (userId == 0) return null;
			UserKrakenApiKey? keys = krakenKeys ?? await GetApiKey(userId);
			if (keys == null) return null;

			var positions = new List<PositionData>();

			var response = await MakeRequestAsync(userId, keys, "OpenOrders", "private");

			if (response == null)
			{
				_ = _log.Db("⚠️KrakenService: No response from OpenOrders API", userId, "TRADE", true);
				return null;
			}
			_ = _log.Db($"KrakenService: Open Orders API response: {JsonConvert.SerializeObject(response, Formatting.Indented)}", userId, "TRADE", true);
			
			if (response.ContainsKey("error") && ((JArray)response["error"]).Count > 0)
			{
				var errorMessages = response["error"] is JArray errorArray
					? string.Join(", ", errorArray.ToObject<List<string>>() ?? new List<string>())
					: "Unknown error";
				_ = _log.Db($"⚠️KrakenService: Open Orders API error: {errorMessages}", userId, "TRADE", true);
				return null;
			}

			if (response.ContainsKey("result") && response["result"] is JObject result && result["openOrders"] is JObject openOrders)
			{
				foreach (var position in openOrders)
				{
					string? symbol = position.Value != null && position.Value["symbol"] != null ? position.Value["symbol"]?.ToString() : "";
					if (symbol != null && symbol.Contains(tmpCoin) && position.Value != null)
					{
						var positionData = new PositionData
						{
							Symbol = symbol,
							Side = position.Value["side"]?.ToString(),
							Size = position.Value["size"]?.Value<decimal>() ?? 0,
							Price = position.Value["price"]?.Value<decimal>() ?? 0,
							UnrealizedPnl = position.Value["unrealizedFunding"]?.Value<decimal>() ?? 0,
							HasStopLoss = position.Value["stopPrice"] != null && position.Value["stopPrice"]?.Value<decimal>() > 0,
							StopPrice = position.Value["stopPrice"]?.Value<decimal>()
						};
						positions.Add(positionData);
						_ = _log.Db($"GetOpenOrders: Added order - Symbol={positionData.Symbol}, Side={positionData.Side}, Size={positionData.Size}, Price={positionData.Price}, UnrealizedPnl={positionData.UnrealizedPnl}, HasStopLoss={positionData.HasStopLoss}, StopPrice={positionData.StopPrice}", userId, "TRADE", true);
					}
				}
			}

			_ = _log.Db($"Retrieved {positions.Count} open orders for coin {tmpCoin}", userId, "TRADE", true);
			return positions;
		}
		catch (Exception e)
		{
			_ = _log.Db($"⚠️KrakenService exception GetOpenOrders: {e.Message}", userId, "TRADE", true);
			return null;
		}
	}

	public async Task<bool> CreateStopLossOrder(int userId, string coin, decimal stopLossPrice, decimal amount, string buyOrSell, UserKrakenApiKey keys)
	{
		string tmpCoin = coin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		try
		{
			_ = _log.Db($"CreateStopLossOrder: userId={userId}, coin={tmpCoin}, stopLossPrice={stopLossPrice}, buyOrSell={buyOrSell}, amountToSell={amount}.", userId, "TRADE", true);

			if (userId == 0)
			{
				_ = _log.Db("CreateStopLossOrder: Invalid userId (0)", userId, "TRADE", true);
				return false;
			}
			if (stopLossPrice <= 0)
			{
				_ = _log.Db($"CreateStopLossOrder: Invalid stopLossPrice ({stopLossPrice})", userId, "TRADE", true);
				return false;
			}
			if (amount <= 0)
			{
				_ = _log.Db($"CreateStopLossOrder: Invalid amount to sell ({amount})", userId, "TRADE", true);
				return false;
			}
			if (string.IsNullOrEmpty(buyOrSell) || (buyOrSell != "buy" && buyOrSell != "sell"))
			{
				_ = _log.Db($"CreateStopLossOrder: Invalid buyOrSell ({buyOrSell})", userId, "TRADE", true);
				return false;
			}
 

			var postData = new Dictionary<string, string>
			{
				{ "orderType", "stop-loss" },
				{ "pair", $"{tmpCoin}USDC" }, 
				{ "type", buyOrSell },
				{ "ordertype", "stop-loss" },
				{ "volume", amount.ToString("F8") },
				{ "price", stopLossPrice.ToString("F2") }
			};
 
			_ = _log.Db($"CreateStopLossOrder: Sending request to AddOrder with postData={JsonConvert.SerializeObject(postData)}", userId, "TRADE", true);
			var response = await MakeRequestAsync(userId, keys, "AddOrder", "private", postData);

			if (response == null)
			{
				_ = _log.Db("⚠️CreateStopLossOrder: No response from SendOrder API", userId, "TRADE", true);
				return false;
			}

			_ = _log.Db($"CreateStopLossOrder: Received response - {JsonConvert.SerializeObject(response, Formatting.Indented)}", userId, "TRADE", true);

			if (response.ContainsKey("error") && response["error"] is JArray errorArray && errorArray.Count > 0)
			{
				var errorList = errorArray.ToObject<List<string>>() ?? new List<string>();
				var errorMessages = string.Join(", ", errorList);
				_ = _log.Db($"⚠️CreateStopLossOrder: SendOrder API error: {errorMessages}", userId, "TRADE", true);
				return false;
			}

			if (response.ContainsKey("result") && response["result"] is JObject result && result["sendStatus"] is JObject sendStatus)
			{
				string? orderId = sendStatus["order_id"]?.ToString();
				if (!string.IsNullOrEmpty(orderId))
				{
					_ = _log.Db($"CreateStopLossOrder: Successfully created stop-loss order, orderId={orderId}", userId, "TRADE", true);
					return true;
				}
				else
				{
					_ = _log.Db("⚠️CreateStopLossOrder: No order_id in response", userId, "TRADE", true);
					return false;
				}
			}

			_ = _log.Db("⚠️CreateStopLossOrder: Invalid response format, missing result or sendStatus", userId, "TRADE", true);
			return false;
		}
		catch (Exception e)
		{
			_ = _log.Db($"⚠️CreateStopLossOrder exception: {e.Message}, StackTrace: {e.StackTrace}", userId, "TRADE", true);
			return false;
		}
	} 

	private async Task<int> GetOppositeTradeCount(int userId, string coin, string buyOrSell, string strategy, int lookbackCount = 5)
	{
		string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			// Query to get the last N trades for the user involving the coin
			var query = @"
				SELECT from_currency, to_currency
				FROM trade_history
				WHERE user_id = @UserId
				AND (from_currency = @Coin OR to_currency = @Coin)
				AND strategy = @Strategy
				ORDER BY timestamp DESC
				LIMIT @LookbackCount";

			using var cmd = new MySqlCommand(query, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@Coin", tmpCoin);
			cmd.Parameters.AddWithValue("@Strategy", strategy);
			cmd.Parameters.AddWithValue("@LookbackCount", lookbackCount);

			var trades = new List<(string FromCurrency, string ToCurrency)>();
			using var reader = await cmd.ExecuteReaderAsync();
			while (await reader.ReadAsync())
			{
				trades.Add((reader.GetString("from_currency"), reader.GetString("to_currency")));
			}

			int oppositeCount = 0;
			string expectedFrom = buyOrSell == "sell" ? "USDC" : tmpCoin;
			string expectedTo = buyOrSell == "sell" ? tmpCoin : "USDC";

			// Count consecutive trades of the opposite type (buy or sell)
			foreach (var trade in trades)
			{
				if (trade.FromCurrency == expectedFrom && trade.ToCurrency == expectedTo)
				{
					oppositeCount++;
				} 
			}  

			//_ = _log.Db($"Trade history for {tmpCoin}: {oppositeCount} {buyOrSell}s, prior {(buyOrSell == "buy" ? "sells" : "buys")}", userId, "TRADE", true);
			return  oppositeCount; // Return prior buys for sell, or consecutive buys for buy
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error analyzing trade history for {tmpCoin}: {ex.Message}", userId, "TRADE", true);
			return 0;
		}
	}

	public async Task<List<ProfitData>> GetUserProfitDataAsync(int userId, int? days = null)
	{
		var profitData = new List<ProfitData>();

		using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
		await connection.OpenAsync();

		// Query for daily profit data
		var dailyQuery = @"
			SELECT 
				'daily' as period_type,
				date_start as period_start,
				date_end as period_end,
				start_usdc,
				start_btc,
				start_btc_price_usdc,
				end_usdc,
				end_btc,
				end_btc_price_usdc,
				profit_usdc,
				cumulative_profit_usdc,
				absolute_profit_usdc
			FROM trade_daily_profit
			WHERE user_id = @userId";

		if (days.HasValue)
		{
			dailyQuery += " AND date_start >= UTC_TIMESTAMP() - INTERVAL @days DAY";
		}

		// Query for weekly profit data
		var weeklyQuery = @"
			SELECT 
				'weekly' as period_type,
				week_start as period_start,
				week_end as period_end,
				start_usdc,
				start_btc,
				start_btc_price_usdc,
				end_usdc,
				end_btc,
				end_btc_price_usdc,
				profit_usdc,
				cumulative_profit_usdc,
				absolute_profit_usdc
			FROM trade_weekly_profit
			WHERE user_id = @userId";

		if (days.HasValue)
		{
			weeklyQuery += " AND week_start >= UTC_TIMESTAMP() - INTERVAL @days DAY";
		}

		// Query for monthly profit data
		var monthlyQuery = @"
			SELECT 
				'monthly' as period_type,
				month_start as period_start,
				month_end as period_end,
				start_usdc,
				start_btc,
				start_btc_price_usdc,
				end_usdc,
				end_btc,
				end_btc_price_usdc,
				profit_usdc,
				cumulative_profit_usdc,
				absolute_profit_usdc
			FROM trade_monthly_profit
			WHERE user_id = @userId";

		if (days.HasValue)
		{
			monthlyQuery += " AND month_start >= UTC_TIMESTAMP() - INTERVAL @days DAY";
		}

		// Combine all queries with UNION ALL
		var combinedQuery = $"{dailyQuery} UNION ALL {weeklyQuery} UNION ALL {monthlyQuery} ORDER BY period_start DESC";

		using var command = new MySqlCommand(combinedQuery, connection);
		command.Parameters.AddWithValue("@userId", userId);

		if (days.HasValue)
		{
			command.Parameters.AddWithValue("@days", days.Value);
		}

		using var reader = await command.ExecuteReaderAsync();

		while (await reader.ReadAsync())
		{
			profitData.Add(new ProfitData
			{
				PeriodType = reader.IsDBNull(reader.GetOrdinal("period_type")) ? string.Empty : reader.GetString("period_type"),
				PeriodStart = reader.IsDBNull(reader.GetOrdinal("period_start")) ? (DateTime?)null : reader.GetDateTime("period_start"),
				PeriodEnd = reader.IsDBNull(reader.GetOrdinal("period_end")) ? (DateTime?)null : reader.GetDateTime("period_end"),
				StartUsdc = reader.IsDBNull(reader.GetOrdinal("start_usdc")) ? 0m : reader.GetDecimal("start_usdc"),
				StartBtc = reader.IsDBNull(reader.GetOrdinal("start_btc")) ? 0m : reader.GetDecimal("start_btc"),
				StartBtcPriceUsdc = reader.IsDBNull(reader.GetOrdinal("start_btc_price_usdc")) ? 0m : reader.GetDecimal("start_btc_price_usdc"),
				EndUsdc = reader.IsDBNull(reader.GetOrdinal("end_usdc")) ? 0m : reader.GetDecimal("end_usdc"),
				EndBtc = reader.IsDBNull(reader.GetOrdinal("end_btc")) ? 0m : reader.GetDecimal("end_btc"),
				EndBtcPriceUsdc = reader.IsDBNull(reader.GetOrdinal("end_btc_price_usdc")) ? 0m : reader.GetDecimal("end_btc_price_usdc"),
				ProfitUsdc = reader.IsDBNull(reader.GetOrdinal("profit_usdc")) ? 0m : reader.GetDecimal("profit_usdc"),
				CumulativeProfitUsdc = reader.IsDBNull(reader.GetOrdinal("cumulative_profit_usdc")) ? 0m : reader.GetDecimal("cumulative_profit_usdc"),
				AbsoluteProfitUsdc = reader.IsDBNull(reader.GetOrdinal("absolute_profit_usdc")) ? 0m : reader.GetDecimal("absolute_profit_usdc")
			});
		}

		return profitData;
	}

	public async Task<IndicatorData?> GetIndicatorData(string fromCoin, string toCoin)
	{
		string tmpCoin = fromCoin.ToUpper();
		tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
		toCoin = toCoin.ToUpper();
		IndicatorData? indicators = null;
		try
		{
			var indicatorQuery = @"
        SELECT 
            200_day_moving_average,
            200_day_moving_average_value,
            14_day_moving_average,
            14_day_moving_average_value,
            21_day_moving_average,
            21_day_moving_average_value,
            rsi_14_day,
            vwap_24_hour,
            vwap_24_hour_value,
            retracement_from_high,
            retracement_from_high_value,
            macd_histogram,
            macd_line_value,
            macd_signal_value
        FROM trade_indicators
        WHERE from_coin = @FromCoin AND to_coin = @ToCoin LIMIT 1;";

			using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await connection.OpenAsync();

			using var command = new MySqlCommand(indicatorQuery, connection);
			command.Parameters.AddWithValue("@FromCoin", tmpCoin);
			command.Parameters.AddWithValue("@ToCoin", toCoin);

			using var reader = await command.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				indicators = new IndicatorData
				{
					FromCoin = tmpCoin,
					ToCoin = toCoin,
					TwoHundredDayMA = reader.IsDBNull(reader.GetOrdinal("200_day_moving_average")) ? false : reader.GetBoolean("200_day_moving_average"),
					TwoHundredDayMAValue = reader.IsDBNull(reader.GetOrdinal("200_day_moving_average_value")) ? 0 : reader.GetDecimal("200_day_moving_average_value"),
					FourteenDayMA = reader.IsDBNull(reader.GetOrdinal("14_day_moving_average")) ? false : reader.GetBoolean("14_day_moving_average"),
					FourteenDayMAValue = reader.IsDBNull(reader.GetOrdinal("14_day_moving_average_value")) ? 0 : reader.GetDecimal("14_day_moving_average_value"),
					TwentyOneDayMA = reader.IsDBNull(reader.GetOrdinal("21_day_moving_average")) ? false : reader.GetBoolean("21_day_moving_average"),
					TwentyOneDayMAValue = reader.IsDBNull(reader.GetOrdinal("21_day_moving_average_value")) ? 0 : reader.GetDecimal("21_day_moving_average_value"),
					RSI14Day = reader.IsDBNull(reader.GetOrdinal("rsi_14_day")) ? 0 : reader.GetDecimal("rsi_14_day"),
					VWAP24Hour = reader.IsDBNull(reader.GetOrdinal("vwap_24_hour")) ? false : reader.GetBoolean("vwap_24_hour"),
					VWAP24HourValue = reader.IsDBNull(reader.GetOrdinal("vwap_24_hour_value")) ? 0 : reader.GetDecimal("vwap_24_hour_value"),
					RetracementFromHigh = reader.IsDBNull(reader.GetOrdinal("retracement_from_high")) ? false : reader.GetBoolean("retracement_from_high"),
					RetracementFromHighValue = reader.IsDBNull(reader.GetOrdinal("retracement_from_high_value")) ? 0 : reader.GetDecimal("retracement_from_high_value"),
					MACDHistogram = reader.IsDBNull(reader.GetOrdinal("macd_histogram")) ? false : reader.GetBoolean("macd_histogram"),
					MACDLineValue = reader.IsDBNull(reader.GetOrdinal("macd_line_value")) ? 0 : reader.GetDecimal("macd_line_value"),
					MACDSignalValue = reader.IsDBNull(reader.GetOrdinal("macd_signal_value")) ? 0 : reader.GetDecimal("macd_signal_value")
				};
			}

			return indicators;
		}
		catch (Exception e)
		{
			_ = _log.Db("⚠️KrakenService exception GetIndicatorData: " + e.Message, outputToConsole: true);
			return indicators;
		}
	}

	public async Task<List<MacdDataPoint>> GetMacdData(
		string fromCoin,
		string toCoin,
		int days = 30,
		int fastPeriod = 12,
		int slowPeriod = 26,
		int signalPeriod = 9)
	{ 
		string pair = NormalizeCoinPair(fromCoin, toCoin);
		await _log.Db($"Fetching MACD data for pair: {pair}, Days: {days}, Fast: {fastPeriod}, Slow: {slowPeriod}, Signal: {signalPeriod}",
			null, "TRADE", true);

		// Fetch price history from Kraken API
		var prices = await GetPriceHistoryForMACD(fromCoin, days);
		if (prices == null || prices.Count == 0)
		{
			await _log.Db($"No price data returned for pair: {pair}, Days: {days}", null, "TRADE", true);
			return new List<MacdDataPoint>();
		}

		// Calculate MACD components
		List<double?>? closes = prices.Select(p => (double?)p.ValueUSD).ToList();
		var timestamps = prices.Select(p => p.Timestamp).ToList();

		var emaFast = CalculateEMA(closes, fastPeriod);
		var emaSlow = CalculateEMA(closes, slowPeriod);

		// Explicitly specify type arguments for Select to fix CS0411
		var macdLine = emaFast.Select<double?, double?>((val, i) =>
			val.HasValue && emaSlow[i].HasValue ? val.Value - emaSlow[i].GetValueOrDefault() : null).ToList();

		var signalLine = CalculateEMA(macdLine, signalPeriod);

		// Explicitly specify type arguments for Select to fix CS0411
		var histogram = macdLine.Select<double?, double?>((val, i) =>
			val.HasValue && signalLine[i].HasValue ? val.Value - signalLine[i].GetValueOrDefault() : null).ToList();

		// Prepare response
		var result = new List<MacdDataPoint>();
		for (int i = 0; i < timestamps.Count; i++)
		{
			result.Add(new MacdDataPoint
			{
				Timestamp = timestamps[i], // ISO 8601 format
				MacdLine = macdLine[i],
				SignalLine = signalLine[i],
				Histogram = histogram[i],
				Price = closes[i]
			});
		}

		await _log.Db($"Returning {result.Count} MACD data points for pair: {pair}", null, "TRADE", true);
		return result;
	}

	private string NormalizeCoinPair(string fromCoin, string toCoin)
	{
		string normalizedFromCoin = fromCoin.ToUpper() switch
		{
			"BTC" => "XBT",
			"BCH" => "XBC",
			_ => fromCoin.ToUpper()
		};
		return $"{normalizedFromCoin}{toCoin.ToUpper()}"; // e.g., "XBTUSD"
	}


	private async Task<List<PricePoint>> GetPriceHistoryForMACD(string pair, int days)
	{
		try
		{
			// Map pair to coin name (e.g., XBT -> Bitcoin, ETH -> Ethereum)
			var coinName = pair.ToUpper() switch
			{
				"XBT" => "Bitcoin",
				"BTC" => "Bitcoin",
				"ETH" => "Ethereum",
				"DOGE" => "Dogecoin",
				"SOL" => "Solana",
				_ => pair // Default to pair if no mapping exists
			};

			// Calculate the start date for the query
			var startDate = DateTime.UtcNow.AddDays(-days);

			// SQL query to fetch price history
			var priceQuery = @"
				SELECT timestamp, value_usd
				FROM (
					SELECT timestamp, value_usd,
						ROW_NUMBER() OVER (ORDER BY timestamp) as row_num
					FROM coin_value
					WHERE name = @CoinName AND timestamp >= @StartDate
				) as numbered
				WHERE row_num % 60 = 0  -- Take every 60th row (10min intervals)
				ORDER BY timestamp
				LIMIT 5000";

			var prices = new List<PricePoint>();

			using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await connection.OpenAsync();

			using var command = new MySqlCommand(priceQuery, connection);
			command.Parameters.AddWithValue("@CoinName", coinName);
			command.Parameters.AddWithValue("@StartDate", startDate);

			using var reader = await command.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				prices.Add(new PricePoint
				{
					Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.UtcNow : reader.GetDateTime("timestamp"),
					ValueUSD = reader.IsDBNull(reader.GetOrdinal("value_usd")) ? 0 : reader.GetDouble("value_usd")
				});
			}

			if (!prices.Any())
			{
				await _log.Db($"No price data found for coin: {coinName}, Days: {days}", null, "TRADE", true);
			}

			return prices;
		}
		catch (Exception ex)
		{
			await _log.Db($"Error fetching price history for pair: {pair}, Days: {days}, {ex.Message}", null, "TRADE", true);
			return new List<PricePoint>();
		}
	}

	private List<double?> CalculateEMA(List<double?> prices, int period)
	{
		if (prices == null || prices.Count == 0 || period <= 0)
		{
			return new List<double?>(new double?[prices?.Count ?? 0]);
		}

		var ema = new List<double?>(new double?[prices.Count]);
		double multiplier = 2.0 / (period + 1);
		double? previousEma = null;

		for (int i = 0; i < prices.Count; i++)
		{
			if (double.IsNaN(prices[i].GetValueOrDefault()) || double.IsInfinity(prices[i].GetValueOrDefault()))
			{
				ema[i] = null;
				continue;
			}

			if (i < period - 1)
			{
				ema[i] = null; // Not enough data for EMA
				continue;
			}

			if (i == period - 1)
			{
				// Use simple moving average for the first EMA value
				var initialPrices = prices.Take(period).Where(p => !double.IsNaN(p.GetValueOrDefault()) && !double.IsInfinity(p.GetValueOrDefault())).ToList();
				if (initialPrices.Count >= period)
				{
					previousEma = initialPrices.Average();
					ema[i] = previousEma;
				}
				else
				{
					ema[i] = null;
				}
			}
			else if (previousEma.HasValue)
			{
				ema[i] = (prices[i] * multiplier) + (previousEma.Value * (1 - multiplier));
				previousEma = ema[i];
			}
			else
			{
				ema[i] = null;
			}
		}

		return ema;
	}
	private async Task<bool> CheckForMissingFees(int userId, string coin, string strategy)
	{
		const string sql = @"
			SELECT 1 
			FROM (
				SELECT fees
				FROM trade_history 
				WHERE user_id = @UserId 
				AND (from_currency = @Coin OR to_currency = @Coin)
				AND strategy = @Strategy
				ORDER BY timestamp DESC 
				LIMIT 20
			) AS recent_trades
			WHERE fees IS NULL OR fees = 0
			LIMIT 1";

		try
		{
			using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@Strategy", strategy);
			cmd.Parameters.AddWithValue("@Coin", coin);

			using var reader = await cmd.ExecuteReaderAsync();
			return reader.HasRows;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️Error checking for missing fees: {ex.Message}", userId, "TRADE", true);
			return false;
		}
	}
	private bool ValidateTradeConfiguration(object? config, int userId)
	{
		if (config == null)
		{
			_ = _log.Db("Trade configuration does not exist. Trade Cancelled.", userId, "TRADE", true);
			return false;
		}

		var nullProperties = config.GetType()
			.GetProperties()
			.Where(p => p.GetValue(config) == null)
			.Select(p => p.Name)
			.ToList();

		if (nullProperties.Any())
		{
			string nulls = string.Join(", ", nullProperties);
			_ = _log.Db($"Trade Cancelled. The following trade configuration properties are null: {nulls}", userId, "TRADE", true);
			return false;
		}

		return true;
	}
	public async Task ClearIndicatorTradeStopLoss(int userId, string fromCoin, string toCoin)
	{
		const string componentName = "INDICATOR";

		// Validate inputs
		if (string.IsNullOrEmpty(fromCoin) || string.IsNullOrEmpty(toCoin))
		{
			_ = _log.Db($"Invalid input parameters: fromCoin={fromCoin}, toCoin={toCoin}", userId, componentName, true);
			return;
		}

		// Validate configuration
		if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
		{
			_ = _log.Db("Configuration or connection string is missing.", userId, componentName, true);
			return;
		}

		// SQL query to clear trade_stop_loss for IND strategy
		const string sql = @"
			UPDATE trade_configuration
			SET trade_stop_loss = NULL
			WHERE user_id = @UserId
			AND from_coin = @FromCoin
			AND to_coin = @ToCoin
			AND strategy = 'IND' 
			LIMIT 1;";

		try
		{
			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			await using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
			cmd.Parameters.Add("@FromCoin", MySqlDbType.VarChar).Value = fromCoin;
			cmd.Parameters.Add("@ToCoin", MySqlDbType.VarChar).Value = toCoin;

			int rowsAffected = await cmd.ExecuteNonQueryAsync();
			if (rowsAffected > 0)
			{
				_ = _log.Db($"Cleared trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND.", userId, componentName, true);
			}
			else
			{
				_ = _log.Db($"No trade configuration found to clear trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND.", userId, componentName, true);
			}
		}
		catch (MySqlException ex)
		{
			_ = _log.Db($"Database error clearing trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND: {ex.Message}", userId, componentName, true);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Unexpected error clearing trade_stop_loss for user {userId}, pair {fromCoin}/{toCoin}, strategy IND: {ex.Message}", userId, componentName, true);
		}
	}
	public async Task<decimal?> GetLastUnmatchedIndicatorTradeValue(int userId, string fromCurrency, string toCurrency)
	{
		const string componentName = "INDICATOR";

		// Validate inputs
		if (string.IsNullOrEmpty(fromCurrency) || string.IsNullOrEmpty(toCurrency))
		{
			_ = _log.Db($"Invalid input parameters: fromCurrency={fromCurrency}, toCurrency={toCurrency}", userId, componentName, true);
			return null;
		}

		// Validate configuration
		if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
		{
			_ = _log.Db("Configuration or connection string is missing.", userId, componentName, true);
			return null;
		}

		// SQL query to get the value of the most recent unmatched IND trade
		const string sql = @"
			SELECT value
			FROM trade_history
			WHERE user_id = @UserId
			AND from_currency = @FromCurrency
			AND to_currency = @ToCurrency
			AND strategy = 'IND'
			AND matching_trade_id IS NULL
			ORDER BY timestamp DESC
			LIMIT 1";

		try
		{
			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			await using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
			cmd.Parameters.Add("@FromCurrency", MySqlDbType.VarChar).Value = fromCurrency;
			cmd.Parameters.Add("@ToCurrency", MySqlDbType.VarChar).Value = toCurrency;

			var result = await cmd.ExecuteScalarAsync();
			if (result == null || result == DBNull.Value)
			{
				_ = _log.Db($"No unmatched IND trade found for user {userId}, pair {fromCurrency}/{toCurrency}.", userId, componentName, true);
				return null;
			}

			decimal value = Convert.ToDecimal(result);
			_ = _log.Db($"Found unmatched IND trade value {value} for user {userId}, pair {fromCurrency}/{toCurrency}.", userId, componentName, true);
			return value;
		}
		catch (MySqlException ex)
		{
			_ = _log.Db($"Database error retrieving unmatched IND trade value for user {userId}, pair {fromCurrency}/{toCurrency}: {ex.Message}", userId, componentName, true);
			return null;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Unexpected error retrieving unmatched IND trade value for user {userId}, pair {fromCurrency}/{toCurrency}: {ex.Message}", userId, componentName, true);
			return null;
		}
	}
	/// <summary>
	/// Returns the lowest buy price from either:
	/// 1. The specific matched trade (if matchingTradeId is provided), OR
	/// 2. The last <paramref name="lookbackTrades"/> USDC→COIN buys
	/// </summary>
	private async Task<decimal> GetLowestBuyPriceInXTradesAsync(int userId, string coin, string strategy, int lookbackTrades, int? matchingTradeId)
	{
		if (matchingTradeId.HasValue)
		{
			// Return the specific matched trade's value
			const string matchedTradeSql = @"
				SELECT value 
				FROM trade_history 
				WHERE id = @MatchingTradeId
				AND user_id = @UserId
				AND strategy = @Strategy
				LIMIT 1;";

			try
			{
				await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				await using var cmd = new MySqlCommand(matchedTradeSql, conn);
				cmd.Parameters.AddWithValue("@MatchingTradeId", matchingTradeId.Value);
				cmd.Parameters.AddWithValue("@UserId", userId);
				cmd.Parameters.AddWithValue("@Strategy", strategy);

				object? result = await cmd.ExecuteScalarAsync();
				return result is null ? 0m : Convert.ToDecimal(result);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️ Error getting matched trade price (ID:{matchingTradeId}({strategy})): {ex.Message}", userId, "TRADE", true);
				return 0m;
			}
		}

		if (lookbackTrades <= 0)
		{
			_ = _log.Db("Lookback trades value must be greater than zero.", userId, "TRADE", true);
			return 0m;
		}

		string tmpCoin = coin.Equals("BTC", StringComparison.OrdinalIgnoreCase) ? "XBT" : coin.ToUpperInvariant();

		string sql = $@"
			SELECT MIN(t.value) AS LowestBuyPrice
			FROM (
				SELECT value
				FROM trade_history
				WHERE user_id = @UserId
				AND from_currency = 'USDC'
				AND to_currency = @ToCur
				ORDER BY timestamp DESC
				LIMIT {lookbackTrades}
			) AS t;";

		try
		{
			await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			await using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);
			cmd.Parameters.AddWithValue("@ToCur", tmpCoin);

			object? result = await cmd.ExecuteScalarAsync();
			return result is null ? 0m : Convert.ToDecimal(result);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"⚠️ Error getting lowest buy price for {tmpCoin}: {ex.Message}", userId, "TRADE", true);
			return 0m;
		}
	}

	private async Task<bool> CheckIfTradedInCurrentInterval(int userId, string fromCoin, string toCoin, string strategy)
	{
		try
		{
			// Step 1: Find the current open interval
			var intervalSql = @"
                    SELECT start_time, end_time
                    FROM signal_intervals
                    WHERE user_id = @userId
					AND from_coin = @fromCoin
					AND to_coin = @toCoin 
					AND end_time IS NULL
                    ORDER BY start_time DESC
                    LIMIT 1";
	 
			await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
 
			await using var intervalCmd = new MySqlCommand(intervalSql, conn);
			intervalCmd.Parameters.AddWithValue("@userId", userId);
			intervalCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
			intervalCmd.Parameters.AddWithValue("@toCoin", toCoin);

			using var intervalReader = await intervalCmd.ExecuteReaderAsync();
			if (!await intervalReader.ReadAsync())
			{
				_ = _log.Db($"No open signal interval found for {fromCoin}/{toCoin}", null, "TISVC", true);
				return false;
			}

			DateTime startTime = intervalReader.GetDateTime("start_time");
			// end_time is NULL for open intervals, so use current time
			DateTime endTime = intervalReader.IsDBNull(intervalReader.GetOrdinal("end_time")) ? DateTime.UtcNow : intervalReader.GetDateTime("end_time");
			await intervalReader.CloseAsync();

			// Step 2: Check for trades in the interval
			var tradeSql = @"
                    SELECT COUNT(*) 
                    FROM trade_history
                    WHERE user_id = @userId
					AND from_currency = @fromCoin 
                    AND to_currency = @toCoin 
					AND strategy = @strategy
                    AND timestamp >= @startTime 
                    AND timestamp <= @endTime";

			using var tradeCmd = new MySqlCommand(tradeSql, conn);
			tradeCmd.Parameters.AddWithValue("@userId", userId);
			tradeCmd.Parameters.AddWithValue("@strategy", strategy);
			tradeCmd.Parameters.AddWithValue("@fromCoin", fromCoin);
			tradeCmd.Parameters.AddWithValue("@toCoin", toCoin);
			tradeCmd.Parameters.AddWithValue("@startTime", startTime);
			tradeCmd.Parameters.AddWithValue("@endTime", endTime);

			long? tradeCount = (long?)await tradeCmd.ExecuteScalarAsync();

			bool hasTrades = tradeCount > 0;
			_ = _log.Db($"Checked trades for {fromCoin}/{toCoin} in interval {startTime:yyyy-MM-dd HH:mm:ss} to {endTime:yyyy-MM-dd HH:mm:ss}: {(hasTrades ? $"{tradeCount} trade(s) found" : "No trades found")}",
					null, "TISVC", true);

			return hasTrades;
		}
		catch (MySqlException ex)
		{
			_ = _log.Db($"Error checking trades for {fromCoin}/{toCoin}: {ex.Message}", null, "TISVC", true);
			return false;
		}
	}
	private async Task<bool> CheckIfBullishSignalExists(string fromCoin, string toCoin)
	{
		try
		{
			// Validate inputs
			if (string.IsNullOrEmpty(fromCoin) || string.IsNullOrEmpty(toCoin))
			{
				_ = _log.Db($"Invalid input parameters: fromCoin={fromCoin}, toCoin={toCoin}", null, "TISVC", true);
				return false;
			}

			// Validate configuration
			if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				_ = _log.Db("Configuration or connection string is missing.", null, "TISVC", true);
				return false;
			}

			// Query to check for an open interval
			var intervalSql = @"
				SELECT 1
				FROM signal_intervals
				WHERE from_coin = @fromCoin
				AND to_coin = @toCoin
				AND end_time IS NULL
				LIMIT 1";

			await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			await using var intervalCmd = new MySqlCommand(intervalSql, conn); 
			intervalCmd.Parameters.Add("@fromCoin", MySqlDbType.VarChar).Value = fromCoin;
			intervalCmd.Parameters.Add("@toCoin", MySqlDbType.VarChar).Value = toCoin;

			bool hasOpenInterval = await intervalCmd.ExecuteScalarAsync() != null;
			_ = _log.Db($"Checked for open interval pair {fromCoin}/{toCoin}: {(hasOpenInterval ? "Open interval found" : "No open interval found")}",
					null, "TISVC", true);

			return hasOpenInterval;
		}
		catch (MySqlException ex)
		{
			_ = _log.Db($"Database error checking open interval for pair {fromCoin}/{toCoin}: {ex.Message}", null, "TISVC", true);
			return false;
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Unexpected error checking open interval for pair {fromCoin}/{toCoin}: {ex.Message}", null, "TISVC", true);
			return false;
		}
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
