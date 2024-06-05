namespace maxhanna.Server.Controllers.DataContracts
{
    public class UpDownVoteCounts
    {
        public int? Upvotes { get; set; }
        public int? Downvotes { get; set; }

        public UpDownVoteCounts() { }
        public UpDownVoteCounts(int? upvotes, int? downvotes)
        {
            Upvotes = upvotes;
            Downvotes = downvotes;
        }
    }
}
