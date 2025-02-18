using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Chat
{
	public class GetChatUsersByChatIdRequest
	{
        public int? ChatId { get; set; }
        public User? User { get; set; } 
    } 
}
