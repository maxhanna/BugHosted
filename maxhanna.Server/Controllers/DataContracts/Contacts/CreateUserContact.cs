using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Contacts
{
	public class CreateUserContact
	{
		public CreateUserContact(User user, User contact)
		{
			this.user = user;
			this.contact = contact;
		}
		public User user { get; set; }
		public User contact { get; set; }
	}
}
