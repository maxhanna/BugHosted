namespace maxhanna.Server.Controllers.DataContracts
{
    public class UpdateMemeRequest
    {
        public UpdateMemeRequest(User user, string text)
        {
            this.User = user;
            this.Text = text;
        }
        public User User { get; set; }
        public string Text { get; set; }
    }
}
