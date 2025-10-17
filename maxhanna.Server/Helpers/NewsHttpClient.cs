using System.Net.Http;
using System.Net.Http.Json;
using System.Web;
using maxhanna.Server.Controllers.DataContracts.News;

namespace maxhanna.Server.Helpers
{
    public class NewsHttpClient
    {
        private readonly HttpClient _http;
        private readonly IConfiguration _config;

        public NewsHttpClient(HttpClient http, IConfiguration config)
        {
            _http = http;
            _config = config;
        }

        private string ApiKey => _config.GetValue<string>("NewsApi:ApiKey") ?? string.Empty;

        public async Task<ArticlesResult?> GetTopHeadlinesAsync(string? q = null, string? language = "en")
        {
            try
            {
                var builder = new UriBuilder("https://newsapi.org/v2/top-headlines");
                var query = HttpUtility.ParseQueryString(string.Empty);
                if (!string.IsNullOrWhiteSpace(q)) query["q"] = q;
                if (!string.IsNullOrWhiteSpace(language)) query["language"] = language;
                builder.Query = query.ToString();

                var req = new HttpRequestMessage(HttpMethod.Get, builder.ToString());
                req.Headers.Add("X-Api-Key", ApiKey);
                var resp = await _http.SendAsync(req);
                if (!resp.IsSuccessStatusCode) return null;
                var body = await resp.Content.ReadFromJsonAsync<ArticlesResult>();
                return body;
            }
            catch
            {
                return null;
            }
        }
    }
}
