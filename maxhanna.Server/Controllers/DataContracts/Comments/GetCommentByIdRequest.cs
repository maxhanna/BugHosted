using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Comments
{
    public class GetCommentByIdRequest
    {
        public int CommentId { get; set; }
        public int? UserId { get; set; }
    }
}