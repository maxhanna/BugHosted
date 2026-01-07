using FirebaseAdmin.Messaging;
using maxhanna.Server.Controllers.DataContracts.Crypto;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Collections.Concurrent;
using System.Data;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

public class KrakenService
{
  private static decimal _TradeThreshold = 0.0084m;
  private static decimal _TradeThresholdHFT = 0.001m;
  private static decimal _MinimumBTCTradeAmount = 0.00005m;
  private static decimal _MaximumBTCBalance = 0;
  private static decimal _MaximumUSDCTradeAmount = 2000m;
  private static decimal _ReserveSellPercentage = 0.04m;
  private static decimal _ValueTradePercentagePremium = 0.05m;
  private static decimal _CoinReserveUSDCValue = 200;
  private static decimal _TradeStopLoss = 0;
  private static decimal _TradeStopLossPercentage = 0;
  private static int _MaxTradeTypeOccurances = 5;
  private static int _VolumeSpikeMaxTradeOccurance = 1;
  private readonly HttpClient _httpClient;
  private static IConfiguration? _config;
  private readonly string _baseAddr = "https://api.kraken.com/";
  private long _lastNonce;
  private readonly Log _log;
  private static readonly Dictionary<string, string> CoinMappingsForDB = new Dictionary<string, string> { { "XBT", "btc" }, { "XXBT", "btc" }, { "BTC", "btc" }, { "USDC", "usdc" }, { "XRP", "xrp" }, { "XXRP", "xrp" }, { "XXDG", "xdg" }, { "XDG", "xdg" }, { "XETH", "eth" }, { "ETH", "eth" }, { "ETH.F", "eth" }, { "SOL.F", "sol" }, { "SOL", "sol" }, { "SUI", "sui" }, { "WIF", "wif" }, { "WIF.F", "wif" }, { "PENGU", "pengu" }, { "PEPE", "pepe" }, { "DOT", "dot" }, { "DOT.F", "dot" }, { "ADA", "ada" }, { "ADA.F", "ada" }, { "LTC", "ltc" }, { "LTC.F", "ltc" }, { "LINK", "link" }, { "LINK.F", "link" }, { "MATIC", "matic" }, { "MATIC.F", "matic" }, { "XLM", "xlm" }, { "XLM.F", "xlm" }, { "TRX", "trx" }, { "TRX.F", "trx" }, { "AVAX", "avax" }, { "AVAX.F", "avax" }, { "ATOM", "atom" }, { "ATOM.F", "atom" }, { "ALGO", "algo" }, { "ALGO.F", "algo" }, { "NEAR", "near" }, { "NEAR.F", "near" }, { "XMR", "xmr" }, { "XMR.F", "xmr" }, { "BCH", "bch" }, { "BCH.F", "bch" }, { "ZEC", "zec" }, { "ZEC.F", "zec" }, { "SHIB", "shib" }, { "SHIB.F", "shib" }, { "UNI", "uni" }, { "UNI.F", "uni" }, { "AAVE", "aave" }, { "AAVE.F", "aave" }, { "ZUSD", "usd" }, { "ZCAD", "cad" } };
  private static readonly Dictionary<string, string> CoinNameMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { { "BTC", "Bitcoin" }, { "XBT", "Bitcoin" }, { "ETH", "Ethereum" }, { "XDG", "Dogecoin" }, { "SOL", "Solana" } };
  private static readonly Dictionary<string, string> CoinSymbols = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) { { "Bitcoin", "₿" }, { "Ethereum", "Ξ" }, { "Dogecoin", "Ɖ" }, { "Solana", "◎" } };
  private static readonly ConcurrentDictionary<int, DateTime> _userLastCheckTimes = new ConcurrentDictionary<int, DateTime>();
  private static readonly TimeSpan _rateLimitDuration = TimeSpan.FromMinutes(1);
  private readonly Dictionary<string, (decimal Atr, DateTime Timestamp)> _atrCache = new();

  public readonly bool viewDebugLogs = false;
  public readonly bool viewErrorDebugLogs = true;
  public KrakenService(IConfiguration config, Log log)
  {
    _config = config;
    _log = log;
    _httpClient = new HttpClient();
  }
  public async Task<bool> MakeATrade(int userId, string coin, UserKrakenApiKey keys, string strategy)
  {
    string tmpCoin = coin.ToUpper().Trim();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

    // 1. Cooldown and system check 
    if (await IsTradeCooldown(userId, coin, strategy, tmpCoin, keys))
    {
      return false;
    }
    TradeConfiguration? tc = await GetTradeConfiguration(userId, fromCoin: tmpCoin, toCoin: "USDC", strategy);
    if (!ValidateAndApplyConfig(userId, coin, strategy, tmpCoin, tc))
    {
      return false;
    }

    // 2. Get last trade info
    bool isFirstTradeEver = false;
    TradeRecord? lastTrade = await GetLastTrade(userId, coin, strategy);
    if (lastTrade == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No trade history.", userId, "TRADE", viewDebugLogs);
      isFirstTradeEver = true;
    }
    decimal? coinPriceUSDC = await GetCoinPriceToUSDC(userId, coin, keys);
    if (coinPriceUSDC == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Unable to fetch {coin}/USDC price. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      return false;
    }
    decimal? coinPriceCAD = await IsSystemUpToDate(userId, coin, coinPriceUSDC.Value);
    if (!CheckPriceValidity(userId, coin, strategy, tmpCoin, coinPriceUSDC, coinPriceCAD))
    {
      return false;
    }

    decimal PriceUSDC = coinPriceUSDC.Value;
    if (PriceUSDC < _TradeStopLoss)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Stop Loss ({_TradeStopLoss}) threshold breached (current price: {coinPriceUSDC}). Liquidating {coin} for USDC.", userId, "TRADE", viewDebugLogs);
      return await ExitPosition(userId, coin, strategy);
    }

    // 3. Calculate spread
    (decimal? firstPriceToday, decimal lastPrice, decimal currentPrice, decimal spread, decimal spread2)
        = await CalculateSpread(userId, coin, strategy, isFirstTradeEver, lastTrade, coinPriceUSDC.Value);


    MomentumStrategy? UpwardsMomentum = await GetMomentumStrategy(userId, tmpCoin, "USDC", strategy);
    if (UpwardsMomentum != null && UpwardsMomentum.Timestamp != null)
    {
      return await ExecuteUpwardsMomentumStrategy(userId, tmpCoin, keys, coinPriceCAD.Value, coinPriceUSDC.Value, firstPriceToday, lastPrice, spread, spread2, UpwardsMomentum, strategy);
    }

    //check the downards momentum strategy
    MomentumStrategy? DownwardsMomentum = await GetMomentumStrategy(userId, "USDC", tmpCoin, strategy); //if trying to buy, its because downwards trend.
    if (DownwardsMomentum != null && DownwardsMomentum.Timestamp != null)
    {
      return await ExecuteDownwardsMomentumStrategy(userId, tmpCoin, keys, coinPriceCAD.Value, coinPriceUSDC.Value, firstPriceToday, lastPrice, spread, spread2, DownwardsMomentum, strategy);
    }

    if (strategy == "IND")
    {
      return await HandleIndicatorStrategy(userId, coin, strategy, tmpCoin, currentPrice, coinPriceCAD.Value, keys);
    }
    decimal spreadThreshold = GetSpreadThreshold(strategy, coinPriceUSDC.Value);
    LogSpreads(userId, strategy, tmpCoin, firstPriceToday, lastPrice, currentPrice, spread, spread2, isFirstTradeEver, spreadThreshold);
    // NO MOMENTUM DETECTED AS OF YET, Check if trade crosses spread thresholds
    if (Math.Abs(spread) >= spreadThreshold || (strategy != "HFT" && Math.Abs(spread2) >= spreadThreshold))
    {
      if (strategy == "HFT")
      {
        await RecordPriceCheck(userId, tmpCoin, coinPriceUSDC.Value);
      }
      // // 4. Now we know a trade is needed - fetch balances 
      var balances = await GetBalance(userId, tmpCoin, strategy, keys);
      if (balances == null)
      {
        _ = _log.Db("Failed to get wallet balances", userId, "TRADE");
        return false;
      }

      decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
      decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) balance: {coinBalance} usdcBalance: {usdcBalance}", userId, "TRADE", viewDebugLogs);
      if (spread >= spreadThreshold || (firstPriceToday != null && spread2 >= spreadThreshold))
      {   // DCA|IND: Selling, HFT: Buying
        string triggeredBy = spread >= spreadThreshold ? "spread" : "spread2";
        decimal coinBalanceConverted = coinBalance * coinPriceUSDC.Value;
        string buyOrSell = strategy == "HFT" ? "Buy" : "Sell";
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Trade ({buyOrSell}) triggered by: {triggeredBy} ({(triggeredBy == "spread2" ? spread2 : spread):P})", userId, "TRADE", viewDebugLogs);

        if (CheckIfReservesNeeded(strategy, isFirstTradeEver, lastTrade, coinBalance, coinBalanceConverted))
        {
          return await CreateCoinReserveWithUSDC(userId, tmpCoin, strategy, keys, coinBalance, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value);
        }

        if (strategy == "HFT")
        {
          if (usdcBalance < (coinPriceUSDC.Value * _MinimumBTCTradeAmount))
          {
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Insufficient balance to trade! usdcBalance : {usdcBalance} must be greater than {_MinimumBTCTradeAmount * coinPriceUSDC.Value} USDC. Review configuration if this amount is incorrect. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
            return false;
          }
          var spread2Message = firstPriceToday != null ? $"Spread2 : {spread2:P} " : "";
          bool isValidTrade = await ValidateTrade(userId, tmpCoin, tmpCoin, "USDC", buyOrSell.ToLower(), usdcBalance, coinBalance, strategy);
          if (isValidTrade)
          {
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread is {spread:P}, {spread2Message}(c:{currentPrice}-l:{lastPrice}). Balance: {coinBalance} {tmpCoin}.", userId, "TRADE", viewDebugLogs);
            return await HandleHFTBuying(userId, coin, keys, strategy, tmpCoin, coinPriceCAD.Value, currentPrice, coinBalance, usdcBalance);
          }
        }
        else if (coinBalance > 0)
        {
          var spread2Message = firstPriceToday != null ? $"Spread2 : {spread2:P} " : "";
          bool isValidTrade = await ValidateTrade(userId, tmpCoin, tmpCoin, "USDC", buyOrSell.ToLower(), usdcBalance, coinBalance, strategy);
          if (isValidTrade)
          {
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread is {spread:P}, {spread2Message}(c:{currentPrice}-l:{lastPrice}). Balance: {coinBalance} {tmpCoin}.", userId, "TRADE", viewDebugLogs);
            return await HandleSell(userId, strategy, tmpCoin, coinPriceUSDC.Value, spreadThreshold);
          }
        }
        else
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User has no {tmpCoin} (coinBalance: {coinBalance}) to trade.", userId, "TRADE", viewDebugLogs);
          return await CreateCoinReserveWithUSDC(userId, coin, strategy, keys, coinBalance, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value);
        }
      }
      if (spread <= -spreadThreshold || (firstPriceToday != null && spread2 <= -spreadThreshold))
      { // DCA|IND: Buying, HFT: Selling
        string triggeredBy = spread <= -spreadThreshold ? "spread" : "spread2";
        string buyOrSell = strategy == "HFT" ? "Sell" : "Buy";

        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Trade ({buyOrSell}) triggered by: {triggeredBy} {(triggeredBy == "spread2" ? spread2 : spread):P}", userId, "TRADE", viewDebugLogs);

        bool isValidTrade = await ValidateTrade(userId, tmpCoin, "USDC", tmpCoin, buyOrSell.ToLower(), usdcBalance, coinBalance, strategy);
        if (isValidTrade)
        {
          if (strategy == "HFT")
          {
            return await HandleHFTSelling(userId, keys, strategy, tmpCoin, coinPriceCAD.Value, currentPrice, coinBalance, usdcBalance);
          }
          else
          {
            if (usdcBalance < (coinPriceUSDC.Value * _MinimumBTCTradeAmount))
            {
              _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Insufficient balance to trade! coinBalance : {coinBalance} and usdcBalance : {usdcBalance} must be greater than {_MinimumBTCTradeAmount * coinPriceUSDC.Value} USDC respectively. Review configuration if this amount is incorrect. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
              return false;
            }
            return await HandleBuy(userId, strategy, tmpCoin, coinPriceUSDC.Value, firstPriceToday, lastPrice, currentPrice, spread, spread2, usdcBalance);
          }
        }
      }
    }
    return false;
  }

  private static decimal GetSpreadThreshold(string strategy, decimal coinPriceUSDC)
  {
    if (strategy != "HFT")
    {
      return _TradeThreshold;
    }
    return _TradeThresholdHFT;
    // Define price and threshold bounds
    // const decimal minPrice = 1.0m; // Representative price for low-priced coins (e.g., DOGE)
    // const decimal referencePrice = 3.5m; // Reference price for XRP-like coins
    // const decimal maxPrice = 100000m; // Representative price for high-priced coins (e.g., BTC)
    // const decimal minThreshold = 0.0075m; // 0.75% for low-priced coins
    // const decimal referenceThreshold = 0.0025m; // 0.25% for XRP-like coins
    // decimal maxThreshold = _TradeThresholdHFT; // Default HFT threshold for high-priced coins

    // // Handle edge cases for price
    // if (coinPriceUSDC <= 0)
    // {
    // 	return minThreshold; // Default to highest threshold for invalid/zero prices
    // }

    // // Clamp price to avoid extreme log values
    // decimal clampedPrice = Math.Max(minPrice, Math.Min(maxPrice, coinPriceUSDC));

    // // Linear interpolation using logarithm of price
    // decimal logMinPrice = (decimal)Math.Log10((double)minPrice);
    // decimal logReferencePrice = (decimal)Math.Log10((double)referencePrice);
    // decimal logMaxPrice = (decimal)Math.Log10((double)maxPrice);
    // decimal logPrice = (decimal)Math.Log10((double)clampedPrice);

    // decimal threshold;
    // if (clampedPrice <= referencePrice)
    // { 
    // 	threshold = minThreshold + (referenceThreshold - minThreshold) *
    // 		(logPrice - logMinPrice) / (logReferencePrice - logMinPrice);
    // }
    // else
    // { 
    // 	threshold = referenceThreshold + (maxThreshold - referenceThreshold) *
    // 		(logPrice - logReferencePrice) / (logMaxPrice - logReferencePrice);
    // }

    // var spreadThreshold = Math.Max(0.001m, Math.Min(minThreshold, threshold));
    // //Console.WriteLine($"Calculated spread threshold for price: {coinPriceUSDC}: " + spreadThreshold);
    // return spreadThreshold;
  }

  private async Task<bool> HandleBuy(int userId, string strategy, string tmpCoin, decimal coinPriceUSDC, decimal? firstPriceToday, decimal lastPrice, decimal currentPrice, decimal spread, decimal spread2, decimal usdcBalance)
  {
    if (usdcBalance > 0)
    {
      var spread2Message = firstPriceToday != null ? $"Spread2: {spread2:P} " : "";
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread is {spread:P} {spread2Message} (c:{currentPrice}-l:{lastPrice}), buying {tmpCoin}.", userId, "TRADE", viewDebugLogs);

      await AddMomentumEntry(userId, "USDC", tmpCoin, strategy, coinPriceUSDC, null);
    }
    return false;
  }

  private async Task<bool> HandleSell(int userId, string strategy, string tmpCoin, decimal coinPriceUSDC, decimal spreadThreshold)
  {
    int? matchingBuyOrderId = await FindMatchingBuyOrders(userId, tmpCoin, strategy, coinPriceUSDC);
    TradeRecord? reservedTransaction = await GetLatestReservedTransaction(userId, tmpCoin, strategy, coinPriceUSDC, spreadThreshold);
    if (matchingBuyOrderId == null && reservedTransaction == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No matching buy or reserve transactions at this depth. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      return false;
    }
    else
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Switching to momentum strategy.", userId, "TRADE", viewDebugLogs);
      await AddMomentumEntry(userId, tmpCoin, "USDC", strategy, coinPriceUSDC, matchingBuyOrderId);
      return false;
    }
  }

  private async Task<bool> HandleHFTBuying(int userId, string coin, UserKrakenApiKey keys, string strategy, string tmpCoin, decimal coinPriceCAD, decimal currentPrice, decimal coinBalance, decimal usdcBalance)
  {
    decimal coinToTrade = _MinimumBTCTradeAmount;
    _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Buying {FormatBTC(coinToTrade)} {coin}.", userId, "TRADE", viewDebugLogs);
    await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinToTrade), "buy", coinBalance, usdcBalance, coinPriceCAD, currentPrice, strategy, null, null);
    return true;
  }

  private async Task<bool> HandleHFTSelling(int userId, UserKrakenApiKey keys, string strategy, string tmpCoin, decimal coinPriceCAD, decimal currentPrice, decimal coinBalance, decimal usdcBalance)
  {
    List<TradeRecord> stopLossedTrades = [];
    bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, tmpCoin, "USDC", userId);
    if (!isVolumeSpiking)
    {
      stopLossedTrades = await CheckAndReturnStopLossedBuys(userId, tmpCoin, strategy, currentPrice, coinBalance, usdcBalance, coinPriceCAD);
    }
    List<TradeRecord> valueMatchingTrades = await GetProfitableOpenBuyPositionsAsync(userId, tmpCoin, strategy, currentPrice, _TradeThreshold, minimum5Hours: false);
    valueMatchingTrades.AddRange(stopLossedTrades);
    if (valueMatchingTrades.Count > 0)
    {
      decimal coinToTrade = valueMatchingTrades.Sum(trade => Convert.ToDecimal(trade.value));
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Summed {valueMatchingTrades.Count} profitable open buy positions for {coinToTrade} {tmpCoin}.", userId, "TRADE", viewDebugLogs);
      coinToTrade = Math.Min(coinToTrade, coinBalance);
      if (coinToTrade > 0 && coinToTrade >= _MinimumBTCTradeAmount)
      {
        await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinToTrade), "sell", coinBalance, usdcBalance, coinPriceCAD, currentPrice, strategy, null, valueMatchingTrades);
        return true;
      }
      else
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Open buy positions / Balance : {coinToTrade} {tmpCoin} does not exceed the Minimum Trade Amount ({_MinimumBTCTradeAmount}). Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }
    }
    else
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No matching open positions at this depth. Waiting.", userId, "TRADE", viewDebugLogs);
    }
    return false;
  }

  private static bool CheckIfReservesNeeded(string strategy, bool isFirstTradeEver, TradeRecord? lastTrade, decimal coinBalance, decimal coinBalanceConverted)
  {
    return strategy != "HFT"
  && (isFirstTradeEver || lastTrade == null || coinBalance < _MinimumBTCTradeAmount)
  && (coinBalanceConverted <= 0);
  }

  private void LogSpreads(
  int userId,
  string strategy,
  string tmpCoin,
  decimal? firstPriceToday,
  decimal lastPrice,
  decimal currentPrice,
  decimal spread,
  decimal spread2,
  bool isFirstTradeEver,
  decimal spreadThreshold)
  {
    string firstPriceStr = firstPriceToday?.ToString("F2") ?? "N/A";
    string spreadStr = spread.ToString("P2");
    string spread2Str = firstPriceToday != null ? spread2.ToString("P2") : "N/A";

    decimal thresholdDiff = (spreadThreshold - Math.Abs(spread)) * 100;
    decimal? thresholdDiff2 = firstPriceToday != null
      ? (spreadThreshold - Math.Abs(spread2)) * 100
      : null;

    string thresholdDiffStr = thresholdDiff.ToString("F2") + "%";
    string thresholdDiff2Str = thresholdDiff2?.ToString("F2") + "%" ?? "N/A";

    string logMessage = $@"({tmpCoin}:{userId}:{strategy}) L:{lastPrice} - C:{currentPrice} - Spread: {spreadStr} | {thresholdDiffStr} from threshold {((strategy != "HFT" && firstPriceToday != null) ? @$" - First Price Today: {firstPriceStr} - Spread2: {spread2Str} | {thresholdDiff2Str} from threshold." : "")}{(isFirstTradeEver ? " (isFirstTradeEver: true.)" : "")}";
    _ = _log.Db(logMessage.Trim(), userId, "TRADE", viewDebugLogs);
  }

  private async Task<bool> HandleIndicatorStrategy(int userId, string coin, string strategy, string tmpCoin, decimal currentPrice, decimal coinPriceCAD, UserKrakenApiKey keys)
  {
    // Check if indicators are bullish.
    bool? isBullish = await CheckIfFreshBullishSignalExists(tmpCoin, "USDC");
    //_ = _log.Db($"({coin.Replace("BTC", "XBT")}:{userId}:{strategy}) Checked for open interval pair {coin}/USDC: {(isBullish.HasValue && isBullish.Value ? "Open interval found." : "No open interval found. Trade Cancelled.")}", userId, "TRADE", viewDebugLogs);
    if (!isBullish.HasValue || !isBullish.Value)
    {
      return false;
    }

    // Indicator strategy can only have 1 active trade at a time.
    int? activeTrades = await GetActiveTradeCount(userId, coin, strategy);
    if (activeTrades == null || activeTrades > 0)
    {
      string message = activeTrades == null
        ? $"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) ⚠️Error fetching active trades for {coin}({strategy}). Trade Cancelled."
        : $"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) User already has an active {coin}({strategy}) trade. Trade Cancelled.";
      _ = _log.Db(message, userId, "TRADE", viewDebugLogs);
      return false;
    }
    // Indicator strategy can only have 1 trade during this "bull" cycle.
    bool? canTradeBullTrade = await CheckIndicatorIntervalOpen(userId, coin, "USDC", strategy);
    if (canTradeBullTrade == null || !canTradeBullTrade.HasValue)
    {
      _ = _log.Db($"⚠️Error fetching active trades for {coin}({strategy}). Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
    if (!canTradeBullTrade.Value)
    {
      _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) User already made a trade in this bull cycle. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      return false;
    }

    int hours = 2;
    int maxXtradesIn2Hours = await GetNumberOfTradesInLastXHours(userId, coin, strategy, hours);
    if (maxXtradesIn2Hours > _MaxTradeTypeOccurances)
    {
      _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) User has already made the maximum number of trades in the last {hours} hour{(hours > 1): 's' : ''}. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      return false;
    }

    //buy some coin then create momentum strategy.
    Dictionary<string, decimal>? balances = await GetBalance(userId, tmpCoin, strategy, keys);
    if (balances == null)
    {
      _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Failed to get wallet balances.", userId, "TRADE", viewDebugLogs);
      return false;
    }
    decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
    decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
    decimal coinToTrade = _MaximumUSDCTradeAmount / currentPrice;

    await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinToTrade), "buy", coinBalance, usdcBalance, coinPriceCAD, currentPrice, strategy, null, null);
    await AddMomentumEntry(userId, tmpCoin, "USDC", strategy, currentPrice, null);

    return true;
  }
  private async Task<bool> ExecuteDownwardsMomentumStrategy(int userId, string coin, UserKrakenApiKey keys, decimal coinPriceCAD, decimal coinPriceUSDC, decimal? firstPriceToday, decimal lastPrice, decimal spread, decimal spread2, MomentumStrategy DownwardsMomentum, string strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    decimal triggeredBySpread = Math.Abs(spread) >= _TradeThreshold ? spread : spread2;
    _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Downwards momentum strategy detected. Verifying momentum data. Current Price : {coinPriceUSDC}. Starting price: {DownwardsMomentum.StartingCoinPriceUsdc}. Best price: {DownwardsMomentum.BestCoinPriceUsdc}. Triggered by spread: {triggeredBySpread:P}", userId, "TRADE", viewDebugLogs);

    // Is spread still respected?
    if (Math.Abs(spread) >= _TradeThreshold || Math.Abs(spread2) >= _TradeThreshold)
    {
      // Threshold calculations
      decimal baseThreshold, maxThreshold;
      const decimal spreadSensitivity = 1.5m;
      const decimal volatilityFactor = 1.5m;
      const decimal volumeSpikeSensitivity = 0.7m; // Reduce threshold by 30% when volume spikes
      const decimal baseThresholdFraction = 0.025m;  // 25% of spread
      const decimal maxRetracementPercentage = 0.005m; // Base 0.5% rebound from BestCoinPriceUsdc

      // Calculate base threshold using triggered spread percentage
      baseThreshold = DownwardsMomentum.StartingCoinPriceUsdc * Math.Abs(triggeredBySpread) * baseThresholdFraction;
      decimal minThreshold = DownwardsMomentum.BestCoinPriceUsdc * 0.0005m;  // 0.05% of best price
      baseThreshold = Math.Max(baseThreshold, minThreshold);

      maxThreshold = baseThreshold * 3.0m;

      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) BaseThreshold: ${baseThreshold:F4} " +
          $"(Spread: {triggeredBySpread:P} of ${DownwardsMomentum.StartingCoinPriceUsdc:F2})",
          userId, "TRADE", viewDebugLogs);

      bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, tmpCoin, "USDC", userId);
      decimal volumeAdjustment = isVolumeSpiking ? volumeSpikeSensitivity : 1.0m;
      if (isVolumeSpiking)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Volume spike detected for {tmpCoin}. Reducing threshold sensitivity by {volumeSpikeSensitivity:P}.", userId, "TRADE", viewDebugLogs);
      }

      decimal spreadImpact = Math.Abs(triggeredBySpread) * spreadSensitivity;
      decimal volatilityImpact = (Math.Abs(triggeredBySpread) / _TradeThreshold) * volatilityFactor;
      volatilityImpact = Math.Min(volatilityImpact, 2.5m);  // Max 2.5x multiplier

      decimal dynamicThreshold = baseThreshold * Math.Max(1, spreadImpact + volatilityImpact) * volumeAdjustment;
      dynamicThreshold = Math.Min(dynamicThreshold, maxThreshold);

      // Adjust maxRetracementPercentage if 0.5% would exceed StartingCoinPriceUsdc
      decimal maxAllowableThreshold = Math.Max(0, DownwardsMomentum.StartingCoinPriceUsdc - DownwardsMomentum.BestCoinPriceUsdc);
      decimal effectiveRetracementPercentage = maxRetracementPercentage;
      if (DownwardsMomentum.BestCoinPriceUsdc * (1 + maxRetracementPercentage) > DownwardsMomentum.StartingCoinPriceUsdc)
      {
        effectiveRetracementPercentage = maxAllowableThreshold / DownwardsMomentum.BestCoinPriceUsdc;
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Adjusted retracement percentage from {maxRetracementPercentage:P} to {effectiveRetracementPercentage:P} to keep trigger at or below starting price {DownwardsMomentum.StartingCoinPriceUsdc:F2}.", userId, "TRADE", viewDebugLogs);
      }

      // Cap the dynamicThreshold to limit rebound
      decimal maxRetracement = DownwardsMomentum.BestCoinPriceUsdc * effectiveRetracementPercentage;
      decimal cappedThreshold = Math.Min(dynamicThreshold, maxRetracement);
      dynamicThreshold = Math.Min(cappedThreshold, maxThreshold);

      // Calculate buy trigger price based on BestCoinPriceUsdc, capped at StartingCoinPriceUsdc
      decimal buyTriggerBest = Math.Min(DownwardsMomentum.StartingCoinPriceUsdc, DownwardsMomentum.BestCoinPriceUsdc + dynamicThreshold);

      // Log the capping information
      if (dynamicThreshold < cappedThreshold)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Dynamic threshold capped at {dynamicThreshold:F2} to limit rebound (Max: {maxRetracement:F2}) and ensure trigger price (Best: {buyTriggerBest:F2}) does not exceed starting price {DownwardsMomentum.StartingCoinPriceUsdc:F2}.", userId, "TRADE", viewDebugLogs);
      }

      // Check if price has rebounded enough from the best (lowest) price
      bool priceAboveBest = coinPriceUSDC >= buyTriggerBest;

      // Prioritize bestTriggerPrice for downward momentum
      if (priceAboveBest)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Executing momentum entry from USDC to {tmpCoin}({strategy}): {coinPriceUSDC}. " +
               $"Trigger price: Best={buyTriggerBest:F2}. " +
               $"triggeredBySpread: {triggeredBySpread:P}, " +
               $"{(spread > 0 ? $"spread:{spread:P}" : "")} " +
               $"{(spread2 > 0 ? $"spread2:{spread2:P}" : "")}",
               userId, "TRADE", viewDebugLogs);
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Threshold ({dynamicThreshold:F2} = price needs to reach {buyTriggerBest:F2}). " +
               $"(Current:{coinPriceUSDC:F2} - Best:{DownwardsMomentum.BestCoinPriceUsdc:F2} = {coinPriceUSDC - DownwardsMomentum.BestCoinPriceUsdc:F2})",
               userId, "TRADE", viewDebugLogs);
        // Buy at this point
        var balances = await GetBalance(userId, tmpCoin, strategy, keys);
        if (balances == null)
        {
          _ = _log.Db("Failed to get wallet balances", userId, "TRADE");
          return false;
        }
        decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
        decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
        if (usdcBalance <= 0)
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Insufficient balance (Coin: {coinBalance}, USDC: {usdcBalance}). Trade Cancelled.", userId, "TRADE", viewDebugLogs);
          await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy);
          return false;
        }
        decimal usdcValueToTrade = Math.Min(usdcBalance, _MaximumUSDCTradeAmount);
        usdcValueToTrade = await AdjustToPriors(userId, tmpCoin, usdcValueToTrade, "buy", strategy);

        if (usdcValueToTrade > 0)
        {
          decimal coinAmount = usdcValueToTrade / coinPriceUSDC;
          if (coinAmount < _MinimumBTCTradeAmount)
          {
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Not enough coin to trade! coinAmount : {coinAmount} must be greater than {_MinimumBTCTradeAmount}. Review configuration if this amount is incorrect. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
            await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy);
            return false;
          }

          var spread2Message = firstPriceToday != null ? $"Spread2: {spread2:P} " : "";
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread is {spread:P} {spread2Message} (c:{coinPriceUSDC:F2}-l:{lastPrice:F2}){(firstPriceToday != null ? $" [First price today: {firstPriceToday}] " : "")}, buying {tmpCoin} with {FormatBTC(coinAmount)} {coin} worth of USDC(${usdcValueToTrade})", userId, "TRADE", viewDebugLogs);

          await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinAmount), "buy", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, null, null);
          await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy);
          return true;
        }
        else
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) ⚠️Error executing {tmpCoin} momentum strategy! usdcValueToTrade:{usdcValueToTrade} < 0. Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
          await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy);
          return false;
        }
      }
      else
      {
        await UpdateMomentumEntry(userId, tmpCoin, "USDC", tmpCoin, coinPriceUSDC, strategy);
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Threshold ({dynamicThreshold:F2} = price needs to reach {buyTriggerBest:F2}) still respected. Waiting. " +
               $"(Current:{coinPriceUSDC:F2} vs Best trigger:{buyTriggerBest:F2} = {coinPriceUSDC - buyTriggerBest:F2} away)",
               userId, "TRADE", viewDebugLogs);
        return false;
      }
    }
    else
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread (spread:{spread:P},spread2:{spread2:P}) no longer respected. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      await DeleteMomentumStrategy(userId, "USDC", tmpCoin, strategy);
      return false;
    }
  }

  private async Task<decimal> AdjustToPriors(int userId, string tmpCoin, decimal valueToTrade, string buyOrSell, string strategy)
  {
    int priorTradeCount = await GetOppositeTradeCount(userId, tmpCoin, buyOrSell, strategy, lookbackCount: 5);
    decimal adjustmentFactor = 1m;
    decimal stabilityQuotient = await CalculateStabilityQuotient(userId, tmpCoin, strategy, lookbackCount: 10);

    if (priorTradeCount > 0)
    {
      if (buyOrSell.ToLower() == "buy")
      {
        decimal adjustmentPerTrade = 0.05m; // Reduce buy amount by 5% per prior sell
        adjustmentFactor = 1m - (priorTradeCount * adjustmentPerTrade);
        adjustmentFactor = Math.Max(0.8m, adjustmentFactor); // Cap reduction at 80%

        // Linearly interpolate adjustment factor based on stability quotient
        decimal minStability = 0.3m;
        decimal maxStability = 0.8m;
        decimal minFactor = 0.3m;
        decimal maxFactor = 1.3m;

        // Linear interpolation formula: y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1)
        decimal stabilityFactor;
        if (stabilityQuotient <= minStability)
        {
          stabilityFactor = minFactor;
        }
        else if (stabilityQuotient >= maxStability)
        {
          stabilityFactor = maxFactor;
        }
        else
        {
          stabilityFactor = minFactor + ((stabilityQuotient - minStability) / (maxStability - minStability)) * (maxFactor - minFactor);
        }
        adjustmentFactor *= stabilityFactor;
        valueToTrade = valueToTrade * adjustmentFactor;

        string adjustmentDirection = adjustmentFactor > 1
          ? "Increased"
          : adjustmentFactor < 1
            ? "Reduced"
            : "Unchanged";

        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) {adjustmentDirection} buy amount to {adjustmentFactor:P0} due to {priorTradeCount} prior sells and stability quotient {stabilityQuotient:F2}. New amount: {valueToTrade}", userId, "TRADE", viewDebugLogs);
      }
      else if (buyOrSell.ToLower() == "sell")
      {
        decimal adjustmentPerTrade = 0.05m;  // Reduce sell amount by 5% per prior buy
        adjustmentFactor = 1m - (priorTradeCount * adjustmentPerTrade);
        adjustmentFactor = Math.Max(0.8m, adjustmentFactor); // Cap reduction at 20% (minimum 80% of original)
        valueToTrade = valueToTrade * adjustmentFactor;
        decimal reductionPercentage = 1m - adjustmentFactor; // Calculate the reduction percentage
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Reduced sell amount by {reductionPercentage:P0} due to {priorTradeCount} prior buys. New amount: {valueToTrade}", userId, "TRADE", viewDebugLogs);
      }
    }
    valueToTrade = Math.Max(_MinimumBTCTradeAmount, await AdjustForRetracement(userId, tmpCoin, strategy, valueToTrade, buyOrSell));

    return valueToTrade;
  }

  private async Task<decimal> CalculateStabilityQuotient(int userId, string coin, string strategy, int lookbackCount = 10)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      var query = @"
				SELECT coin_price_usdc 
				FROM trade_history
				WHERE user_id = @UserId
				AND (from_currency = @Coin OR to_currency = @Coin)
				AND strategy = @Strategy
				AND coin_price_usdc IS NOT NULL
				ORDER BY timestamp DESC
				LIMIT @LookbackCount";

      using var cmd = new MySqlCommand(query, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@Coin", tmpCoin);
      cmd.Parameters.AddWithValue("@Strategy", strategy);
      cmd.Parameters.AddWithValue("@LookbackCount", lookbackCount);

      var prices = new List<decimal>();
      using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        prices.Add(reader.GetDecimal("coin_price_usdc"));
      }

      if (prices.Count < 2)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Insufficient trade data for {tmpCoin} to calculate stability quotient", userId, "TRADE", viewDebugLogs);
        return 0.5m; // Default to moderate stability if not enough data
      }

      // Calculate percentage changes between consecutive trades
      var priceChanges = new List<decimal>();
      for (int i = 1; i < prices.Count; i++)
      {
        decimal change = (prices[i - 1] - prices[i]) / prices[i];
        priceChanges.Add(change);
      }

      // Count alternating direction changes
      int alternations = 0;
      for (int i = 1; i < priceChanges.Count; i++)
      {
        if (priceChanges[i] * priceChanges[i - 1] < 0) // Opposite signs indicate alternation
        {
          alternations++;
        }
      }

      // Calculate average magnitude of changes
      decimal avgChange = priceChanges.Select(Math.Abs).Average();

      // Stability quotient: high for many alternations and small changes
      // Ranges from 0 (highly unstable) to 1 (highly stable)
      decimal stabilityQuotient = Math.Min(1m, (decimal)alternations / (lookbackCount - 1));
      if (avgChange > 0.01m) // If average change exceeds 1%
      {
        stabilityQuotient *= 0.5m; // Reduce stability for large swings
      }

      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Calculated stability quotient for {tmpCoin}: {stabilityQuotient:F2} (alternations: {alternations}, avg change: {avgChange:P2})", userId, "TRADE", viewDebugLogs);
      return stabilityQuotient;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error calculating stability quotient for {tmpCoin}: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      return 0.5m; // Default to moderate stability on error
    }
  }
  private async Task<bool> ExecuteUpwardsMomentumStrategy(int userId, string coin, UserKrakenApiKey keys, decimal coinPriceCAD, decimal coinPriceUSDC, decimal? firstPriceToday, decimal lastPrice, decimal spread, decimal spread2, MomentumStrategy upwardsMomentum, string strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    if (strategy == "IND")
    {
      return await ExecuteUpwardsINDMomentumStrategy(userId, keys, coinPriceCAD, coinPriceUSDC, upwardsMomentum, strategy, tmpCoin, spread);
    }
    else
    {
      // Is spread still respected?
      if (Math.Abs(spread) >= _TradeThreshold || Math.Abs(spread2) >= _TradeThreshold)
      {
        decimal triggeredBySpread = Math.Abs(spread) >= _TradeThreshold ? spread : spread2;
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Upwards momentum detected. Current Price: {coinPriceUSDC}. Starting Price: {upwardsMomentum.StartingCoinPriceUsdc}. Best Price: {upwardsMomentum.BestCoinPriceUsdc}. Triggered by spread: {triggeredBySpread:P}",
          userId, "TRADE", viewDebugLogs);

        decimal baseThreshold, maxThreshold, premiumThreshold;
        const decimal spreadSensitivity = 1.5m;
        const decimal volatilityFactor = 1.5m;
        const decimal volumeSpikeSensitivity = 0.7m; // Reduce threshold by 30% when volume spikes 
        const decimal baseThresholdFraction = 0.5m;  // 50% of spread
        const decimal maxRetracementPercentage = 0.005m; // Base 0.5% retracement from BestCoinPriceUsdc

        // Calculate spread in dollar value
        decimal spreadValue = upwardsMomentum.StartingCoinPriceUsdc * _TradeThreshold;
        // Set base threshold as 50% of the spread value
        baseThreshold = baseThresholdFraction * spreadValue;
        // Ensure minimum threshold of $0.01
        baseThreshold = Math.Max(baseThreshold, 0.01m);

        maxThreshold = baseThreshold * 3.0m;
        premiumThreshold = baseThreshold * 2.0m;

        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) BaseThreshold: ${baseThreshold:F4} " +
          $"(Spread: ${spreadValue:F4} = {_TradeThreshold:P} of ${upwardsMomentum.StartingCoinPriceUsdc:F2})",
          userId, "TRADE", viewDebugLogs);

        bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, tmpCoin, "USDC", userId);
        decimal volumeAdjustment = isVolumeSpiking ? volumeSpikeSensitivity : 1.0m;
        if (isVolumeSpiking)
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Volume spike! Reducing sensitivity by {volumeSpikeSensitivity:P}",
            userId, "TRADE", viewDebugLogs);
        }

        decimal spreadImpact = Math.Abs(triggeredBySpread) * spreadSensitivity;
        decimal volatilityImpact = (Math.Abs(triggeredBySpread) / _TradeThreshold) * volatilityFactor;
        volatilityImpact = Math.Min(volatilityImpact, 2.5m); // Max 2.5x multiplier
        decimal dynamicThreshold = baseThreshold * Math.Max(1, spreadImpact + volatilityImpact) * volumeAdjustment;
        dynamicThreshold = Math.Min(dynamicThreshold, maxThreshold);

        // Adjust maxRetracementPercentage if 0.5% would fall below StartingCoinPriceUsdc
        decimal maxAllowableThreshold = Math.Max(0, upwardsMomentum.BestCoinPriceUsdc - upwardsMomentum.StartingCoinPriceUsdc);
        decimal effectiveRetracementPercentage = maxRetracementPercentage;
        if (upwardsMomentum.BestCoinPriceUsdc * (1 - maxRetracementPercentage) < upwardsMomentum.StartingCoinPriceUsdc)
        {
          effectiveRetracementPercentage = maxAllowableThreshold / upwardsMomentum.BestCoinPriceUsdc;
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Adjusted retracement percentage from {maxRetracementPercentage:P} to {effectiveRetracementPercentage:P} to keep trigger at or above starting price {upwardsMomentum.StartingCoinPriceUsdc:F2}.", userId, "TRADE", viewDebugLogs);
        }

        // Cap the dynamicThreshold to limit retracement
        decimal maxRetracement = upwardsMomentum.BestCoinPriceUsdc * effectiveRetracementPercentage;
        decimal cappedThreshold = Math.Min(dynamicThreshold, maxRetracement);
        dynamicThreshold = Math.Min(cappedThreshold, maxThreshold);

        // Calculate sell trigger price based on BestCoinPriceUsdc, capped at StartingCoinPriceUsdc
        decimal sellTriggerBest = Math.Max(upwardsMomentum.StartingCoinPriceUsdc, upwardsMomentum.BestCoinPriceUsdc - dynamicThreshold);
        if (dynamicThreshold < cappedThreshold)
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Dynamic threshold capped at {dynamicThreshold:F2} to limit retracement (Max: {maxRetracement:F2}) and ensure trigger price (Best: {sellTriggerBest:F2}) does not fall below starting price {upwardsMomentum.StartingCoinPriceUsdc:F2}.", userId, "TRADE", viewDebugLogs);
        }

        bool priceBelowBest = coinPriceUSDC <= sellTriggerBest;
        if (!priceBelowBest)
        {
          await UpdateMomentumEntry(userId, tmpCoin, tmpCoin, "USDC", coinPriceUSDC, strategy);
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Threshold ({dynamicThreshold:F8} = price needs to fall below {sellTriggerBest:F8}) still respected. " +
                 $"Waiting. (Current:{coinPriceUSDC:F8} vs Best trigger:{sellTriggerBest:F8} = {coinPriceUSDC - sellTriggerBest:F8})",
                 userId, "TRADE", viewDebugLogs);
          return false;
        }
        else
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Executing momentum sell: {coinPriceUSDC:F8}. " +
                 $"Trigger price: Best={sellTriggerBest:F8}. " +
                 $"triggeredBySpread: {triggeredBySpread:P}, " +
                 $"{(spread > 0 ? $"spread:{spread:P}" : "")} " +
                 $"{(spread2 > 0 ? $"spread2:{spread2:P}" : "")}",
                 userId, "TRADE", viewDebugLogs);

          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Threshold ({dynamicThreshold:F8} = price fell below {sellTriggerBest:F8}). " +
                 $"(Current:{coinPriceUSDC:F8} vs Best:{upwardsMomentum.BestCoinPriceUsdc:F8} = {coinPriceUSDC - upwardsMomentum.BestCoinPriceUsdc:F8})",
                 userId, "TRADE", viewDebugLogs);

          var balances = await GetBalance(userId, tmpCoin, strategy, keys);
          if (balances == null)
          {
            _ = _log.Db("Failed to get wallet balances", userId, "TRADE");
            return false;
          }
          decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
          decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) USDC Balance: {usdcBalance}; {tmpCoin} Balance: {coinBalance}", userId, "TRADE", viewDebugLogs);
          if (coinBalance <= 0)
          {
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Insufficient balance (Coin: {coinBalance}). Trade Cancelled.", userId, "TRADE", viewDebugLogs);
            await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
            return false;
          }
          decimal coinToTrade = 0;
          int? fundingTransactionId = null;
          List<TradeRecord> valueMatchingTrades = await GetProfitableOpenBuyPositionsAsync(userId, tmpCoin, strategy, coinPriceUSDC, _TradeThreshold, minimum5Hours: false);
          if (valueMatchingTrades.Count > 0)
          {
            coinToTrade = valueMatchingTrades.Sum(trade => Convert.ToDecimal(trade.value));
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Summed {valueMatchingTrades.Count} profitable open buy positions for {coinToTrade} {tmpCoin}.", userId, "TRADE", viewDebugLogs);
          }
          else
          {
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy})⚠️ No matching open positions at this depth! Looking for reserve transactions...", userId, "TRADE", viewErrorDebugLogs);
            TradeRecord? fundingTransaction = await GetLatestReservedTransaction(userId, tmpCoin, strategy, coinPriceUSDC, _TradeThreshold);
            if (fundingTransaction != null)
            {
              var isPremiumCondition = dynamicThreshold > premiumThreshold;
              if (isPremiumCondition)
              {
                coinToTrade = Convert.ToDecimal(fundingTransaction.value) * (_ReserveSellPercentage + _ValueTradePercentagePremium);
                _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) [PREMIUM SELL OPPORTUNITY] dynamicThreshold:{dynamicThreshold:F2} > {premiumThreshold:F2}. Increasing trade size by {_ValueTradePercentagePremium:P}", userId, "TRADE", viewDebugLogs);
              }
              else
              {
                coinToTrade = Convert.ToDecimal(fundingTransaction.value) * _ReserveSellPercentage;
              }
              coinToTrade = await AdjustToPriors(userId, tmpCoin, coinToTrade, "sell", strategy);
              //todo make sure it isnt less than minimum
              if (coinToTrade < _MinimumBTCTradeAmount && _MinimumBTCTradeAmount < Convert.ToDecimal(fundingTransaction.value))
              {
                coinToTrade = _MinimumBTCTradeAmount;
                _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Adjusting coin to trade to Minimum Trade amount (trade id: {fundingTransactionId}).", userId, "TRADE", viewDebugLogs);
              }
              if (coinToTrade >= _MinimumBTCTradeAmount)
              {
                fundingTransactionId = fundingTransaction.id;
                _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Using the reserves matching this trade depth (trade id: {fundingTransactionId}).", userId, "TRADE", viewDebugLogs);
              }
              else
              {
                _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Nothing to sell at this buy level. Reserves Depleted. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
                await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
                return false;
              }
            }
            else
            {
              _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No matching funding transactions at this buy level. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
              await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
              return false;
            }
          }
          coinToTrade = AdjustCoinToSell(userId, strategy, tmpCoin, coinBalance, coinToTrade);

          decimal coinValueInUsdc = coinToTrade * coinPriceUSDC;
          var spread2Message = firstPriceToday != null ? $"Spread2: {spread2:P} " : "";
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread is {spread:P}, {spread2Message}(c:{coinPriceUSDC}-l:{lastPrice}), selling {coinToTrade} {tmpCoin} for USDC ({coinValueInUsdc}) matching trade ID: {upwardsMomentum.MatchingTradeId}{(fundingTransactionId != null ? $", Funding transaction: {fundingTransactionId}" : "")}.", userId, "TRADE", viewDebugLogs);
          await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinToTrade), "sell", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, fundingTransactionId, valueMatchingTrades);
          await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
          return true;
        }
      }
      else
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread (spread:{spread:P},spread2:{spread2:P}) no longer respected. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
        return false;
      }
    }
  }

  private decimal AdjustCoinToSell(int userId, string strategy, string tmpCoin, decimal coinBalance, decimal coinToTrade)
  {
    if (Convert.ToDecimal(coinToTrade) < _MinimumBTCTradeAmount)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Trade amount:{coinToTrade} < {_MinimumBTCTradeAmount} is too small. Setting trade amount to {_MinimumBTCTradeAmount}.", userId, "TRADE", viewDebugLogs);
      coinToTrade = _MinimumBTCTradeAmount;
    }

    if (coinBalance < coinToTrade)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Coin balance ({coinBalance}) is less than coin to trade ({coinToTrade}). Equalizing CoinToTrade with balance.", userId, "TRADE", viewDebugLogs);
      coinToTrade = Math.Min(coinToTrade, coinBalance);
    }

    return coinToTrade;
  }

  private async Task<decimal> AdjustForRetracement(int userId, string fromCoin, string strategy, decimal valueToTrade, string buyOrSell)
  {
    var retracementData = await GetRetracementData(fromCoin, "USDC");

    if (retracementData == null || !retracementData.RetracementFromHigh)
    {
      return valueToTrade;
    }

    decimal retracementValue = Math.Abs(retracementData.RetracementFromHighValue); // e.g., 0.03 = 3%

    if (buyOrSell.Equals("buy", StringComparison.OrdinalIgnoreCase))
    {
      decimal adjustmentFactor = GetBuyFraction(retracementValue); ;
      _ = _log.Db($"({fromCoin}:{userId}:{strategy}) BUY ADJUST: {retracementValue:P2} retrace → {adjustmentFactor:P1} of max buy", userId);
      return valueToTrade * adjustmentFactor;
    }
    else if (buyOrSell.Equals("sell", StringComparison.OrdinalIgnoreCase))
    {
      // For now, no retracement adjustment on sells
      return valueToTrade;
    }

    return valueToTrade;
  }
  decimal GetBuyFraction(decimal retracement)
  {
    if (retracement < 0.01m) return 0m;   // No dip, no buy
    if (retracement < 0.02m) return 0.02m;
    if (retracement < 0.03m) return 0.05m;
    if (retracement < 0.05m) return 0.10m;
    if (retracement < 0.08m) return 0.20m;
    if (retracement < 0.12m) return 0.30m;
    return 1.00m; // max buy
  }
  public async Task<RetracementData?> GetRetracementData(string fromCoin, string toCoin)
  {
    string tmpFromCoin = fromCoin.ToUpper();
    string tmpToCoin = toCoin.ToUpper();
    tmpFromCoin = tmpFromCoin == "BTC" ? "XBT" : tmpFromCoin;
    tmpToCoin = tmpToCoin == "BTC" ? "XBT" : tmpToCoin;

    var sql = @"
			SELECT 
				retracement_from_high,
				retracement_from_high_value,
				updated
			FROM trade_indicators 
			WHERE from_coin = @FromCoin AND to_coin = @ToCoin
        	LIMIT 1;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@FromCoin", tmpFromCoin);
      cmd.Parameters.AddWithValue("@ToCoin", tmpToCoin);

      using var reader = await cmd.ExecuteReaderAsync();
      if (await reader.ReadAsync())
      {
        return new RetracementData
        {
          RetracementFromHigh = reader.GetBoolean(reader.GetOrdinal("retracement_from_high")),
          RetracementFromHighValue = reader.GetDecimal(reader.GetOrdinal("retracement_from_high_value")),
          LastUpdated = reader.GetDateTime(reader.GetOrdinal("updated"))
        };
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error fetching retracement data for {fromCoin}/{toCoin}: " + ex.Message, null, "TRADE", viewErrorDebugLogs);
    }
    return null;
  }

  private async Task<bool> ExecuteUpwardsINDMomentumStrategy(int userId, UserKrakenApiKey keys, decimal coinPriceCAD, decimal coinPriceUSDC, MomentumStrategy upwardsMomentum, string strategy, string tmpCoin, decimal spread)
  {
    try
    {
      if (Math.Abs(_TradeStopLossPercentage) > 0)
      {
        // Get Buy trade coin price. 
        TradeRecord? lastTrade = await GetLastTrade(userId, tmpCoin, strategy);
        if (lastTrade == null || lastTrade.value == 0 || lastTrade.matching_trade_id != null || lastTrade.from_currency != "USDC")
        {

          _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) ⚠️ Error, last trade does not exist, was not a buy trade or from_currency was not USDC during UpwardsMomentumStrategy.", userId, "TRADE", viewErrorDebugLogs);
          return false;
        }
        decimal lastTradeCoinPriceUSD = Convert.ToDecimal(lastTrade.coin_price_usdc);
        if (lastTradeCoinPriceUSD == 0)
        {
          _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) ⚠️ Error, last trade {tmpCoin} USD price does not exist during UpwardsMomentumStrategy.", userId, "TRADE", viewErrorDebugLogs);
          return false;
        }

        decimal stopLossPercentage = _TradeStopLossPercentage / 100; // e.g., 0.5 / 100 = 0.005 (0.5%)
        decimal stopLossAmount = lastTradeCoinPriceUSD * stopLossPercentage; // Dollar amount of loss
        decimal stopLossPrice = lastTradeCoinPriceUSD - stopLossAmount; // Price at which to trigger stop-loss

        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Stop Loss Verification: " +
                     $"Current: {coinPriceUSDC:F2} ({spread:P})$, " +
                     $"Stop Loss Trigger: {stopLossPrice:F2}$ ({_TradeStopLossPercentage:F2}% below buy price {lastTradeCoinPriceUSD:F2}$)",
                     userId, "TRADE", viewDebugLogs);
        // Verifying Trade StopLoss percentage threshold
        if (coinPriceUSDC < stopLossPrice)
        {
          _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Stop Loss Triggered: " +
                         $"Current ({coinPriceUSDC:F2}$) fell below stop price {stopLossPrice:F2}$ " +
                         $"(bought at {lastTradeCoinPriceUSD:F2}$). Exiting position.",
                         userId, "TRADE", viewDebugLogs);
          // Sell lastTrade.amount worth of tmpCoin for USDC. Set Matching Trade ID. Delete Momentum Strategy.
          var balances = await GetBalance(userId, tmpCoin, strategy, keys);
          if (balances == null)
          {
            _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Failed to get wallet balances", userId, "TRADE", viewDebugLogs);
            return false;
          }
          decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
          decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
          _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Executing trade. USDC Balance: " + usdcBalance + "; Btc Balance: " + coinBalance, userId, "TRADE", viewDebugLogs);
          await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(Convert.ToDecimal(lastTrade.value)), "sell", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, lastTrade.id, null);
          await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
          return true;
        }

        // Verify price movement.
        if (coinPriceUSDC > upwardsMomentum.BestCoinPriceUsdc)
        {
          await UpdateMomentumEntry(userId, tmpCoin, tmpCoin, "USDC", coinPriceUSDC, strategy);
          //_ = _log.Db($"Updated momentum entry from {tmpCoin}({strategy}) to USDC: {coinPriceUSDC:F2}. triggeredBySpread: {triggeredBySpread:P}, {(spread > 0 ? $"spread:{spread:P}" : "")} {(spread2 > 0 ? $"spread2:{spread2:P}" : "")}", userId, "TRADE", viewDebugLogs);
          _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Price still rising. " +
                        $"Updated best price from {upwardsMomentum.BestCoinPriceUsdc:F2}$ to {coinPriceUSDC:F2}$. " +
                        $"Waiting for downward movement.",
                        userId, "TRADE", viewDebugLogs);
          return false;
        }
        else
        {
          //First check if above trade threshold.
          decimal indSpread = (coinPriceUSDC - Convert.ToDecimal(lastTrade.coin_price_usdc)) / Convert.ToDecimal(lastTrade.coin_price_usdc);
          if (indSpread > _TradeThreshold)
          {
            _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Profit threshold surpassed. " +
                           $"Current profit: {indSpread:P} (threshold: {_TradeThreshold:P}). " +
                           $"Verifying dynamic exit conditions.",
                           userId, "TRADE", viewDebugLogs);

            var balances = await GetBalance(userId, tmpCoin, strategy, keys);
            if (balances == null)
            {
              _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Failed to get wallet balances. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
              return false;
            }
            decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
            decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");

            _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Exit Condition Met: " +
                              $"USDC Balance: {usdcBalance}; Btc Balance: {coinBalance}" +
                              $"Executing sell order.",
                              userId, "TRADE", viewDebugLogs);
            await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(Convert.ToDecimal(lastTrade.value)), "sell", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, lastTrade.id, null);
            await DeleteMomentumStrategy(userId, tmpCoin, "USDC", strategy);
            return true;
          }
          else
          {
            _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Profit Threshold Not Met: " +
                            $"Current profit {indSpread:P}. Below minimum threshold: {_TradeThreshold:P}. " +
                            $"Bought at {lastTradeCoinPriceUSD:F2}$, current {coinPriceUSDC:F2}$.",
                            userId, "TRADE", viewDebugLogs);
            return false;
          }
        }
      }
      else
      {
        _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) No stoploss detected. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) ⚠️ Exception while doing Upwards Momentum Strategy! Trade Cancelled. " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
    return false;
  }

  private async Task<bool> ValidateTrade(int userId, string coin, string from, string to, string buyOrSell, decimal usdcBalance, decimal coinBalance, string strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    //_ = _log.Db($"({tmpCoin}:{userId}:{strategy}) ValidateTrade from:{from}, to: {to}, {buyOrSell}, usdcBalance:{usdcBalance}, coinToTrade:{coinToTrade}.", userId, "TRADE", viewDebugLogs);

    try
    {
      if (buyOrSell.ToLower() == "buy" && _MaximumBTCBalance > 0 && coinBalance >= _MaximumBTCBalance)
      {
        if (coinBalance > _MaximumBTCBalance)
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User has too much {tmpCoin} ({coinBalance} / {_MaximumBTCBalance}) in their wallet. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
          return false;
        }
        else
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User maximum allowed {tmpCoin} balance ({coinBalance} / {_MaximumBTCBalance}) verified.", userId, "TRADE", viewDebugLogs);
        }
      }

      int numberOfTradesToday = await NumberOfTradesToday(userId, from, strategy);
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User has traded {tmpCoin} {numberOfTradesToday} times today.", userId, "TRADE", viewDebugLogs);

      if (strategy != "HFT" && buyOrSell.ToLower() == "buy")
      {
        bool isVolumeSpiking = await IsSignificantVolumeSpike(tmpCoin, from, to, userId);
        int tradeRange = (buyOrSell.ToLower() == "buy" && isVolumeSpiking) ? _VolumeSpikeMaxTradeOccurance : _MaxTradeTypeOccurances;
        bool isRepeatedTrades = await IsRepeatedTradesInRange(userId, from, to, buyOrSell.ToLower(), strategy, tradeRange);
        if (isRepeatedTrades && numberOfTradesToday > 0)
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) [ConsecutiveCheck] User has {buyOrSell} {from} {to} too many times in the last {tradeRange} trades (Based on {tmpCoin}/USDC reserves{(isVolumeSpiking ? " and volume spike" : "")}). ({strategy})Trade Cancelled.", userId, "TRADE", viewDebugLogs);
          return false;
        }

        bool withinTradeSequenceLimit = await CheckTradeFrequencyOccurance(userId, buyOrSell.ToLower(), strategy, _MaxTradeTypeOccurances);
        if (!withinTradeSequenceLimit && numberOfTradesToday > 0)
        {
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User has {buyOrSell} {from} {to} too frequently ({_MaxTradeTypeOccurances - 1}) in the last {_MaxTradeTypeOccurances} occurances. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
          return false;
        }
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️({tmpCoin}:{userId}:{strategy}) Exception while validating trade! Trade Cancelled. " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    return true;
  }
  private async Task<Dictionary<string, decimal>?> GetBalanceFromDatabase(int userId, string coin, string strategy)
  {
    _ = _log.Db($"({coin}:{userId}:{strategy}) Getting balance from database for {coin} (strategy: {strategy}).", userId, "TRADE", viewDebugLogs);

    if (string.IsNullOrEmpty(coin))
    {
      _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️ERROR: Coin parameter is null or empty.", userId, "TRADE", viewErrorDebugLogs);
      return null;
    }

    // Normalize input coin to Kraken's format
    string krakenCoin = GetKrakenCoinName(coin);

    if (!CoinMappingsForDB.TryGetValue(krakenCoin, out var checkSuffix))
    {
      _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️ERROR: No mapping found for coin: {krakenCoin}", userId, "TRADE", viewErrorDebugLogs);
      return null;
    }

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Define supported coins and their Kraken symbols and table suffixes
      var supportedCoins = new Dictionary<string, string>
      {
        { "XXBT", CoinMappingsForDB.GetValueOrDefault("XXBT", "btc") },
        { "XETH", CoinMappingsForDB.GetValueOrDefault("XETH", "eth") },
        { "XXRP", CoinMappingsForDB.GetValueOrDefault("XXRP", "xrp") },
        { "SOL", CoinMappingsForDB.GetValueOrDefault("SOL", "sol") },
        { "XXDG", CoinMappingsForDB.GetValueOrDefault("XXDG", "xdg") },
        { "USDC", CoinMappingsForDB.GetValueOrDefault("USDC", "usdc") }
      };

      // Define SQL templates
      const string walletSqlTemplate = "SELECT id FROM user_{0}_wallet_info WHERE {0}_address = 'Kraken' AND user_id = @UserId;";
      const string balanceCheckSqlTemplate = @"
				SELECT fetched_at FROM user_{0}_wallet_balance 
				WHERE wallet_id = @WalletId ORDER BY fetched_at DESC LIMIT 1;";
      const string balanceSqlTemplate = @"
				SELECT balance FROM user_{0}_wallet_balance 
				WHERE wallet_id = @WalletId ORDER BY fetched_at DESC LIMIT 1;";

      var balanceDictionary = new Dictionary<string, decimal>();

      // Check freshness and fetch balances for all supported coins
      foreach (var (krakenSymbol, tableSuffix) in supportedCoins)
      {
        // Skip if table suffix is not defined
        if (string.IsNullOrEmpty(tableSuffix))
        {
          _ = _log.Db($"({coin}:{userId}:{strategy}) No table suffix for coin: {krakenSymbol}", userId, "TRADE", viewDebugLogs);
          return null;
        }

        // Get wallet ID
        var walletSql = string.Format(walletSqlTemplate, tableSuffix);
        int walletId;
        using (var cmd = new MySqlCommand(walletSql, conn))
        {
          cmd.Parameters.AddWithValue("@UserId", userId);
          var walletIdObj = await cmd.ExecuteScalarAsync();
          if (walletIdObj == null || walletIdObj == DBNull.Value)
          {
            // _ = _log.Db($"({coin}:{userId}) No wallet found for coin: {tableSuffix}", userId, "TRADE", viewDebugLogs);
            return null;
          }
          walletId = Convert.ToInt32(walletIdObj);
        }

        // Check freshness
        var balanceCheckSql = string.Format(balanceCheckSqlTemplate, tableSuffix);
        using (var checkCmd = new MySqlCommand(balanceCheckSql, conn))
        {
          checkCmd.Parameters.AddWithValue("@WalletId", walletId);
          var fetchedAtObj = await checkCmd.ExecuteScalarAsync();
          if (fetchedAtObj == null || fetchedAtObj == DBNull.Value)
          {
            _ = _log.Db($"({coin}:{userId}:{strategy}) No recent balance found for coin: {krakenSymbol}", userId, "TRADE", viewDebugLogs);
            return null;
          }
          DateTime fetchedAt = Convert.ToDateTime(fetchedAtObj);
          if (fetchedAt < DateTime.UtcNow.AddSeconds(-10))
          {
            //_ = _log.Db($"({coin}:{userId}) Balance for {krakenSymbol} is older than 10 seconds.", userId, "TRADE", viewDebugLogs);
            return null;
          }
          else
          {
            //_ = _log.Db($"({coin}:{userId}) Balance for {krakenSymbol} is fresh: {fetchedAt}.", userId, "TRADE", viewDebugLogs); 
          }
        }

        // Fetch balance
        var balanceSql = string.Format(balanceSqlTemplate, tableSuffix);
        using (var balanceCmd = new MySqlCommand(balanceSql, conn))
        {
          balanceCmd.Parameters.AddWithValue("@WalletId", walletId);
          var balanceObj = await balanceCmd.ExecuteScalarAsync();
          if (balanceObj == null || balanceObj == DBNull.Value)
          {
            _ = _log.Db($"({coin}:{userId}:{strategy}) No balance found for coin: {krakenSymbol}", userId, "TRADE", viewDebugLogs);
            return null;
          }
          decimal balance = Convert.ToDecimal(balanceObj);
          balanceDictionary[krakenSymbol] = balance;
        }
      }

      balanceDictionary[krakenCoin] = await ComputeStrategyCoinBalance(userId, strategy, coin, conn);

      // If the input coin isn't in the supported list, add it with zero balance to mimic Kraken
      if (!balanceDictionary.ContainsKey(krakenCoin))
      {
        balanceDictionary[krakenCoin] = 0;
      }

      return balanceDictionary;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️Error fetching balance from DB: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
  }
  private async Task<Decimal> ComputeStrategyCoinBalance(int userId, string strategy, string coin, MySqlConnection conn)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    if (coin != "USDC" && !string.IsNullOrEmpty(strategy))
    {
      const string reservedSql = @"
					SELECT SUM(r.value - IFNULL(m.matched_sum, 0)) AS reserved_available
					FROM trade_history r
					LEFT JOIN (
						SELECT matching_trade_id, SUM(value) as matched_sum
						FROM trade_history
						WHERE strategy = @strategy
						GROUP BY matching_trade_id
					) m ON r.id = m.matching_trade_id
					WHERE r.user_id = @userId AND r.strategy = @strategy AND r.is_reserved = 1 
					AND r.from_currency = 'USDC' AND r.to_currency = @coin;";

      using (var reservedCmd = new MySqlCommand(reservedSql, conn))
      {
        reservedCmd.Parameters.AddWithValue("@userId", userId);
        reservedCmd.Parameters.AddWithValue("@strategy", strategy);
        reservedCmd.Parameters.AddWithValue("@coin", tmpCoin);  // Use original coin param (e.g., "XBT")

        var reservedObj = await reservedCmd.ExecuteScalarAsync();
        decimal reservedAvailable = reservedObj != null && reservedObj != DBNull.Value ? Convert.ToDecimal(reservedObj) : 0m;

        // Compute open non-reserved
        const string openSql = @"
						SELECT SUM(value) AS open_non_reserved
						FROM trade_history
						WHERE user_id = @userId AND strategy = @strategy AND is_reserved = 0 
						AND matching_trade_id IS NULL AND from_currency = 'USDC' AND to_currency = @coin;";

        using (var openCmd = new MySqlCommand(openSql, conn))
        {
          openCmd.Parameters.AddWithValue("@userId", userId);
          openCmd.Parameters.AddWithValue("@strategy", strategy);
          openCmd.Parameters.AddWithValue("@coin", tmpCoin);

          var openObj = await openCmd.ExecuteScalarAsync();
          decimal openNonReserved = openObj != null && openObj != DBNull.Value ? Convert.ToDecimal(openObj) : 0m;

          // Override the coin's balance
          decimal coinComputed = reservedAvailable + openNonReserved;
          _ = _log.Db($"({coin}:{userId}:{strategy}) Computed strategy-specific balance: Reserved={reservedAvailable}, Open={openNonReserved}, Total={coinComputed}", userId, "TRADE", viewDebugLogs);
          return coinComputed;
        }
      }
    }
    return 0;
  }
  public async Task<Dictionary<string, decimal>?> GetBalance(int userId, string coin, string strategy, UserKrakenApiKey keys)
  {
    try
    {
      Dictionary<string, decimal>? dbBalance = await GetBalanceFromDatabase(userId, coin, strategy);
      if (dbBalance != null)
      {
        _ = _log.Db($"({coin}:{userId}:{strategy}) Returned cached balance from database.", userId, "TRADE", viewDebugLogs);
        return dbBalance;
      }
      // Fetch the balance response as a dictionary
      var balanceResponse = await MakeRequestAsync(userId, keys, "/Balance", "private", new Dictionary<string, string>());

      // Check if the response contains the "result" key
      if (balanceResponse == null || !balanceResponse.ContainsKey("result"))
      {
        _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️Failed to get wallet balances: 'result' not found.", userId, "TRADE", viewErrorDebugLogs);
        return null;
      }

      // Extract the result part of the response
      var result = (JObject)balanceResponse["result"];

      // Convert the result into a Dictionary<string, decimal> to store the balances
      Dictionary<string, decimal>? balanceDictionary = result.ToObject<Dictionary<string, decimal>>();
      if (balanceDictionary == null)
      {
        _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️Failed to convert balance response to dictionary.", userId, "TRADE", viewErrorDebugLogs);
        return null;
      }
      //_ = _log.Db(string.Join(Environment.NewLine, balanceDictionary.Select(x => $"{x.Key}: {x.Value}")), userId, "TRADE", viewDebugLogs);
      _ = CreateWalletEntriesFromFetchedDictionary(balanceDictionary, userId);
      string krakenCoin = GetKrakenCoinName(coin);

      if (krakenCoin != "USDC" && !string.IsNullOrEmpty(strategy))
      {
        try
        {
          using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
          await conn.OpenAsync();
          decimal strategyCoin = await ComputeStrategyCoinBalance(userId, strategy, coin, conn);
          decimal totalCoin = GetCoinBalanceFromDictionaryAndKey(balanceDictionary, coin);
          balanceDictionary[krakenCoin] = Math.Min(totalCoin, strategyCoin);
          //_ = _log.Db($"({coin}:{userId}:{strategy}) All: {string.Join(", ", balanceDictionary.Select(kvp => $"{kvp.Key}={kvp.Value:F8}"))}", userId, "TRADE", viewDebugLogs);
          _ = _log.Db($"({coin}:{userId}:{strategy}) Computed strategy-specific balance after Kraken fetch: {strategyCoin}, Total: {totalCoin}, Using: {balanceDictionary[krakenCoin]}", userId, "TRADE", viewDebugLogs);
        }
        catch (Exception ex)
        {
          _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️ERROR GetBalance: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
        }
      }
      return balanceDictionary;
    }
    catch (Exception ex)
    {
      // Handle any errors that occur during the request
      _ = _log.Db($"({coin}:{userId}:{strategy}) ⚠️Error fetching balance: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
  }

  private static string GetKrakenCoinName(string coin)
  {
    string krakenCoin;
    switch (coin.ToUpper())
    {
      case "BTC":
      case "XBT":
        krakenCoin = "XXBT";
        break;
      case "ETH":
        krakenCoin = "XETH";
        break;
      case "XRP":
        krakenCoin = "XXRP";
        break;
      case "SOL":
        krakenCoin = "SOL";
        break;
      case "XDG":
        krakenCoin = "XXDG";
        break;
      case "USDC":
        krakenCoin = "USDC";
        break;
      default:
        krakenCoin = coin.StartsWith("X") ? coin : $"X{coin}";
        break;
    }

    return krakenCoin;
  }

  private async Task<bool> CreateCoinReserveWithUSDC(int userId, string coin, string strategy, UserKrakenApiKey keys, decimal coinBalance, decimal usdcBalance, decimal coinPriceCAD, decimal coinPriceUSDC)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

    _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Creating reserve ({tmpCoin}: {coinBalance}, USDC: {usdcBalance})", userId, "TRADE", viewDebugLogs);
    if (usdcBalance > _CoinReserveUSDCValue && _CoinReserveUSDCValue > 0)
    {
      decimal amount = _CoinReserveUSDCValue / coinPriceUSDC;
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Starting user off with some {amount} ({_CoinReserveUSDCValue}$USDC) {tmpCoin} reserves", userId, "TRADE", viewDebugLogs);
      await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(amount), "buy", coinBalance, usdcBalance, coinPriceCAD, coinPriceUSDC, strategy, null, null, true);
    }
    else
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) ⚠️Not enough USDC to trade({strategy}) ({usdcBalance}<{_CoinReserveUSDCValue})", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
    return true;
  }

  private async Task ExecuteTrade(int userId, string coin, UserKrakenApiKey keys, string amount, string buyOrSell, decimal coinBalance, decimal usdcBalance, decimal coinPriceCAD, decimal coinPriceUSDC, string strategy, int? matchingTradeId, List<TradeRecord>? matchingTradeRecords, bool isReserved = false)
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

    _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) Executing trade: {buyOrSell} {from}->{to}/{amount}", userId, "TRADE", viewDebugLogs);
    Dictionary<string, Object>? response = await MakeRequestAsync(userId, keys, "/AddOrder", "private", parameters);
    if (response == null)
    {
      _ = _log.Db($"({tmpCoin.Replace("BTC", "XBT")}:{userId}:{strategy}) ⚠️ ERROR Executing trade: {buyOrSell} {from}->{to}/{amount}. Verify configuration.", userId, "TRADE", viewErrorDebugLogs);
    }
    else
    {
      await GetOrderResults(userId, keys, amount, from, to, response);
      await SaveTradeFootprint(userId, from, to, amount, coinPriceCAD, coinPriceUSDC, buyOrSell, coinBalance, usdcBalance, strategy, matchingTradeId, matchingTradeRecords, isReserved);
    }
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
      _ = _log.Db($"Order status: {statusResponse}", userId, "TRADE", viewDebugLogs);
      if (statusResponse != null)
      {
        if (statusResponse["status"]?.ToString() == "closed")
        {
          _ = _log.Db($"Trade successful: {from}->{to}/{amount}", userId, "TRADE", viewDebugLogs);
        }
        else
        {
          _ = _log.Db("Trade response: " + statusResponse["status"], userId, "TRADE", viewDebugLogs);
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
      var verifySql = @"SELECT user_id, fees FROM trade_history WHERE id = @tradeId LIMIT 1;";
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
        _ = _log.Db($"{logPrefix}: Trade ID {tradeId} not found", userId, "TRADE", viewDebugLogs);
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
					id = @tradeId
				LIMIT 1;";


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
        userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
  }
  public async Task<bool?> UpdateFees(int userId, string coin, UserKrakenApiKey keys, string strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    if (_userLastCheckTimes.TryGetValue(userId, out var lastCheckTime))
    {
      if (DateTime.UtcNow - lastCheckTime < _rateLimitDuration)
      {
        //_ = _log.Db($"Rate limit hit for fee update check (user {userId})", userId, "TRADE", viewDebugLogs);
        return false;
      }
    }

    bool updated = false;

    // 0. First check if there are any trades needing fee updates (top 20 recent trades)
    bool hasMissingFees = await CheckForMissingFees(userId, tmpCoin, strategy);
    if (!hasMissingFees)
    {
      updated = await ApplyFallbackFee(userId, tmpCoin, strategy);
      if (!updated)
      {
        // _ = _log.Db($"No trades with missing fees found for {tmpCoin}", userId, "TRADE", viewDebugLogs);
        return false; // No work needed
      }
      return updated;
    }
    try
    {
      _userLastCheckTimes.AddOrUpdate(userId, DateTime.UtcNow, (id, oldTime) => DateTime.UtcNow);

      // 1. Get all trades from Kraken for both XBTUSDC and USDCXBT pairs
      var krakenTradesBuySide = await GetUserTradesFromKraken(userId, keys, $"{tmpCoin}USDC");
      if (krakenTradesBuySide == null || krakenTradesBuySide.Count == 0) return null;
      var krakenTradesSellSide = await GetUserTradesFromKraken(userId, keys, $"USDC{tmpCoin}");

      // Combine both sets of trades
      var allKrakenTrades = krakenTradesBuySide.Concat(krakenTradesSellSide).ToList();
      var today = DateTime.UtcNow.Date;
      var yesterday = today.AddDays(-1);
      allKrakenTrades = allKrakenTrades.Where(x =>
        x.Timestamp.Date == today ||
        x.Timestamp.Date == yesterday)
      .ToList();
      // 2. Get trades from our database that are missing fees
      var allTradesHistory = await GetTradeHistory(userId, tmpCoin, strategy);
      var allTrades = allTradesHistory.Trades?.Where(x => x.timestamp.Date == today ||
        x.timestamp.Date == yesterday).ToList();
      // 3. Match and update
      if (allTrades != null)
      {
        foreach (var dbTrade in allTrades)
        {
          if (dbTrade.fees == 0)
          {
            var matchingTrade = FindMatchingKrakenTrade(tmpCoin, allKrakenTrades, dbTrade);
            if (matchingTrade != null)
            {
              await UpdateTradeFee(dbTrade.id, matchingTrade.Fee, matchingTrade.Price, userId);
              updated = true;
            }
            else if (dbTrade.timestamp <= DateTime.UtcNow.AddMinutes(-10))
            {
              // Apply 0.40% fee for trades older than 10 minutes
              float fallbackFee = (float)Convert.ToDecimal(dbTrade.value * dbTrade.coin_price_usdc * 0.004);
              await UpdateTradeFee(dbTrade.id, fallbackFee, Convert.ToDecimal(dbTrade.coin_price_usdc), userId);
              updated = true;
            }
          }
        }
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error updating {tmpCoin} missing fees: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      updated = await ApplyFallbackFee(userId, tmpCoin, strategy);
      return updated ? true : null;
    }
    return updated;
  }
  private async Task<bool> ApplyFallbackFee(int userId, string coin, string strategy)
  {
    const string sql = @"
			UPDATE trade_history 
			SET fees = (value * coin_price_usdc * 0.004), 
				fee_updated_at = NOW()
			WHERE user_id = @UserId 
			AND (from_currency = @Coin OR to_currency = @Coin)
			AND strategy = @Strategy
			AND (fees IS NULL OR fees = 0)
			AND timestamp <= NOW() - INTERVAL 10 MINUTE
			AND timestamp >= NOW() - INTERVAL 3 DAY";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@Coin", coin);
      cmd.Parameters.AddWithValue("@Strategy", strategy);

      int rowsAffected = await cmd.ExecuteNonQueryAsync();
      if (rowsAffected > 0)
      {
        _ = _log.Db($"Applied fallback 0.40% fee to {rowsAffected} trades for {coin}", userId, "TRADE", viewDebugLogs);
        return true;
      }
      return false;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error applying fallback fee for {coin}: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
  }
  private async Task<List<KrakenTrade>> GetUserTradesFromKraken(int userId, UserKrakenApiKey keys, string pair)
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
              _ = _log.Db($"Failed to parse timestamp for trade {trade.Key}", userId, "TRADE", viewDebugLogs);
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

    //_ = _log.Db($"No matching {tmpCoin} Kraken trade found", dbTrade.user_id, "TRADE", viewDebugLogs);
    return null;
  }

  private async Task<bool> SaveTradeFootprint(int userId, string from, string to, string amount,
    decimal coinPriceCad, decimal coinPriceUSDC, string buyOrSell,
    decimal coinBalance, decimal usdcBalance, string strategy, int? matchingTradeId, List<TradeRecord>? matchingTradeRecords,
    bool isReserved)
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
    try
    {
      await CreateTradeHistory(coinPriceCad, coinPriceUSDC, amount, userId, tmpFrom, tmpTo, coinBalance, usdcBalance, strategy, matchingTradeId, matchingTradeRecords, isReserved);
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpFrom}:{userId}:{strategy}) ⚠️Error SaveTradeFootprint: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    return true;
  }
  private async Task<bool> InvalidateTrades(int userId, string coin, string? strategy)
  {
    var checkSql = $@"
			UPDATE maxhanna.trade_history
			SET matching_trade_id = 16
			WHERE user_id = @UserId 
			AND (from_currency = @Coin OR to_currency = @Coin)
			{(!string.IsNullOrEmpty(strategy) ? " AND strategy = @Strategy " : "")}
			AND matching_trade_id IS NULL;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var checkCmd = new MySqlCommand(checkSql, conn);
      checkCmd.Parameters.AddWithValue("@UserId", userId);
      checkCmd.Parameters.AddWithValue("@Coin", coin);
      if (!string.IsNullOrEmpty(strategy))
      {
        checkCmd.Parameters.AddWithValue("@Strategy", strategy);
      }

      int affectedRows = await checkCmd.ExecuteNonQueryAsync();

      return affectedRows > 0;
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Error Invalidating Trades: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false; // Default action in case of error.
    }
  }
  public async Task<List<int>> GetActiveTradeBotUsers(string type, string strategy, MySqlConnection? conn = null)
  {
    bool shouldDisposeConnection = conn == null;
    var activeUsers = new List<int>();
    string tmpType = type.ToLowerInvariant();
    tmpType = tmpType == "xbt" ? "btc" : tmpType;

    if (string.IsNullOrWhiteSpace(tmpType))
    {
      return activeUsers;
    }

    string sql = @"
			SELECT u.id
			FROM users u
			JOIN trade_bot_status tbs 
				ON u.id = tbs.user_id 
				AND tbs.coin = @Coin 
				AND tbs.is_running = 1 
				AND tbs.strategy = @Strategy
			JOIN user_kraken_api_keys ukak 
				ON u.id = ukak.user_id
			WHERE ukak.api_key IS NOT NULL 
				AND ukak.api_key != ''
				AND ukak.private_key IS NOT NULL 
				AND ukak.private_key != '';";

    try
    {
      conn ??= new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      if (conn.State != System.Data.ConnectionState.Open)
      {
        await conn.OpenAsync();
      }

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@Coin", tmpType);
      cmd.Parameters.AddWithValue("@Strategy", strategy);

      using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        activeUsers.Add(reader.GetInt32("id"));
      }

      _ = _log.Db($"✅ Found {activeUsers.Count} active trade bot users for '{tmpType}' and strategy '{strategy}'");
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️ Error fetching active trade bot users: {ex.Message}");
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

      int count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

      //_ = _log.Db($"({tmpCoin}:{userId}:{strategy}) [ActiveTradeCount] Count={count}", userId, "TRADE", viewDebugLogs);
      return count;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) ⚠️Error at [ActiveTradeCount]: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
  }
  private async Task<int> NumberOfTradesToday(int userId, string from, string strategy)
  {
    var checkSql = @"
			SELECT COUNT(*) 
			FROM maxhanna.trade_history
			WHERE user_id = @UserId 
			AND strategy = @Strategy
			AND (from_currency = @FromCurrency OR to_currency = @FromCurrency)
			AND timestamp >= UTC_DATE()
			AND timestamp <  UTC_DATE() + INTERVAL 1 DAY;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var checkCmd = new MySqlCommand(checkSql, conn);
      checkCmd.Parameters.AddWithValue("@UserId", userId);
      checkCmd.Parameters.AddWithValue("@Strategy", strategy);
      checkCmd.Parameters.AddWithValue("@FromCurrency", from);

      var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());

      //bool result = count >= threshold;
      //_ = _log.Db($"[RepeatingTradesCheck] Today's ({strategy}) {buyOrSell} {from}/{to} count={count}, Threshold={threshold}, Result={result}", userId, "TRADE", viewDebugLogs);
      return count;
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Error at [RepeatingTradesCheck]: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return 0;
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
			AND (from_currency = @Coin OR to_currency = @Coin)
			AND strategy = @Strategy
			ORDER BY timestamp DESC
			LIMIT @Range;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var checkCmd = new MySqlCommand(checkSql, conn);
      checkCmd.Parameters.AddWithValue("@UserId", userId);
      checkCmd.Parameters.AddWithValue("@Coin", from);
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
          //_ = _log.Db($"[ConsecutiveCheck] Mismatch at position {count}: Expected {expectedFrom}, Got {actualFrom}", userId, "TRADE", viewDebugLogs);
          return false;
        }
        count++;
      }

      // Only return true if we got enough matches
      bool result = (count == range);
      _ = _log.Db($"[ConsecutiveCheck] Consecutive Matches={count}, Range={range}, Result={result}, Strategy={strategy}", userId, "TRADE", viewDebugLogs);
      return result;
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Error checking consecutive trades: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return true; // Fail safe: prevent trade
    }
  }


  private async Task CreateTradeHistory(decimal currentCoinPriceInCAD, decimal currentCoinPriceInUSDC, string amount, int userId,
    string from, string to, decimal coinBalance, decimal usdcBalance, string strategy, int? matchingTradeId,
    List<TradeRecord>? matchingTradeRecords, bool isReserved)
  {
    string tmpCoin = from.Replace("BTC", "XBT");
    if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to) || string.IsNullOrEmpty(amount) || string.IsNullOrEmpty(strategy))
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Invalid input parameters: from={from}, to={to}, amount={amount}, strategy={strategy}", userId, "TRADE", viewDebugLogs);
      return;
    }

    // Validate configuration
    if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Configuration or connection string is missing.", userId, "TRADE", viewDebugLogs);
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
			INSERT INTO maxhanna.trade_history (user_id, from_currency, to_currency, value, timestamp, coin_price_cad, coin_price_usdc, coin_balance, usdc_balance, is_reserved, strategy{(matchingTradeId != null && !isReserved ? ", matching_trade_id" : "")}) 
			VALUES (@UserId, @From, @To, @Value, UTC_TIMESTAMP(), @CoinValueCad, @CoinValueUSDC, @CoinBalance, @UsdcBalance, @IsReserved, @Strategy{(matchingTradeId != null && !isReserved ? ", @MatchingTradeId" : "")});
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
      insertCmd.Parameters.Add("@IsReserved", MySqlDbType.Bool).Value = isReserved;
      if (matchingTradeId != null && !isReserved)
      {
        insertCmd.Parameters.Add("@MatchingTradeId", MySqlDbType.Int32).Value = matchingTradeId;
      }

      var newTradeId = await insertCmd.ExecuteScalarAsync();
      if (newTradeId != null && newTradeId != DBNull.Value)
      {
        int newId = Convert.ToInt32(newTradeId);
        string tmpFrom = from == "USDC" ? to : from;
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Created trade history with ID {newId}, pair {from}/{to}, coin_price_cad={adjustedCoinPriceInCAD}.", userId, "TRADE", viewDebugLogs);
        bool setMatchingId = false;
        // If there's a matching trade ID, update the original trade's matching_trade_id
        if (matchingTradeId != null)
        {
          const string updateSql = @"
						UPDATE maxhanna.trade_history 
						SET matching_trade_id = @NewTradeId 
						WHERE id = @MatchingTradeId 
						AND is_reserved = 0
						LIMIT 1;";
          await using var updateCmd = new MySqlCommand(updateSql, conn);
          updateCmd.Parameters.Add("@NewTradeId", MySqlDbType.Int32).Value = newId;
          updateCmd.Parameters.Add("@MatchingTradeId", MySqlDbType.Int32).Value = matchingTradeId;
          await updateCmd.ExecuteNonQueryAsync();
          setMatchingId = true;
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Updated trade ID {matchingTradeId} with matching_trade_id {newId}.", userId, "TRADE", viewDebugLogs);
        }
        if (!setMatchingId && matchingTradeRecords != null && matchingTradeRecords.Count > 0)
        {
          if (matchingTradeRecords.Any())
          {
            var matchingTradeIds = matchingTradeRecords.Select(record => record.id).ToList();
            var paramPlaceholders = string.Join(",", matchingTradeIds.Select((_, i) => $"@TradeId{i}"));

            string updateSql = $@"
							UPDATE maxhanna.trade_history 
							SET matching_trade_id = @NewTradeId 
							WHERE id IN ({paramPlaceholders}) 
							AND is_reserved = 0;";

            await using var updateCmd = new MySqlCommand(updateSql, conn);
            updateCmd.Parameters.AddWithValue("@NewTradeId", newId);
            for (int i = 0; i < matchingTradeIds.Count; i++)
            {
              updateCmd.Parameters.AddWithValue($"@TradeId{i}", matchingTradeIds[i]);
            }

            int rowsAffected = await updateCmd.ExecuteNonQueryAsync();
            _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Updated {rowsAffected} trade IDs ({string.Join(", ", matchingTradeIds)}) with matching_trade_id {newId}.", userId, "TRADE", viewDebugLogs);
          }
          const string updateOriginalTradeSQL = @"
						UPDATE maxhanna.trade_history 
						SET matching_trade_id = @MatchingTradeId 
						WHERE id = @NewTradeId AND is_reserved = 0;";
          await using var updateOriginalTradeCmd = new MySqlCommand(updateOriginalTradeSQL, conn);
          updateOriginalTradeCmd.Parameters.Add("@NewTradeId", MySqlDbType.Int32).Value = newId;
          updateOriginalTradeCmd.Parameters.Add("@MatchingTradeId", MySqlDbType.Int32).Value = matchingTradeRecords[0].id;
          await updateOriginalTradeCmd.ExecuteNonQueryAsync();
          _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Updated trade ID {newId} with matching_trade_id {matchingTradeRecords[0].id}.", userId, "TRADE", viewDebugLogs);
        }

        await SendTradeNotification(currentCoinPriceInUSDC, amount, userId, from, to, strategy, conn);
      }
      else
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Failed to retrieve new trade ID, pair {from}/{to}.", userId, "TRADE", viewDebugLogs);
      }
    }
    catch (MySqlException ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Database error creating trade history, pair {from}/{to}: {ex.Message}", userId, "TRADE", viewDebugLogs);
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Unexpected error creating trade history, pair {from}/{to}: {ex.Message}", userId, "TRADE", viewDebugLogs);
    }
  }

  private async Task SendTradeNotification(decimal currentCoinPriceInUSDC, string amount, int userId, string from, string to, string strategy, MySqlConnection conn)
  {
    string buyOrSell = to == "USDC" ? "Sell" : "Buy";
    if (strategy == "HFT" && buyOrSell == "Buy") { return; }

    const string createNotificationSql = @"
			INSERT INTO maxhanna.notifications 
				(user_id, text, date)
			VALUES 
				(@UserId, @Content, UTC_TIMESTAMP());";
    await using var createNotificationCmd = new MySqlCommand(createNotificationSql, conn);
    createNotificationCmd.Parameters.AddWithValue("@UserId", userId);
    decimal tradeValue = Convert.ToDecimal(amount) * currentCoinPriceInUSDC;
    string content;
    string toCoinName = CoinNameMap.TryGetValue(to, out var toname) ? toname : to;
    string fromCoinName = CoinNameMap.TryGetValue(from, out var fromname) ? fromname : from;

    if (buyOrSell == "Buy")
    { // Buy: Spent [USDC], Bought [Coin]
      content = $"Executed Trade: Buy {amount} {toCoinName}, Cost: {tradeValue:F2}$ @ ${currentCoinPriceInUSDC}/{to.Replace("XBT", "BTC").Replace("XDG", "Doge")} ({strategy});";
    }
    else
    { // Sell: Sold [Coin], Received [USDC]
      content = $"Executed Trade: Sold {amount} {fromCoinName}, Received {tradeValue:F2}$ @ ${currentCoinPriceInUSDC}/{from.Replace("XBT", "BTC").Replace("XDG", "Doge")} ({strategy})";
    }
    createNotificationCmd.Parameters.AddWithValue("@Content", content);
    await createNotificationCmd.ExecuteNonQueryAsync();
    _ = SendFirebaseNotifications(userId, content);
  }

  private async Task SendFirebaseNotifications(int userId, string passedMessage)
  {
    var tmpMessage = passedMessage ?? "Notification from Bughosted.com";
    try
    {
      var message = new Message()
      {
        Notification = new FirebaseAdmin.Messaging.Notification()
        {
          Title = $"Bughosted.com",
          Body = tmpMessage,
          ImageUrl = "https://www.bughosted.com/assets/logo.jpg"
        },
        Data = new Dictionary<string, string>
          {
              { "url", "https://bughosted.com" }
          },
        Topic = "notification" + userId
      };

      string response = await FirebaseAdmin.Messaging.FirebaseMessaging.DefaultInstance.SendAsync(message);
      //Console.WriteLine($"Successfully sent message: {response} to user {tmpUserId} with topic: {message.Topic}.");
    }
    catch (Exception ex)
    {
      _ = _log.Db("An error occurred while sending Firebase notifications. " + ex.Message, null, "NOTIFICATION", true);
    }
  }

  private async Task CreateWalletEntriesFromFetchedDictionary(Dictionary<string, decimal>? balanceDictionary, int userId)
  {
    if (balanceDictionary == null)
    {
      _ = _log.Db("Balance dictionary is null. Cannot create wallet entries.", userId, "TRADE", viewDebugLogs);
      return;
    }

    const string ensureWalletSqlTemplate = @"
			INSERT INTO user_{0}_wallet_info (user_id, {0}_address, last_fetched)
			VALUES (@UserId, 'Kraken', UTC_TIMESTAMP())
			ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
			SELECT LAST_INSERT_ID();";

    const string getRecentBalanceIdSqlTemplate = @"
			SELECT id FROM user_{0}_wallet_balance 
			WHERE wallet_id = @WalletId AND fetched_at > (UTC_TIMESTAMP() - INTERVAL 10 MINUTE)
			ORDER BY fetched_at DESC LIMIT 1;";

    const string insertBalanceSqlTemplate = "INSERT INTO user_{0}_wallet_balance (wallet_id, balance, fetched_at) VALUES (@WalletId, @Balance, UTC_TIMESTAMP());";

    const string updateBalanceSqlTemplate = "UPDATE user_{0}_wallet_balance SET balance = @Balance, fetched_at = UTC_TIMESTAMP() WHERE id = @BalanceId;";

    const string updateFetchedSqlTemplate = "UPDATE user_{0}_wallet_info SET last_fetched = UTC_TIMESTAMP() WHERE id = @WalletId;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Aggregate balances by table suffix
      var aggregatedBalances = new Dictionary<string, decimal>();
      foreach (var entry in balanceDictionary)
      {
        var coinSymbol = entry.Key;
        var balance = entry.Value;

        // Check if we have a mapping for this coin
        if (!CoinMappingsForDB.TryGetValue(coinSymbol, out var tableSuffix))
        {
          _ = _log.Db($"No mapping found for coin symbol: {coinSymbol}", userId, "TRADE", viewDebugLogs);
          continue;
        }

        // Sum balances for the same table suffix
        if (aggregatedBalances.ContainsKey(tableSuffix))
        {
          aggregatedBalances[tableSuffix] += balance;
        }
        else
        {
          aggregatedBalances[tableSuffix] = balance;
        }
      }

      // Process each aggregated balance
      foreach (var entry in aggregatedBalances)
      {
        var tableSuffix = entry.Key;
        var balance = entry.Value;

        try
        {
          int walletId;
          var ensureWalletSql = string.Format(ensureWalletSqlTemplate, tableSuffix);

          using (var cmd = new MySqlCommand(ensureWalletSql, conn))
          {
            cmd.Parameters.AddWithValue("@UserId", userId);
            using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync();
            walletId = reader.GetInt32(0);
            await reader.CloseAsync(); // Ensure reader is closed before reusing connection
          }

          // Check for recent entry and get its ID if exists
          int? recentBalanceId = null;
          var getRecentSql = string.Format(getRecentBalanceIdSqlTemplate, tableSuffix);
          using (var getRecentCmd = new MySqlCommand(getRecentSql, conn))
          {
            getRecentCmd.Parameters.AddWithValue("@WalletId", walletId);
            var result = await getRecentCmd.ExecuteScalarAsync();
            if (result != null && result != DBNull.Value)
            {
              recentBalanceId = Convert.ToInt32(result);
            }
          }

          if (recentBalanceId.HasValue)
          {
            // Update existing recent balance record
            var updateBalanceSql = string.Format(updateBalanceSqlTemplate, tableSuffix);
            using var updateBalanceCmd = new MySqlCommand(updateBalanceSql, conn);
            updateBalanceCmd.Parameters.AddWithValue("@Balance", balance);
            updateBalanceCmd.Parameters.AddWithValue("@BalanceId", recentBalanceId.Value);
            await updateBalanceCmd.ExecuteNonQueryAsync();
          }
          else
          {
            // Insert new balance record
            var insertSql = string.Format(insertBalanceSqlTemplate, tableSuffix);
            using var insertCmd = new MySqlCommand(insertSql, conn);
            insertCmd.Parameters.AddWithValue("@WalletId", walletId);
            insertCmd.Parameters.AddWithValue("@Balance", balance);
            await insertCmd.ExecuteNonQueryAsync();
          }

          // Always update last fetched timestamp in wallet_info
          var updateSql = string.Format(updateFetchedSqlTemplate, tableSuffix);
          using var updateCmd = new MySqlCommand(updateSql, conn);
          updateCmd.Parameters.AddWithValue("@WalletId", walletId);
          await updateCmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
          _ = _log.Db($"⚠️Error processing {tableSuffix} balance: {ex.Message}", userId, "TRADE", false);
        }
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error creating wallet balance entries: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
    }
  }

  private async Task<int?> GetSecondsSinceLastTrade(int userId, string coin, string strategy)
  {
    try
    {
      string normalizedCoin = string.IsNullOrWhiteSpace(coin)
        ? string.Empty
        : coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();

      string condition = strategy == "IND"
        ? "AND (from_currency = @Coin AND to_currency = 'USDC')"
        : "AND (from_currency = @Coin OR to_currency = @Coin)";

      string sql = $@"
            SELECT TIMESTAMPDIFF(SECOND, MAX(timestamp), UTC_TIMESTAMP())
            FROM maxhanna.trade_history
            WHERE user_id = @UserId
            {condition}
            AND strategy = @Strategy;";

      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@Coin", normalizedCoin);
      cmd.Parameters.AddWithValue("@Strategy", strategy);

      var result = await cmd.ExecuteScalarAsync();
      return result != DBNull.Value ? Convert.ToInt32(result) : (int?)null;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error checking {coin?.ToUpper() ?? "UNKNOWN"} trade history: {ex.Message}",
             userId, "TRADE", viewDebugLogs);
      return null;
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
			{(strategy == "IND" ? "AND (from_currency = @Coin AND to_currency = 'USDC') " : "AND (from_currency = @Coin OR to_currency = @Coin) ")}
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
      _ = _log.Db($"⚠️Error checking {tmpCoin} trade history: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
  }

  private async Task<decimal?> IsSystemUpToDate(int userId, string coin, decimal coinPriceUSDC)
  {
    string tmpCoin = coin == "XBT" ? "BTC" : coin;
    //_ = _log.Db($"Checking IsSystemUpToDate for coin: {tmpCoin}", userId, "TRADE", viewDebugLogs);
    try
    {
      using (var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        await conn.OpenAsync();

        string normalizedCoinName = CoinNameMap.TryGetValue(tmpCoin.ToUpperInvariant(), out var mappedName) ? mappedName : tmpCoin;
        string symbol = CoinSymbols.TryGetValue(normalizedCoinName, out var knownSymbol) ? knownSymbol : "";


        string checkSql = @$"
					SELECT value_cad 
					FROM maxhanna.coin_value 
					WHERE name = @CoinName
					AND timestamp >= UTC_TIMESTAMP() - INTERVAL 1 MINUTE
					ORDER BY ID DESC LIMIT 1;";

        // Check if there's a recent price in the database
        using (var checkCmd = new MySqlCommand(checkSql, conn))
        {
          checkCmd.Parameters.AddWithValue("@CoinName", normalizedCoinName);

          var result = await checkCmd.ExecuteScalarAsync();
          if (result != null && decimal.TryParse(result.ToString(), out var valueCad))
          {
            //_ = _log.Db($"Returning recent {tmpCoin} rate from database.", userId, "TRADE", viewDebugLogs);
            return valueCad;
          }
        }

        // Fetch CAD/USD exchange rate
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
            usdToCadRate = 1m / cadToUsdRate;
          }
          else
          {
            _ = _log.Db("Failed to fetch CAD/USD exchange rate from database.", userId, "TRADE", viewDebugLogs);
            return null;
          }
        }

        decimal coinPriceCad = coinPriceUSDC * usdToCadRate;

        var insertSql = @$"
					INSERT INTO maxhanna.coin_value (symbol, name, value_cad, value_usd, timestamp)
					VALUES (@Symbol, @CoinName, @ValueCad, @ValueUsd, UTC_TIMESTAMP());";

        // _ = _log.Db(
        // 	$"[Symbol Resolution] Raw Coin Input: '{coin}' | Upper: '{tmpCoin}' | Normalized Name: '{normalizedCoinName}' | Final Symbol: '{symbol}'",
        // 	userId,
        // 	"TRADE",
        // 	outputToConsole: viewDebugLogs
        //);
        using (var insertCmd = new MySqlCommand(insertSql, conn))
        {
          insertCmd.Parameters.AddWithValue("@Symbol", symbol);
          insertCmd.Parameters.AddWithValue("@CoinName", normalizedCoinName);
          insertCmd.Parameters.AddWithValue("@ValueCad", coinPriceCad);
          insertCmd.Parameters.AddWithValue("@ValueUsd", coinPriceUSDC);
          await insertCmd.ExecuteNonQueryAsync();
          //_ = _log.Db($"Inserted new data for {tmpCoin} with symbol {symbol} into database.", userId, "TRADE", viewDebugLogs); 
        }

        return coinPriceCad;
      }
    }
    catch (MySqlException ex)
    {
      _ = _log.Db("⚠️Error checking IsSystemUpToDate: " + ex.Message, userId, "TRADE", viewDebugLogs);
      return null;
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Unexpected error in IsSystemUpToDate: " + ex.Message, userId, "TRADE", viewDebugLogs);
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
          coin_price_cad = reader.GetFloat(reader.GetOrdinal("coin_price_cad")),
          coin_price_usdc = reader.GetFloat(reader.GetOrdinal("coin_price_usdc")),
          trade_value_cad = reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
          trade_value_usdc = reader.GetFloat(reader.GetOrdinal("trade_value_usdc"))
        };

        return tradeRecord;
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error fetching last {coin} trade: " + ex.Message, null, "TRADE", viewDebugLogs);
    }
    return null;
  }

  public async Task<TradeRecord?> GetTradeById(int userId, int tradeId)
  {
    TradeRecord? tradeRecord = null;
    var checkSql = @"
        SELECT * 
        FROM maxhanna.trade_history 
        WHERE user_id = @UserId 
        AND id = @TradeId;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var checkCmd = new MySqlCommand(checkSql, conn);
      checkCmd.Parameters.AddWithValue("@UserId", userId);
      checkCmd.Parameters.AddWithValue("@TradeId", tradeId);

      using var reader = await checkCmd.ExecuteReaderAsync();
      if (await reader.ReadAsync())
      {
        tradeRecord = new TradeRecord
        {
          id = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32(reader.GetOrdinal("id")),
          user_id = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
          from_currency = reader.IsDBNull(reader.GetOrdinal("from_currency")) ? "null" : reader.GetString(reader.GetOrdinal("from_currency")),
          to_currency = reader.IsDBNull(reader.GetOrdinal("to_currency")) ? "null" : reader.GetString(reader.GetOrdinal("to_currency")),
          strategy = reader.IsDBNull(reader.GetOrdinal("strategy")) ? "null" : reader.GetString(reader.GetOrdinal("strategy")),
          value = reader.IsDBNull(reader.GetOrdinal("value")) ? (float)0 : reader.GetFloat(reader.GetOrdinal("value")),
          timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime(reader.GetOrdinal("timestamp")),
          coin_price_cad = reader.IsDBNull(reader.GetOrdinal("coin_price_cad")) ? 0 : reader.GetFloat(reader.GetOrdinal("coin_price_cad")),
          coin_price_usdc = reader.IsDBNull(reader.GetOrdinal("coin_price_usdc")) ? 0 : reader.GetFloat(reader.GetOrdinal("coin_price_usdc")),
          trade_value_cad = reader.IsDBNull(reader.GetOrdinal("trade_value_cad")) ? 0 : reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
          trade_value_usdc = reader.IsDBNull(reader.GetOrdinal("trade_value_usdc")) ? 0 : reader.GetFloat(reader.GetOrdinal("trade_value_usdc")),
          fees = reader.IsDBNull(reader.GetOrdinal("fees")) ? 0 : reader.GetFloat(reader.GetOrdinal("fees")),
          matching_trade_id = reader.IsDBNull(reader.GetOrdinal("matching_trade_id")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("matching_trade_id")),
          is_reserved = reader.IsDBNull(reader.GetOrdinal("is_reserved")) ? false : reader.GetBoolean(reader.GetOrdinal("is_reserved"))
        };
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Error fetching trade by ID: " + ex.Message, null, "TRADE", viewDebugLogs);
    }

    return tradeRecord;
  } 
  
  public async Task<TradeHistoryResponse> GetTradeHistory(
      int userId,
      string coin,
      string strategy,
      double? hours = null,
      int? page = null,
      int? pageSize = null)
  {
    // Normalize coin symbol (BTC -> XBT)
    string tmpCoin = (coin ?? string.Empty).ToUpperInvariant();
    if (tmpCoin == "BTC") tmpCoin = "XBT";

    int take = Math.Clamp(pageSize ?? 50, 1, 500);       // default 50, cap 500
    int skip = Math.Max(((page ?? 1) - 1) * take, 0);    // offset
    bool hasHours = hours.HasValue && hours.Value > 0;
    DateTime startTimeUtc = DateTime.UtcNow.AddHours(-(hours ?? 0.0));

    var response = new TradeHistoryResponse
    {
      Trades = new List<TradeRecord>(),
      TotalCount = 0
    };

    const string sql = @"
WITH filtered AS (
  SELECT
    id, user_id, from_currency, to_currency, strategy,
    value, timestamp, coin_price_cad, coin_price_usdc,
    trade_value_cad, trade_value_usdc, fees,
    matching_trade_id, is_reserved
  FROM trade_history
  WHERE user_id = @UserId
    AND strategy = @Strategy
    AND (@HasHours = 0 OR timestamp >= @StartTime)
    AND from_currency = @Coin

  UNION ALL

  SELECT
    id, user_id, from_currency, to_currency, strategy,
    value, timestamp, coin_price_cad, coin_price_usdc,
    trade_value_cad, trade_value_usdc, fees,
    matching_trade_id, is_reserved
  FROM trade_history
  WHERE user_id = @UserId
    AND strategy = @Strategy
    AND (@HasHours = 0 OR timestamp >= @StartTime)
    AND to_currency = @Coin
)
SELECT
  f.*,
  COUNT(*) OVER () AS total_count
FROM filtered f
ORDER BY f.id DESC
LIMIT @PageSize OFFSET @Offset;";

    await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));

    try
    {
      await conn.OpenAsync();

      await using var cmd = new MySqlCommand(sql, conn)
      {
        CommandTimeout = 10
      };

      // Explicit parameter types/sizes
      cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
      cmd.Parameters.Add("@Strategy", MySqlDbType.VarChar, 3).Value = strategy ?? string.Empty;
      cmd.Parameters.Add("@Coin", MySqlDbType.VarChar, 45).Value = tmpCoin;
      cmd.Parameters.Add("@HasHours", MySqlDbType.Int32).Value = hasHours ? 1 : 0;
      cmd.Parameters.Add("@StartTime", MySqlDbType.DateTime).Value = hasHours ? startTimeUtc : (object)DBNull.Value;
      cmd.Parameters.Add("@PageSize", MySqlDbType.Int32).Value = take;
      cmd.Parameters.Add("@Offset", MySqlDbType.Int32).Value = skip;

      cmd.Prepare();

      await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess);

      while (await reader.ReadAsync())
      {
        // total_count is same for all rows; read once, inline GetOrdinal + IsDBNull
        if (response.TotalCount == 0 &&
            !reader.IsDBNull(reader.GetOrdinal("total_count")))
        {
          response.TotalCount = reader.GetInt32(reader.GetOrdinal("total_count"));
        }

        // BIT(1) handling (MySqlConnector returns bool; MySql.Data may return byte)
        bool isReserved = false;
        if (!reader.IsDBNull(reader.GetOrdinal("is_reserved")))
        {
          var raw = reader.GetValue(reader.GetOrdinal("is_reserved"));
          isReserved = raw is bool b ? b : Convert.ToBoolean(raw);
        }

        var tr = new TradeRecord
        {
          id = reader.IsDBNull(reader.GetOrdinal("id"))
                ? 0 : reader.GetInt32(reader.GetOrdinal("id")),
          user_id = reader.IsDBNull(reader.GetOrdinal("user_id"))
                ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
          from_currency = reader.IsDBNull(reader.GetOrdinal("from_currency"))
                ? "null" : reader.GetString(reader.GetOrdinal("from_currency")),
          to_currency = reader.IsDBNull(reader.GetOrdinal("to_currency"))
                ? "null" : reader.GetString(reader.GetOrdinal("to_currency")),
          strategy = reader.IsDBNull(reader.GetOrdinal("strategy"))
                ? "null" : reader.GetString(reader.GetOrdinal("strategy")),
          value = reader.IsDBNull(reader.GetOrdinal("value"))
                ? 0f : reader.GetFloat(reader.GetOrdinal("value")),
          timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp"))
                ? DateTime.UtcNow : reader.GetDateTime(reader.GetOrdinal("timestamp")),
          coin_price_cad = reader.IsDBNull(reader.GetOrdinal("coin_price_cad"))
                ? 0f : reader.GetFloat(reader.GetOrdinal("coin_price_cad")),
          coin_price_usdc = reader.IsDBNull(reader.GetOrdinal("coin_price_usdc"))
                ? 0f : reader.GetFloat(reader.GetOrdinal("coin_price_usdc")),
          trade_value_cad = reader.IsDBNull(reader.GetOrdinal("trade_value_cad"))
                ? 0f : reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
          trade_value_usdc = reader.IsDBNull(reader.GetOrdinal("trade_value_usdc"))
                ? 0f : reader.GetFloat(reader.GetOrdinal("trade_value_usdc")),
          fees = reader.IsDBNull(reader.GetOrdinal("fees"))
                ? 0f : Convert.ToSingle(reader.GetDecimal(reader.GetOrdinal("fees"))),
          matching_trade_id = reader.IsDBNull(reader.GetOrdinal("matching_trade_id"))
                ? (int?)null : reader.GetInt32(reader.GetOrdinal("matching_trade_id")),
          is_reserved = isReserved
        };

        response.Trades.Add(tr);
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️ Error fetching trade history: {ex.Message}", userId, "TRADE", viewDebugLogs);
    }
    finally
    {
      await conn.CloseAsync();
    }

    return response;
  }

  public async Task<int?> GetPageForTradeId(int userId, int tradeId, int tradesPerPage, string coin, string strategy)
  {
    if (userId <= 0 || tradeId <= 0 || tradesPerPage <= 0 || string.IsNullOrEmpty(coin) || string.IsNullOrEmpty(strategy))
      return null;

    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

    var countSql = @"
                SELECT COUNT(*) 
                FROM maxhanna.trade_history 
                WHERE user_id = @UserId 
                AND (from_currency = @Coin OR to_currency = @Coin) 
                AND strategy = @Strategy 
                AND id >= @TradeId 
                ORDER BY id DESC";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var countCmd = new MySqlCommand(countSql, conn);
      countCmd.Parameters.AddWithValue("@UserId", userId);
      countCmd.Parameters.AddWithValue("@Coin", tmpCoin);
      countCmd.Parameters.AddWithValue("@Strategy", strategy);
      countCmd.Parameters.AddWithValue("@TradeId", tradeId);

      long position = Convert.ToInt64(await countCmd.ExecuteScalarAsync());
      if (position == 0)
        return null;

      int pageNumber = (int)Math.Floor((position - 1) / (double)tradesPerPage) + 1;
      return pageNumber;
    }
    catch (Exception ex)
    {
      await _log.Db($"⚠️Error fetching page for trade ID {tradeId}: {ex.Message}", null, "TRADE", viewDebugLogs);
      return null;
    }
  }

  public async Task<List<TradeRecord>> GetTradesForPage(int userId, int pageNumber, int tradesPerPage, string coin, string strategy)
  {
    if (userId <= 0 || pageNumber < 1 || tradesPerPage <= 0 || string.IsNullOrEmpty(coin) || string.IsNullOrEmpty(strategy))
      return new List<TradeRecord>();

    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

    var sql = @"
                SELECT id, user_id, from_currency, to_currency, strategy, value, timestamp, 
                       coin_price_cad, coin_price_usdc, trade_value_cad, trade_value_usdc, fees, 
                       matching_trade_id, is_reserved 
                FROM maxhanna.trade_history 
                WHERE user_id = @UserId 
                AND (from_currency = @Coin OR to_currency = @Coin) 
                AND strategy = @Strategy 
                ORDER BY id DESC 
                LIMIT @PageSize OFFSET @Offset";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      int offset = (pageNumber - 1) * tradesPerPage;
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@Coin", tmpCoin);
      cmd.Parameters.AddWithValue("@Strategy", strategy);
      cmd.Parameters.AddWithValue("@PageSize", tradesPerPage);
      cmd.Parameters.AddWithValue("@Offset", offset);

      var trades = new List<TradeRecord>();
      using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        var trade = new TradeRecord
        {
          id = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32(reader.GetOrdinal("id")),
          user_id = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
          from_currency = reader.IsDBNull(reader.GetOrdinal("from_currency")) ? "null" : reader.GetString(reader.GetOrdinal("from_currency")),
          to_currency = reader.IsDBNull(reader.GetOrdinal("to_currency")) ? "null" : reader.GetString(reader.GetOrdinal("to_currency")),
          strategy = reader.IsDBNull(reader.GetOrdinal("strategy")) ? "null" : reader.GetString(reader.GetOrdinal("strategy")),
          value = reader.IsDBNull(reader.GetOrdinal("value")) ? (float)0 : reader.GetFloat(reader.GetOrdinal("value")),
          timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime(reader.GetOrdinal("timestamp")),
          coin_price_cad = reader.IsDBNull(reader.GetOrdinal("coin_price_cad")) ? 0 : reader.GetFloat(reader.GetOrdinal("coin_price_cad")),
          coin_price_usdc = reader.IsDBNull(reader.GetOrdinal("coin_price_usdc")) ? 0 : reader.GetFloat(reader.GetOrdinal("coin_price_usdc")),
          trade_value_cad = reader.IsDBNull(reader.GetOrdinal("trade_value_cad")) ? 0 : reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
          trade_value_usdc = reader.IsDBNull(reader.GetOrdinal("trade_value_usdc")) ? 0 : reader.GetFloat(reader.GetOrdinal("trade_value_usdc")),
          fees = reader.IsDBNull(reader.GetOrdinal("fees")) ? 0 : reader.GetFloat(reader.GetOrdinal("fees")),
          matching_trade_id = reader.IsDBNull(reader.GetOrdinal("matching_trade_id")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("matching_trade_id")),
          is_reserved = reader.IsDBNull(reader.GetOrdinal("is_reserved")) ? false : reader.GetBoolean(reader.GetOrdinal("is_reserved"))
        };
        trades.Add(trade);
      }

      return trades;
    }
    catch (Exception ex)
    {
      await _log.Db($"⚠️Error fetching trades for page {pageNumber}: {ex.Message}", null, "TRADE", viewDebugLogs);
      return new List<TradeRecord>();
    }
  }

  public async Task<TradeRecord?> GetLatestTradeHistory(int userId)
  {
    var checkSql = @"SELECT * FROM maxhanna.trade_history WHERE user_id = @UserId ORDER BY id DESC LIMIT 1;";

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var checkCmd = new MySqlCommand(checkSql, conn);
      checkCmd.Parameters.AddWithValue("@UserId", userId);

      using var reader = await checkCmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        return new TradeRecord
        {
          id = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32(reader.GetOrdinal("id")),
          user_id = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
          from_currency = reader.IsDBNull(reader.GetOrdinal("from_currency")) ? "null" : reader.GetString(reader.GetOrdinal("from_currency")),
          to_currency = reader.IsDBNull(reader.GetOrdinal("to_currency")) ? "null" : reader.GetString(reader.GetOrdinal("to_currency")),
          strategy = reader.IsDBNull(reader.GetOrdinal("strategy")) ? "null" : reader.GetString(reader.GetOrdinal("strategy")),
          value = reader.IsDBNull(reader.GetOrdinal("value")) ? (float)0 : reader.GetFloat(reader.GetOrdinal("value")),
          timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime(reader.GetOrdinal("timestamp")),
          coin_price_cad = reader.IsDBNull(reader.GetOrdinal("coin_price_cad")) ? 0 : reader.GetFloat(reader.GetOrdinal("coin_price_cad")),
          coin_price_usdc = reader.IsDBNull(reader.GetOrdinal("coin_price_usdc")) ? 0 : reader.GetFloat(reader.GetOrdinal("coin_price_usdc")),
          trade_value_cad = reader.IsDBNull(reader.GetOrdinal("trade_value_cad")) ? 0 : reader.GetFloat(reader.GetOrdinal("trade_value_cad")),
          trade_value_usdc = reader.IsDBNull(reader.GetOrdinal("trade_value_usdc")) ? 0 : reader.GetFloat(reader.GetOrdinal("trade_value_usdc")),
          fees = reader.IsDBNull(reader.GetOrdinal("fees")) ? 0 : reader.GetFloat(reader.GetOrdinal("fees")),
          matching_trade_id = reader.IsDBNull(reader.GetOrdinal("matching_trade_id")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("matching_trade_id")),
          is_reserved = reader.IsDBNull(reader.GetOrdinal("is_reserved")) ? false : reader.GetBoolean(reader.GetOrdinal("is_reserved"))
        };
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Error fetching latest trade history: " + ex.Message, null, "TRADE", viewErrorDebugLogs);
    }
    return null;
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
      _ = _log.Db($"⚠️Error checking ({strategy}) trade sequence: {ex.Message}", null, "TRADE", viewErrorDebugLogs);
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
        var checkCmd = new MySqlCommand("SELECT COUNT(*) FROM user_kraken_api_keys WHERE user_id = @userId;", connection);
        checkCmd.Parameters.AddWithValue("@userId", request.UserId);

        var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;

        if (exists)
        {
          // Update existing
          var updateCmd = new MySqlCommand(@"
                    UPDATE user_kraken_api_keys
                    SET api_key = @apiKey,
                        private_key = @privateKey 
                    WHERE user_id = @userId;", connection);

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
                    VALUES (@userId, @apiKey, @privateKey);", connection);

          insertCmd.Parameters.AddWithValue("@userId", request.UserId);
          insertCmd.Parameters.AddWithValue("@apiKey", request.ApiKey);
          insertCmd.Parameters.AddWithValue("@privateKey", request.PrivateKey);

          await insertCmd.ExecuteNonQueryAsync();
        }
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db("⚠️Error updating API keys: " + ex.Message, request.UserId, "TRADE", viewErrorDebugLogs);
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
      _ = _log.Db("⚠️Error getting API keys: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
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
      _ = _log.Db("⚠️Error getting API keys: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false; // Return false in case of error
    }
  }
  public async Task<bool> StartBot(int userId, string coin, string strategy)
  {
    string tmpCoin = coin.ToLowerInvariant();
    tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;

    var allowedCoins = new HashSet<string> { "btc", "eth", "sol", "ada", "xrp", "xdg" };
    if (!allowedCoins.Contains(tmpCoin))
    {
      await _log.Db($"⚠️ Invalid coin symbol attempted: {tmpCoin}", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    if (string.IsNullOrWhiteSpace(strategy) || strategy.Length > 100)
    {
      await _log.Db($"⚠️ Invalid strategy value for StartBot: '{strategy}'", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    try
    {
      using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await connection.OpenAsync();

      var cmd = new MySqlCommand(@"
			INSERT INTO maxhanna.trade_bot_status (user_id, coin, is_running, updated, strategy)
			VALUES (@UserId, @Coin, 1, UTC_TIMESTAMP(), @Strategy)
			ON DUPLICATE KEY UPDATE 
				is_running = 1,
				updated = UTC_TIMESTAMP(),
				strategy = @Strategy;", connection);

      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@Coin", tmpCoin);
      cmd.Parameters.AddWithValue("@Strategy", strategy);

      await cmd.ExecuteNonQueryAsync();
      await _log.Db($"{strategy} {coin} Bot started.", userId, "TRADE", viewDebugLogs);
      return true;
    }
    catch (Exception ex)
    {
      await _log.Db($"Error starting the {strategy} bot: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
  }

  public async Task<bool> StopBot(int userId, string coin, string strategy)
  {
    string tmpCoin = coin.ToLowerInvariant();
    tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;

    var allowedCoins = new HashSet<string> { "btc", "eth", "sol", "ada", "xrp", "xdg" };
    if (!allowedCoins.Contains(tmpCoin))
    {
      await _log.Db($"{strategy} Invalid coin symbol attempted while stopping bot: {tmpCoin}", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    if (string.IsNullOrWhiteSpace(strategy) || strategy.Length > 100)
    {
      await _log.Db($"Invalid strategy({strategy}) value for StopBot: '{strategy}'", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    try
    {
      using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await connection.OpenAsync();

      var cmd = new MySqlCommand(@"
			INSERT INTO maxhanna.trade_bot_status (user_id, coin, is_running, updated, strategy)
			VALUES (@UserId, @Coin, 0, UTC_TIMESTAMP(), @Strategy)
			ON DUPLICATE KEY UPDATE 
				is_running = 0,
				updated = UTC_TIMESTAMP(),
				strategy = @Strategy;", connection);

      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@Coin", tmpCoin);
      cmd.Parameters.AddWithValue("@Strategy", strategy);

      await cmd.ExecuteNonQueryAsync();
      await _log.Db($"{strategy} Bot stopped.", userId, "TRADE", viewDebugLogs);
      return true;
    }
    catch (Exception ex)
    {
      await _log.Db($"Error stopping the {strategy} bot: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
  }
  public async Task<Dictionary<string, Dictionary<string, DateTime?>>> GetAllTradebotStatuses(int userId)
  {
    var statuses = new Dictionary<string, Dictionary<string, DateTime?>>();

    // Initialize with all possible currencies and strategies
    var currencies = new[] { "btc", "xrp", "sol", "xdg", "eth" };
    var strategies = new[] { "DCA", "IND", "HFT" };

    try
    {
      using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        await connection.OpenAsync();

        var cmd = new MySqlCommand(@"
                SELECT coin, strategy, updated 
                FROM maxhanna.trade_bot_status 
                WHERE user_id = @userId 
                AND is_running = 1;", connection);
        cmd.Parameters.AddWithValue("@userId", userId);

        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            var coin = reader["coin"].ToString()?.ToUpper();
            var strategy = reader["strategy"].ToString();
            var updated = reader["updated"] == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(reader["updated"]);

            if (!string.IsNullOrEmpty(coin) && !statuses.ContainsKey(coin))
            {
              statuses[coin] = new Dictionary<string, DateTime?>();
            }
            if (!string.IsNullOrEmpty(coin) && !string.IsNullOrEmpty(strategy))
            {
              statuses[coin][strategy] = updated;
            }
          }
        }
      }

      // Ensure all currencies and strategies are represented in the response
      foreach (var currency in currencies)
      {
        var upperCurrency = currency.ToUpper();
        if (!statuses.ContainsKey(upperCurrency))
          statuses[upperCurrency] = new Dictionary<string, DateTime?>();

        foreach (var strategy in strategies)
        {
          if (!statuses[upperCurrency].ContainsKey(strategy))
            statuses[upperCurrency][strategy] = null;
        }
      }

      return statuses;
    }
    catch (Exception ex)
    {
      _ = _log.Db("Error checking GetAllTradebotStatuses: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);

      // Return empty statuses with all currencies/strategies set to null on error
      var emptyStatuses = new Dictionary<string, Dictionary<string, DateTime?>>();
      foreach (var currency in currencies)
      {
        var upperCurrency = currency.ToUpper();
        emptyStatuses[upperCurrency] = new Dictionary<string, DateTime?>();
        foreach (var strategy in strategies)
        {
          emptyStatuses[upperCurrency][strategy] = null;
        }
      }
      return emptyStatuses;
    }
  }
  public async Task<DateTime?> IsTradebotStarted(int userId, string coin, string strategy)
  {
    string tmpCoin = coin.ToLower();
    tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;
    if (!System.Text.RegularExpressions.Regex.IsMatch(tmpCoin, @"^[a-z]{2,5}$")) // Only allow 2-5 lowercase letters
    {
      _ = _log.Db($"Invalid coin name (IsTradebotStarted:{strategy}).", userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
    try
    {
      using (var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        await connection.OpenAsync();

        var cmd = new MySqlCommand(@$"
					SELECT updated 
					FROM maxhanna.trade_bot_status 
					WHERE user_id = @userId 
					AND strategy = @strategy 
					AND coin = @coin 
					AND is_running = 1;", connection);
        cmd.Parameters.AddWithValue("@userId", userId);
        cmd.Parameters.AddWithValue("@strategy", strategy);
        cmd.Parameters.AddWithValue("@coin", tmpCoin);
        var result = await cmd.ExecuteScalarAsync();

        if (result == DBNull.Value || result == null)
          return null;

        return Convert.ToDateTime(result);
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db("Error checking IsTradebotStarted({strategy}): " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
  }
  public async Task<decimal?> GetCoinPriceToUSDC(int userId, string coin, UserKrakenApiKey keys)
  {
    string inputCoin = coin?.ToUpperInvariant() ?? "";
    inputCoin = (inputCoin == "BITCOIN" || inputCoin == "XBT") ? "BTC" : inputCoin;

    string tmpCoin = inputCoin == "BTC" ? "XBT" : inputCoin;

    // Normalize coin name
    string normalizedName = CoinNameMap.TryGetValue(inputCoin, out var mappedName) ? mappedName : inputCoin;
    string symbol = CoinSymbols.TryGetValue(normalizedName, out var resolvedSymbol) ? resolvedSymbol : "";

    //_ = _log.Db($"🔍 Input: {coin}, Mapped Name: {normalizedName}, Resolved Symbol: {symbol}", userId, "TRADE", viewDebugLogs);

    // Step 1: Try to get cached value from DB (last 10 seconds)
    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      string query = @"
				SELECT value_usd 
				FROM coin_value 
				WHERE name = @CoinName AND timestamp >= (UTC_TIMESTAMP() - INTERVAL 10 SECOND)
				ORDER BY timestamp DESC 
				LIMIT 1;";

      using var cmd = new MySqlCommand(query, conn);
      cmd.Parameters.AddWithValue("@CoinName", normalizedName);

      var result = await cmd.ExecuteScalarAsync();
      if (result != null)
      {
        decimal dbPrice = Convert.ToDecimal(result); // Direct cast to preserve precision
                                                     //_ = _log.Db($"✅ Cache hit for {normalizedName}: ${dbPrice:F8}", userId, "TRADE", viewDebugLogs);
        return dbPrice;
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️ DB error fetching cached coin value for {normalizedName}: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
    }

    // Step 2: Fallback to Kraken API
    try
    {
      string pair = $"{tmpCoin}USDC";
      var response = await MakeRequestAsync(userId, keys, "/Ticker", "public", new Dictionary<string, string> { ["pair"] = pair });

      if (response == null || !response.ContainsKey("result"))
      {
        _ = _log.Db($"❌ Kraken response missing 'result' for {pair}", userId, "TRADE", viewErrorDebugLogs);
        return null;
      }

      var result = (JObject)response["result"];
      if (!result.ContainsKey(pair))
      {
        _ = _log.Db($"❌ Kraken result missing pair: {pair}", userId, "TRADE", viewErrorDebugLogs);
        return null;
      }

      var askArray = result[pair]?["a"]?.ToObject<JArray>();
      if (askArray == null || askArray.Count < 1)
      {
        _ = _log.Db($"❌ Kraken ask price missing or invalid for {coin}", userId, "TRADE", viewErrorDebugLogs);
        return null;
      }

      var askPrice = askArray[0].ToObject<decimal>();

      // Step 3: Optional - Insert into DB for future cache
      try
      {
        using var connInsert = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
        await connInsert.OpenAsync();

        decimal? coinPriceCAD = await ConvertFiatAsync("USD", "CAD", askPrice);
        if (coinPriceCAD == null)
        {
          await _log.Db($"⚠️ Could not convert {askPrice} USD to CAD for {normalizedName}", userId, "TRADE", viewErrorDebugLogs);
          return askPrice;
        }

        decimal roundedAskPrice = askPrice > 1000m ? Math.Round(askPrice, 2) : askPrice;
        decimal roundedCad = coinPriceCAD.Value > 1000m ? Math.Round(coinPriceCAD.Value, 2) : coinPriceCAD.Value;

        var insertCmd = new MySqlCommand(@"
					INSERT INTO coin_value (symbol, name, value_usd, value_cad, timestamp)
					VALUES (@Symbol, @Name, @Price, @PriceCAD, UTC_TIMESTAMP());", connInsert);

        insertCmd.Parameters.AddWithValue("@Symbol", symbol);
        insertCmd.Parameters.AddWithValue("@Name", normalizedName);
        insertCmd.Parameters.AddWithValue("@Price", roundedAskPrice);
        insertCmd.Parameters.AddWithValue("@PriceCAD", roundedCad);

        await insertCmd.ExecuteNonQueryAsync();
        //_ = _log.Db($"💾 Inserted price for {normalizedName}: USD${roundedAskPrice} / CAD${roundedCad} (Symbol: {symbol})", userId, "TRADE", viewDebugLogs);
      }
      catch (Exception insertEx)
      {
        _ = _log.Db($"⚠️ Failed to insert new coin value for {normalizedName}: {insertEx.Message}", userId, "TRADE", viewErrorDebugLogs);
      }

      return askPrice;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️ Error fetching {coin} price from Kraken: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
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
        _ = _log.Db("Failed to make API request: " + responseContent, userId, "TRADE", viewErrorDebugLogs);
      }

      Dictionary<string, object>? responseObject = JsonConvert.DeserializeObject<Dictionary<string, object>>(responseContent);

      // Check for any error messages in the response
      if (responseObject != null && responseObject.ContainsKey("error") && ((JArray)responseObject["error"]).Count > 0)
      {
        var errorMessages = responseObject["error"] is JArray errorArray
          ? string.Join(", ", errorArray.ToObject<List<string>>() ?? new List<string>())
          : string.Empty;
        _ = _log.Db($"Kraken API error: {errorMessages}. Url: {urlPath}. User: {userId}", userId, "TRADE", viewErrorDebugLogs);
        return null;
      }
      return responseObject;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️ Kraken API request failed: {ex}", userId, "TRADE", viewErrorDebugLogs);
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
  public async Task<decimal?> ConvertFiatAsync(string fromCurrency, string toCurrency, decimal amount = 1.0m)
  {
    fromCurrency = fromCurrency.ToUpperInvariant();
    toCurrency = toCurrency.ToUpperInvariant();

    if (string.IsNullOrWhiteSpace(fromCurrency) || string.IsNullOrWhiteSpace(toCurrency) || amount < 0)
    {
      await _log.Db($"⚠️ Invalid conversion input: {fromCurrency} → {toCurrency}, amount: {amount}", null, "TRADE", outputToConsole: viewErrorDebugLogs);
      return null;
    }

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Case 1: From CAD to target (direct)
      if (fromCurrency == "CAD")
      {
        decimal? rate = await GetRateAsync("CAD", toCurrency, conn);
        if (rate.HasValue)
          return rate.Value * amount;
      }
      // Case 2: From target to CAD (invert)
      else if (toCurrency == "CAD")
      {
        decimal? rate = await GetRateAsync("CAD", fromCurrency, conn);
        if (rate.HasValue && rate.Value != 0)
          return amount / rate.Value;
      }
      // Case 3: Neither side is CAD → Cross-convert via CAD
      else
      {
        decimal? rateFromCadToFrom = await GetRateAsync("CAD", fromCurrency, conn);
        decimal? rateFromCadToTo = await GetRateAsync("CAD", toCurrency, conn);

        if (rateFromCadToFrom.HasValue && rateFromCadToTo.HasValue && rateFromCadToFrom.Value != 0)
        {
          decimal cadAmount = amount / rateFromCadToFrom.Value;
          return cadAmount * rateFromCadToTo.Value;
        }
      }

      await _log.Db($"⚠️ Could not find valid conversion rate: {fromCurrency} → {toCurrency}");
      return null;
    }
    catch (Exception ex)
    {
      await _log.Db($"🔥 Error during fiat conversion: {ex.Message}", outputToConsole: viewErrorDebugLogs);
      return null;
    }
  }

  private async Task<decimal?> GetRateAsync(string baseCurrency, string targetCurrency, MySqlConnection conn)
  {
    var sql = @"
		SELECT rate 
		FROM exchange_rates 
		WHERE base_currency = @BaseCurrency AND target_currency = @TargetCurrency 
		ORDER BY timestamp DESC 
		LIMIT 1;";

    using var cmd = new MySqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@BaseCurrency", baseCurrency);
    cmd.Parameters.AddWithValue("@TargetCurrency", targetCurrency);

    var result = await cmd.ExecuteScalarAsync();
    return result != null && decimal.TryParse(result.ToString(), out var rate) ? rate : null;
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
      await _log.Db("⚠️GetTradeConfigurationLastUpdate Exception: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
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
          MaximumFromBalance = reader.GetDecimal("maximum_from_balance"),
          MinimumFromTradeAmount = reader.GetDecimal("minimum_from_trade_amount"),
          TradeThreshold = reader.GetDecimal("trade_threshold"),
          MaximumToTradeAmount = reader.GetDecimal("maximum_to_trade_amount"),
          ReserveSellPercentage = reader.GetDecimal("reserve_sell_percentage"),
          CoinReserveUSDCValue = reader.GetDecimal("coin_reserve_usdc_value"),
          MaxTradeTypeOccurances = reader.GetInt32("max_trade_type_occurances"),
          VolumeSpikeMaxTradeOccurance = reader.GetInt32("volume_spike_max_trade_occurances"),
          TradeStopLoss = reader.GetDecimal("trade_stop_loss"),
          TradeStopLossPercentage = reader.GetDecimal("trade_stop_loss_percentage"),
        };
      }
    }
    catch (Exception ex)
    {
      await _log.Db($"({fromCoin}:{userId}:{strategy}) ⚠️GetTradeConfiguration Exception: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
    await _log.Db($"({fromCoin}:{userId}:{strategy}) ⚠️GetTradeConfiguration No trade configuration for : {fromCoin}/{toCoin}:{strategy}", userId, "TRADE", viewErrorDebugLogs);
    return null;
  }
  public async Task<bool> UpsertTradeConfiguration(int userId, string fromCoin,
    string toCoin, string strategy, decimal maxFromBalance, decimal minFromAmount, decimal threshold,
    decimal maxToAmount, decimal reserveSellPercentage,
    decimal coinReserveUSDCValue, int maxtradeTypeOccurances, int volumeSpikeMaxTradeOccurance,
    decimal tradeStopLoss, decimal tradeStopLossPercentage)
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
				maximum_from_balance,  
				minimum_from_trade_amount, 
				trade_threshold,  
				maximum_to_trade_amount,  
				reserve_sell_percentage,   
				coin_reserve_usdc_value,  
				max_trade_type_occurances,
				volume_spike_max_trade_occurances,
				trade_stop_loss,
				trade_stop_loss_percentage
			)
			VALUES (
				@userId, @fromCoin, @toCoin, @strategy, UTC_TIMESTAMP(),
				@maxFromBalance, @minFromAmount,
				@threshold, @maxToAmount, @reserveSellPercentage, 
				@coinReserveUSDCValue, 
				@maxTradeTypeOccurances, 
				@volumeSpikeMaxTradeOccurance, @tradeStopLoss, @tradeStopLossPercentage
			)
			ON DUPLICATE KEY UPDATE 
				updated = UTC_TIMESTAMP(),
				maximum_from_balance = @maxFromBalance, 
				minimum_from_trade_amount = @minFromAmount,
				trade_threshold = @threshold, 
				maximum_to_trade_amount = @maxToAmount, 
				reserve_sell_percentage = @reserveSellPercentage,  
				coin_reserve_usdc_value = @coinReserveUSDCValue, 
				max_trade_type_occurances = @maxTradeTypeOccurances,
				volume_spike_max_trade_occurances = @volumeSpikeMaxTradeOccurance,
				trade_stop_loss = @tradeStopLoss,
				trade_stop_loss_percentage = @tradeStopLossPercentage;
				", connection);

      cmd.Parameters.AddWithValue("@userId", userId);
      cmd.Parameters.AddWithValue("@fromCoin", fromCoin);
      cmd.Parameters.AddWithValue("@toCoin", toCoin);
      cmd.Parameters.AddWithValue("@strategy", strategy);
      cmd.Parameters.AddWithValue("@maxFromBalance", maxFromBalance);
      cmd.Parameters.AddWithValue("@minFromAmount", minFromAmount);
      cmd.Parameters.AddWithValue("@threshold", threshold);
      cmd.Parameters.AddWithValue("@maxToAmount", maxToAmount);
      cmd.Parameters.AddWithValue("@reserveSellPercentage", reserveSellPercentage);
      cmd.Parameters.AddWithValue("@coinReserveUSDCValue", coinReserveUSDCValue);
      cmd.Parameters.AddWithValue("@maxTradeTypeOccurances", maxtradeTypeOccurances);
      cmd.Parameters.AddWithValue("@volumeSpikeMaxTradeOccurance", volumeSpikeMaxTradeOccurance);
      cmd.Parameters.AddWithValue("@tradeStopLoss", tradeStopLoss);
      cmd.Parameters.AddWithValue("@tradeStopLossPercentage", tradeStopLossPercentage);

      await cmd.ExecuteNonQueryAsync();
      return true;
    }
    catch (Exception ex)
    {
      await _log.Db("⚠️Error upserting trade configuration: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
  }
  private static bool ApplyTradeConfiguration(TradeConfiguration? tc)
  {
    if (tc == null)
      return false;

    _MaximumBTCBalance = tc.MaximumFromBalance ?? 0;
    _MinimumBTCTradeAmount = tc.MinimumFromTradeAmount ?? 0;
    _MaximumUSDCTradeAmount = tc.MaximumToTradeAmount ?? 0;
    _TradeThreshold = tc.TradeThreshold ?? 0;
    _ReserveSellPercentage = tc.ReserveSellPercentage ?? 0;
    _CoinReserveUSDCValue = tc.CoinReserveUSDCValue ?? 0;
    _MaxTradeTypeOccurances = tc.MaxTradeTypeOccurances ?? 0;
    _VolumeSpikeMaxTradeOccurance = tc.VolumeSpikeMaxTradeOccurance ?? 0;
    _TradeStopLoss = tc.TradeStopLoss ?? 0;
    _TradeStopLossPercentage = tc.TradeStopLossPercentage ?? 0;

    return true;
  }

  public async Task<decimal?> GetFirstCoinPriceTodayIfNoRecentTrades(string coin, int userId, string strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

    string tmpCoinForLookup = coin.ToUpper();
    tmpCoinForLookup = tmpCoinForLookup == "XBT" ? "BTC" : tmpCoinForLookup;

    string tmpCoinName = CoinNameMap.TryGetValue(tmpCoinForLookup, out var mappedName) ? mappedName : tmpCoin;

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

      // 2. If no recent trades, get first price today
      if (tradeCount == 0)
      {
        var priceQuery = $@"
					SELECT value_usd 
					FROM maxhanna.coin_value 
					WHERE name = '{tmpCoinName}' 
          AND timestamp >= UTC_DATE()
            AND timestamp <  UTC_DATE() + INTERVAL 1 DAY
          ORDER BY timestamp ASC
          LIMIT 1;";

        using var priceCmd = new MySqlCommand(priceQuery, connection);
        var result = await priceCmd.ExecuteScalarAsync();

        if (result != null && result != DBNull.Value)
        {
          return Convert.ToDecimal(result);
        }
        _ = _log.Db($"({tmpCoinName}:{userId}:{strategy}) No price found for today for {tmpCoinName}.", userId, "TRADE", viewDebugLogs);
      }
      return null;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoinName}:{userId}:{strategy}) ⚠️ Error checking first {tmpCoinName}({strategy}) price with trade condition: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
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
			INSERT INTO maxhanna.trade_momentum_accumulation (user_id, from_currency, to_currency, timestamp, strategy, coin_price_usdc, starting_coin_price_usdc, best_coin_price_usdc{(matchingTradeId != null ? ", matching_trade_id" : "")}) 
			VALUES (@UserId, @From, @To, UTC_TIMESTAMP(), @Strategy, @BtcValueUSDC, @BtcValueUSDC, @BtcValueUSDC{(matchingTradeId != null ? ", " + matchingTradeId : "")});";
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
      _ = _log.Db($"({from}:{userId}:{strategy}) Momentum entry created: {from}/{to} price : {coinPriceUsdc}.", userId, "TRADE", viewDebugLogs);
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({from}:{userId}:{strategy}) ⚠️ Error creating momentum entry: " + ex.Message, userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
    return true;
  }
  private async Task<bool> DeleteMomentumStrategy(int userId, string from, string to, string strategy, MySqlConnection? conn = null)
  {
    string tmpCoin = from == "USDC" ? to : from;
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
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Deleted momentum strategy; From {from}, To {to}.", userId, "TRADE", viewDebugLogs);
      }
      else
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No momentum strategy found to delete; From {from}, To {to}.", userId, "TRADE", viewDebugLogs);
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Error deleting momentum strategy; From {from}, To {to}: {ex.Message}", userId, "TRADE", viewDebugLogs);
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
				(user_id, from_currency, to_currency, timestamp, coin_price_usdc, best_coin_price_usdc, starting_coin_price_usdc, strategy)
			VALUES 
				(@UserId, @From, @To, UTC_TIMESTAMP(), @CoinPriceUSDC, @CoinPriceUSDC, @CoinPriceUSDC, @Strategy)
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
      _ = _log.Db($"({from}:{userId}:{strategy}) Error updating momentum entry: " + ex.Message, userId, "TRADE", viewDebugLogs);
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
      cmd.Parameters.AddWithValue("@From", from.Replace("BTC", "XBT"));
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
          StartingCoinPriceUsdc = reader.GetDecimal("starting_coin_price_usdc"),
          MatchingTradeId = reader.IsDBNull(reader.GetOrdinal("matching_trade_id")) ? null : reader.GetInt32("matching_trade_id")
        };
      }
      // if (momentumStrategy != null)
      // {
      // 	_ = _log.Db($"({from}:{userId}:{strategy}) Found an active momentum strategy; From {from}, To {to}.", userId, "TRADE", viewDebugLogs);
      // }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({from.Replace("BTC", "XBT")}:{userId}:{strategy}) Error fetching active momentum strategy; From {from.Replace("BTC", "XBT")}, To {to}.: {ex.Message}");
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
  private async Task<int?> FindMatchingBuyOrders(int userId, string coinSymbol, string strategy, decimal sellPrice, MySqlConnection? conn = null)
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
			AND is_reserved = 0 
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
        _ = _log.Db($"({coinSymbol}:{userId}:{strategy}) Found matching buy order {matchingBuyId} at {sellPrice} (buy price <= {maxBuyPrice}).", userId, "TRADE", viewDebugLogs);
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({coinSymbol}:{userId}:{strategy}) Error finding matching buy order: {ex.Message}", userId, "TRADE", viewDebugLogs);
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
      _ = _log.Db("No volume data available for spike detection.", null, "TRADE", viewDebugLogs);
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
    if (isSpike)
    {
      _ = _log.Db($@"[Volume Spike Check]
			Time Range: Last 1 hour (since {sinceTime:u})
			Pair: {fromCurrency}/{toCurrency}
			Volume Points: {volumes.Count}
			Average Volume: {averageVolume:N2} USDC
			Latest Volume: {latestVolume:N2} USDC
			Volume Increase: {volumeIncreasePercent:P2}
			Spike Threshold: {spikeThresholdPercent:P2}
			Significant Spike Detected: {isSpike}", userId, "TRADE", viewDebugLogs);
    }

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
      _ = _log.Db("⚠️KrakenService exception GetTradeMarketVolumesForGraphAsync: " + e.Message, outputToConsole: viewDebugLogs);
    }
    return volumes;
  }

  /// <summary>
  /// Exits the user's position for the specified coin.
  /// </summary>
  public async Task<bool> ExitPosition(int userId, string coin, string? strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    try
    {
      if (userId == 0) return false;
      UserKrakenApiKey? keys = await GetApiKey(userId);
      if (keys == null) return false;
      var balances = await GetBalance(userId, tmpCoin, strategy ?? "XXX", keys);
      if (balances == null)
      {
        _ = _log.Db("Failed to get wallet balances", userId, "TRADE", viewDebugLogs);
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
        _ = _log.Db($"No {tmpCoin} balance found. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }
      decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
      decimal? coinPriceUSDC = await GetCoinPriceToUSDC(userId, coin, keys);
      if (coinPriceUSDC == null)
      {
        _ = _log.Db("No USDC price found. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }

      decimal? coinPriceCAD = await IsSystemUpToDate(userId, coin, coinPriceUSDC.Value);
      if (coinPriceCAD == null)
      {
        _ = _log.Db("No CAD price found. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }

      _ = _log.Db($"Exiting position. BTC Balance: {coinBalance}", userId, "TRADE", viewDebugLogs);
      await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(coinBalance.Value), "sell", coinBalance.Value, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value, strategy ?? "XXX", null, null);
      await InvalidateTrades(userId, tmpCoin, strategy);
      if (strategy != null && strategy != "XXX")
      {
        await StopBot(userId, tmpCoin, strategy);
      }

      return true;
    }
    catch (Exception e)
    {
      _ = _log.Db("⚠️KrakenService exception ExitPosition: " + e.Message, outputToConsole: viewDebugLogs);
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
  /// <param name="strategy">The strategy to enter a position for (e.g., "HFT", "DCA").</param>
  /// <returns>Returns true if the position was successfully entered, otherwise false.</returns>
  public async Task<bool> EnterPosition(int userId, string coin, string strategy)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    try
    {
      if (userId == 0) return false;
      //GET USER API KEYS, Trade Configuration
      UserKrakenApiKey? keys = await GetApiKey(userId);
      if (keys == null) return false;

      TradeConfiguration? tc = await GetTradeConfiguration(userId, tmpCoin, "USDC", strategy);
      if (tc == null)
      {
        _ = _log.Db($"Null ({strategy}) {tmpCoin} trade configuration. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }
      if (!ValidateTradeConfiguration(tc, userId))
      {
        _ = _log.Db($"Invalid ({strategy}) {tmpCoin} configuration. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }
      if (!ApplyTradeConfiguration(tc))
      {
        _ = _log.Db($"Null {tmpCoin} trade configuration. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }

      // 1. If user does not have _InitialMinimumFromAmountToStart, cancel entering position.  
      var balances = await GetBalance(userId, tmpCoin, "XXX", keys);
      if (balances == null)
      {
        _ = _log.Db($"Failed to get {tmpCoin} wallet balances", userId, "TRADE");
        return false;
      }
      decimal coinBalance = GetCoinBalanceFromDictionaryAndKey(balances, tmpCoin);
      decimal usdcBalance = GetCoinBalanceFromDictionaryAndKey(balances, "USDC");
      decimal? coinPriceUSDC = await GetCoinPriceToUSDC(userId, tmpCoin, keys);
      if (coinPriceUSDC == null)
      {
        _ = _log.Db("No USDC price found. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }

      decimal? coinPriceCAD = await IsSystemUpToDate(userId, tmpCoin, coinPriceUSDC.Value);
      if (coinPriceCAD == null)
      {
        _ = _log.Db("No CAD price found. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return false;
      }
      //Trade configured percentage % of USDC balance TO BTC 
      decimal usdcValueToTrade = Math.Min(_MaximumUSDCTradeAmount, usdcBalance);
      if (usdcValueToTrade > 0)
      {
        decimal btcAmount = usdcValueToTrade / coinPriceUSDC.Value;

        _ = _log.Db($"Entering Position - Buying {tmpCoin} with {FormatBTC(btcAmount)} {tmpCoin} worth of USDC(${usdcValueToTrade}), Strategy: {strategy}.", userId, "TRADE", viewDebugLogs);
        await ExecuteTrade(userId, tmpCoin, keys, FormatBTC(btcAmount), "buy", coinBalance, usdcBalance, coinPriceCAD.Value, coinPriceUSDC.Value, strategy, null, null);

        return true;
      }
      else
      {
        _ = _log.Db($"Not enough USDC to trade! {usdcValueToTrade}. {strategy} Trade Cancelled.", userId, "TRADE", viewDebugLogs);
      }

      return false;
    }
    catch (Exception e)
    {
      _ = _log.Db($"⚠️ERROR: EnterPosition {tmpCoin}: " + e.Message, outputToConsole: viewDebugLogs);
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

      //_ = _log.Db($"Trade history for {tmpCoin}: {oppositeCount} {buyOrSell}s, prior {(buyOrSell == "buy" ? "sells" : "buys")}", userId, "TRADE", viewDebugLogs);
      return oppositeCount; // Return prior buys for sell, or consecutive buys for buy
    }
    catch (Exception ex)
    {
      _ = _log.Db($"⚠️Error analyzing trade history for {tmpCoin}: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
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
					high_price_value,
					macd_histogram,
					macd_line_value,
					macd_signal_value,
					volume_above_20_day_avg,
					volume_20_day_avg_value,
					current_volume_value
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
          HighPriceValue = reader.IsDBNull(reader.GetOrdinal("high_price_value")) ? 0 : reader.GetDecimal("high_price_value"),
          MACDHistogram = reader.IsDBNull(reader.GetOrdinal("macd_histogram")) ? false : reader.GetBoolean("macd_histogram"),
          MACDLineValue = reader.IsDBNull(reader.GetOrdinal("macd_line_value")) ? 0 : reader.GetDecimal("macd_line_value"),
          MACDSignalValue = reader.IsDBNull(reader.GetOrdinal("macd_signal_value")) ? 0 : reader.GetDecimal("macd_signal_value"),
          VolumeAbove20DayAverage = reader.IsDBNull(reader.GetOrdinal("volume_above_20_day_avg")) ? false : reader.GetBoolean("volume_above_20_day_avg"),
          Volume20DayAverageValue = reader.IsDBNull(reader.GetOrdinal("volume_20_day_avg_value")) ? 0 : reader.GetDecimal("volume_20_day_avg_value"),
          CurrentVolumeValue = reader.IsDBNull(reader.GetOrdinal("current_volume_value")) ? 0 : reader.GetDecimal("current_volume_value")
        };
      }

      return indicators;
    }
    catch (Exception e)
    {
      _ = _log.Db("⚠️KrakenService exception GetIndicatorData: " + e.Message, outputToConsole: viewErrorDebugLogs);
      return indicators;
    }
  }

  public async Task<int> GetNumberOfTrades(int userId)
  {
    try
    {
      var sql = @"
				SELECT 
					count(*)
				FROM trade_history
				WHERE user_id = @UserId;";

      using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await connection.OpenAsync();

      using var command = new MySqlCommand(sql, connection);
      command.Parameters.AddWithValue("@UserId", userId);

      using var reader = await command.ExecuteReaderAsync();

      while (await reader.ReadAsync())
      {
        if (!reader.IsDBNull(0))
        {
          return reader.GetInt32(0);
        }
      }
    }
    catch (Exception e)
    {
      _ = _log.Db("⚠️KrakenService exception GetNumberOfTrades: " + e.Message, outputToConsole: viewDebugLogs);
      return 0;
    }
    return 0;
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
				AND timestamp >= NOW() - INTERVAL 10 MINUTE
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
      _ = _log.Db($"⚠️Error checking for missing fees: {ex.Message}", userId, "TRADE", viewDebugLogs);
      return false;
    }
  }
  private bool ValidateTradeConfiguration(object? config, int userId)
  {
    if (config == null)
    {
      _ = _log.Db("Trade configuration does not exist. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
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
      _ = _log.Db($"Trade Cancelled. The following trade configuration properties are null: {nulls}", userId, "TRADE", viewDebugLogs);
      return false;
    }

    return true;
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

  private async Task<List<TradeRecord>> GetProfitableOpenBuyPositionsAsync(int userId, string coin, string strategy, decimal coinPriceUSD, decimal tradeThreshold, bool minimum5Hours = false)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    string sql = $@"SELECT *
			FROM trade_history
			WHERE user_id = @UserId
			AND from_currency = 'USDC'
			AND to_currency = @ToCur 
			AND strategy = @Strategy 
			AND matching_trade_id IS NULL 
			AND is_reserved = 0 
			{(minimum5Hours ? " AND timestamp <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) " : "")}
			{(tradeThreshold > 0 ? $" AND ((@CurrentPrice - coin_price_usdc) / coin_price_usdc) > @TradeThreshold; " : "")}";
    try
    {
      await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      await using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@ToCur", tmpCoin);
      cmd.Parameters.AddWithValue("@CurrentPrice", coinPriceUSD);
      cmd.Parameters.AddWithValue("@Strategy", strategy);
      cmd.Parameters.AddWithValue("@TradeThreshold", tradeThreshold);

      await using var reader = await cmd.ExecuteReaderAsync();
      var trades = new List<TradeRecord>();
      while (await reader.ReadAsync())
      {
        trades.Add(new TradeRecord
        {
          id = reader.GetInt32("id"),
          user_id = reader.GetInt32("user_id"),
          from_currency = reader.GetString("from_currency"),
          to_currency = reader.GetString("to_currency"),
          value = reader.GetFloat("value"),
          timestamp = reader.GetDateTime("timestamp"),
          coin_price_cad = reader.GetFloat("coin_price_cad"),
          coin_price_usdc = reader.GetFloat("coin_price_usdc"),
          strategy = reader.GetString("strategy"),
          trade_value_cad = reader.GetFloat("trade_value_cad"),
          trade_value_usdc = reader.GetFloat("trade_value_usdc"),
          is_reserved = reader.GetBoolean("is_reserved")
        });
      }
      return trades;
    }
    catch (Exception ex)
    {
      _ = _log.Db($@"({tmpCoin}:{userId}:{strategy}) Error getting profitable open buy positions. Data: tradeThreshold:{tradeThreshold}, coinPriceUSD: {coinPriceUSD}. Message: {ex.Message}", userId, "TRADE", viewDebugLogs);
      return new List<TradeRecord>();
    }
  }
  private async Task<TradeRecord?> GetLatestReservedTransaction(int userId, string coin, string strategy, decimal coinPriceUSD, decimal tradeThreshold)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    string sql = @"SELECT 
						r.*
					FROM 
						trade_history r
					LEFT JOIN 
						trade_history t ON r.id = t.matching_trade_id
					WHERE  
						r.user_id = @UserId
						AND r.from_currency = 'USDC'
						AND r.to_currency = @ToCur 
						AND r.strategy = @Strategy 
						AND r.matching_trade_id IS NULL 
						AND r.is_reserved = 1 
						AND ((@CurrentPrice - r.coin_price_usdc) / r.coin_price_usdc) > @TradeThreshold
					GROUP BY 
						r.id
					HAVING 
						(r.value - COALESCE(SUM(t.value), 0)) > 0;";
    try
    {
      await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      await using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);
      cmd.Parameters.AddWithValue("@ToCur", tmpCoin);
      cmd.Parameters.AddWithValue("@CurrentPrice", coinPriceUSD);
      cmd.Parameters.AddWithValue("@Strategy", strategy);
      cmd.Parameters.AddWithValue("@TradeThreshold", tradeThreshold);

      await using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        return new TradeRecord
        {
          id = reader.GetInt32("id"),
          user_id = reader.GetInt32("user_id"),
          from_currency = reader.GetString("from_currency"),
          to_currency = reader.GetString("to_currency"),
          value = reader.GetFloat("value"),
          timestamp = reader.GetDateTime("timestamp"),
          coin_price_cad = reader.GetFloat("coin_price_cad"),
          coin_price_usdc = reader.GetFloat("coin_price_usdc"),
          strategy = reader.GetString("strategy"),
          trade_value_cad = reader.GetFloat("trade_value_cad"),
          trade_value_usdc = reader.GetFloat("trade_value_usdc"),
          is_reserved = reader.GetBoolean("is_reserved")
        };
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Error getting latest reserved transaction: {ex.Message}", userId, "TRADE", viewDebugLogs);
    }
    return null;
  }
  /// <summary>
  /// Retrieves the minimum order volume for a trading pair, caching it in the database for 3 hours.
  /// </summary>
  /// <param name="pair">The trading pair (e.g., "XBTUSDC").</param>
  /// <param name="keys">User's Kraken API keys.</param>
  /// <param name="userId">User ID for logging.</param>
  /// <returns>The minimum order volume, or null if unable to fetch.</returns>
  public async Task<decimal?> GetMinOrderVolume(string pair, UserKrakenApiKey keys, int userId)
  {
    string normalizedPair = pair.ToUpperInvariant();
    decimal? minVolume = null;

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      // Step 1: Check for cached value (within last 3 hours)
      const string checkSql = @"
            SELECT min_volume 
            FROM trade_pair_min_orders 
            WHERE pair = @Pair 
            AND timestamp >= UTC_TIMESTAMP() - INTERVAL 3 HOUR 
            LIMIT 1;";

      using var checkCmd = new MySqlCommand(checkSql, conn);
      checkCmd.Parameters.AddWithValue("@Pair", normalizedPair);

      var cachedResult = await checkCmd.ExecuteScalarAsync();
      if (cachedResult != null && cachedResult != DBNull.Value)
      {
        minVolume = Convert.ToDecimal(cachedResult);
        _ = _log.Db($"({normalizedPair}:{userId}) Using cached min order volume: {minVolume}", userId, "TRADE", viewDebugLogs);
        return minVolume;
      }

      // Step 2: Fetch from Kraken if no valid cache
      var parameters = new Dictionary<string, string> { ["pair"] = normalizedPair };
      var response = await MakeRequestAsync(userId, keys, "/AssetPairs", "public", parameters);

      if (response == null || !response.ContainsKey("result"))
      {
        _ = _log.Db($"({normalizedPair}:{userId}) Failed to fetch AssetPairs: No result in response.", userId, "TRADE", viewDebugLogs);
        return null;
      }

      var result = (JObject)response["result"];
      if (!result.ContainsKey(normalizedPair))
      {
        _ = _log.Db($"({normalizedPair}:{userId}) Pair {normalizedPair} not found in Kraken response.", userId, "TRADE", viewDebugLogs);
        return null;
      }

      var pairInfo = result[normalizedPair] as JObject;
      if (pairInfo == null || !pairInfo.ContainsKey("ordermin"))
      {
        _ = _log.Db($"({normalizedPair}:{userId}) No 'ordermin' found for pair {normalizedPair}.", userId, "TRADE", viewDebugLogs);
        return null;
      }

      minVolume = pairInfo["ordermin"]!.Value<decimal>();

      // Step 3: Store/Update in DB
      const string upsertSql = @"
            INSERT INTO trade_pair_min_orders (pair, min_volume, timestamp)
            VALUES (@Pair, @MinVolume, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE 
                min_volume = @MinVolume,
                timestamp = UTC_TIMESTAMP();";

      using var upsertCmd = new MySqlCommand(upsertSql, conn);
      upsertCmd.Parameters.AddWithValue("@Pair", normalizedPair);
      upsertCmd.Parameters.AddWithValue("@MinVolume", minVolume);

      await upsertCmd.ExecuteNonQueryAsync();
      _ = _log.Db($"({normalizedPair}:{userId}) Fetched and stored min order volume: {minVolume}", userId, "TRADE", viewDebugLogs);

      return minVolume;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({normalizedPair}:{userId}) Error fetching/storing min order volume: {ex.Message}", userId, "TRADE", viewDebugLogs);
      return null;
    }
  }
  private async Task<bool> CheckIndicatorIntervalOpen(int userId, string fromCoin, string toCoin, string strategy)
  {
    string tmpCoin = fromCoin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    try
    {
      // Step 1: Find the current open interval
      var intervalSql = @"
				SELECT start_time, end_time
				FROM signal_intervals
				WHERE from_coin = @fromCoin
				AND to_coin = @toCoin 
				AND end_time IS NULL
				ORDER BY start_time DESC
				LIMIT 1";

      await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      await using var intervalCmd = new MySqlCommand(intervalSql, conn);
      intervalCmd.Parameters.AddWithValue("@userId", userId);
      intervalCmd.Parameters.AddWithValue("@fromCoin", tmpCoin);
      intervalCmd.Parameters.AddWithValue("@toCoin", toCoin);

      using var intervalReader = await intervalCmd.ExecuteReaderAsync();
      if (!await intervalReader.ReadAsync())
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No open signal interval found for {tmpCoin}/{toCoin}", userId, "TRADE", viewDebugLogs);
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
      tradeCmd.Parameters.AddWithValue("@fromCoin", tmpCoin);
      tradeCmd.Parameters.AddWithValue("@toCoin", toCoin);
      tradeCmd.Parameters.AddWithValue("@startTime", startTime);
      tradeCmd.Parameters.AddWithValue("@endTime", endTime);

      long? tradeCount = (long?)await tradeCmd.ExecuteScalarAsync();

      bool hasTrades = tradeCount > 0;
      // if (hasTrades)
      // { 
      // 	_ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Checked trades for {tmpCoin}/{toCoin} in interval {startTime:yyyy-MM-dd HH:mm:ss} to {endTime:yyyy-MM-dd HH:mm:ss}: {(hasTrades ? $"{tradeCount} trade(s) found" : "No trades found")}",
      // 			userId, "TRADE", viewDebugLogs);
      // }

      return !hasTrades;
    }
    catch (MySqlException ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Error checking trades for {tmpCoin}/{toCoin}: {ex.Message}", null, "TRADE", viewDebugLogs);
      return false;
    }
  }
  private static decimal GetCoinBalanceFromDictionaryAndKey(Dictionary<string, decimal> balances, string coinKey)
  {
    // Normalize the requested coin key
    string normalized = CoinMappingsForDB.TryGetValue(coinKey.ToUpper(), out var mapped)
      ? mapped
      : coinKey.ToLower();

    // Sum all balances whose key maps to the same normalized coin
    var total = balances
      .Where(kvp =>
        CoinMappingsForDB.TryGetValue(kvp.Key.ToUpper(), out var map) && map == normalized)
      .Sum(kvp => kvp.Value);

    return total;
  }
  private async Task<int> GetNumberOfTradesInLastXHours(int userId, string coin, string strategy, int hours)
  {
    string tmpCoin = coin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;

    try
    {
      var intervalSql = @"
            SELECT count(*)
            FROM maxhanna.trade_history
            WHERE user_id = @UserId
            AND (from_coin = @Coin OR to_coin = @Coin)
            AND strategy = @Strategy
            AND timestamp > DATE_SUB(NOW(), INTERVAL @Hours HOUR);";

      await using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      await using var intervalCmd = new MySqlCommand(intervalSql, conn);
      intervalCmd.Parameters.AddWithValue("@UserId", userId);
      intervalCmd.Parameters.AddWithValue("@Coin", tmpCoin);
      intervalCmd.Parameters.AddWithValue("@Strategy", strategy);
      intervalCmd.Parameters.AddWithValue("@Hours", hours);

      var result = await intervalCmd.ExecuteScalarAsync();
      return result != null ? Convert.ToInt32(result) : 0;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Error getting trade count: {ex.Message}", userId, "TRADE", viewDebugLogs);
      return 0;
    }
  }
  private async Task<bool> CheckIfFreshBullishSignalExists(string fromCoin, string toCoin)
  {
    string tmpCoin = fromCoin.ToUpper();
    tmpCoin = tmpCoin == "BTC" ? "XBT" : tmpCoin;
    try
    {
      // Validate inputs
      if (string.IsNullOrEmpty(tmpCoin) || string.IsNullOrEmpty(toCoin))
      {
        _ = _log.Db($"Invalid input parameters: fromCoin={tmpCoin}, toCoin={toCoin}", null, "TRADE", viewDebugLogs);
        return false;
      }

      // Validate configuration
      if (_config == null || string.IsNullOrEmpty(_config.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        _ = _log.Db("Configuration or connection string is missing.", null, "TRADE", viewDebugLogs);
        return false;
      }

      // Query to check for an open interval
      var intervalSql = @"
				SELECT 1
				FROM signal_intervals
				WHERE from_coin = @fromCoin
				AND to_coin = @toCoin
				AND end_time IS NULL 
				AND start_time >= (NOW() - INTERVAL 2 MINUTE) 
				LIMIT 1";

      await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      await using var intervalCmd = new MySqlCommand(intervalSql, conn);
      intervalCmd.Parameters.Add("@fromCoin", MySqlDbType.VarChar).Value = tmpCoin;
      intervalCmd.Parameters.Add("@toCoin", MySqlDbType.VarChar).Value = toCoin;

      bool hasOpenInterval = await intervalCmd.ExecuteScalarAsync() != null;
      // _ = _log.Db($"({tmpCoin}:{strategy})Checked for open interval pair {tmpCoin}/{toCoin}: {(hasOpenInterval ? "Open interval found" : "No open interval found")}",
      // 		null, "TRADE", viewDebugLogs);

      return hasOpenInterval;
    }
    catch (MySqlException ex)
    {
      _ = _log.Db($"Database error checking open interval for pair {tmpCoin}/{toCoin}: {ex.Message}", null, "TRADE", viewDebugLogs);
      return false;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"Unexpected error checking open interval for pair {tmpCoin}/{toCoin}: {ex.Message}", null, "TRADE", viewDebugLogs);
      return false;
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
      null, "TRADE", viewDebugLogs);

    // 1. Fetch price history with proper date range
    var prices = await GetPriceHistoryForMACD(fromCoin, days);
    if (prices == null || prices.Count == 0)
    {
      await _log.Db($"No price data returned for pair: {pair}, Days: {days}", null, "TRADE", viewDebugLogs);
      return new List<MacdDataPoint>();
    }

    // 2. Verify sufficient data
    int requiredPoints = slowPeriod + signalPeriod;
    if (prices.Count < requiredPoints)
    {
      await _log.Db($"Insufficient data for MACD: {prices.Count} points, need at least {requiredPoints}",
        null, "TRADE", viewDebugLogs);
      return new List<MacdDataPoint>();
    }

    // 3. Prepare price data with proper rounding
    List<decimal?> closes = prices.Select(p =>
      double.IsNaN(p.ValueUSD) || double.IsInfinity(p.ValueUSD) ?
        (decimal?)null :
        Math.Round((decimal)p.ValueUSD, 4)) // Reduced precision
      .ToList();

    var timestamps = prices.Select(p => p.Timestamp).ToList();

    // 4. Calculate EMAs with proper validation
    var emaFast = CalculateEMA(closes, fastPeriod);
    var emaSlow = CalculateEMA(closes, slowPeriod);

    // 5. Calculate MACD line (fast EMA - slow EMA)
    var macdLine = emaFast.Zip<decimal?, decimal?, decimal?>(
      emaSlow,
      (fast, slow) => fast.HasValue && slow.HasValue ?
        Math.Round(fast.Value - slow.Value, 4) :
        (decimal?)null)
      .ToList();

    // 6. Calculate signal line (EMA of MACD line)
    var signalLine = CalculateEMA(macdLine, signalPeriod);

    // 7. Calculate histogram (MACD line - signal line)
    var histogram = macdLine.Zip<decimal?, decimal?, decimal?>(
      signalLine,
      (macd, sig) => macd.HasValue && sig.HasValue ?
        Math.Round(macd.Value - sig.Value, 4) :
        (decimal?)null)
      .ToList();

    // 8. Prepare results starting from where all components are available
    var result = new List<MacdDataPoint>();
    int startIndex = slowPeriod + signalPeriod - 2; // Adjusted index calculation

    for (int i = startIndex; i < timestamps.Count; i++)
    {
      // Verify we have all components


      result.Add(new MacdDataPoint
      {
        Timestamp = timestamps[i],
        MacdLine = macdLine[i],
        SignalLine = signalLine[i],
        Histogram = histogram[i],
        Price = closes[i]
      });
    }

    await _log.Db($"Returning {result.Count} MACD data points for pair: {pair}. Latest point: {result.LastOrDefault()?.Timestamp}",
      null, "TRADE", viewDebugLogs);
    return result;
  }

  private async Task<decimal> ComputeATR(int userId, string strategy, string coin, int period = 14)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    string coinName = CoinNameMap.TryGetValue(tmpCoin, out var name) ? name : tmpCoin;
    string cacheKey = $"{coinName}_{period}";

    if (_atrCache.TryGetValue(cacheKey, out var cached) && DateTime.UtcNow - cached.Timestamp < TimeSpan.FromMinutes(5))
    {
      return cached.Atr;
    }

    int fetchCount = period + 1;
    string sql = @"
			WITH daily_max AS (
				SELECT DATE(timestamp) as date,
					MAX(timestamp) as max_timestamp
				FROM coin_value
				WHERE name = @CoinName
				AND timestamp >= CURDATE() - INTERVAL @FetchCount DAY
				GROUP BY date
			)
			SELECT dm.date,
				cv.value_usd as close_usd
			FROM daily_max dm
			JOIN coin_value cv ON cv.timestamp = dm.max_timestamp AND cv.name = @CoinName
			ORDER BY dm.date ASC;";

    var closes = new List<decimal>();
    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@CoinName", coinName);
      cmd.Parameters.AddWithValue("@FetchCount", fetchCount);

      using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        if (!reader.IsDBNull(reader.GetOrdinal("close_usd")))
        {
          closes.Add(reader.GetDecimal("close_usd"));
        }
      }
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Error fetching daily closes for ATR: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      return 0m;
    }

    if (closes.Count < period)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Insufficient daily closes for ATR: {closes.Count} points", userId, "TRADE", viewErrorDebugLogs);
      return 0m;
    }

    // Compute True Ranges (|C - PC| approximation)
    var trList = new List<decimal>();
    for (int i = 1; i < closes.Count; i++)
    {
      trList.Add(Math.Abs(closes[i] - closes[i - 1]));
    }

    // Initial ATR (SMA of first period TRs)
    decimal atr = trList.Take(period - 1).Average();

    // Smooth the rest (Wilder's method)
    for (int i = period - 1; i < trList.Count; i++)
    {
      atr = (atr * (period - 1) + trList[i]) / period;
    }

    _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Computed ATR({period}): {atr} over {closes.Count} daily points", userId, "TRADE", viewDebugLogs);

    _atrCache[cacheKey] = (atr, DateTime.UtcNow);
    return atr;
  }

  private async Task<List<TradeRecord>> CheckAndReturnStopLossedBuys(int userId, string coin, string strategy, decimal currentPrice, decimal coinBalance, decimal usdcBalance, decimal coinPriceCAD)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    string pair = $"{tmpCoin}USDC";
    List<TradeRecord> records = new List<TradeRecord>();
    // Compute current ATR
    decimal atr = await ComputeATR(userId, strategy, coin);
    if (atr == 0m)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Skipping stop-loss: ATR=0 (data issue)", userId, "TRADE", viewErrorDebugLogs);
      return records;
    }

    // Get open buys (unmatched)
    var openBuys = await GetProfitableOpenBuyPositionsAsync(userId, tmpCoin, strategy, currentPrice, 0m, minimum5Hours: true);  // Reuse but with threshold=0 to get all open
    if (openBuys == null || openBuys.Count == 0)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No open buys match average true range stop loss.", userId, "TRADE", viewErrorDebugLogs);
      return records;
    }

    foreach (var buy in openBuys)
    {
      decimal entryPrice = Convert.ToDecimal(buy.coin_price_usdc);
      decimal stopLoss = entryPrice - (5m * atr);

      if (entryPrice > 0 && currentPrice <= stopLoss)
      {
        // Exit this position
        decimal amountToSell = (decimal)buy.value;
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Stop-loss hit for trade {buy.id}: Entry={entryPrice}, ATR={atr}, SL={stopLoss}, Current={currentPrice}. Selling {amountToSell}.", userId, "TRADE", viewDebugLogs);
        records.Add(buy);
      }
    }
    return records;
  }
  private bool ValidateAndApplyConfig(int userId, string coin, string strategy, string tmpCoin, TradeConfiguration? tc)
  {
    if (!ValidateTradeConfiguration(tc, userId) || tc == null)
    {
      return false;
    }
    if (!ApplyTradeConfiguration(tc))
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Null {coin} trade configuration. Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    return true;
  }

  private bool CheckPriceValidity(int userId, string coin, string strategy, string tmpCoin, decimal? coinPriceUSDC, decimal? coinPriceCAD)
  {
    if (coinPriceUSDC == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No {coin}/USDC price found. Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }
    if (coinPriceCAD == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) System is not up to date. Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
      return false;
    }

    return true;
  }

  private async Task<bool> IsTradeCooldown(int userId, string coin, string strategy, string tmpCoin, UserKrakenApiKey keys)
  {
    bool? updatedFeeResult = await UpdateFees(userId, coin, keys, strategy);
    if (updatedFeeResult == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Unable to update fees. API Error most likely culprit. Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
      return true;
    }
    DateTime? started = await IsTradebotStarted(userId, coin, strategy);
    if (started == null)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User has stopped the {coin}({strategy}) tradebot. Trade Cancelled.", userId, "TRADE", viewErrorDebugLogs);
      return true;
    }
    //TODO : For HFT, make it a 5 second limit.
    if (strategy == "HFT")
    {
      int? secondsSinceLastTrade = await GetSecondsSinceLastTrade(userId, coin, strategy);
      int tradeCooldownSeconds = 20;
      if (secondsSinceLastTrade != null && secondsSinceLastTrade < tradeCooldownSeconds)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User is in cooldown for another {(tradeCooldownSeconds - secondsSinceLastTrade)} seconds. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return true;
      }
      else if (secondsSinceLastTrade != null)
      {
        var timeSince = _log.GetTimeSince(secondsSinceLastTrade, true, true);
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Last trade: {timeSince}.", userId, "TRADE", viewDebugLogs);
      }
    }
    else
    {
      int? minutesSinceLastTrade = await GetMinutesSinceLastTrade(userId, coin, strategy);
      int tradeCooldownMinutes = 15;
      if (minutesSinceLastTrade != null && minutesSinceLastTrade < tradeCooldownMinutes)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) User is in cooldown for another {(tradeCooldownMinutes - minutesSinceLastTrade)} minutes. Trade Cancelled.", userId, "TRADE", viewDebugLogs);
        return true;
      }
      else if (minutesSinceLastTrade != null)
      {
        var timeSince = _log.GetTimeSince(minutesSinceLastTrade, true);
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Last trade: {timeSince}.", userId, "TRADE", viewDebugLogs);
      }
    }

    return false;
  }

  private async Task<
    (decimal? firstPriceToday,
    decimal lastPrice,
    decimal currentPrice,
    decimal spread,
    decimal spread2)>
    CalculateSpread(int userId, string coin, string strategy, bool isFirstTradeEver, TradeRecord? lastTrade, decimal coinPriceUSDC)
  {
    // Normalize coin symbol (BTC -> XBT)
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();

    // Fetch first price of the day
    decimal? firstPriceToday = await GetFirstCoinPriceTodayIfNoRecentTrades(tmpCoin, userId, strategy);

    decimal? lastCheckedPrice = null;
    if (strategy == "HFT")
    {
      lastCheckedPrice = await GetLastCheckedPrice(userId, tmpCoin);
    }

    decimal lastPrice;
    if (lastCheckedPrice.HasValue)
    {
      lastPrice = lastCheckedPrice.Value;
    }
    else if (lastTrade != null && lastTrade.coin_price_usdc.HasValue)
    {
      lastPrice = Convert.ToDecimal(lastTrade.coin_price_usdc);
    }
    else
    {
      if (firstPriceToday == null || !firstPriceToday.HasValue)
      {
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No last trade, checked price, or firstPriceToday available. Cannot calculate spread accurately.", userId, "TRADE", viewErrorDebugLogs);
        lastPrice = coinPriceUSDC; // Fallback to current price
      }
      else
      {
        lastPrice = firstPriceToday.Value; // Fallback to current price
        _ = _log.Db($"({tmpCoin}:{userId}:{strategy}) No last trade or checked price, using firstPriceToday ({firstPriceToday.Value}) as fallback.", userId, "TRADE", viewDebugLogs);
      }
    }

    decimal currentPrice = coinPriceUSDC;

    decimal spread = (isFirstTradeEver && strategy != "HFT") ? 0 : (currentPrice - lastPrice) / lastPrice;
    decimal spread2 = firstPriceToday != null ? (currentPrice - firstPriceToday.Value) / firstPriceToday.Value : 0;

    // Log spread calculation details for debugging
    //_ = _log.Db($"({tmpCoin}:{userId}:{strategy}) Spread calc: lastPrice={lastPrice}, currentPrice={currentPrice}, spread={spread:P}, spread2={spread2:P}, firstPriceToday={firstPriceToday}, lastCheckedPrice={lastCheckedPrice}", userId, "TRADE", viewDebugLogs);

    return (firstPriceToday, lastPrice, currentPrice, spread, spread2);
  }

  /// <summary>
  /// Returns a list of active tradebot users ranked by number of trades.
  /// Optional filters: strategy and date range (from/to). If null, returns overall counts.
  /// </summary>
  public async Task<List<(int UserId, long TradeCount)>> GetTopActiveUsersByTradeCount(string? strategy = null, DateTime? from = null, DateTime? to = null, int limit = 50)
  {
    var results = new List<(int, long)>();
    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      var whereClauses = new List<string>();
      if (!string.IsNullOrWhiteSpace(strategy)) whereClauses.Add("strategy = @strategy");
      if (from.HasValue) whereClauses.Add("timestamp >= @from");
      if (to.HasValue) whereClauses.Add("timestamp <= @to");

      var whereSql = whereClauses.Count > 0 ? "WHERE " + string.Join(" AND ", whereClauses) : "";

      var sql = $@"
				SELECT user_id, COUNT(*) AS trades
				FROM trade_history
				{whereSql}
				GROUP BY user_id
				ORDER BY trades DESC
				LIMIT @limit;";

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@limit", limit);
      if (!string.IsNullOrWhiteSpace(strategy)) cmd.Parameters.AddWithValue("@strategy", strategy);
      if (from.HasValue) cmd.Parameters.AddWithValue("@from", from.Value);
      if (to.HasValue) cmd.Parameters.AddWithValue("@to", to.Value);

      using var reader = await cmd.ExecuteReaderAsync();
      while (await reader.ReadAsync())
      {
        results.Add((reader.GetInt32("user_id"), reader.GetInt64("trades")));
      }
    }
    catch (Exception ex)
    {
      await _log.Db($"Error fetching top active users by trade count: {ex.Message}", type: "TRADE", outputToConsole: viewErrorDebugLogs);
    }
    return results;
  }

  private async Task<List<PricePoint>> GetPriceHistoryForMACD(string pair, int days, int maxDataPoints = 1000)
  {
    try
    {
      var coinName = pair.ToUpper() switch
      {
        "XBT" => "Bitcoin",
        "BTC" => "Bitcoin",
        "ETH" => "Ethereum",
        "DOGE" => "Dogecoin",
        "XDG" => "Dogecoin",
        "SOL" => "Solana",
        _ => pair
      };

      var startDate = DateTime.UtcNow.AddDays(-days);
      var endDate = DateTime.UtcNow;

      // Modified query to ensure latest data
      var priceQuery = @"
            SELECT timestamp, value_usd
            FROM coin_value
            WHERE name = @CoinName 
                AND timestamp >= @StartDate 
                AND timestamp <= @EndDate
            ORDER BY timestamp DESC
            LIMIT @MaxDataPoints";

      var prices = new List<PricePoint>();

      using var connection = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await connection.OpenAsync();

      using var command = new MySqlCommand(priceQuery, connection);
      command.Parameters.AddWithValue("@CoinName", coinName);
      command.Parameters.AddWithValue("@StartDate", startDate);
      command.Parameters.AddWithValue("@EndDate", endDate);
      command.Parameters.AddWithValue("@MaxDataPoints", maxDataPoints);

      using var reader = await command.ExecuteReaderAsync();

      while (await reader.ReadAsync())
      {
        prices.Add(new PricePoint
        {
          Timestamp = reader.GetDateTime("timestamp"),
          ValueUSD = reader.GetDouble("value_usd")
        });
      }

      // Reverse to get chronological order
      prices = prices.OrderBy(p => p.Timestamp).ToList();

      await _log.Db($"Fetched {prices.Count} price points for {coinName}. Latest: {prices.LastOrDefault()?.Timestamp}",
        null, "TRADE", viewDebugLogs);
      return prices;
    }
    catch (Exception ex)
    {
      await _log.Db($"Error fetching price history: {ex.Message}", null, "TRADE", viewErrorDebugLogs);
      return new List<PricePoint>();
    }
  }

  private async Task<decimal?> GetLastCheckedPrice(int userId, string coin)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    string sql = "SELECT price_usdc FROM trade_price_checks WHERE user_id = @userId AND coin = @coin ORDER BY timestamp DESC LIMIT 1";
    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@userId", userId);
      cmd.Parameters.AddWithValue("@coin", tmpCoin);
      var result = await cmd.ExecuteScalarAsync();
      return result != null ? Convert.ToDecimal(result) : null;
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:HFT) Error fetching last checked price: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
      return null;
    }
  }

  private async Task RecordPriceCheck(int userId, string coin, decimal price)
  {
    string tmpCoin = coin.ToUpper() == "BTC" ? "XBT" : coin.ToUpper();
    string sql = @"
			INSERT INTO trade_price_checks (user_id, coin, price_usdc, timestamp)
			VALUES (@userId, @coin, @price, UTC_TIMESTAMP())
			ON DUPLICATE KEY UPDATE 
				price_usdc = @price,
				timestamp = UTC_TIMESTAMP()";


    decimal roundedPrice = price > 1000m ? Math.Round(price, 2) : price;

    try
    {
      using var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@userId", userId);
      cmd.Parameters.AddWithValue("@coin", tmpCoin);
      cmd.Parameters.AddWithValue("@price", roundedPrice);
      await cmd.ExecuteNonQueryAsync();
      _ = _log.Db($"({tmpCoin}:{userId}:HFT) Recorded price check: {roundedPrice}", userId, "TRADE", viewDebugLogs);
    }
    catch (Exception ex)
    {
      _ = _log.Db($"({tmpCoin}:{userId}:HFT) Error recording price check: {ex.Message}", userId, "TRADE", viewErrorDebugLogs);
    }
  }

  private List<decimal?> CalculateEMA(List<decimal?> prices, int period)
  {
    if (prices == null || prices.Count == 0)
      return new List<decimal?>();

    var ema = new List<decimal?>();
    decimal multiplier = 2m / (period + 1);

    // Calculate SMA for the first period
    var initialWindow = prices.Take(period)
      .Where(p => p.HasValue)
      .ToList();

    if (initialWindow.Count < period)
    {
      // Not enough valid data points
      return Enumerable.Repeat<decimal?>(null, prices.Count).ToList();
    }

    decimal? sma = initialWindow.Average();

    // First period-1 values are null (not enough data)
    ema.AddRange(Enumerable.Repeat<decimal?>(null, period - 1));
    ema.Add(sma);

    // Calculate subsequent EMAs
    for (int i = period; i < prices.Count; i++)
    {
      if (!prices[i].HasValue || !ema[i - 1].HasValue)
      {
        ema.Add(null);
        continue;
      }

      decimal? currentEma = Math.Round(
        (prices[i].GetValueOrDefault(1) * multiplier) +
        (ema[i - 1].GetValueOrDefault(1) * (1 - multiplier)),
        4); // Reduced precision

      ema.Add(currentEma);
    }

    return ema;
  }

  private string NormalizeCoinPair(string fromCoin, string toCoin)
  {
    string normalizedFromCoin = fromCoin.ToUpper() switch
    {
      "BTC" => "XBT",
      "BCH" => "XBC",
      _ => fromCoin.ToUpper()
    };
    return $"{normalizedFromCoin}{toCoin.ToUpper()}";
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
