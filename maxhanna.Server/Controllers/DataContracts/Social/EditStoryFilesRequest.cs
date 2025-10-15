using System.Collections.Generic;
using maxhanna.Server.Controllers.DataContracts.Files;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
    public class EditStoryFilesRequest
    {
        public int UserId { get; set; }
        public int StoryId { get; set; }
        public List<FileEntry>? SelectedFiles { get; set; }
    }
}
