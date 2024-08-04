using RestSharp;
using System.Text;

namespace maxhanna.Server.Controllers.Helpers
{
    class MiningApi
    {
        private string urlRoot = "https://api2.nicehash.com";

        private static string HashBySegments(string key, string apiKey, string time, string nonce, string orgId, string method, string encodedPath, string query, string? bodyStr)
        {
            List<string?> segments = new List<string?>
            {
                apiKey,
                time,
                nonce,
                null, 
                orgId,
                null,
                method,
                encodedPath ?? null,
                query ?? null
            };

            if (bodyStr != null && bodyStr.Length > 0)
            {
                segments.Add(bodyStr);
            }
            return CalcHMACSHA256Hash(JoinSegments(segments!), key);
        }
        private static string getPath(string url)
        {
            var arrSplit = url.Split('?');
            return arrSplit[0];
        }
        private static string? getQuery(string url)
        {
            var arrSplit = url.Split('?');

            if (arrSplit.Length == 1)
            {
                return null;
            }
            else
            {
                return arrSplit[1];
            }
        }

        private static string JoinSegments(List<string> segments)
        {
            var sb = new System.Text.StringBuilder();
            bool first = true;
            foreach (var segment in segments)
            {
                if (!first)
                {
                    sb.Append("\x00");
                }
                else
                {
                    first = false;
                }

                if (segment != null)
                {
                    sb.Append(segment);
                }
            }
            return sb.ToString();
        }

        private static string CalcHMACSHA256Hash(string plaintext, string salt)
        {
            string result = "";
            var enc = Encoding.Default;
            byte[]
            baText2BeHashed = enc.GetBytes(plaintext),
            baSalt = enc.GetBytes(salt);
            System.Security.Cryptography.HMACSHA256 hasher = new System.Security.Cryptography.HMACSHA256(baSalt);
            byte[] baHashedText = hasher.ComputeHash(baText2BeHashed);
            result = string.Join("", baHashedText.ToList().Select(b => b.ToString("x2")).ToArray());
            return result;
        }
        private string? getTime(Dictionary<string,string> apiKeys)
        {
            string? timeResponse = get(apiKeys, "/api/v2/time");

            if (!string.IsNullOrEmpty(timeResponse))
            {
                ServerTime? serverTimeObject = Newtonsoft.Json.JsonConvert.DeserializeObject<ServerTime>(timeResponse);
                return serverTimeObject?.serverTime;
            }
            else
            {
                return null;
            }
        }
        public string get(Dictionary<string, string> apiKeys, string url)
        {
            return this.get(apiKeys, url, false);
        }

        public string get(Dictionary<string,string> apiKeys, string url, bool auth)
        {
            try
            {
                var client = new RestSharp.RestClient(this.urlRoot);
                var request = new RestSharp.RestRequest(url);
                string orgId = apiKeys["orgId"];
                string apiKey = apiKeys["apiKey"];
                string apiSecret = apiKeys["apiSecret"];
                if (auth)
                {
                    string time = getTime(apiKeys)!;
                    if (string.IsNullOrEmpty(time))
                    {
                        return "";
                    }
                    string nonce = Guid.NewGuid().ToString();
                    string digest = HashBySegments(apiSecret, apiKey, time, nonce, orgId, "GET", getPath(url), getQuery(url)!, null);

                    request.AddHeader("X-Time", time);
                    request.AddHeader("X-Nonce", nonce);
                    request.AddHeader("X-Auth", apiKey + ":" + digest);
                    request.AddHeader("X-Organization-Id", orgId);
                }

                var response = client.Execute(request, Method.Get);
                var content = response.Content;
                return content!;
            }
            catch (Exception ex)
            {
                return "";
            }
        }

        public string post(Dictionary<string, string> apiKeys, string url, string payload, bool requestId)
        {
            var client = new RestSharp.RestClient(this.urlRoot);
            var request = new RestSharp.RestRequest(url);
            string orgId = apiKeys["orgId"];
            string apiKey = apiKeys["apiKey"];
            string apiSecret = apiKeys["apiSecret"];
            request.AddHeader("Accept", "application/json");
            request.AddHeader("Content-type", "application/json");

            string nonce = Guid.NewGuid().ToString();
            string time = getTime(apiKeys)!;
            string digest = HashBySegments(apiSecret, apiKey, time, nonce, orgId, "POST", getPath(url), getQuery(url)!, payload);

            if (payload != null)
            {
                request.AddJsonBody(payload);
            }

            request.AddHeader("X-Time", time);
            request.AddHeader("X-Nonce", nonce);
            request.AddHeader("X-Auth", apiKey + ":" + digest);
            request.AddHeader("X-Organization-Id", orgId);

            if (requestId)
            {
                request.AddHeader("X-Request-Id", Guid.NewGuid().ToString());
            }

            var response = client.Execute(request, Method.Post);
            var content = response.Content;
            return content!;
        }

        public string delete(Dictionary<string, string> apiKeys, string url, string time, bool requestId)
        {
            var client = new RestClient(this.urlRoot);
            var request = new RestRequest(url);
            string orgId = apiKeys["orgId"];
            string apiKey = apiKeys["apiKey"];
            string apiSecret = apiKeys["apiSecret"];

            string nonce = Guid.NewGuid().ToString();
            string digest = HashBySegments(apiSecret, apiKey, time, nonce, orgId, "DELETE", getPath(url), getQuery(url)!, null);

            request.AddHeader("X-Time", time);
            request.AddHeader("X-Nonce", nonce);
            request.AddHeader("X-Auth", apiKey + ":" + digest);
            request.AddHeader("X-Organization-Id", orgId);

            if (requestId)
            {
                request.AddHeader("X-Request-Id", Guid.NewGuid().ToString());
            }

            var response = client.Execute(request, Method.Delete);
            var content = response.Content;
            return content!;
        }
        public class ServerTime
        {
            public string? serverTime { get; set; }
        }
    }
}