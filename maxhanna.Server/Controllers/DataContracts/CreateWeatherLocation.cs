namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateWeatherLocation
    {
        public CreateWeatherLocation(User user, WeatherLocation location)
        {
            this.user = user;
            this.location = location;
        }
        public User user { get; set; }
        public WeatherLocation location { get; set; }
    }
}
