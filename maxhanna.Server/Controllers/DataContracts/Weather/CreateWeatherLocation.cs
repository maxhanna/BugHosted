using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Weather
{
    public class CreateWeatherLocation
    {
        public CreateWeatherLocation(User user, string location, string? city)
        {
            this.user = user;
            this.location = location;
            this.city = city;
        }
        public User user { get; set; }
        public string location { get; set; }
        public string? city { get; set; }
    }
}
