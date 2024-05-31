namespace maxhanna.Server.Controllers.DataContracts
{
    public class CommentRequest
    {
        public CommentRequest(User user, int fileId, string comment)
        {
            User = user;
            FileId = fileId;
            Comment = comment;
        }
        public User User { get; set; }
        public int FileId { get; set; }
        public string Comment { get; set; }
    }
}
