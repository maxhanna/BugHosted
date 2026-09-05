namespace maxhanna.Server.Controllers.DataContracts.Files
{
    public class RenameFileRequest
    {
        public int UserId { get; set; }
        public int FileId { get; set; }
        public string NewName { get; set; } = "";
    }
}
