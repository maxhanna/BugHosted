using System.Net.Http.Headers;
using System.Text;

namespace maxhanna.Server.Services
{
    public class EmailService
    {
        private readonly HttpClient _httpClient;
        private readonly string _apiKey;
        private readonly string _baseUrl;
        private readonly string _sandboxUrl;
        private readonly Log _log;

        public EmailService(IConfiguration config, Log log, HttpClient httpClient)
        {
            _apiKey = config["Mailgun:ApiKey"] ?? throw new ArgumentNullException("Mailgun:ApiKey is not configured.");
            _baseUrl = config["Mailgun:BaseURL"] ?? "https://api.mailgun.net/v3";
            _sandboxUrl = config["Mailgun:SandboxURL"] ?? throw new ArgumentNullException("Mailgun:SandboxURL is not configured.");
            _log = log;
            _httpClient = httpClient;
            _httpClient.BaseAddress = new Uri(_baseUrl);

            var credentials = Convert.ToBase64String(Encoding.ASCII.GetBytes($"api:{_apiKey}"));
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        }

        /// <summary>
        /// Send a plain-text email via Mailgun.
        /// </summary>
        public async Task<bool> SendEmailAsync(string to, string subject, string textBody, string? from = null)
        {
            try
            {
                from ??= $"BugHosted <postmaster@{_sandboxUrl}>";

                var formData = new Dictionary<string, string>
                {
                    { "from", from },
                    { "to", to },
                    { "subject", subject },
                    { "text", textBody }
                };

                var response = await _httpClient.PostAsync(
                    $"/{_sandboxUrl}/messages",
                    new FormUrlEncodedContent(formData));

                if (response.IsSuccessStatusCode)
                {
                    _ = _log.Db($"Email sent successfully to {to}.", 0, "EMAIL");
                    return true;
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                _ = _log.Db($"Failed to send email to {to}. Status: {response.StatusCode}. Response: {errorContent}", 0, "EMAIL");
                return false;
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Exception sending email to {to}: {ex.Message}", 0, "EMAIL");
                return false;
            }
        }

        /// <summary>
        /// Send an HTML email via Mailgun.
        /// </summary>
        public async Task<bool> SendHtmlEmailAsync(string to, string subject, string htmlBody, string? from = null)
        {
            try
            {
                from ??= $"BugHosted <postmaster@{_sandboxUrl}>";

                var formData = new Dictionary<string, string>
                {
                    { "from", from },
                    { "to", to },
                    { "subject", subject },
                    { "html", htmlBody }
                };

                var response = await _httpClient.PostAsync(
                    $"/{_sandboxUrl}/messages",
                    new FormUrlEncodedContent(formData));

                if (response.IsSuccessStatusCode)
                {
                    _ = _log.Db($"HTML email sent successfully to {to}.", 0, "EMAIL");
                    return true;
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                _ = _log.Db($"Failed to send HTML email to {to}. Status: {response.StatusCode}. Response: {errorContent}", 0, "EMAIL");
                return false;
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Exception sending HTML email to {to}: {ex.Message}", 0, "EMAIL");
                return false;
            }
        }
    }
}
