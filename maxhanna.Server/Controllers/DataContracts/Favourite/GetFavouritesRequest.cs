using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class GetFavouritesRequest
	{ 
		public required User User { get; set; }
		public string? Search { get; set; } 
	}
}
