using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class ShareFileRequest
	{
		public ShareFileRequest(int user1Id, int user2Id)
		{
			User1Id = user1Id;
			User2Id = user2Id;
		}
		public int User1Id { get; set; }
		public int User2Id { get; set; }
	}
}
