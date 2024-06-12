namespace maxhanna.Server.Controllers.DataContracts
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
