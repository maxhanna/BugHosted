namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class GetCommentsRequest
    {
        public int? FileId { get; set; }
        public int? StoryId { get; set; }
        public int? UserProfileId { get; set; }
    }
}
