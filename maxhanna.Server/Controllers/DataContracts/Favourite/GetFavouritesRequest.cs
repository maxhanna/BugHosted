using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class GetFavouritesRequest
	{  
		public string? Search { get; set; }
		public int Page { get; set; } = 1;
		public int PageSize { get; set; } = 20;
	}
}
