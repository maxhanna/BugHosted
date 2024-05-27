namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateWeatherLocation
    {
        public CreateWeatherLocation(User user, string location)
        {
            this.user = user;
            this.location = location;
        }
        public User user { get; set; }
        public string location { get; set; }
    }
}
