using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Weather
{
    public class SaveDefaultSearchRequest
	{
        public SaveDefaultSearchRequest(User User, string Search)
        {
            this.User = User;
            this.Search = Search; 
        }
        public User User { get; set; }
        public string Search { get; set; } 
    }
}
