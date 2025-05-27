namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class Poll
	{
		public string ComponentId { get; set; } = string.Empty;
		public string Question { get; set; } = string.Empty;
		public List<PollOption> Options { get; set; } = new List<PollOption>();
		public List<PollVote> UserVotes { get; set; } = new List<PollVote>();
		public int TotalVotes { get; set; }
		public DateTime CreatedAt { get; set; }
	}

	public class PollOption
	{
		public string Id { get; set; } = string.Empty; // Unique identifier for the option (e.g., "1", "2", or option text)
		public string Text { get; set; } = string.Empty; // Display text for the option
		public int VoteCount { get; set; }
		public int Percentage { get; set; }
	}

	public class PollVote
	{
		public int Id { get; set; }
		public int UserId { get; set; }
		public string ComponentId { get; set; } = string.Empty;
		public string Value { get; set; } = string.Empty; // The selected option's ID or text
		public DateTime Timestamp { get; set; }
		public string Username { get; set; } = string.Empty;
		public string? DisplayPicture { get; set; }
	}
}