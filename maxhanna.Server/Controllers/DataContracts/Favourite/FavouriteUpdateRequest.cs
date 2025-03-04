namespace maxhanna.Server.Controllers.DataContracts.Favourite
{
	public class FavouriteUpdateRequest
	{  
		public required string Url { get; set; }
		public string? ImageUrl { get; set; }
		public int CreatedBy { get; set; } 
		public int? Id { get; set; } 
		public string? Name { get; set; } 
	}
}
