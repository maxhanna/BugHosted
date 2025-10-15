using System.Collections.Generic;
using maxhanna.Server.Controllers.DataContracts.Files;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class EditCommentFilesRequest
    {
        public int UserId { get; set; }
        public int CommentId { get; set; }
        public List<FileEntry>? SelectedFiles { get; set; }
    }
}
