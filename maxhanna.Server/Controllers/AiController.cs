using Google.Apis.Auth.OAuth2;
using maxhanna.Server.Controllers.DataContracts.Array;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class AiController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly HttpClient _httpClient;

		public AiController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
			_httpClient = new HttpClient();
		}


		[HttpPost("/Ai/SendMessageToAi", Name = "SendMessageToAi")]
		public async Task<IActionResult> SendMessageToAi([FromBody] AiRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			try
			{
				if (request.UserId != 0)
				{
					if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader))
						return StatusCode(500, "Access Denied.");
				}

				if (request == null || (string.IsNullOrWhiteSpace(request.Message) && request.FileId == null))
				{
					return BadRequest("Message cannot be empty.");
				}

				// Check usage limits
				bool hasExceeded = await HasExceededUsageLimit("text", request.UserId);
				if (hasExceeded)
				{
					return StatusCode(429, new { Reply = "You have exceeded the maximum number of text requests for this month." });
				}

				// Update usage count if needed
				if (!request.SkipSave)
				{
					await UpdateUserRequestCount(request.UserId, request.Message, "text");
				}

				// Ollama API URL
				string url = "http://localhost:11434/api/generate";
				string basePrompt = request.Message;

				// Handle length modifiers
				switch (request.MaxCount)
				{
					case 30: // Super short
						basePrompt += "\n\nRespond in one concise sentence. Do not elaborate.";
						break;
					case 200: // Short
						basePrompt += "\n\nRespond briefly. Keep it to a few sentences and avoid unnecessary detail.";
						break;
					case 450: // Medium
						basePrompt += "\n\nRespond with a moderate amount of detail. Two to three paragraphs is ideal.";
						break;
					case 600: // Long
						basePrompt += "\n\nRespond in detail. Feel free to explain thoroughly and give multiple examples if needed.";
						break;
					case 0: // Unfiltered
							// No modification - allow model to respond freely
						break;
					default:
						basePrompt += "\n\nRespond briefly.";
						break;
				}

				if (request.FileId.HasValue)
				{
					var descRes = await DescribeMedia(request.FileId.GetValueOrDefault(0));
					string? desc = descRes;
					if (!string.IsNullOrEmpty(desc))
					{
						// Incorporate media analysis into the prompt
						basePrompt = $"Media analysis: {desc}\n\nUser question: {basePrompt}";
					}
					else
					{
						_ = _log.Db($"Media analysis failed: no response.", null, "AiController", true);
					}
				}

				object requestBody = new
				{
					model = "gemma3",
					prompt = basePrompt,
					stream = false,
					max_tokens = request.MaxCount,
				};

				var jsonContent = new StringContent(
					JsonSerializer.Serialize(requestBody),
					Encoding.UTF8,
					"application/json"
				);

				// Log the full payload for debugging
				var payloadJson = JsonSerializer.Serialize(requestBody);
				_ = _log.Db($"Ollama payload: {payloadJson}", null, "AiController", true);

				using var httpReq = new HttpRequestMessage(HttpMethod.Post, url)
				{
					Content = jsonContent
				};

				// Send request to Ollama and get full response
				var ollamaResponse = await _httpClient.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead);
				var respBody = await ollamaResponse.Content.ReadAsStringAsync();

				if (!ollamaResponse.IsSuccessStatusCode)
				{
					// Log the full response for debugging
					_ = _log.Db($"Ollama API error {(int)ollamaResponse.StatusCode}: {respBody}", null, "AiController", true);
					return StatusCode((int)ollamaResponse.StatusCode, new
					{
						Reply = $"Ollama API returned {(int)ollamaResponse.StatusCode}",
						Details = respBody
					});
				}

				// Parse the full JSON response
				var parsedResponse = JsonSerializer.Deserialize<JsonElement>(respBody);

				// Extract the complete response text
				var fullResponse = parsedResponse.GetProperty("response").GetString() ?? string.Empty;

				// Return the complete response in one piece
				return Ok(new { Reply = fullResponse });
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in SendMessageToAi: {ex.Message}", null, "AiController", true);
				return StatusCode(500, new { Reply = "Internal server error." });
			}
		}

		[HttpPost("/Ai/GetMarketSentiment", Name = "GetMarketSentiment")]
		public async Task<IActionResult> GetMarketSentiment([FromBody] MarketSentimentRequest request)
		{
			DateTime utcNow = DateTime.UtcNow;
			DateTime from = request.Start ?? utcNow.AddDays(-7);
			DateTime to = request.End ?? utcNow;

			if (from > to)
				return BadRequest("`start` must be earlier than `end`.");

			var snapshots = new List<object>();

			await using (var conn = new MySqlConnection(
							 _config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				const string sql = @"
					SELECT id,
						sentiment_score,
						analysis_text,
						created
					FROM   market_sentiment_analysis
					WHERE  created BETWEEN @from AND @to
					ORDER  BY created DESC;";

				using var cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@from", from);
				cmd.Parameters.AddWithValue("@to", to);

				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					snapshots.Add(new
					{
						Id = reader.GetInt32("id"),
						SentimentScore = reader.GetInt32("sentiment_score"),
						Analysis = reader.GetString("analysis_text"),
						CreatedUtc = reader.GetDateTime("created")
					});
				}
			}

			if (snapshots.Count == 0)
				return NoContent();                    // 204 – nothing for that range

			return Ok(snapshots);                      // 200 – JSON array
		}



		/// <summary>
		/// Returns true when either (a) a fresh sentiment row already exists
		/// or (b) one was just generated and inserted.  Returns false only on error.
		/// </summary>
		public async Task<bool> ProvideMarketAnalysis()
		{
			_ = _log.Db("Providing Market Sentiment Analysis for the last 3 hours...", null, "AIController", outputToConsole: true);
			try
			{
				var newsBlob = await GetLatestNewsDescriptionsAsync();
				// 1.  Do we already have a snapshot from the last 3 h?
				await using (var conn = new MySqlConnection(
								  _config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					const string recentSql = @"
						SELECT id, sentiment_score, analysis_text, created
						FROM   market_sentiment_analysis
						WHERE  created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
						ORDER  BY created DESC
						LIMIT  1";

					using var checkCmd = new MySqlCommand(recentSql, conn);
					using var reader = await checkCmd.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						// Already exists, no need to insert again
						_ = _log.Db("Market Sentiment Analysis for the last 3 hours already provided. Skipping.", null, "AIController", outputToConsole: true);
						return true;
					}
				}

				// 2.  Build the prompt exactly once
				var prompt = @$"
					Provide a sentiment analysis of the market (0 = black-swan crash imminent, 100 = everyone eager to buy).
					Return ONLY in this exact format:

					Sentiment: <number>
					Analysis: <concise explanation>

					Given the following news articles:
					{newsBlob}";

				// 4.  Call Ollama exactly like SendMessageToAi, but capture the JSON
				var ollamaUrl = "http://localhost:11434/api/generate";
				var body = new
				{
					model = "gemma3",
					prompt = prompt,
					stream = false,
					max_tokens = 450
				};

				using var httpRequest = new HttpRequestMessage(HttpMethod.Post, ollamaUrl)
				{
					Content = new StringContent(
						JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
				};

				var ollamaResponse = await _httpClient.SendAsync(httpRequest);
				if (!ollamaResponse.IsSuccessStatusCode)
				{
					_ = _log.Db($"Ollama error: {ollamaResponse.StatusCode}", null);
					return false;
				}

				var rawJson = await ollamaResponse.Content.ReadAsStringAsync();
				// Ollama’s /generate returns { "response":"…text…" , … }
				var parsed = JsonSerializer.Deserialize<JsonElement>(rawJson);
				var aiText = parsed.GetProperty("response").GetString() ?? "";

				// 5.  Parse “Sentiment: 73, Analysis: …”
				//     (robust split in case the comma is missing or spacing differs)
				var firstLine = aiText.Split('\n', StringSplitOptions.RemoveEmptyEntries)
									  .FirstOrDefault() ?? "";
				var scoreMatch = System.Text.RegularExpressions.Regex.Match(firstLine, @"Sentiment:\s*(\d{1,3})",
											 System.Text.RegularExpressions.RegexOptions.IgnoreCase);
				var sentimentScore = scoreMatch.Success
								   ? int.Parse(scoreMatch.Groups[1].Value)
								   : -1; // sentinel for unexpected format
				var analysisText = aiText.Replace("Sentiment:", "")
										 .Replace($" {sentimentScore}", "")
										 .Replace("Analysis:", "")
										 .Trim();

				// 6.  Store the snapshot
				await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					const string insertSql = @"
						INSERT INTO market_sentiment_analysis
						(sentiment_score, analysis_text, created)
						VALUES
						(@score, @analysis, UTC_TIMESTAMP());";

					using var insertCmd = new MySqlCommand(insertSql, conn);
					insertCmd.Parameters.AddWithValue("@score", sentimentScore);
					insertCmd.Parameters.AddWithValue("@analysis", analysisText);
					await insertCmd.ExecuteNonQueryAsync();
				}

				return true;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"ProvideMarketAnalysis failed: {ex.Message}", null);
				return false;
			}
		}

		private async Task<string> AnalyzeMediaAsync(FileEntry mediaFile, bool rename)
		{
			try
			{
				// Reuse DescribeMedia functionality for the analysis
				string description = await DescribeMediaContent(mediaFile, detailed: false);

				if (string.IsNullOrEmpty(description))
				{
					_ = _log.Db($"Media analysis returned no description.", null, "AiController", true);
					return "";
				}

				if (rename)
				{
					// Perform DB update for renaming
					var newName = SanitizeFileName(description, mediaFile.FileType ?? "");
					using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
					await conn.OpenAsync();
					using var cmd = new MySqlCommand(
						"UPDATE file_uploads SET given_file_name=@n, last_updated = UTC_TIMESTAMP() WHERE id=@id", conn);
					cmd.Parameters.AddWithValue("@n", newName);
					cmd.Parameters.AddWithValue("@id", mediaFile.Id);
					await cmd.ExecuteNonQueryAsync();
					await UpdateSitemapEntry(mediaFile.Id, newName, newName);
					_ = _log.Db($"Changed filename: {mediaFile.FileName} → {newName}",
								 null, "AiController", true);
					return newName;
				}

				_ = _log.Db($"Media analysis returned: {description}.", null, "AiController", true);
				return description;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in AnalyzeMediaAsync: {ex.Message}", null, "AiController", true);
				return "";
			}
		}

		private async Task<string> DescribeMediaContent(FileEntry file, bool detailed = true)
		{
			const string tempThumbnailDir = @"E:\Dev\maxhanna\maxhanna.Server\TempThumbnails";
			var tempThumbnailPaths = new List<string>();
			try
			{
				var filePath = Path.Combine(file.Directory ?? string.Empty, file.FileName ?? string.Empty);
				if (!System.IO.File.Exists(filePath))
				{
					_ = _log.Db($"File {file.FileName} not found on disk.", null, "AiController", true);
					return string.Empty;
				}

				// Prepare base64 images
				var base64Images = new List<string>();
				var videoTypes = new[] { "mp4", "mov", "webm", "avi", "mkv" };
				bool isVideo = file.FileType != null && videoTypes.Contains(file.FileType.ToLower());

				if (isVideo)
				{
					// Video processing (unchanged)
					double durationSec = file.Duration.GetValueOrDefault(10);
					var capturePoints = new[] { 0.1, 0.3, 0.5, 0.7, 0.9 }.Select(p => TimeSpan.FromSeconds(durationSec * p));

					foreach (var t in capturePoints)
					{
						var thumbPath = Path.Combine(tempThumbnailDir, $"{Guid.NewGuid()}.jpg");
						tempThumbnailPaths.Add(thumbPath);

						var ffmpegArgs = $"-i \"{filePath}\" -ss {t} -vframes 1 -q:v 2 \"{thumbPath}\"";
						var proc = Process.Start(new ProcessStartInfo("ffmpeg", ffmpegArgs)
						{
							RedirectStandardError = true,
							UseShellExecute = false,
							CreateNoWindow = true
						});
						if (proc != null)
						{
							await proc.WaitForExitAsync();
							if (proc.ExitCode == 0 && System.IO.File.Exists(thumbPath))
							{
								var bytes = await System.IO.File.ReadAllBytesAsync(thumbPath);
								base64Images.Add(Convert.ToBase64String(bytes));
							}
							else
							{
								var err = await proc.StandardError.ReadToEndAsync();
								_ = _log.Db($"FFmpeg thumbnail failed: {err}", null, "AiController", true);
							}
						}
						else
						{
							_ = _log.Db($"FFmpeg thumbnail failed: Failed to start process.", null, "AiController", true);
						}
					}
				}
				else
				{
					// IMAGE PROCESSING: Convert all image formats to JPEG
					var jpegPath = Path.Combine(tempThumbnailDir, $"{Guid.NewGuid()}.jpg");
					tempThumbnailPaths.Add(jpegPath);

					// Convert image to JPEG using FFmpeg
					var ffmpegArgs = $"-i \"{filePath}\" -q:v 2 \"{jpegPath}\"";
					var proc = Process.Start(new ProcessStartInfo("ffmpeg", ffmpegArgs)
					{
						RedirectStandardError = true,
						UseShellExecute = false,
						CreateNoWindow = true
					});

					if (proc != null)
					{
						await proc.WaitForExitAsync();
						if (proc.ExitCode == 0 && System.IO.File.Exists(jpegPath))
						{
							var bytes = await System.IO.File.ReadAllBytesAsync(jpegPath);
							base64Images.Add(Convert.ToBase64String(bytes));
							_ = _log.Db($"Converted {file.FileType} image to JPEG: {jpegPath}", null, "AiController", true);
						}
						else
						{
							var err = await proc.StandardError.ReadToEndAsync();
							_ = _log.Db($"Image conversion failed: {err}", null, "AiController", true);

							// Fallback to direct read if conversion fails
							try
							{
								var bytes = await System.IO.File.ReadAllBytesAsync(filePath);
								base64Images.Add(Convert.ToBase64String(bytes));
								_ = _log.Db($"Used original image as fallback", null, "AiController", true);
							}
							catch (Exception ex)
							{
								_ = _log.Db($"Image read fallback failed: {ex.Message}", null, "AiController", true);
							}
						}
					}
					else
					{
						_ = _log.Db($"FFmpeg thumbnail failed: Failed to start process.", null, "AiController", true);
					}
				}

				if (!base64Images.Any())
				{
					_ = _log.Db("No valid media content to analyze.", null, "AiController", true);
					return string.Empty;
				}

				// Build prompt
				string prompt = detailed
					? base64Images.Count > 1
						? "Analyze these sequential video frames collectively. Describe: "
						  + "1. **Text content** (extract and paraphrase any visible text in each panel) "
						  + "2. **Visual style** (art style, colors, exaggerated expressions, or common meme formats) "
						  + "3. **Narrative progression**: How elements change/develop between frames "
						  + "4. **Possible meaning or humor** (satire, reaction, cultural reference, etc.) "
						  + "Combine into a cohesive 3-4 sentence summary, noting if it's a known meme format (e.g., 'Distracted Boyfriend', 'Two Buttons')."
						: "Analyze this single image. Include:\n"
						+ "1. **Key elements**: Subjects, objects, text, style\n"
						+ "2. **Context**: Possible purpose (meme, infographic, etc.)\n"
						+ "3. **Tone/Intent**: Humor, emotion, or message\n" 
						+ "Provide a 2-3 sentence description that captures both text and visuals."
					: base64Images.Count > 1
						? "Summarize this in 3-5 words, focusing on its topic or punchline (e.g., 'Woman yelling at cat')."
						: "Summarize this in 2-5 words (e.g., 'Wojak crying', 'Mocking SpongeBob').";
				// Send to Ollama
				var payload = new
				{
					model = "llava",
					prompt,
					stream = false,
					images = base64Images.ToArray()
				};

				using var req = new HttpRequestMessage(HttpMethod.Post, "http://localhost:11434/api/generate")
				{
					Content = new StringContent(JsonSerializer.Serialize(payload),
					Encoding.UTF8,
					"application/json")
				};

				var resp = await _httpClient.SendAsync(req);
				resp.EnsureSuccessStatusCode();

				var body = await resp.Content.ReadAsStringAsync();
				var parsed = JsonSerializer.Deserialize<JsonElement>(body);
				return parsed.GetProperty("response").GetString()?.Trim() ?? string.Empty;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in DescribeMediaContent: {ex.Message}", null, "AiController", true);
				return string.Empty;
			}
			finally
			{
				CleanupTempThumbnails(tempThumbnailDir);
			}
		}

		public async Task<string?> DescribeMedia([FromBody] int fileEntryId)
		{
			try
			{
				FileEntry? file = await GetFileEntryById(fileEntryId);
				if (file == null)
				{
					_ = _log.Db($"Error in DescribeMedia: File Not Found", null, "AiController", true);
					return null;
				}

				var description = await DescribeMediaContent(file, detailed: true);
				if (string.IsNullOrEmpty(description))
				{
					_ = _log.Db($"Error in DescribeMedia: No description received from DescribeMediaContent", null, "AiController", true);
					return null;
				}

				return description;

			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in DescribeMedia: {ex.Message}", null, "AiController", true);
				return null;
			}
		}

		private async Task<FileEntry?> GetFileEntryById(int fileEntryId)
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			const string selectSql = @"
        SELECT 
            id,  
            file_name AS FileName,
            folder_path AS Directory,
            file_type AS FileType,
            duration as Duration
        FROM file_uploads
        WHERE id = @fileId";

			using var cmd = new MySqlCommand(selectSql, conn);
			cmd.Parameters.AddWithValue("@fileId", fileEntryId);

			using var reader = await cmd.ExecuteReaderAsync();
			if (await reader.ReadAsync())
			{
				return new FileEntry
				{
					Id = reader.GetInt32("id"),
					FileName = reader.GetString("FileName"),
					Directory = reader.GetString("Directory"),
					FileType = reader.GetString("FileType"),
					Duration = reader.IsDBNull(reader.GetOrdinal("Duration")) ? null : reader.GetInt32(reader.GetOrdinal("Duration")),
				};
			}
			return null;
		}

		public async Task<IActionResult> AnalyzeAndRenameFile()
		{
			try
			{
				_ = _log.Db("Analyzing and renaming a random file.", null, "AiController", true);

				// Get random file meeting criteria
				FileEntry? fileToRename = null;
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					const string selectSql = @"
						SELECT 
							id,  
							file_name AS FileName,
							folder_path AS Directory,
							file_type AS FileType,
							duration as Duration
						FROM file_uploads
						WHERE given_file_name IS NULL
						AND file_name REGEXP '^[0-9]+\.[a-zA-Z0-9]+$'
						AND file_type IN ('jpg','jpeg','png','gif','bmp','webp','mp4','mov','webm','avi','mkv','flv')
						ORDER BY RAND()
						LIMIT 1";

					using var cmd = new MySqlCommand(selectSql, conn);
					using var reader = await cmd.ExecuteReaderAsync();
					if (await reader.ReadAsync())
					{
						fileToRename = new FileEntry
						{
							Id = reader.GetInt32("id"),
							FileName = reader.GetString("FileName"),
							Directory = reader.GetString("Directory"),
							FileType = reader.GetString("FileType"),
							Duration = reader.IsDBNull(reader.GetOrdinal("Duration")) ? null : reader.GetInt32(reader.GetOrdinal("Duration")),
						};
					}
				}
				if (fileToRename == null)
				{
					_ = _log.Db("No suitable files to rename. Aborted.", null, "AiController", true);
					return Ok(new { Message = "No suitable files found for renaming." });
				}

				await AnalyzeMediaAsync(fileToRename, true);
				return Ok();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in AnalyzeAndRenameFile: {ex.Message}", null, "AiController", true);
				return StatusCode(500, new { Message = "Internal server error" });
			}
		}

		private void CleanupTempThumbnails(string tempDir)
		{
			try
			{
				// Ensure directory exists
				if (!Directory.Exists(tempDir))
				{
					Directory.CreateDirectory(tempDir);
					return;
				}

				// Delete all existing temp thumbnails
				foreach (var file in Directory.GetFiles(tempDir))
				{
					try
					{
						System.IO.File.Delete(file);
						_ = _log.Db($"Deleted temp thumbnail: {file}", null, "AiController", true);
					}
					catch (Exception ex)
					{
						_ = _log.Db($"Failed to delete temp thumbnail: {ex.Message}", null, "AiController", true);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Temp thumbnail cleanup failed: {ex.Message}", null, "AiController", true);
			}
		}

		private static string SanitizeFileName(string name, string extension)
		{
			if (string.IsNullOrWhiteSpace(name))
				name = "media-file";

			// Remove invalid characters
			var invalidChars = Path.GetInvalidFileNameChars();
			var sanitized = new string(name
				.Where(c => !invalidChars.Contains(c))
				.ToArray());

			// Ensure max length of 240 + extension
			int maxLength = 240 - (extension?.Length ?? 0);
			if (sanitized.Length > maxLength)
				sanitized = sanitized.Substring(0, maxLength);

			// Remove trailing periods/dashes
			sanitized = sanitized.TrimEnd('.', '-', ' ');

			return $"{sanitized}";
		}
		public async Task<string> GetLatestNewsDescriptionsAsync()
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			const string sql = @"
				SELECT description
				FROM news_headlines
				WHERE saved_at >= NOW() - INTERVAL 1 DAY
				AND description IS NOT NULL;";

			using var cmd = new MySqlCommand(sql, conn);
			using var reader = await cmd.ExecuteReaderAsync();

			var descriptions = new List<string>();
			while (await reader.ReadAsync())
			{
				if (!reader.IsDBNull(0))
					descriptions.Add(reader.GetString(0));
			}

			return string.Join("\n\n", descriptions);
		}

		private async Task<bool> HasExceededUsageLimit(string callType, int userId)
		{
			string sql = "";
			long currentCount = 0;
			long limit = 0;
			int MaxTextRequestsPerHourGlobal = 600;
			int MaxTextRequestsPerHourUser = 100;
			int MaxImageRequestsPerHour = 1;

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			if (callType == "text")
			{
				// Check global text requests in the last hour
				limit = MaxTextRequestsPerHourGlobal;
				sql = @"
					SELECT COUNT(*)
					FROM maxhanna.host_ai_calls
					WHERE type = 'text'
					AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR);";

				using var cmdTextGlobal = new MySqlCommand(sql, conn);
				long globalCount = (long)(await cmdTextGlobal.ExecuteScalarAsync() ?? 0L);
				if (userId == 0)
				{
					return globalCount >= MaxTextRequestsPerHourGlobal;
				}
				// Check user-specific text requests in the last hour
				sql = @"
					SELECT COUNT(*)
					FROM maxhanna.host_ai_calls
					WHERE type = 'text'
					AND user_id = @userId
					AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR);";

				using var cmdTextUser = new MySqlCommand(sql, conn);
				cmdTextUser.Parameters.AddWithValue("@userId", userId);
				long userCount = (long)(await cmdTextUser.ExecuteScalarAsync() ?? 0L);

				// Return true if either limit is exceeded
				return globalCount >= MaxTextRequestsPerHourGlobal || userCount >= MaxTextRequestsPerHourUser;
			}
			else
			{
				// Check image requests in the current calendar month
				limit = MaxImageRequestsPerHour;
				sql = @"
					SELECT COUNT(*)
					FROM maxhanna.host_ai_calls
					WHERE type = 'image'
					AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR);";

				using var cmdImage = new MySqlCommand(sql, conn);
				currentCount = (long)(await cmdImage.ExecuteScalarAsync() ?? 0L);
				_ = _log.Db($"Current image requests this month: {currentCount} (Limit: {limit})", null);

				return currentCount >= limit;
			}
		}
		private async Task UpdateUserRequestCount(int userId, string message, string callType)
		{
			// Basic validation for callType
			if (callType != "text" && callType != "image")
			{
				_ = _log.Db($"Invalid callType '{callType}' provided to UpdateUserRequestCount.", null);
				// Decide if you want to throw an exception or just log and potentially skip insert
				return; // Or throw new ArgumentException("Invalid callType");
			}

			string sql = @"
				INSERT INTO maxhanna.host_ai_calls (user_id, created, message, type)
				VALUES (@UserId, UTC_TIMESTAMP(), @message, @type);";

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId); // Assuming 0 for anonymous/unknown if user is null
			cmd.Parameters.AddWithValue("@message", message);
			cmd.Parameters.AddWithValue("@type", callType); // Add the type parameter
			await cmd.ExecuteNonQueryAsync();
		}

		private async Task UpdateSitemapEntry(int? fileId, string? fileName, string? description)
		{
			if (string.IsNullOrEmpty(fileName) || fileId == null)
			{
				_ = _log.Db("FileId and FileName must be provided.", null, "AiController", true);
				return;
			}

			string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

			// Define both URL forms
			var urlPatterns = new[]
			{
				$"https://bughosted.com/File/{fileId}",
				$"https://bughosted.com/Media/{fileId}"
			};

			await _sitemapLock.WaitAsync();
			try
			{
				if (!System.IO.File.Exists(_sitemapPath))
				{
					_ = _log.Db("Sitemap not found, unable to update.", null, "AiController", true);
					return;
				}
				var sitemap = XDocument.Load(_sitemapPath);

				// namespaces
				XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
				XNamespace vidNs = "http://www.google.com/schemas/sitemap-video/1.1";
				XNamespace imgNs = "http://www.google.com/schemas/sitemap-image/1.1";

				// ensure image namespace on root
				var root = sitemap.Root;
				if (root?.Attribute(XNamespace.Xmlns + "image") == null)
					root?.SetAttributeValue(XNamespace.Xmlns + "image", imgNs.NamespaceName);

				foreach (var fileUrl in urlPatterns)
				{
					// find existing <url> for this pattern
					var urlElem = sitemap
						.Descendants(ns + "url")
						.FirstOrDefault(u => (string?)u.Element(ns + "loc") == fileUrl);

					if (urlElem == null)
					{
						// create new <url> if missing
						urlElem = new XElement(ns + "url",
							new XElement(ns + "loc", fileUrl),
							new XElement(ns + "lastmod", lastMod)
						);
						root?.Add(urlElem);
					}
					else
					{
						// update lastmod
						urlElem.Element(ns + "lastmod")?.SetValue(lastMod);
					}

					// now update or add video vs. image block
					var videoElement = urlElem.Element(vidNs + "video");
					if (videoElement != null)
					{
						// update existing <video:video>
						var descText = !string.IsNullOrEmpty(description) ? description : fileName;
						videoElement.Element(vidNs + "title")?.SetValue(fileName);
						videoElement.Element(vidNs + "description")?.SetValue(descText);
					}
					else
					{
						// treat as image
						var imageElem = urlElem.Element(imgNs + "image");
						var captionText = !string.IsNullOrEmpty(description) ? description : fileName;

						if (imageElem != null)
						{
							// update existing
							imageElem.Element(imgNs + "loc")?.SetValue(fileUrl);
							imageElem.Element(imgNs + "title")?.SetValue(fileName);
							imageElem.Element(imgNs + "caption")?.SetValue(captionText);
						}
						else
						{
							// create new <image:image>
							imageElem = new XElement(imgNs + "image",
								new XElement(imgNs + "loc", fileUrl),
								new XElement(imgNs + "title", fileName),
								new XElement(imgNs + "caption", captionText)
							);
							urlElem.Add(imageElem);
						}
					}
				}

				// persist changes
				sitemap.Save(_sitemapPath);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while updating the sitemap entry. " + ex.Message, null, "AiController", true);
			}
			finally
			{
				_sitemapLock.Release();
			}
		}




		private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
		private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");
		public class AiRequest
		{
			public required int UserId { get; set; }
			public required string Message { get; set; }
			public int? FileId { get; set; }
			public required bool SkipSave { get; set; }
			public required int MaxCount { get; set; }
		}
		public class MarketSentimentRequest
		{
			public DateTime? Start { get; set; }
			public DateTime? End { get; set; }
		}
	}
}
