namespace maxhanna.Server.Controllers.DataContracts.Weather
{
	public class CreateWeatherLocation
	{
		public CreateWeatherLocation(int userId, string location, string? city, string? country)
		{
			this.userId = userId;
			this.location = location;
			this.city = city;
			this.country = country;
		}
		public int userId { get; set; }
		public string location { get; set; }
		public string? city { get; set; }
		public string? country { get; set; }
	}
}
