namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class UpdateLastCharacterColorRequest
    {
        public int UserId { get; set; }
        public string? Color { get; set; }

        public UpdateLastCharacterColorRequest() { }
        public UpdateLastCharacterColorRequest(int userId, string? color)
        {
            UserId = userId;
            Color = color;
        }
    }
}
