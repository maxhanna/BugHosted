using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
    public class Story
    {
        public int Id { get; set; }
        public User? User { get; set; }
        public string? StoryText { get; set; }
        public int? FileId { get; set; }
        public DateTime Date { get; set; }
        public int Upvotes { get; set; }
        public int Downvotes { get; set; }
        public int CommentsCount { get; set; }
        public MetadataDto? Metadata { get; set; }
        public List<FileEntry>? StoryFiles { get; set; }
        public List<FileComment>? StoryComments { get; set; }
        public List<Topic>? StoryTopics { get; set; }
        public int? ProfileUserId { get; set; }
        public List<Reaction>? Reactions { get; set; }

        public Story() { }

        public Story(int id, User user, string storyText, int? fileId,
            DateTime date, int upvotes, int downvotes, int commentsCount, MetadataDto? metaData,
            List<FileEntry> storyFiles, List<FileComment> storyComments, List<Topic> storyTopics,
            int? profileUserId, List<Reaction>? reactions)
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
            StoryComments = storyComments;
            StoryTopics = storyTopics;
            ProfileUserId = profileUserId;
            Reactions = reactions;
        }
    }
}