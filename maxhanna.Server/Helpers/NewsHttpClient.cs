using System.Net.Http;
using System.Net.Http.Json;
using System.Web;
using System.Text.Json;
using maxhanna.Server.Controllers.DataContracts.News;

namespace maxhanna.Server.Helpers
{
    public class NewsHttpClient
    {
        private readonly HttpClient _http;
        private readonly IConfiguration _config;
        private readonly Log _log;

        public NewsHttpClient(HttpClient http, IConfiguration config, Log log)
        {
            _http = http;
            _config = config;
            _log = log;
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
                    var respText = await resp.Content.ReadAsStringAsync();
                    if (!resp.IsSuccessStatusCode)
                    {
                        // Log non-success status and response body for diagnosis
                        try
                        {
                            await _log.Db($"NewsHttpClient.GetTopHeadlinesAsync NON-SUCCESS: {(int)resp.StatusCode} {resp.ReasonPhrase}\n{respText}", null, "NEWSSERVICE", true);
                        }
                        catch { /* swallow logging errors */ }
                        return null;
                    }

                    ArticlesResult? body = null;
                    try
                    {
                        body = JsonSerializer.Deserialize<ArticlesResult>(respText);
                    }
                    catch (Exception ex)
                    {
                        try { await _log.Db("NewsHttpClient.GetTopHeadlinesAsync - failed to deserialize response: " + ex.Message + "\nRawResponse:\n" + respText, null, "NEWSSERVICE", true); } catch { }
                    }

                    try { await _log.Db("NewsHttpClient.GetTopHeadlinesAsync - response body:\n" + (respText ?? ""), null, "NEWSSERVICE", true); } catch { }

                    return body;
            }
            catch (Exception ex)
            {
                try { await _log.Db("NewsHttpClient.GetTopHeadlinesAsync Exception: " + ex.Message, null, "NEWSSERVICE", true); } catch { }
                return null;
            }
        }
    }
}
