namespace maxhanna.Server.Controllers.DataContracts.Weather
{
	public class WeatherLocation
	{
		public int Ownership { get; set; }
		public string? Location { get; set; }
		public string? City { get; set; }
		public string? Country { get; set; }
	}
}
