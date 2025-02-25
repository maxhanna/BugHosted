namespace maxhanna.Server.Controllers.DataContracts.Weather
{
	public class Condition
	{
		public string? text { get; set; }
		public string? icon { get; set; }
	}

	public class Hour
	{
		public string? time { get; set; }
		public double? temp_c { get; set; }
		public double? temp_f { get; set; }
		public Condition? condition { get; set; }
		public double? wind_kph { get; set; }
		public double? wind_mph { get; set; }
		public int? humidity { get; set; }
		public int? cloud { get; set; }
	}

	public class ForecastDay
	{
		public string? date { get; set; }
		public Hour[]? hour { get; set; }
	}

	public class Forecast
	{
		public ForecastDay[]? forecastday { get; set; }
	}

	public class Current
	{
		public string? last_updated { get; set; }
		public double? temp_c { get; set; }
		public double? temp_f { get; set; }
		public Condition? condition { get; set; }
		public double? wind_kph { get; set; }
		public double? wind_mph { get; set; }
		public int? humidity { get; set; }
		public int? cloud { get; set; }
	}

	public class WeatherForecast
	{
		public Current? current { get; set; }
		public Forecast? forecast { get; set; }
	}
}
