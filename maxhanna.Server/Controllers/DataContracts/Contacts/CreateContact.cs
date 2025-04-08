using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Contacts
{
	public class CreateContact
	{
		public CreateContact(int userId, Contact contact)
		{
			this.userId = userId;
			this.contact = contact;
		}
		public int userId { get; set; }
		public Contact contact { get; set; }
	}
}
