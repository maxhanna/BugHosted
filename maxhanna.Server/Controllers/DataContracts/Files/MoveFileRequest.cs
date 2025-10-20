namespace maxhanna.Server.Controllers.DataContracts.Files
{
    public class MoveFileRequest
    {
        public MoveFileRequest() { }
        public MoveFileRequest(int userId, int? fileId)
        {
            UserId = userId;
            FileId = fileId;
        }
        public int UserId { get; set; }
        public int? FileId { get; set; }
        public string? InputFile { get; set; }
        public string? DestinationFolder { get; set; }
    }
}
