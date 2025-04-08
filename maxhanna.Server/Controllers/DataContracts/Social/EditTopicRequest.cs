using maxhanna.Server.Controllers.DataContracts.Topics; 

namespace maxhanna.Server.Controllers.DataContracts.Social
{
	public class EditTopicRequest
	{
		public EditTopicRequest(Topic[] topics, Story story)
		{ 
			this.Story = story;
			this.Topics = topics;
		} 
		public Story Story { get; set; }
		public Topic[] Topics { get; set; }
	}
}
