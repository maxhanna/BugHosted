using Google.Apis.Auth.OAuth2;
using maxhanna.Server.Controllers.DataContracts.Array;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Diagnostics;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing; 
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
    private readonly KrakenService _krakenService;
    private readonly HttpClient _httpClient;
    private readonly HttpClient _ollamaClient;
    private static readonly SemaphoreSlim _analyzeLock = new SemaphoreSlim(1, 1);
    // Serialize heavy media-analysis calls to Ollama to avoid concurrent model runner crashes
    private static readonly SemaphoreSlim _ollamaMediaLock = new SemaphoreSlim(1, 1);
    private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
    private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");

    public AiController(Log log, IConfiguration config, KrakenService krakenService)
    {
      _log = log;
      _config = config;
      _krakenService = krakenService;
      _httpClient = new HttpClient
      {
        Timeout = TimeSpan.FromMinutes(5)
      };

      var sockets = new SocketsHttpHandler
      {
        // keep connections alive for long generations
        PooledConnectionIdleTimeout = TimeSpan.FromMinutes(10),
        ConnectTimeout = TimeSpan.FromSeconds(30), // connection establishment 
        KeepAlivePingDelay = TimeSpan.FromSeconds(15),
        KeepAlivePingTimeout = TimeSpan.FromSeconds(5),
        KeepAlivePingPolicy = HttpKeepAlivePingPolicy.Always,
      };

      _ollamaClient = new HttpClient(sockets)
      {
        Timeout = Timeout.InfiniteTimeSpan // disable HttpClient timeout for Ollama
      };

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
          model = "gemma3:4b",
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
        var ollamaResponse = await _ollamaClient.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead);
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

    [HttpPost("/Ai/AnalyzeWallet", Name = "AnalyzeWallet")]
    public async Task<IActionResult> AnalyzeWallet([FromBody] AnalyzeWalletRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      try
      {
        if (request.UserId != 0)
        {
          if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader))
            return StatusCode(500, "Access Denied.");
        }

        // rate limit
        if (await HasExceededUsageLimit("text", request.UserId))
          return StatusCode(429, new { Reply = "You have exceeded the maximum number of text requests for this hour." });

        // Fetch recent wallet balance data server-side
        var body = new { WalletAddress = request.WalletAddress, Currency = request.Currency ?? "btc" };
        // Use internal CoinValueController GetWalletBalanceData logic by querying DB directly here for simplicity
        List<object> latest = new List<object>();
        await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await conn.OpenAsync();
          string currency = (request.Currency ?? "btc").ToLower();
          if (currency == "xbt") currency = "btc";

          string sql = $@"
						SELECT wb.balance, wb.fetched_at
						FROM user_{currency}_wallet_info wi
						LEFT JOIN user_{currency}_wallet_balance wb ON wi.id = wb.wallet_id
						WHERE wi.{currency}_address = @WalletAddress
						ORDER BY wb.fetched_at DESC
						LIMIT 250";

          using var cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@WalletAddress", request.WalletAddress);
          using var reader = await cmd.ExecuteReaderAsync();
          while (await reader.ReadAsync())
          {
            latest.Add(new { balance = reader.GetDecimal("balance"), timestamp = reader.GetDateTime("fetched_at") });
          }
        }

        if (latest.Count == 0)
          return NotFound("No wallet balance data found for that address.");

        // Build prompt
        var prompt = $"Analyze the following {request.Currency ?? "BTC"} wallet balance data: {System.Text.Json.JsonSerializer.Serialize(latest)}. " +
               "Focus on trends, volatility, and price action over the last 5 days. Identify: - Recent trends (uptrend, downtrend, or consolidation). - Volatility and major swings. - Potential buy or sell signals with justification. Avoid disclaimers.";

        // Update usage count
        if (!request.SkipSave) await UpdateUserRequestCount(request.UserId, prompt, "text");

        // Call Ollama like SendMessageToAi
        string url = "http://localhost:11434/api/generate";
        object requestBody = new
        {
          model = "gemma3:4b",
          prompt,
          stream = false,
          max_tokens = request.MaxCount
        };

        var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");
        using var httpReq = new HttpRequestMessage(HttpMethod.Post, url) { Content = jsonContent };
        var ollamaResponse = await _httpClient.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead);
        var respBody = await ollamaResponse.Content.ReadAsStringAsync();
        if (!ollamaResponse.IsSuccessStatusCode)
        {
          _ = _log.Db($"Ollama API error {(int)ollamaResponse.StatusCode}: {respBody}", null, "AiController", true);
          return StatusCode((int)ollamaResponse.StatusCode, new { Reply = $"Ollama API returned {(int)ollamaResponse.StatusCode}", Details = respBody });
        }
        var parsed = JsonSerializer.Deserialize<JsonElement>(respBody);
        var fullResponse = parsed.GetProperty("response").GetString() ?? string.Empty;
        return Ok(new { Reply = fullResponse });
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in AnalyzeWallet: {ex.Message}", null, "AiController", true);
        return StatusCode(500, new { Reply = "Internal server error." });
      }
    }

    [HttpPost("/Ai/AnalyzeCoin", Name = "AnalyzeCoin")]
    public async Task<IActionResult> AnalyzeCoin([FromBody] AnalyzeCoinRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      try
      {
        if (request.UserId != 0)
        {
          if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader))
            return StatusCode(500, "Access Denied.");
        }

        if (await HasExceededUsageLimit("text", request.UserId))
          return StatusCode(429, new { Reply = "You have exceeded the maximum number of text requests for this hour." });

        // Fetch recent coin price history (last 250 points)
        List<object> history = new List<object>();
        await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await conn.OpenAsync();
          string sql = @"SELECT value_cad as value, timestamp FROM coin_value WHERE LOWER(name) = @Name ORDER BY timestamp DESC LIMIT 250";
          using var cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@Name", request.Coin);
          using var reader = await cmd.ExecuteReaderAsync();
          while (await reader.ReadAsync())
          {
            history.Add(new { value = reader.GetDecimal("value"), timestamp = reader.GetDateTime("timestamp") });
          }
        }

        if (history.Count == 0)
          return NotFound("No coin price history found for that coin.");

        // Fetch market volume data for the last 5 hours via KrakenService and include it in the prompt
        List<object> recentVolumes = new List<object>();
        try
        {
          // KrakenService stores trade volumes per pair (e.g., BTCUSDC). Request last 300 minutes (5 hours).
          var vols = await _krakenService.GetTradeMarketVolumesAsync(request.Coin.ToUpper(), "USDC", null, minutes: 300);
          foreach (var v in vols)
          {
            recentVolumes.Add(new
            {
              timestamp = v.Timestamp,
              volume = v.Volume,
              volume_usdc = v.VolumeUSDC,
              close_price = v.ClosePrice
            });
          }
        }
        catch (Exception ex)
        {
          _ = _log.Db($"Error fetching trade market volumes via KrakenService: {ex.Message}", null, "AiController", true);
        }

        var prompt = $"Analyze the following {request.Coin} price history: {System.Text.Json.JsonSerializer.Serialize(history)}. " +
          $"Also consider this market volume snapshot for the last 5 hours: {System.Text.Json.JsonSerializer.Serialize(recentVolumes)}. " +
          "Focus on trends, volatility, major swings, and provide a short recommendation (buy/sell/hold) with justification. In your analysis, explicitly consider volume spikes and how they affect volatility and trade signals. Avoid disclaimers.";

        if (!request.SkipSave) await UpdateUserRequestCount(request.UserId, prompt, "text");

        string url = "http://localhost:11434/api/generate";
        object requestBody = new
        {
          model = "gemma3:4b",
          prompt = prompt,
          stream = false,
          max_tokens = request.MaxCount
        };
        var jsonContent = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");
        using var httpReq = new HttpRequestMessage(HttpMethod.Post, url) { Content = jsonContent };
        var ollamaResponse = await _httpClient.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead);
        var respBody = await ollamaResponse.Content.ReadAsStringAsync();
        if (!ollamaResponse.IsSuccessStatusCode)
        {
          _ = _log.Db($"Ollama API error {(int)ollamaResponse.StatusCode}: {respBody}", null, "AiController", true);
          return StatusCode((int)ollamaResponse.StatusCode, new { Reply = $"Ollama API returned {(int)ollamaResponse.StatusCode}", Details = respBody });
        }
        var parsed = JsonSerializer.Deserialize<JsonElement>(respBody);
        var fullResponse = parsed.GetProperty("response").GetString() ?? string.Empty;
        return Ok(new { Reply = fullResponse });
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in AnalyzeCoin: {ex.Message}", null, "AiController", true);
        return StatusCode(500, new { Reply = "Internal server error." });
      }
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
          model = "gemma3:4b",
          prompt = prompt,
          stream = false,
          max_tokens = 450,
          Timeout = 300000
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
            "UPDATE file_uploads SET given_file_name=@n, last_updated = UTC_TIMESTAMP(), last_updated_by_user_id = 314 WHERE id=@id", conn);
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
    try
    {
        EnsureTempDir(tempThumbnailDir);

        var filePath = Path.Combine(file.Directory ?? string.Empty, file.FileName ?? string.Empty);
        if (!System.IO.File.Exists(filePath))
        {
            _ = _log.Db($"File {file.FileName} not found on disk.", null, "AiController", true);
            return string.Empty;
        }

        var base64Images = new List<string>();

        // Decide if the media is video
        var videoTypes = new[] { "mp4", "mov", "webm", "avi", "mkv" };
        bool isVideo = file.FileType != null && videoTypes.Contains(file.FileType.ToLower());
        bool hasMultipleFrames = false;

        // Keep RAM small; we’ll resample to PNG + small dimension
        const int MaxShortSide = 512;

        if (isVideo)
        {
            double durationSec = file.Duration.GetValueOrDefault(10);
            hasMultipleFrames = durationSec > 2;

            var capturePoints = hasMultipleFrames
                ? new[] { 0.3, 0.6 }  // two representative frames
                : new[] { 0.5 };      // single frame for short videos

            foreach (var t in capturePoints)
            {
                // Extract a JPG frame via ffmpeg
                var jpgPath = Path.Combine(tempThumbnailDir, $"{Guid.NewGuid()}.jpg");
                var ffmpegArgs = $"-i \"{filePath}\" -ss {t} -vframes 1 -vf scale={MaxShortSide}:-1 -q:v 10 \"{jpgPath}\"";

                var proc = Process.Start(new ProcessStartInfo("ffmpeg", ffmpegArgs)
                {
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                });

                if (proc != null)
                {
                    await proc.WaitForExitAsync();
                    if (proc.ExitCode == 0 && System.IO.File.Exists(jpgPath))
                    {
                        // Convert JPG bytes to PNG bytes via ImageSharp, then Base64
                        var jpgBytes = await System.IO.File.ReadAllBytesAsync(jpgPath);
                        var pngBytes = await ConvertImageBytesToPngAsync(jpgBytes, MaxShortSide);
                        var b64 = ToCleanBase64(pngBytes);
                        base64Images.Add(b64);

                        _ = _log.Db($"Created video thumbnail (PNG): {jpgPath} → {pngBytes.Length} bytes", null, "AiController", true);
                    }
                    else
                    {
                        var err = await proc.StandardError.ReadToEndAsync();
                        _ = _log.Db($"FFmpeg thumbnail failed: {err}", null, "AiController", true);
                    }
                }
            }
        }
        else
        {
            // Image: convert to PNG at MaxShortSide
            try
            {
                var pngBytes = await ConvertImageFileToPngAsync(filePath, MaxShortSide);
                var b64 = ToCleanBase64(pngBytes);
                base64Images.Add(b64);

                _ = _log.Db($"Converted image to PNG: {filePath} → {pngBytes.Length} bytes", null, "AiController", true);
            }
            catch (Exception ex)
            {
                // Fallback: ffmpeg → JPG, then PNG
                var jpgPath = Path.Combine(tempThumbnailDir, $"{Guid.NewGuid()}.jpg");
                var ffmpegArgs = $"-i \"{filePath}\" -vf scale={MaxShortSide}:-1 -q:v 10 \"{jpgPath}\"";

                var proc = Process.Start(new ProcessStartInfo("ffmpeg", ffmpegArgs)
                {
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                });

                if (proc != null)
                {
                    await proc.WaitForExitAsync();
                    if (proc.ExitCode == 0 && System.IO.File.Exists(jpgPath))
                    {
                        var jpgBytes = await System.IO.File.ReadAllBytesAsync(jpgPath);
                        var pngBytes = await ConvertImageBytesToPngAsync(jpgBytes, MaxShortSide);
                        var b64 = ToCleanBase64(pngBytes);
                        base64Images.Add(b64);

                        _ = _log.Db($"Fallback image conversion (ffmpeg->JPG->PNG): {jpgPath} → {pngBytes.Length} bytes", null, "AiController", true);
                    }
                    else
                    {
                        var err = proc != null ? await proc.StandardError.ReadToEndAsync() : "ffmpeg start failed";
                        _ = _log.Db($"FFmpeg image fallback failed: {err} | Original error: {ex.Message}", null, "AiController", true);
                    }
                }
            }
        }

        if (!base64Images.Any())
        {
            _ = _log.Db("No valid media content to analyze.", null, "AiController", true);
            return string.Empty;
        }

        // Limit to at most 2 images
        if (base64Images.Count > 2)
            base64Images = base64Images.Take(2).ToList();

        // Validate via ImageSharp and compute total bytes
        const long MaxTotalImageBytes = 3_000_000; // 3 MB
        long totalBytes = 0;
        var validated = new List<string>();

        foreach (var b64 in base64Images)
        {
            try
            {
                var raw = Convert.FromBase64String(StripDataUriPrefixIfPresent(b64));
                using var ms = new MemoryStream(raw);
                var info = SixLabors.ImageSharp.Image.Identify(ms);

                if (info != null)
                {
                    totalBytes += raw.Length;
                    validated.Add(ToCleanBase64(raw));  // ensure padded/cleaned
                }
                else
                {
                    _ = _log.Db("Thumbnail not recognized as a valid image; skipped.", null, "AiController", true);
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Invalid/corrupt thumbnail skipped: {ex.Message}", null, "AiController", true);
            }
        }

        base64Images = validated;

        if (!base64Images.Any())
        {
            _ = _log.Db("No valid thumbnails after validation.", null, "AiController", true);
            return string.Empty;
        }

        if (totalBytes > MaxTotalImageBytes)
        {
            _ = _log.Db($"Combined thumbnail payload too large ({totalBytes} bytes). Aborting media analysis.", null, "AiController", true);
            return string.Empty;
        }

        _ = _log.Db($"Thumbnails validated: {base64Images.Count} images, combined size: {totalBytes} bytes.", null, "AiController", true);

        // Build content-focused prompt
        string prompt = detailed
            ? BuildDetailedPrompt(base64Images.Count > 1)
            : BuildConcisePrompt();

        // STRICT Vision /api/chat payload — raw base64 strings in messages[].images[]
        var payload = new
        {
            model = "moondream",
            stream = false,
            messages = new[]
            {
                new
                {
                    role = "user",
                    content = prompt,
                    images = base64Images.Select(StripDataUriPrefixIfPresent).ToArray()
                }
            },
            options = new { num_ctx = 1024 } // keep within moondream2's 2048 context
        };

        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        string? responseBody = null;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, "http://localhost:11434/api/chat")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };

            await _ollamaMediaLock.WaitAsync();
            HttpResponseMessage? resp = null;
            try
            {
                var ct = HttpContext?.RequestAborted ?? CancellationToken.None;
                resp = await _ollamaClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            }
            finally
            {
                try { _ollamaMediaLock.Release(); } catch { /* ignore */ }
            }

            if (!resp.IsSuccessStatusCode)
            {
                var errBody = await resp.Content.ReadAsStringAsync();
                _ = _log.Db($"Ollama media analysis error {(int)resp.StatusCode}: {errBody}", null, "AiController", true);
                return string.Empty;
            }

            responseBody = await resp.Content.ReadAsStringAsync();
        }
        catch (HttpRequestException hre)
        {
            _ = _log.Db($"Ollama request failed: {hre.Message}", null, "AiController", outputToConsole: true);
            return string.Empty;
        }
        catch (Exception ex)
        {
            _ = _log.Db($"Unexpected error sending to Ollama: {ex.Message}", null, "AiController", true);
            return string.Empty;
        }

        if (string.IsNullOrEmpty(responseBody))
        {
            _ = _log.Db("Ollama media analysis returned empty body.", null, "AiController", true);
            return string.Empty;
        }

        var parsed = JsonSerializer.Deserialize<JsonElement>(responseBody);
        var content = parsed.GetProperty("message").GetProperty("content").GetString();
        return RemoveMediaReferences(content?.Trim() ?? string.Empty);
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

    private string BuildDetailedPrompt(bool multipleFrames)
    {
      string basePrompt = "Describe the image in 2–3 short sentences. Start with the main subject and action, then relevant details (objects, colors, setting). Avoid meta-language and formatting.";
      if (multipleFrames)
      {
        basePrompt += "If multiple images are provided, summarize consistent elements across frames and note any differences.";
      }
      return basePrompt;
    }

    private string BuildConcisePrompt()
    {
      return "Create a single-sentence caption describing the main subject and action. Avoid meta-language and formatting.";
    }

    private string RemoveMediaReferences(string response)
    {
      // Remove common media-type references
      var patterns = new[] {
        "image of", "images of", "video of", "videos of",
        "this image", "this video", "these images", "these frames",
        "in the picture", "in the clip", "in these shots"
      };

      foreach (var pattern in patterns)
      {
        response = System.Text.RegularExpressions.Regex.Replace(response, pattern, "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
      }

      // Remove leading articles/prepositions
      return System.Text.RegularExpressions.Regex.Replace(response, @"^(the|a|an|this|these)\s+", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
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
      if (!await _analyzeLock.WaitAsync(0)) // non-blocking wait
      {
        _ = _log.Db("AnalyzeAndRenameFile skipped because a previous operation is still in progress.", null, "AiController", true);
        return Conflict(new { Message = "Analyze and rename is already running." });
      }
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
							id, file_name, folder_path, file_type, duration
						FROM file_uploads
						WHERE given_file_name IS NULL
						AND folder_path = 'E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Meme/'
						AND file_type IN ('jpg','jpeg','png','gif','bmp','webp','mp4','mov','webm','avi','mkv','flv') 
						AND (
							(file_name LIKE '%.%' AND file_name NOT LIKE '%-%' AND file_name NOT LIKE '% %')
							AND (
								file_name REGEXP '^[0-9]+\\.[a-zA-Z0-9]+$'  -- Pure numeric
								OR file_name REGEXP '^\\w+_\\w+\\.[a-zA-Z0-9]+$'  -- Alphanumeric + underscore
							)
						) 
						ORDER BY RAND()
						LIMIT 1;";

          using var cmd = new MySqlCommand(selectSql, conn);
          using var reader = await cmd.ExecuteReaderAsync();
          if (await reader.ReadAsync())
          {
            fileToRename = new FileEntry
            {
              Id = reader.GetInt32("id"),
              FileName = reader.GetString("file_name"),
              Directory = reader.GetString("folder_path"),
              FileType = reader.GetString("file_type"),
              Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? null : reader.GetInt32(reader.GetOrdinal("duration")),
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
      finally
      {
        _analyzeLock.Release();
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
    
    static string StripDataUriPrefixIfPresent(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        int commaIdx = input.IndexOf(',');
        return commaIdx >= 0 ? input.Substring(commaIdx + 1).Trim() : input.Trim();
    }

    static string ToCleanBase64(byte[] bytes)
    {
        var b64 = Convert.ToBase64String(bytes);
        int mod = b64.Length % 4;                      // normalize padding defensively
        if (mod != 0) b64 = b64.PadRight(b64.Length + (4 - mod), '=');
        return b64.Trim();
    }

    static byte[] ToPngBytesResized(Image img, int maxShortSide = 512)
    {
        // Compute target size preserving aspect ratio where SHORT side = maxShortSide
        int w = img.Width, h = img.Height;
        bool widthIsShort = w <= h;
        float scale;
        if (widthIsShort)
            scale = (float)maxShortSide / w;
        else
            scale = (float)maxShortSide / h;

        int targetW = Math.Max(1, (int)Math.Round(w * scale));
        int targetH = Math.Max(1, (int)Math.Round(h * scale));

        // Resize + encode PNG
        using var resized = img.Clone(x => x.Resize(targetW, targetH));
        using var ms = new MemoryStream();
        resized.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
        return ms.ToArray();
    }

    static async Task<byte[]> ConvertImageFileToPngAsync(string path, int maxShortSide = 512)
    {
        using var img = await SixLabors.ImageSharp.Image.LoadAsync(path);
        return ToPngBytesResized(img, maxShortSide);
    }

    static async Task<byte[]> ConvertImageBytesToPngAsync(byte[] bytes, int maxShortSide = 512)
    {
        using var img = await SixLabors.ImageSharp.Image.LoadAsync(new MemoryStream(bytes));
        return ToPngBytesResized(img, maxShortSide);
    }

    static void EnsureTempDir(string dir)
    {
        if (!Directory.Exists(dir))
            Directory.CreateDirectory(dir);
    }
  }
}
public class AiRequest
{
  public required int UserId { get; set; }
  public required string Message { get; set; }
  public int? FileId { get; set; }
  public required bool SkipSave { get; set; }
  public required int MaxCount { get; set; }
}
public class AnalyzeWalletRequest
{
  public required int UserId { get; set; }
  public required string WalletAddress { get; set; }
  public string? Currency { get; set; } // e.g., btc, usdc
  public int MaxCount { get; set; } = 600;
  public bool SkipSave { get; set; } = false;
}
public class AnalyzeCoinRequest
{
  public required int UserId { get; set; }
  public required string Coin { get; set; }
  public int MaxCount { get; set; } = 600;
  public bool SkipSave { get; set; } = false;
}
public class MarketSentimentRequest
{
  public DateTime? Start { get; set; }
  public DateTime? End { get; set; }
}