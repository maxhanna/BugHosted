using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class AddFavouriteRequest
	{ 
		public required int FavouriteId { get; set; }
		public required int UserId { get; set; } 
	}
}
