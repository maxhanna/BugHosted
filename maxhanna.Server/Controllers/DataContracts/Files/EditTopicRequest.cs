using maxhanna.Server.Controllers.DataContracts.Topics; 

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class EditTopicRequest
	{
		public EditTopicRequest(Topic[] topics, FileEntry file, int? userId)
		{
			this.UserId = userId;
			this.File = file;
			this.Topics = topics;
		}
		public int? UserId { get; set; }
		public FileEntry File { get; set; }
		public Topic[] Topics { get; set; }
	}
}
