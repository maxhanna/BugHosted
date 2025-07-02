using System.Security.Cryptography;
using maxhanna.Server.Controllers.DataContracts.Crypto;  
using Microsoft.AspNetCore.Mvc;

public class TradeController : ControllerBase
{
	private readonly KrakenService _krakenService;
	private readonly Log _log;

	public TradeController(KrakenService krakenService, Log log)
	{
		_krakenService = krakenService;
		_log = log;
	}

	[HttpPost("/Trade/GetTradeHistory", Name = "GetTradeHistory")]
	public async Task<IActionResult> GetTradeHistory([FromBody] TradebotStatusRequest req, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (req.UserId != 1 && !await _log.ValidateUserLoggedIn(req.UserId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var time = await _krakenService.GetTradeHistory(req.UserId, req.Coin ?? "XBT", "DCA");
			return Ok(time);
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error fetching trade history. " + ex.Message, req.UserId, "TRADE", true);
			return StatusCode(500, "Error fetching trade history.");
		}
	}

	[HttpPost("/Trade/UpdateApiKey", Name = "UpdateApiKey")]
	public async Task<IActionResult> UpdateApiKey([FromBody] UpdateApiKeyRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			await _krakenService.UpdateApiKey(request);
			return Ok("ApiKey Updated.");
		}
		catch (Exception)
		{
			return StatusCode(500, "Error updating API key");
		}
	}

	[HttpPost("/Trade/HasApiKey", Name = "HasApiKey")]
	public async Task<IActionResult> HasApiKey([FromBody] int userId)
	{
		try
		{
			bool result = await _krakenService.CheckIfUserHasApiKey(userId);
			return Ok(result);
		}
		catch (Exception)
		{
			return StatusCode(500, "Error getting API key");
		}
	}
	[HttpPost("/Trade/StartBot", Name = "StartBot")]
	public async Task<IActionResult> StartBot([FromBody] TradebotStatusRequest req, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var result = await _krakenService.StartBot(req.UserId, req.Coin);
			return Ok(result ? "Trading bot has started." : "Unable to start the trade bot.");
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error starting trade bot. " + ex.Message);
		}
	}
	[HttpPost("/Trade/StopBot", Name = "StopBot")]
	public async Task<IActionResult> StopBot([FromBody] TradebotStatusRequest req, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var result = await _krakenService.StopBot(req.UserId, req.Coin);
			return Ok(result ? "Trading bot has stopped." : "Unable to stop the trade bot.");
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error stopping trade bot. " + ex.Message);
		}
	}

	[HttpPost("/Trade/IsTradebotStarted", Name = "IsTradebotStarted")]
	public async Task<IActionResult> IsTradebotStarted([FromBody] TradebotStatusRequest req, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		string tmpCoin = req.Coin.ToLower();
		tmpCoin = tmpCoin == "xbt" ? "btc" : tmpCoin;
		try
		{
			if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			DateTime? result = await _krakenService.IsTradebotStarted(req.UserId, tmpCoin, req.Strategy ?? "DCA");
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error stopping trade bot. " + ex.Message);
		}
	}

	[HttpPost("/Trade/GetConfigurationLastUpdated", Name = "GetConfigurationLastUpdated")]
	public async Task<IActionResult> GetConfigurationLastUpdated([FromBody] TradeConfiguration keys, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		int userId = keys.UserId;
		string from = keys.FromCoin ?? "";
		string to = keys.ToCoin ?? "";


		if (userId == 0)
		{
			return BadRequest("You must be logged in.");
		}
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			DateTime? result = await _krakenService.GetTradeConfigurationLastUpdate(userId, from, to, keys.Strategy ?? "DCA");
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error stopping trade bot. " + ex.Message);
		}
	}

	[HttpPost("/Trade/GetConfiguration", Name = "GetConfiguration")]
	public async Task<IActionResult> GetConfiguration([FromBody] TradeConfiguration keys, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		int userId = keys.UserId;
		string from = keys.FromCoin?.ToUpper() ?? "";
		from = from == "BTC" ? "XBT" : from;
		string to = keys.ToCoin?.ToUpper() ?? "";
		if (userId == 0)
		{
			return BadRequest("You must be logged in.");
		}
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			TradeConfiguration? tc = await _krakenService.GetTradeConfiguration(userId, from, to, keys.Strategy ?? "DCA");
			return Ok(tc);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error GetConfiguration. " + ex.Message);
		}
	}

	[HttpPost("/Trade/GetTradeLogs", Name = "GetTradeLogs")]
	public async Task<IActionResult> GetTradeLogs([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (userId != 1 && !await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			List<Dictionary<string, object?>>? result = await _log.GetLogs(userId, "TRADE", 2500);
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error getting trade bot logs. " + ex.Message);
		}
	}
	[HttpPost("/Trade/GetTradeVolume", Name = "GetTradeVolume")]
	public async Task<IActionResult> GetTradeVolume([FromBody] int? days)
	{
		try
		{
			List<VolumeData>? result = await _krakenService.GetTradeMarketVolumesAsync("XBT", "USDC", days);
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error GetTradeMarketVolumesAsync. " + ex.Message);
		}
	}

	[HttpPost("/Trade/GetProfitData", Name = "GetProfitData")]
	public async Task<IActionResult> GetProfitData([FromBody] ProfitDataRequest req, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		if (req.UserId == 0)
		{
			return BadRequest("You must be logged in.");
		}
		try
		{
			if (req.UserId != 1 && !await _log.ValidateUserLoggedIn(req.UserId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			List<ProfitData>? result = await _krakenService.GetUserProfitDataAsync(req.UserId, req.Days);
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error GetProfitData. " + ex.Message);
		}
	}

	[HttpPost("/Trade/GetTradeVolumeForGraph", Name = "GetTradeVolumeForGraph")]
	public async Task<IActionResult> GetTradeVolumeForGraph([FromBody] GraphRangeRequest request)
	{
		try
		{
			List<VolumeData>? result = await _krakenService.GetTradeMarketVolumesForGraphAsync("XBT", "USDC", request);
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error GetTradeMarketVolumesAsync. " + ex.Message);
		}
	}

	[HttpPost("/Trade/UpsertTradeConfiguration", Name = "UpsertTradeConfiguration")]
	public async Task<IActionResult> UpsertTradeConfiguration([FromBody] TradeConfiguration req, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		string from = req.FromCoin ?? "";
		string to = req.ToCoin ?? "";
		int userId = req.UserId;
		if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to))
		{
			return BadRequest("From or To coin cannot be empty.");
		}
		if (userId == 0)
		{
			return BadRequest("You must be logged in.");
		}

		try
		{
			if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserId))
				return StatusCode(500, "Access Denied.");

			var worked = await _krakenService.UpsertTradeConfiguration(
					userId,
					from,
					to,
					req.Strategy ?? "DCA",
					req.MaximumFromTradeAmount ?? 0,
					req.MinimumFromTradeAmount ?? 0,
					req.TradeThreshold ?? 0,
					req.MaximumTradeBalanceRatio ?? 0,
					req.MaximumToTradeAmount ?? 0,
					req.ValueTradePercentage ?? 0,
					req.ValueSellPercentage ?? 0,
					req.InitialMinimumFromAmountToStart ?? 0,
					req.InitialMinimumUSDCAmountToStart ?? 0,
					req.InitialMaximumUSDCAmountToStart ?? 0,
					req.MinimumFromReserves ?? 0,
					req.MinimumToReserves ?? 0,
					req.MaxTradeTypeOccurances ?? 0,
					req.VolumeSpikeMaxTradeOccurance ?? 0,
					req.TradeStopLoss ?? 0
			);

			return worked ? Ok(worked) : BadRequest("Something went wrong. Check input data.");
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error upserting trade config. " + ex.Message, req.UserId, "TRADE", true);
			return StatusCode(500, "Error saving configuration.");
		}
	}

	[HttpPost("/Trade/EnterPosition", Name = "EnterPosition")]
	public async Task<IActionResult> EnterPosition([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		if (userId == 0)
		{
			return BadRequest("You must be logged in.");
		}
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			bool ok = await _krakenService.EnterPosition(userId, "BTC");
			return Ok(ok);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error EnterPosition. " + ex.Message);
		}
	}

	[HttpPost("/Trade/ExitPosition", Name = "ExitPosition")]
	public async Task<IActionResult> ExitPosition([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		if (userId == 0)
		{
			return BadRequest("You must be logged in.");
		}
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			bool ok = await _krakenService.ExitPosition(userId, "BTC", null, "XXX");
			return Ok(ok);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error ExitPosition. " + ex.Message);
		}
	}

	[HttpPost("/Trade/GetTradeIndicators", Name = "GetTradeIndicators")]
	public async Task<IActionResult> GetTradeIndicators([FromBody] TradebotIndicatorRequest req)
	{
		IndicatorData? ok = await _krakenService.GetIndicatorData(req.FromCoin, req.ToCoin);
		return Ok(ok);
	}

	[HttpPost("/Trade/GetMacdData", Name = "GetMacdData")]
	public async Task<IActionResult> GetMacdData([FromBody] MacdDataRequest request)
	{
		try
		{
			// Validate inputs
			if (string.IsNullOrWhiteSpace(request.FromCoin) || string.IsNullOrWhiteSpace(request.ToCoin))
			{
				_ = _log.Db($"Invalid coin pair: FromCoin={request.FromCoin}, ToCoin={request.ToCoin}", null, "TRADE", true);
				return BadRequest("FromCoin and ToCoin are required.");
			}
			if (request.Days <= 0 || request.Days > 720) // Kraken OHLC limit: ~720 days
			{
				_ = _log.Db("Invalid Days: {Days}", request.Days);
				return BadRequest("Days must be between 1 and 720.");
			}
			if (request.FastPeriod <= 0 || request.SlowPeriod <= 0 || request.SignalPeriod <= 0)
			{
				_ = _log.Db($"Invalid periods: Fast={request.FastPeriod}, Slow={request.SlowPeriod}, Signal={request.SignalPeriod}", null, "TRADE", true);
				return BadRequest("MACD periods must be positive.");
			}
			if (request.SlowPeriod <= request.FastPeriod)
			{
				_ = _log.Db($"SlowPeriod ({request.SlowPeriod}) must be greater than FastPeriod ({request.FastPeriod})", null, "TRADE", true);
				return BadRequest("SlowPeriod must be greater than FastPeriod.");
			}

			var result = await _krakenService.GetMacdData(
				request.FromCoin,
				request.ToCoin,
				request.Days,
				request.FastPeriod,
				request.SlowPeriod,
				request.SignalPeriod
			);
			return Ok(result);
		}
		catch (Exception ex)
		{
			_ = _log.Db($"Error getting MACD data for FromCoin: {request.FromCoin}, ToCoin: {request.ToCoin}, Days: {request.Days}", null, "TRADE", true);
			return StatusCode(500, $"Error getting MACD data: {ex.Message}");
		}
	}
}  