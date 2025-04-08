using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Contacts
{
	public class CreateUserContact
	{
		public CreateUserContact(int userId, int contactId)
		{
			this.userId = userId;
			this.contactId = contactId;
		}
		public int userId { get; set; }
		public int contactId { get; set; }
	}
}
