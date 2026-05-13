using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class FlightController : ControllerBase
	{
		private readonly IHttpClientFactory _httpClientFactory;
		private static List<object> _cachedStates = new List<object>();
		private static DateTime _lastFetch = DateTime.MinValue;
		private static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(15);

		public FlightController(IHttpClientFactory httpClientFactory)
		{
			_httpClientFactory = httpClientFactory;
		}

		[HttpGet("states")]
		public async Task<IActionResult> GetStates()
		{
			if (DateTime.UtcNow - _lastFetch < CacheDuration && _cachedStates.Count > 0)
			{
				return Ok(new { states = _cachedStates });
			}

			try
			{
				var client = _httpClientFactory.CreateClient();
				var response = await client.GetAsync("https://opensky-network.org/api/states/all");
				if (response.IsSuccessStatusCode)
				{
					var json = await response.Content.ReadAsStringAsync();
					var data = JsonConvert.DeserializeAnonymousType(json, new { states = new List<object>() });
					if (data?.states != null)
					{
						_cachedStates = data.states;
						_lastFetch = DateTime.UtcNow;
					}
				}
			}
			catch { }

			return Ok(new { states = _cachedStates });
		}
	}
}
