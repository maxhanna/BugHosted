namespace maxhanna.Server.Controllers.DataContracts.Top
{
	public class AddTopRequest
	{
		public required string Entry { get; set; }
		public required string Category { get; set; }
		public required int UserId { get; set; } 
	} 
}
