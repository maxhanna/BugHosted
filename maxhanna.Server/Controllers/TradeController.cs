using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;

public class TradeController : ControllerBase
{ 
	private readonly KrakenService _krakenService; 

	public TradeController(KrakenService krakenService)
	{ 
		_krakenService = krakenService;
	}

	[HttpPost("/Trade/GetWalletBalance", Name = "GetWalletBalance")]
	public async Task<IActionResult> GetWalletBalance([FromBody] string currency)
	{
		try
		{
			var time = await _krakenService.GetWalletBalances(1);
			return Ok(time);
		}
		catch (Exception ex)
		{
			return StatusCode(500, "Error fetching balance");
		}
	}

	[HttpPost("/Trade/UpdateApiKey", Name = "UpdateApiKey")]
	public async Task<IActionResult> UpdateApiKey([FromBody] UpdateApiKeyRequest request)
	{
		try
		{
			await _krakenService.UpdateApiKey(request);
			return Ok();
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
			bool key = await _krakenService.CheckIfUserHasApiKey(userId);
			return Ok(key);
		}
		catch (Exception)
		{
			return StatusCode(500, "Error getting API key");
		}
	}
}