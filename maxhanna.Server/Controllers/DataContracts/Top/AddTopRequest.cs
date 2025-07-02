using maxhanna.Server.Controllers.DataContracts.Topics;

namespace maxhanna.Server.Controllers.DataContracts.Top
{
	public class AddTopRequest
	{
		public required string Entry { get; set; }
		public required Topic[] Topics { get; set; }
		public string? Url { get; set; }
		public string? Text { get; set; }
		public int? Picture { get; set; }
		public int? UserId { get; set; } 
	} 
}
