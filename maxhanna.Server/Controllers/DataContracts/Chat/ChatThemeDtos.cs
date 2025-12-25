using maxhanna.Server.Controllers.DataContracts.Files;

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
        // If a saved user theme is linked to this chat, return its full properties
        public UserThemeDto? UserTheme { get; set; }
    }

    public class SetChatThemeRequest
    {
        public int ChatId { get; set; }
        public string Theme { get; set; } = "";
        public int? UserThemeId { get; set; }
    }

    public class UserThemeDto
    {
        public int Id { get; set; }
        public int? UserId { get; set; }
        public FileEntry? BackgroundImage { get; set; }
        public string? FontColor { get; set; }
        public string? SecondaryFontColor { get; set; }
        public string? ThirdFontColor { get; set; }
        public string? BackgroundColor { get; set; }
        public string? ComponentBackgroundColor { get; set; }
        public string? SecondaryComponentBackgroundColor { get; set; }
        public string? MainHighlightColor { get; set; }
        public string? MainHighlightColorQuarterOpacity { get; set; }
        public string? LinkColor { get; set; }
        public int? FontSize { get; set; }
        public string? FontFamily { get; set; }
        public string Name { get; set; } = "";
    }
}
