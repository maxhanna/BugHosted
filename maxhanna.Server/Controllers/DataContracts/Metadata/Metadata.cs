namespace maxhanna.Server.Controllers.DataContracts.Metadata
{
	public class Metadata
	{
		public int? Id { get; set; }
		public string? Url { get; set; }
		public string? Title { get; set; }
		public string? Description { get; set; }
		public string? Keywords { get; set; }
		public string? Author { get; set; }
		public string? ImageUrl { get; set; }
		public int? HttpStatus { get; set; } 
		public int? FavouriteCount { get; set; } 
		public bool? IsUserFavourite { get; set; }
	}
}
