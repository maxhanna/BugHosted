using System.Text.Json.Serialization;

namespace maxhanna.Server.Services.NewsApiDtos
{
    public class ArticlesResult
    {
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("totalResults")] public int TotalResults { get; set; }
        [JsonPropertyName("articles")] public List<Article>? Articles { get; set; } = new List<Article>();
        [JsonPropertyName("code")] public string? Code { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
    }

    public class Article
    {
        [JsonPropertyName("source")] public Source? Source { get; set; }
        [JsonPropertyName("author")] public string? Author { get; set; }
        [JsonPropertyName("title")] public string? Title { get; set; }
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("url")] public string? Url { get; set; }
        [JsonPropertyName("urlToImage")] public string? UrlToImage { get; set; }
        [JsonPropertyName("publishedAt")] public DateTime? PublishedAt { get; set; }
        [JsonPropertyName("content")] public string? Content { get; set; }
    }

    public class Source
    {
        [JsonPropertyName("id")] public string? Id { get; set; }
        [JsonPropertyName("name")] public string? Name { get; set; }
    }

    public static class NewsStatuses
    {
        public const string Ok = "ok";
        public const string Error = "error";
    }

    public class Error
    {
        public string? Code { get; set; }
        public string? Message { get; set; }
    }
}
