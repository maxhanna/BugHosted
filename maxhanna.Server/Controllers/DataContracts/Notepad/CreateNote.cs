using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Notepad
{
    public class CreateNote
    {
        public CreateNote(User user, string note)
        {
            this.user = user;
            this.note = note;
        }
        public User user { get; set; }
        public string note { get; set; }
    }
}
