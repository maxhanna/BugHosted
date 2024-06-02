namespace maxhanna.Server.Controllers.DataContracts
{
    public class User
    {
        public int Id { get; set; }
        public string Username { get; set; }
        public string? Pass { get; set; }
        public User() {  }
        public User(int id, string username, string? pass)
        {
            Id = id;
            Username = username;
            Pass = pass;
        }
        public User(int id, string username)
        {
            Id = id;
            Username = username;
        }
    }
}
