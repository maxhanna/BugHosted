namespace maxhanna.Server.Controllers.DataContracts.Crawler
{
	public class YoutubeVideo
	{
		public string VideoId { get; set; } = "";
		public string Title { get; set; } = "";
		public string Description { get; set; } = "";
		public string ThumbnailUrl { get; set; } = "";
		public string Url => $"https://www.youtube.com/watch?v={VideoId}";
	}

}
