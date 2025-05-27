namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class StoryResponse
	{
		public int PageCount { get; set; }
		public int CurrentPage { get; set; }
		public int TotalCount { get; set; }
		public List<Story> Stories { get; set; }
		public List<Poll> Polls { get; set; } = new List<Poll>(); 
		public StoryResponse()
		{
			Stories = new List<Story>();
		}
	}
}
