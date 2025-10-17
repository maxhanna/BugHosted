using System.Net.Http;
using System.Net.Http.Json;
using System.Web;
using System.Text.Json;
using System.Linq;
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

        // Existing NewsAPI implementation moved here
        public async Task<ArticlesResult?> GetTopHeadlinesNewsApiAsync(string? q = null, string? language = "en")
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
                 
                var userAgent = "maxhanna-server/1.0 (+https://github.com/maxhanna/BugHosted)";
                try
                {
                    req.Headers.UserAgent.ParseAdd(userAgent);
                }
                catch
                {
                    req.Headers.Add("User-Agent", userAgent);
                }

                try { await _log.Db($"NewsHttpClient: NewsApi ApiKey length={(ApiKey ?? string.Empty).Length}", null, "NEWSSERVICE", false); } catch { }

                var resp = await _http.SendAsync(req);
                var respText = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    await _log.Db($"NewsHttpClient.NewsApi.NON-SUCCESS {(int)resp.StatusCode} {resp.ReasonPhrase}\n{respText}", null, "NEWSSERVICE", true);
                    return null;
                }

                ArticlesResult? body = null;
                try
                {
                    body = JsonSerializer.Deserialize<ArticlesResult>(respText);
                }
                catch (Exception ex)
                {
                    await _log.Db("NewsHttpClient.NewsApi - failed to deserialize response: " + ex.Message + "\nRawResponse:\n" + respText, null, "NEWSSERVICE", true);
                }
                return body;
            }
            catch (Exception ex)
            {
                await _log.Db("NewsHttpClient.NewsApi - failed: " + ex.Message, null, "NEWSSERVICE", true);
                return null;
            }
        }

        // MediaStack API implementation
        public async Task<ArticlesResult?> GetTopHeadlinesMediaStackApiAsync(string? q = null, string? language = "en")
        {
            try
            {
                var apiKey = _config.GetValue<string>("MediaStack:ApiKey") ?? string.Empty;
                var builder = new UriBuilder("http://api.mediastack.com/v1/news");
                var query = HttpUtility.ParseQueryString(string.Empty);
                if (!string.IsNullOrWhiteSpace(q)) query["keywords"] = q;
                // mediastack uses 'languages' param with comma-separated list (e.g., 'en')
                if (!string.IsNullOrWhiteSpace(language)) query["languages"] = language;
                query["access_key"] = apiKey;
                builder.Query = query.ToString();

                var req = new HttpRequestMessage(HttpMethod.Get, builder.ToString());
                var userAgent = "maxhanna-server/1.0 (+https://github.com/maxhanna/BugHosted)";
                try { req.Headers.UserAgent.ParseAdd(userAgent); } catch { req.Headers.Add("User-Agent", userAgent); }

                var resp = await _http.SendAsync(req);
                var respText = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    await _log.Db($"NewsHttpClient.MediaStack.NON-SUCCESS {(int)resp.StatusCode} {resp.ReasonPhrase}\n{respText}", null, "NEWSSERVICE", true);
                    return null;
                }

                // MediaStack response shape is different; parse into a dynamic object then map to ArticlesResult
                try
                {
                    using var doc = JsonDocument.Parse(respText);
                    var root = doc.RootElement;
                    var data = root.GetProperty("data");
                    var result = new ArticlesResult { Status = NewsStatuses.Ok, TotalResults = data.GetArrayLength(), Articles = new List<maxhanna.Server.Controllers.DataContracts.News.Article>() };
                    foreach (var item in data.EnumerateArray())
                    {
                        var art = new maxhanna.Server.Controllers.DataContracts.News.Article();
                        // Map common fields where possible
                        if (item.TryGetProperty("author", out var author)) art.Author = author.GetString();
                        if (item.TryGetProperty("title", out var title)) art.Title = title.GetString();
                        if (item.TryGetProperty("description", out var desc)) art.Description = desc.GetString();
                        if (item.TryGetProperty("url", out var url)) art.Url = url.GetString();
                        if (item.TryGetProperty("image", out var image)) art.UrlToImage = image.GetString();
                        if (item.TryGetProperty("published_at", out var pub))
                        {
                            if (DateTime.TryParse(pub.GetString(), out var dt)) art.PublishedAt = dt;
                        }
                        // MediaStack doesn't include content full body in many plans; leave Content as null or description
                        art.Content = art.Content ?? art.Description;
                        // Source mapping
                        var source = new maxhanna.Server.Controllers.DataContracts.News.ApiSource { Id = null, Name = null };
                        if (item.TryGetProperty("source", out var sourceObj))
                        {
                            if (sourceObj.ValueKind == JsonValueKind.Object)
                            {
                                if (sourceObj.TryGetProperty("name", out var sname)) source.Name = sname.GetString();
                            }
                            else if (sourceObj.ValueKind == JsonValueKind.String)
                            {
                                source.Name = sourceObj.GetString();
                            }
                        }
                        else if (item.TryGetProperty("source_id", out var sid))
                        {
                            source.Id = sid.GetString();
                        }
                        art.Source = source;
                        result.Articles.Add(art);
                    }
                    return result;
                }
                catch (Exception ex)
                {
                    await _log.Db("NewsHttpClient.MediaStack - failed to parse/map response: " + ex.Message + "\nRawResponse:\n" + respText, null, "NEWSSERVICE", true);
                    return null;
                }
            }
            catch (Exception ex)
            {
                await _log.Db("NewsHttpClient.MediaStack - failed: " + ex.Message, null, "NEWSSERVICE", true);
                return null;
            }
        }

        // Combined facade: call both providers and merge results (dedupe by URL)
        public async Task<ArticlesResult?> GetTopHeadlinesAsync(string? q = null, string? language = "en")
        {
            try
            {
                var taskA = GetTopHeadlinesNewsApiAsync(q, language);
                var taskB = GetTopHeadlinesMediaStackApiAsync(q, language);
                await Task.WhenAll(taskA, taskB);

                var a = taskA.Result;
                var b = taskB.Result;

                if (a == null && b == null) return null;
                if (a == null) return b;
                if (b == null) return a;

                // Merge and dedupe by URL (prefer NewsApi entries first)
                var map = new Dictionary<string, maxhanna.Server.Controllers.DataContracts.News.Article>(StringComparer.OrdinalIgnoreCase);
                if (a.Articles != null)
                {
                    foreach (var art in a.Articles)
                    {
                        if (string.IsNullOrWhiteSpace(art.Url)) continue;
                        if (!map.ContainsKey(art.Url)) map[art.Url] = art;
                    }
                }
                if (b.Articles != null)
                {
                    foreach (var art in b.Articles)
                    {
                        if (string.IsNullOrWhiteSpace(art.Url)) continue;
                        if (!map.ContainsKey(art.Url)) map[art.Url] = art;
                    }
                }

                var merged = new ArticlesResult
                {
                    Status = NewsStatuses.Ok,
                    TotalResults = map.Count,
                    Articles = map.Values.ToList()
                };

                return merged;
            }
            catch (Exception ex)
            {
                await _log.Db("NewsHttpClient.GetTopHeadlinesAsync - combine failed: " + ex.Message, null, "NEWSSERVICE", true);
                // Fallback to attempting sequential fetches
                try { return await GetTopHeadlinesNewsApiAsync(q, language) ?? await GetTopHeadlinesMediaStackApiAsync(q, language); } catch { return null; }
            }
        }
    }
}
