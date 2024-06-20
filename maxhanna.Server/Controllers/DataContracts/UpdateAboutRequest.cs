namespace maxhanna.Server.Controllers.DataContracts
{
    public class UpdateAboutRequest
    {
        public User User { get; set; }
        public UserAbout About { get; set; } 

        public UpdateAboutRequest(User user, UserAbout about)
        {
            User = user;
            About = about; 
        }
    }
}
