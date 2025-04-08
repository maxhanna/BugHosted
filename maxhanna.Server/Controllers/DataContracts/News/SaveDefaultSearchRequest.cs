using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Weather
{
	public class SaveDefaultSearchRequest
	{
		public SaveDefaultSearchRequest(int UserId, string Search)
		{
			this.UserId = UserId;
			this.Search = Search;
		}
		public int UserId { get; set; }
		public string Search { get; set; }
	}
}
