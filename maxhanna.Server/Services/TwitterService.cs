using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace maxhanna.Server.Services
{
	public class TwitterService
	{
		private readonly string _clientId;
		private readonly string _clientSecret;
		private readonly string _accessTokenSecret;
		private readonly HttpClient _httpClient;

		public TwitterService(string clientId, string clientSecret, string accessTokenSecret)
		{
			_clientId = clientId;
			_clientSecret = clientSecret;
			_accessTokenSecret = accessTokenSecret;
			_httpClient = new HttpClient();
		}

		// Step 1: Get the OAuth 2.0 token using user context
		public async Task<string> GetAccessTokenAsync(string authorizationCode, string redirectUri)
		{
			var url = "https://api.twitter.com/oauth2/token";
			var content = new FormUrlEncodedContent(new[]
			{
								new KeyValuePair<string, string>("client_id", _clientId),
								new KeyValuePair<string, string>("client_secret", _clientSecret),
								new KeyValuePair<string, string>("code", authorizationCode),
								new KeyValuePair<string, string>("redirect_uri", redirectUri),
								new KeyValuePair<string, string>("grant_type", "authorization_code")
						});

			var response = await _httpClient.PostAsync(url, content);
			if (response.IsSuccessStatusCode)
			{
				var responseContent = await response.Content.ReadAsStringAsync();
				var tokenJson = JsonDocument.Parse(responseContent);
				var accessToken = tokenJson.RootElement.GetProperty("access_token").GetString();
				Console.WriteLine($"Access token received: {accessToken}");
				return accessToken; // Store this token for making requests on behalf of the user
			}
			else
			{
				Console.WriteLine("Failed to get access token.");
				return null;
			}
		}

		// Step 2: Post Tweet with Image URL (Using OAuth 2.0 User Context)
		public async Task<bool> PostTweetWithImage(string accessToken, string status, string imageUrl)
		{
			var url = "https://api.twitter.com/2/tweets"; // API v2 endpoint for posting a tweet

			var tweetData = new
			{
				status = status, // The tweet content
				media = new[] { new { media_url = imageUrl } } // Assuming you're adding an image URL
			};

			var content = new StringContent(JsonSerializer.Serialize(tweetData), Encoding.UTF8, "application/json");

			var request = new HttpRequestMessage(HttpMethod.Post, url)
			{
				Content = content
			};

			// Add Authorization header with Bearer token (OAuth 2.0 User Context)
			request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

			var response = await _httpClient.SendAsync(request);
			if (response.IsSuccessStatusCode)
			{
				Console.WriteLine("Tweet posted successfully!");
				return true;
			}
			else
			{
				Console.WriteLine($"Failed to post tweet. Response: {response.StatusCode}");
				var responseContent = await response.Content.ReadAsStringAsync();
				Console.WriteLine($"Error details: {responseContent}");
				return false;
			}
		}

		// Step 3: Upload Media (Image or Video) to Twitter
		public async Task<string> UploadMedia(string accessToken, string mediaFilePath)
		{
			var uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
			var mediaData = new MultipartFormDataContent();

			mediaData.Add(new ByteArrayContent(await System.IO.File.ReadAllBytesAsync(mediaFilePath)), "media", System.IO.Path.GetFileName(mediaFilePath));

			var request = new HttpRequestMessage(HttpMethod.Post, uploadUrl)
			{
				Content = mediaData
			};

			request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

			var response = await _httpClient.SendAsync(request);
			if (response.IsSuccessStatusCode)
			{
				var responseContent = await response.Content.ReadAsStringAsync();
				var mediaJson = JsonDocument.Parse(responseContent);
				var mediaId = mediaJson.RootElement.GetProperty("media_id_string").GetString(); // Extract media_id
				Console.WriteLine($"Media uploaded successfully. Media ID: {mediaId}");
				return mediaId; // Return the media ID for posting the tweet
			}
			else
			{
				Console.WriteLine($"Failed to upload media. Response: {response.StatusCode}");
				var responseContent = await response.Content.ReadAsStringAsync();
				Console.WriteLine($"Error details: {responseContent}");
				return null;
			}
		}

		// Step 4: Post Tweet with Media (OAuth 2.0 User Context)
		public async Task<bool> PostTweetWithMedia(string accessToken, string status, string mediaId)
		{
			var url = "https://api.twitter.com/2/tweets"; // API v2 endpoint for posting a tweet

			var tweetData = new
			{
				status = status,
				media_ids = new[] { mediaId } // Attach uploaded media by media_id
			};

			var content = new StringContent(JsonSerializer.Serialize(tweetData), Encoding.UTF8, "application/json");

			var request = new HttpRequestMessage(HttpMethod.Post, url)
			{
				Content = content
			};

			request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

			var response = await _httpClient.SendAsync(request);
			if (response.IsSuccessStatusCode)
			{
				Console.WriteLine("Tweet with media posted successfully!");
				return true;
			}
			else
			{
				Console.WriteLine($"Failed to post tweet with media. Response: {response.StatusCode}");
				var responseContent = await response.Content.ReadAsStringAsync();
				Console.WriteLine($"Error details: {responseContent}");
				return false;
			}
		}

		public async Task<string> GetAuthorizationUrlAsync()
		{
			var url = "https://api.twitter.com/oauth2/authorize";

			// Create the parameters for the OAuth request
			var oauthParameters = new Dictionary<string, string>
		{
				{ "oauth_consumer_key", _clientId },
				{ "oauth_signature_method", "HMAC-SHA1" },
				{ "oauth_version", "1.0" },
				{ "oauth_callback", "https://your-redirect-uri.com" }  // The redirect URI you specified in your Twitter developer app
    };

			// Add any additional parameters if needed (you can use `oauth_nonce` and `oauth_timestamp` as in previous steps)
			oauthParameters["oauth_nonce"] = Guid.NewGuid().ToString("N");
			oauthParameters["oauth_timestamp"] = ((int)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds).ToString();

			// Sort parameters by name and construct the base string for signature
			var sortedParameters = oauthParameters.OrderBy(p => p.Key)
					.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}");

			string parameterString = string.Join("&", sortedParameters);
			string baseString = $"GET&{Uri.EscapeDataString(url)}&{Uri.EscapeDataString(parameterString)}";

			// Generate the OAuth signature
			string signature = GenerateOAuthSignature(baseString);

			// Add the signature to the parameters
			oauthParameters["oauth_signature"] = signature;

			// Build the OAuth header
			var oauthHeader = string.Join(", ", oauthParameters.Select(p => $"{p.Key}=\"{Uri.EscapeDataString(p.Value)}\""));

			// Make the request to Twitter's authorization endpoint
			var authUrl = $"{url}?{parameterString}&oauth_signature={Uri.EscapeDataString(signature)}";

			// Return the URL that the user can visit to authorize the app
			return authUrl;
		}
		private string GenerateOAuthSignature(string baseString)
		{
			using (var hmacsha1 = new HMACSHA1(Encoding.UTF8.GetBytes($"{_clientSecret}&{_accessTokenSecret}")))
			{
				byte[] hash = hmacsha1.ComputeHash(Encoding.UTF8.GetBytes(baseString));
				return Convert.ToBase64String(hash);
			}
		}


	}
}
