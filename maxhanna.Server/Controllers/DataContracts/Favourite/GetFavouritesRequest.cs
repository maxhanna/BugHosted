namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class GetFavouritesRequest
	{  
		public string? Search { get; set; }
		public int Page { get; set; } = 1;
		public int PageSize { get; set; } = 20;
		public bool ShowAll { get; set; } = false;
		public string? OrderBy { get; set; } 
		public int? UserId { get; set; } = null;
	}
}
