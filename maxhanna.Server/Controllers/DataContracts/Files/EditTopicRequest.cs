using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class EditTopicRequest
	{
		public EditTopicRequest(Topic[] topics, FileEntry file, User? user)
		{
			this.User = user;
			this.File = file;
			this.Topics = topics;
		}
		public User? User { get; set; }
		public FileEntry File { get; set; }
		public Topic[] Topics { get; set; }
	}
}
