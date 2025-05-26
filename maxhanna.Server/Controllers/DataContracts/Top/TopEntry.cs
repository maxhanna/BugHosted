namespace maxhanna.Server.Controllers.DataContracts.Top
{
	public class TopEntry
	{
		public int Id { get; set; }
		public string? Entry { get; set; }
		public string? Category { get; set; }
		public string? Text { get; set; }
		public string? Url { get; set; }

		public string? ImgUrl { get; set; }
		public int? UserId { get; set; }
		public DateTime CreatedAt { get; set; }
		public int TotalVotes { get; set; }
		public int Upvotes { get; set; }
		public int Downvotes { get; set; }
	} 
}