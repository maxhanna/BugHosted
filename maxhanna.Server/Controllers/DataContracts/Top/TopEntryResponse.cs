namespace maxhanna.Server.Controllers.DataContracts.Top
{
	public class TopEntryResponse
	{
		public int Id { get; set; }
		public string? Entry { get; set; }
		public string? Category { get; set; }
		public string? Url { get; set; }
		public int? UserId { get; set; }
		public DateTime CreatedAt { get; set; }
	}
}