namespace maxhanna.Server.Controllers.DataContracts.Crawler
{
	public class CrawlerRequest
	{
		public string? Url { get; set; }
		public int PageSize { get; set; }
		public int CurrentPage { get; set; }
		public bool? ExactMatch { get; set; }
		public bool? SkipScrape { get; set; }
	}
	 
}
