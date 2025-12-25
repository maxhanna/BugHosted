using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Chat
{
    public class GetChatThemeRequest
    {
        public int ChatId { get; set; }
    }

    public class GetChatThemeResponse
    {
        public string Theme { get; set; } = "";
        public int? UserThemeId { get; set; }
        public UserTheme? UserTheme { get; set; }
    }

    public class SetChatThemeRequest
    {
        public int ChatId { get; set; }
        public string Theme { get; set; } = "";
        public int? UserThemeId { get; set; }
    } 
}
