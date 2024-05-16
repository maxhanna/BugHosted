namespace maxhanna.Server.Controllers.DataContracts
{
    public class CreateContact
    {
        public CreateContact(User user, Contact contact)
        {
            this.user = user;
            this.contact = contact;
        }
        public User user { get; set; }
        public Contact contact { get; set; }
    }
}
