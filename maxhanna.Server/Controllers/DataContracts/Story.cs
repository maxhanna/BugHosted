namespace maxhanna.Server.Controllers.DataContracts
{
    public class Story
    {
        public int Id { get; set; }
        public User? User{ get; set; } 
        public string? StoryText { get; set; }
        public int? FileId { get; set; }
        public DateTime Date { get; set; }
        public int Upvotes { get; set; }
        public int Downvotes { get; set; }
        public int CommentsCount { get; set; }
        public MetadataDto? Metadata { get; set; }
        public List<FileEntry>? StoryFiles {  get; set; }

        public Story() { }

        public Story(int id, User user, string storyText, int? fileId, 
            DateTime date, int upvotes, int downvotes, int commentsCount, MetadataDto? metaData, List<FileEntry> storyFiles)
        {
            Id = id;
            User = user;
            StoryText = storyText;
            FileId = fileId;
            Date = date;
            Upvotes = upvotes;
            Downvotes = downvotes;
            CommentsCount = commentsCount;
            Metadata = metaData;
            StoryFiles = storyFiles;
        } 
    }
}