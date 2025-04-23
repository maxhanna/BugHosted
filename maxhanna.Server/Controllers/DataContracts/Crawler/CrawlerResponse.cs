namespace maxhanna.Server.Controllers.DataContracts.Crawler
{ 
	public class CrawlerResponse
	{
		public int Id { get; set; }
		public string? Url { get; set; }
		public string? Title { get; set; }
		public string? Description { get; set; }
	}
}
