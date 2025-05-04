using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Users; 
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

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
	public async Task<IActionResult> GetTradeHistory([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (userId != 1 && !await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var time = await _krakenService.GetTradeHistory(userId);
			return Ok(time);
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error fetching balance. " + ex.Message, userId, "TRADE", true);
			return StatusCode(500, "Error fetching balance.");
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
	[HttpPost("/Trade/GetWeightedAveragePrices", Name = "GetWeightedAveragePrices")]
	public async Task<IActionResult> GetWeightedAveragePrices([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (userId != 1 && !await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var result = await _krakenService.GetWeightedAveragePrices(userId, "XBT", "USDC"); 
			return Ok(result);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error GetWeightedAveragePrices. " + ex.Message);
		}
	}
	[HttpPost("/Trade/StartBot", Name = "StartBot")]
	public async Task<IActionResult> StartBot([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var result = await _krakenService.StartBot(userId);
			return Ok(result ? "Trading bot has started." : "Unable to start the trade bot.");
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error starting trade bot. " + ex.Message);
		}
	}
	[HttpPost("/Trade/StopBot", Name = "StopBot")]
	public async Task<IActionResult> StopBot([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			var result = await _krakenService.StopBot(userId);
			return Ok(result ? "Trading bot has stopped." : "Unable to stop the trade bot.");
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error stopping trade bot. " + ex.Message);
		}
	}

	[HttpPost("/Trade/IsTradebotStarted", Name = "IsTradebotStarted")]
	public async Task<IActionResult> IsTradebotStarted([FromBody] int userId, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			DateTime? result = await _krakenService.IsTradebotStarted(userId);
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
			DateTime? result = await _krakenService.GetTradeConfigurationLastUpdate(userId, from, to);
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
		string from = keys.FromCoin ?? "";
		string to = keys.ToCoin ?? "";
		if (userId == 0)
		{
			return BadRequest("You must be logged in.");
		}
		try
		{
			if (!await _log.ValidateUserLoggedIn(userId, encryptedUserId)) return StatusCode(500, "Access Denied.");
			TradeConfiguration? tc = await _krakenService.GetTradeConfiguration(userId, "XBT", "USDC");
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
	public async Task<IActionResult> UpsertTradeConfiguration(
		[FromBody] TradeConfiguration config,
		[FromHeader(Name = "Encrypted-UserId")] string encryptedUserId)
	{
		string from = config.FromCoin ?? "";
		string to = config.ToCoin ?? "";
		int userId = config.UserId;
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
			if (!await _log.ValidateUserLoggedIn(config.UserId, encryptedUserId))
				return StatusCode(500, "Access Denied.");

			var worked = await _krakenService.UpsertTradeConfiguration(
					userId,
					from,
					to,
					config.MaximumFromTradeAmount ?? 0,
					config.MinimumFromTradeAmount ?? 0,
					config.TradeThreshold ?? 0,
					config.MaximumTradeBalanceRatio ?? 0,
					config.MaximumToTradeAmount ?? 0,
					config.ValueTradePercentage ?? 0,
					config.FromPriceDiscrepencyStopPercentage ?? 0,
					config.InitialMinimumFromAmountToStart ?? 0,
					config.MinimumFromReserves ?? 0,
					config.MinimumToReserves ?? 0,
					config.MaxTradeTypeOccurances ?? 0,
					config.VolumeSpikeMaxTradeOccurance ?? 0
			);

			return worked ? Ok(worked) : BadRequest("Something went wrong. Check input data.");
		}
		catch (Exception ex)
		{
			_ = _log.Db("Error upserting trade config. " + ex.Message, config.UserId, "TRADE", true);
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
			bool ok = await _krakenService.EnterPosition(userId);
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
			bool ok = await _krakenService.ExitPosition(userId);
			return Ok(ok);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error ExitPosition. " + ex.Message);
		}
	}
}