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

    private static readonly string[] ImageTargetFormats = { "png", "jpg", "jpeg", "webp", "bmp", "gif", "tiff" };

    public ConversionController(Log log, IConfiguration config, AiController aiController)
    {
      _log = log;
      _config = config;
      _aiController = aiController;
      _connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      _baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? "";
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
}
