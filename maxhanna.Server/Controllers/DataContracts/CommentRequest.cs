namespace maxhanna.Server.Controllers.DataContracts
{
    public class CommentRequest
    {
        public CommentRequest(User? user, int? fileId, int? storyId, List<FileEntry>? selectedFiles, string comment)
        {
            User = user;
            StoryId = storyId;
            FileId = fileId;
            Comment = comment;
            SelectedFiles = selectedFiles;
        }
        public User? User { get; set; }
        public int? FileId { get; set; }
        public int? StoryId { get; set; }
        public string Comment { get; set; }
        public List<FileEntry>? SelectedFiles { get; set; }
    }
}
