using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using System.Text;
using System.Text.RegularExpressions;
using Xabe.FFmpeg;
using YoutubeExplode;
using YoutubeExplode.Videos.Streams;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class ConversionController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly AiController _aiController;
    private readonly string _connectionString;
    private readonly string _baseTarget;
    private bool _ffmpegAvailable;

    private static readonly string[] ImageTargetFormats = { "png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff", "tga", "qoi", "pbm", "pnm", "pgm", "ppm" };

    public ConversionController(Log log, IConfiguration config, AiController aiController)
    {
      _log = log;
      _config = config;
      _aiController = aiController;
      _connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      var configPath = _config.GetValue<string>("FileUploads:BasePath") ?? "";
      if (string.IsNullOrWhiteSpace(configPath))
      {
        var serverDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location) ?? ".";
        configPath = Path.Combine(serverDir, "..", "..", "..", "..", "maxhanna.client", "src", "assets", "Uploads");
      }
      _baseTarget = Path.GetFullPath(configPath).Replace("\\", "/");
      if (!_baseTarget.EndsWith("/")) _baseTarget += "/";
      try { Directory.CreateDirectory(_baseTarget); } catch { }

      var ffmpegPath = _config.GetValue<string>("FileUploads:FFmpegPath") ?? "E:\\ffmpeg-latest-win64-static\\bin";
      _ffmpegAvailable = Directory.Exists(ffmpegPath);
      if (_ffmpegAvailable)
      {
        FFmpeg.SetExecutablesPath(ffmpegPath);
      }
    }

    private async Task<(string fileName, string folderPath, string fullPath)?> ResolveSourceFile(int fileId)
    {
      if (fileId <= 0) return null;
      string? fileName = null;
      string? folderPath = null;
      using (var conn = new MySqlConnection(_connectionString))
      {
        await conn.OpenAsync();
        var cmd = new MySqlCommand(@"SELECT file_name, folder_path FROM maxhanna.file_uploads WHERE id = @id LIMIT 1;", conn);
        cmd.Parameters.AddWithValue("@id", fileId);
        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
          fileName = reader.IsDBNull("file_name") ? null : reader.GetString("file_name");
          folderPath = reader.IsDBNull("folder_path") ? null : reader.GetString("folder_path");
        }
      }
      if (fileName == null || folderPath == null) return null;
      var fullPath = Path.Combine(folderPath, fileName).Replace("\\", "/");
      if (!System.IO.File.Exists(fullPath)) return null;
      return (fileName, folderPath, fullPath);
    }

    private async Task<int> InsertConvertedFile(int userId, string fileName, string diskFolder, long fileSize, int? width, int? height)
    {
      using var conn = new MySqlConnection(_connectionString);
      await conn.OpenAsync();
      var cmd = new MySqlCommand(
        @"INSERT IGNORE INTO maxhanna.file_uploads
          (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size, width, height, last_updated, last_updated_by_user_id, duration)
          VALUES
          (@user_id, @fileName, UTC_TIMESTAMP(), @folderPath, @isPublic, @isFolder, @file_size, @width, @height, UTC_TIMESTAMP(), @user_id, NULL);
          SELECT LAST_INSERT_ID();", conn);
      cmd.Parameters.AddWithValue("@user_id", userId);
      cmd.Parameters.AddWithValue("@fileName", fileName);
      cmd.Parameters.AddWithValue("@folderPath", diskFolder);
      cmd.Parameters.AddWithValue("@isPublic", false);
      cmd.Parameters.AddWithValue("@isFolder", false);
      cmd.Parameters.AddWithValue("@file_size", fileSize);
      cmd.Parameters.AddWithValue("@width", width);
      cmd.Parameters.AddWithValue("@height", height);

      var scalar = await cmd.ExecuteScalarAsync();
      int fileId = Convert.ToInt32(scalar);

      if (fileId == 0)
      {
        // INSERT was ignored (existing row) - fetch its id
        var fetchCmd = new MySqlCommand(
          "SELECT id FROM maxhanna.file_uploads WHERE user_id = @user_id AND file_name = @fileName AND folder_path = @folderPath LIMIT 1;", conn);
        fetchCmd.Parameters.AddWithValue("@user_id", userId);
        fetchCmd.Parameters.AddWithValue("@fileName", fileName);
        fetchCmd.Parameters.AddWithValue("@folderPath", diskFolder);
        var fetched = await fetchCmd.ExecuteScalarAsync();
        if (fetched != null) fileId = Convert.ToInt32(fetched);
      }
      return fileId;
    }

    private string SanitizeFormat(string? targetFormat)
    {
      var f = (targetFormat ?? "").Trim().ToLowerInvariant();
      return Regex.IsMatch(f, "^[a-z0-9]{1,10}$") ? f : "";
    }

    /// <summary>Generic file conversion (video/audio via FFmpeg, images via ImageSharp).</summary>
    [HttpPost("/Conversion/Convert", Name = "Conversion_Convert")]
    public async Task<IActionResult> ConvertFile([FromBody] ConversionRequest request)
    {
      try
      {
        if (request == null || request.FileId <= 0) return BadRequest("Invalid request.");
        var format = SanitizeFormat(request.TargetFormat);
        if (string.IsNullOrEmpty(format)) return BadRequest("Invalid target format.");

        var source = await ResolveSourceFile(request.FileId);
        if (source == null) return NotFound("Source file not found.");

        string originalName = Path.GetFileNameWithoutExtension(source.Value.fileName);
        string outputName = $"{originalName}.{format}";
        string outputFolder = Path.Combine(_baseTarget, "Converted").Replace("\\", "/") + "/";
        Directory.CreateDirectory(outputFolder.Replace("/", Path.DirectorySeparatorChar.ToString()));
        string outputPath = Path.Combine(outputFolder, outputName).Replace("\\", "/");

        int? width = null, height = null;
        long fileSize;

        if (ImageTargetFormats.Contains(format))
        {
          using var img = await SixLabors.ImageSharp.Image.LoadAsync<Rgba32>(source.Value.fullPath);
          width = img.Width;
          height = img.Height;
          using var ms = new MemoryStream();
          await img.SaveAsync(ms, GetImageEncoder(format));
          await System.IO.File.WriteAllBytesAsync(outputPath, ms.ToArray());
          fileSize = new FileInfo(outputPath).Length;
        }
        else
        {
          if (System.IO.File.Exists(outputPath)) System.IO.File.Delete(outputPath);
          var conversion = FFmpeg.Conversions.New()
            .AddParameter($"-i \"{source.Value.fullPath}\"")
            .SetOutput(outputPath);
          await conversion.Start();
          if (!System.IO.File.Exists(outputPath))
          {
            throw new FileNotFoundException("FFmpeg conversion failed or output file not found.");
          }
          fileSize = new FileInfo(outputPath).Length;
        }

        int userId = request.UserId ?? 0;
        int newFileId = await InsertConvertedFile(userId, outputName, outputFolder, fileSize, width, height);
        _ = _log.Db($"Conversion completed: {source.Value.fileName} -> {outputName} (file {newFileId})", userId, "CONVERSION", true);

        return Ok(new ConversionResult
        {
          FileId = newFileId,
          FileName = outputName,
          FolderPath = outputFolder
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Conversion error: " + ex.Message, request?.UserId ?? 0, "CONVERSION", true);
        return StatusCode(500, "Conversion failed: " + ex.Message);
      }
    }

    /// <summary>Turns a pixel-art image into a TrueType font file.</summary>
    [HttpPost("/Conversion/ImageToFont", Name = "Conversion_ImageToFont")]
    public async Task<IActionResult> ImageToFont([FromBody] ImageToFontRequest request)
    {
      try
      {
        if (request == null || request.FileId <= 0) return BadRequest("Invalid request.");
        var source = await ResolveSourceFile(request.FileId);
        if (source == null) return NotFound("Source file not found.");

        byte[] imageBytes = await System.IO.File.ReadAllBytesAsync(source.Value.fullPath);
        using var image = await SixLabors.ImageSharp.Image.LoadAsync<Rgba32>(new MemoryStream(imageBytes));

        // Identify characters: prefer explicit text, otherwise ask the vision model.
        string? knownText = null;
        if (string.IsNullOrWhiteSpace(request.Text))
        {
          var prompt = "Identify each distinct letter, digit or symbol shown in this pixel art image, in reading order (left to right, top to bottom). Return ONLY the characters separated by commas. If you cannot identify them, return exactly: UNKNOWN";
          var b64 = Convert.ToBase64String(EncodePng(image));
          var response = await _aiController.SendVisionBase64Async(prompt, new[] { b64 }, temperature: 0.1);
          if (!string.IsNullOrWhiteSpace(response))
          {
            var cleaned = Regex.Replace(response, "(?i)UNKNOWN|[,;\\s]+", " ").Trim();
            var letters = cleaned.Where(char.IsLetterOrDigit).Distinct().ToArray();
            if (letters.Length > 0) knownText = new string(letters);
          }
        }
        else
        {
          knownText = new string(request.Text.Where(c => char.IsLetterOrDigit(c) || char.IsPunctuation(c)).ToArray());
        }

        var glyphs = maxhanna.Server.Services.FontGlyphTracer.TraceGlyphs(image, knownText);
        if (glyphs.Count == 0) return BadRequest("No glyphs detected in the image.");

        string familyName = Path.GetFileNameWithoutExtension(source.Value.fileName) ?? "Converted";
        familyName = Regex.Replace(familyName, "[^A-Za-z0-9]", " ");
        familyName = Regex.Replace(familyName, "\\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(familyName)) familyName = "Converted";

        byte[] ttfBytes = maxhanna.Server.Services.FontBuilder.BuildTtf(familyName, glyphs);

        string outputName = $"{familyName}.ttf";
        string outputFolder = Path.Combine(_baseTarget, "Converted").Replace("\\", "/") + "/";
        Directory.CreateDirectory(outputFolder.Replace("/", Path.DirectorySeparatorChar.ToString()));
        string outputPath = Path.Combine(outputFolder, outputName).Replace("\\", "/");
        await System.IO.File.WriteAllBytesAsync(outputPath, ttfBytes);

        int userId = request.UserId ?? 0;
        int newFileId = await InsertConvertedFile(userId, outputName, outputFolder, ttfBytes.Length, null, null);
        _ = _log.Db($"Font conversion completed: {source.Value.fileName} -> {outputName} ({glyphs.Count} glyphs, file {newFileId})", userId, "CONVERSION", true);

        return Ok(new FontConversionResult
        {
          FileId = newFileId,
          FileName = outputName,
          FolderPath = outputFolder,
          FontDataUri = "data:font/ttf;base64," + Convert.ToBase64String(ttfBytes),
          Characters = string.Concat(glyphs.Select(g => g.Character))
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db("ImageToFont error: " + ex.Message, request?.UserId ?? 0, "CONVERSION", true);
        return StatusCode(500, "Font conversion failed: " + ex.Message);
      }
    }

    /// <summary>Runs the vision model over an image and returns a text report.</summary>
    [HttpPost("/Conversion/VisionReport", Name = "Conversion_VisionReport")]
    public async Task<IActionResult> VisionReport([FromBody] VisionReportRequest request)
    {
      try
      {
        if (request == null || request.FileId <= 0) return BadRequest("Invalid request.");
        var source = await ResolveSourceFile(request.FileId);
        if (source == null) return NotFound("Source file not found.");

        byte[] imageBytes = await System.IO.File.ReadAllBytesAsync(source.Value.fullPath);
        string b64;
        using (var image = await SixLabors.ImageSharp.Image.LoadAsync<Rgba32>(new MemoryStream(imageBytes)))
        {
          b64 = Convert.ToBase64String(EncodePng(image, 768));
        }

        string prompt = string.IsNullOrWhiteSpace(request.Prompt)
          ? "Describe this image in detail. What is it, what does it look like, and what can be improved?"
          : request.Prompt;

        var report = await _aiController.SendVisionBase64Async(prompt, new[] { b64 }, temperature: 0.3);
        _ = _log.Db($"Vision report generated for file {request.FileId}", request.UserId ?? 0, "CONVERSION", true);
        return Ok(new VisionReportResult { Report = report ?? "The vision model did not return a response." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("VisionReport error: " + ex.Message, request?.UserId ?? 0, "CONVERSION", true);
        return StatusCode(500, "Vision report failed: " + ex.Message);
      }
    }

    /// <summary>Downloads a YouTube video (muxed MP4) or its audio (M4A/MP3).</summary>
    [HttpPost("/Conversion/YoutubeDownload", Name = "Conversion_YoutubeDownload")]
    public async Task<IActionResult> YoutubeDownload([FromBody] YoutubeDownloadRequest request)
    {
      bool wantMp3 = request != null && string.Equals(request.Format, "mp3", StringComparison.OrdinalIgnoreCase);
      try
      {
        if (request == null || string.IsNullOrWhiteSpace(request.Url)) return BadRequest("Invalid request.");
        var url = request.Url.Trim();
        if (!IsYoutubeUrl(url)) return BadRequest("Only youtube.com / youtu.be URLs are supported.");

        var client = new YoutubeClient();
        var video = await client.Videos.GetAsync(url);
        var manifest = await client.Videos.Streams.GetManifestAsync(video.Id);

        string safeTitle = SanitizeFileName(video.Title);
        string outputFolder = Path.Combine(_baseTarget, "YouTube").Replace("\\", "/") + "/";
        Directory.CreateDirectory(outputFolder.Replace("/", Path.DirectorySeparatorChar.ToString()));

        string downloadPath;
        string finalName;
        string note = "";
        int? width = null, height = null;

        if (string.Equals(request.Format, "audio", StringComparison.OrdinalIgnoreCase) || wantMp3)
        {
          var audioStream = manifest.GetAudioOnlyStreams().OrderByDescending(s => s.Bitrate).FirstOrDefault();
          if (audioStream == null) return BadRequest("No downloadable audio stream available for this video.");

          var audioExt = audioStream.Container.Name switch
          {
            "MP4" => "m4a",
            "WEBM" => "webm",
            "OGG" => "ogg",
            "OPUS" => "opus",
            _ => "m4a"
          };

          var sourceM4a = Path.Combine(outputFolder, $"{safeTitle}.{audioExt}");
          await client.Videos.Streams.DownloadAsync(audioStream, sourceM4a);

          if (wantMp3 && _ffmpegAvailable)
          {
            finalName = $"{safeTitle}.mp3";
            downloadPath = Path.Combine(outputFolder, finalName);
            if (System.IO.File.Exists(downloadPath)) System.IO.File.Delete(downloadPath);
            var conversion = FFmpeg.Conversions.New()
              .AddParameter($"-i \"{sourceM4a}\"")
              .AddParameter("-vn")
              .AddParameter("-b:a 192k")
              .SetOutput(downloadPath);
            await conversion.Start();
            try { System.IO.File.Delete(sourceM4a); } catch { }
          }
          else
          {
            finalName = $"{safeTitle}.{audioExt}";
            downloadPath = sourceM4a;
            note = wantMp3 ? "FFmpeg not available - saved as M4A instead of MP3." : "";
          }
        }
        else
        {
          var muxed = manifest.GetMuxedStreams().TryGetWithHighestVideoQuality();
          if (muxed != null)
          {
            finalName = $"{safeTitle}.mp4";
            downloadPath = Path.Combine(outputFolder, finalName);
            await client.Videos.Streams.DownloadAsync(muxed, downloadPath);
          }
          else if (_ffmpegAvailable)
          {
            var videoOnly = manifest.GetVideoOnlyStreams().OrderByDescending(s => s.VideoQuality).FirstOrDefault();
            var audioOnly = manifest.GetAudioOnlyStreams().OrderByDescending(s => s.Bitrate).FirstOrDefault();
            if (videoOnly == null || audioOnly == null) return BadRequest("No video stream available for this video.");

            var vPath = Path.Combine(outputFolder, $"{safeTitle}.video.{videoOnly.Container.Name.ToLower()}");
            var aPath = Path.Combine(outputFolder, $"{safeTitle}.audio.{audioOnly.Container.Name.ToLower()}");
            await client.Videos.Streams.DownloadAsync(videoOnly, vPath);
            await client.Videos.Streams.DownloadAsync(audioOnly, aPath);

            finalName = $"{safeTitle}.mp4";
            downloadPath = Path.Combine(outputFolder, finalName);
            var conversion = FFmpeg.Conversions.New()
              .AddParameter($"-i \"{vPath}\"")
              .AddParameter($"-i \"{aPath}\"")
              .AddParameter("-c:v copy")
              .AddParameter("-c:a aac")
              .AddParameter("-shortest")
              .SetOutput(downloadPath);
            await conversion.Start();
            try { System.IO.File.Delete(vPath); System.IO.File.Delete(aPath); } catch { }
            note = "Video had no combined stream - merged best video + audio with FFmpeg.";
          }
          else
          {
            return BadRequest("This video has no combined audio+video stream and FFmpeg is not available to merge.");
          }
        }

        if (!System.IO.File.Exists(downloadPath) || new FileInfo(downloadPath).Length == 0)
        {
          return StatusCode(500, "Download failed - output file is empty.");
        }

        long fileSize = new FileInfo(downloadPath).Length;
        int userId = request.UserId ?? 0;
        int newFileId = await InsertConvertedFile(userId, finalName, outputFolder, fileSize, width, height);
        _ = _log.Db($"YouTube download completed: \"{video.Title}\" -> {finalName} (file {newFileId})", userId, "CONVERSION", true);

        return Ok(new YoutubeDownloadResult
        {
          FileId = newFileId,
          FileName = finalName,
          Title = video.Title,
          Note = note
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db("YouTube download error: " + ex.Message, request?.UserId ?? 0, "CONVERSION", true);
        return StatusCode(500, "YouTube download failed: " + ex.Message);
      }
    }

    private static bool IsYoutubeUrl(string url)
    {
      return Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
             (uri.Host.EndsWith("youtube.com", StringComparison.OrdinalIgnoreCase) ||
              uri.Host.Equals("youtu.be", StringComparison.OrdinalIgnoreCase));
    }

    private static string SanitizeFileName(string name)
    {
      if (string.IsNullOrWhiteSpace(name)) return "video";
      var cleaned = Regex.Replace(name, "[\\\\/:*?\"<>|]", "_").Trim();
      if (cleaned.Length > 90) cleaned = cleaned.Substring(0, 90).Trim();
      return string.IsNullOrWhiteSpace(cleaned) ? "video" : cleaned;
    }

    /// <summary>Renders plain text as block ASCII art (5x7 bitmap font) and saves a .txt copy.</summary>
    [HttpPost("/Conversion/TextToAscii", Name = "Conversion_TextToAscii")]
    public async Task<IActionResult> TextToAscii([FromBody] TextToAsciiRequest request)
    {
      try
      {
        if (request == null || string.IsNullOrWhiteSpace(request.Text)) return BadRequest("Enter some text first.");
        if (request.Text.Length > 400) return BadRequest("Text too long (max 400 characters).");

        var art = maxhanna.Server.Services.TextAsciiRenderer.Render(request.Text, request.Style, request.Scale ?? 1);
        if (string.IsNullOrWhiteSpace(art)) return BadRequest("Nothing to render - use letters or numbers.");

        int userId = request.UserId ?? 0;
        string safeName = SanitizeFileName(request.Text.Length > 40 ? request.Text.Substring(0, 40) : request.Text);
        if (safeName.Length < 1) safeName = "ascii";
        string fileName = $"ascii_{safeName}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.txt";
        string outputFolder = Path.Combine(_baseTarget, "Converted").Replace("\\", "/") + "/";
        Directory.CreateDirectory(outputFolder.Replace("/", Path.DirectorySeparatorChar.ToString()));

        var bytes = System.Text.Encoding.UTF8.GetBytes(art);
        await System.IO.File.WriteAllBytesAsync(Path.Combine(outputFolder, fileName).Replace("/", Path.DirectorySeparatorChar.ToString()), bytes);

        int fileId = await InsertConvertedFile(userId, fileName, outputFolder, bytes.Length, null, null);
        _ = _log.Db($"Text-to-ASCII art rendered ({art.Length} chars) -> {fileName} (file {fileId})", userId, "CONVERSION", true);

        return Ok(new TextToAsciiResult
        {
          FileId = fileId,
          FileName = fileName,
          FolderPath = outputFolder,
          Art = art
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Text-to-ASCII error: " + ex.Message, request?.UserId ?? 0, "CONVERSION", true);
        return StatusCode(500, "Failed to render ASCII art: " + ex.Message);
      }
    }

    private static byte[] EncodePng(Image<Rgba32> image, int maxShortSide = 0)
    {
      if (maxShortSide > 0)
      {
        int w = image.Width, h = image.Height;
        if (Math.Max(w, h) > maxShortSide)
        {
          float scale = (float)maxShortSide / Math.Max(w, h);
          int tw = Math.Max(1, (int)Math.Round(w * scale));
          int th = Math.Max(1, (int)Math.Round(h * scale));
          using var resized = image.Clone(x => x.Resize(tw, th));
          using var ms = new MemoryStream();
          resized.Save(ms, new PngEncoder());
          return ms.ToArray();
        }
      }
      using var stream = new MemoryStream();
      image.Save(stream, new PngEncoder());
      return stream.ToArray();
    }

    private static SixLabors.ImageSharp.Formats.IImageEncoder GetImageEncoder(string format)
    {
      return format switch
      {
        "jpg" or "jpeg" => new SixLabors.ImageSharp.Formats.Jpeg.JpegEncoder(),
        "webp" => new SixLabors.ImageSharp.Formats.Webp.WebpEncoder(),
        "bmp" => new SixLabors.ImageSharp.Formats.Bmp.BmpEncoder(),
        "gif" => new SixLabors.ImageSharp.Formats.Gif.GifEncoder(),
        "tiff" => new SixLabors.ImageSharp.Formats.Tiff.TiffEncoder(),
        "tga" => new SixLabors.ImageSharp.Formats.Tga.TgaEncoder(),
        "qoi" => new SixLabors.ImageSharp.Formats.Qoi.QoiEncoder(),
        "pbm" or "pnm" or "pgm" or "ppm" => new SixLabors.ImageSharp.Formats.Pbm.PbmEncoder(),
        _ => new PngEncoder()
      };
    }
  }

  public class ConversionRequest
  {
    public int FileId { get; set; }
    public string? TargetFormat { get; set; }
    public int? UserId { get; set; }
  }

  public class ConversionResult
  {
    public int FileId { get; set; }
    public string? FileName { get; set; }
    public string? FolderPath { get; set; }
  }

  public class ImageToFontRequest
  {
    public int FileId { get; set; }
    public string? Text { get; set; }
    public int? UserId { get; set; }
  }

  public class FontConversionResult
  {
    public int FileId { get; set; }
    public string? FileName { get; set; }
    public string? FolderPath { get; set; }
    public string? FontDataUri { get; set; }
    public string? Characters { get; set; }
  }

  public class VisionReportRequest
  {
    public int FileId { get; set; }
    public string? Prompt { get; set; }
    public int? UserId { get; set; }
  }

  public class VisionReportResult
  {
    public string? Report { get; set; }
  }

  public class YoutubeDownloadRequest
  {
    public string? Url { get; set; }
    public string? Format { get; set; }
    public int? UserId { get; set; }
  }

  public class YoutubeDownloadResult
  {
    public int FileId { get; set; }
    public string? FileName { get; set; }
    public string? Title { get; set; }
    public string? Note { get; set; }
  }

  public class TextToAsciiRequest
  {
    public string? Text { get; set; }
    public string? Style { get; set; }
    public int? Scale { get; set; }
    public int? UserId { get; set; }
  }

  public class TextToAsciiResult
  {
    public int FileId { get; set; }
    public string? FileName { get; set; }
    public string? FolderPath { get; set; }
    public string? Art { get; set; }
  }
}
