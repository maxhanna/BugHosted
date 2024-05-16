namespace maxhanna.Server.Controllers.DataContracts
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
