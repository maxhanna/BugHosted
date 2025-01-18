using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Social
{
    public class EditTopicRequest
	{
        public EditTopicRequest(Topic[] topics, Story story, User? user)
        {
            this.User = user;
            this.Story = story;
            this.Topics = topics;
        }
        public User? User { get; set; }
        public Story Story { get; set; }
        public Topic[] Topics { get; set; }
    }
}
