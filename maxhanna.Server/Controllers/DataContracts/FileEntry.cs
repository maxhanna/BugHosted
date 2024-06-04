namespace maxhanna.Server.Controllers.DataContracts
{
    public class FileEntry
    {
        public FileEntry() { }
        public FileEntry(int id, string name, string visibility, string sharedWith, string username, int userId, bool isFolder, int upvotes, int downvotes, int commentCount, DateTime date)
        {
            Id = id;
            Name = name;
            Visibility = visibility;
            SharedWith = sharedWith;
            Username = username;
            UserId = userId;
            IsFolder = isFolder;
            Upvotes = upvotes;
            Downvotes = downvotes;
            CommentCount = commentCount;
            Date = date;
        }
        public int Id { get; set; }
        public string? Name { get; set; }
        public string? Visibility { get; set; }
        public string? SharedWith { get; set; }
        public string? Username { get; set; }
        public int UserId { get; set; }
        public bool IsFolder { get; set; }
        public int? Upvotes { get; set; }
        public int? Downvotes { get; set; }
        public int? CommentCount { get; set; }
        public DateTime Date { get; set; }
    }
}
