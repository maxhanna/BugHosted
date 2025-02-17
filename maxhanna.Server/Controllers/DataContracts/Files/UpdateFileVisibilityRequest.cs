using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
    public class UpdateFileVisibilityRequest
	{
        public User User { get; set; }
        public int FileId { get; set; }
        public bool IsVisible { get; set; }

        public UpdateFileVisibilityRequest(User User, int FileId, bool IsVisible)
        {
            this.User = User; 
            this.FileId = FileId; 
            this.IsVisible = IsVisible; 
        }
    }
}
