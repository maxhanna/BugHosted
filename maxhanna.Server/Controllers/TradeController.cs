using maxhanna.Server.Controllers.DataContracts.Crypto;
using Microsoft.AspNetCore.Mvc;

public class TradeController : ControllerBase
{
	private readonly ILogger<TradeController> _logger;
	private readonly IConfiguration _config;
	private readonly KrakenService _krakenService;

	public TradeController(
		ILogger<TradeController> logger,
		IConfiguration config,
		KrakenService krakenService)
	{
		_logger = logger;
		_config = config;
		_krakenService = krakenService;
	}

	[HttpPost("/Trade/GetWalletBalance", Name = "GetWalletBalance")]
	public async Task<IActionResult> GetWalletBalance([FromBody]string currency)
	{
		try
		{ 
			var time = await _krakenService.GetWalletBalances(1);
			return Ok(time);
		}
		catch (Exception ex)
		{
			_logger.LogError(ex, "Failed to get wallet balance for {currency}", currency);
			return StatusCode(500, "Error fetching balance");
		}
	}  
}