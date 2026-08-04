using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Files;
using System.Text.RegularExpressions;

[ApiController]
[Route("api/[controller]")]
public class PaintController : ControllerBase
{
  private readonly IConfiguration _config;
  private readonly string _baseTarget;
  private readonly Log _log;

  public PaintController(IConfiguration config, Log log)
  {
    _config = config;
    _log = log;
    var configPath = config.GetValue<string>("FileUploads:BasePath") ?? "";
    if (string.IsNullOrWhiteSpace(configPath))
    {
      var serverDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location) ?? ".";
      configPath = Path.Combine(serverDir, "..", "..", "..", "..", "maxhanna.client", "src", "assets", "Uploads");
    }
    _baseTarget = Path.GetFullPath(configPath).Replace("\\", "/");
    if (!_baseTarget.EndsWith("/")) _baseTarget += "/";
  }

  [HttpPost("/Paint/Save", Name = "PaintSave")]
  public async Task<IActionResult> SavePainting([FromBody] PaintSaveRequest request)
  {
    if (request.UserId <= 0) return BadRequest("Invalid user.");
    if (string.IsNullOrWhiteSpace(request.ImageData)) return BadRequest("No image data provided.");

    try
    {
      var match = Regex.Match(request.ImageData, @"^data:image\/(png|jpeg|webp);base64,(.+)$");
      if (!match.Success) return BadRequest("Invalid image data format.");
      var ext = match.Groups[1].Value == "png" ? "png" : match.Groups[1].Value == "webp" ? "webp" : "jpeg";
      var base64Data = match.Groups[2].Value;
      var bytes = Convert.FromBase64String(base64Data);

      var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

      // Save into the user's personal folder (Users/[username]), matching how
      // regular user file uploads are stored (see UserController).
      var username = request.UserId.ToString();
      try
      {
        using (var nameConn = new MySqlConnection(connStr))
        {
          await nameConn.OpenAsync();
          var nameCmd = new MySqlCommand("SELECT username FROM maxhanna.users WHERE id = @uid LIMIT 1;", nameConn);
          nameCmd.Parameters.AddWithValue("@uid", request.UserId);
          var nameResult = await nameCmd.ExecuteScalarAsync();
          if (nameResult != null && !string.IsNullOrWhiteSpace(nameResult.ToString()))
          {
            username = nameResult.ToString()!;
          }
        }
      }
      catch (Exception ex)
      {
        await _log.Db($"Paint: failed to resolve username, falling back to userId: {ex.Message}", request.UserId, "PAINT", true);
      }

      var usersRoot = Path.Combine(_baseTarget, "Users").Replace("\\", "/");
      if (!usersRoot.EndsWith("/")) usersRoot += "/";
      var uploadDir = Path.Combine(usersRoot, username).Replace("\\", "/");
      if (!uploadDir.EndsWith("/")) uploadDir += "/";
      if (!Directory.Exists(uploadDir)) Directory.CreateDirectory(uploadDir);
      // Mark the user folder private, matching the registration-time setup.
      var marker = Path.Combine(uploadDir, ".private");
      if (!System.IO.File.Exists(marker))
      {
        try { await System.IO.File.WriteAllTextAsync(marker, "private"); } catch { }
      }
      // Ensure the Users/[username] virtual folder row exists in file_uploads so
      // the folder shows up in the file browser (mirror of UserController).
      try
      {
        using (var folderConn = new MySqlConnection(connStr))
        {
          await folderConn.OpenAsync();
          var folderExists = new MySqlCommand(@"SELECT COUNT(*) FROM maxhanna.file_uploads WHERE user_id = @uid AND file_name = @fn AND is_folder = 1;", folderConn);
          folderExists.Parameters.AddWithValue("@uid", request.UserId);
          folderExists.Parameters.AddWithValue("@fn", username);
          var folderCount = Convert.ToInt32(await folderExists.ExecuteScalarAsync());
          if (folderCount == 0)
          {
            var insertFolder = new MySqlCommand(@"INSERT INTO maxhanna.file_uploads (user_id, upload_date, file_name, folder_path, is_public, is_folder) VALUES (@uid, UTC_TIMESTAMP(), @fn, @fp, 0, 1);", folderConn);
            insertFolder.Parameters.AddWithValue("@uid", request.UserId);
            insertFolder.Parameters.AddWithValue("@fn", username);
            insertFolder.Parameters.AddWithValue("@fp", usersRoot);
            await insertFolder.ExecuteNonQueryAsync();
          }
        }
      }
      catch (Exception ex)
      {
        await _log.Db($"Paint: failed to ensure user folder row: {ex.Message}", request.UserId, "PAINT", true);
      }

      var fileName = $"paint_{request.UserId}_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}.{ext}";
      if (!string.IsNullOrWhiteSpace(request.FileName))
      {
        var safeName = Regex.Replace(request.FileName, @"[^\w\-_\. ]", "");
        if (!string.IsNullOrWhiteSpace(safeName)) fileName = $"{safeName}_{Guid.NewGuid():N}.{ext}";
      }
      var filePath = Path.Combine(uploadDir, fileName).Replace("\\", "/");

      await System.IO.File.WriteAllBytesAsync(filePath, bytes);

      var fileSize = new FileInfo(filePath).Length;

      int fileId;
      using (var conn = new MySqlConnection(connStr))
      {
        await conn.OpenAsync();

        var givenFileName = !string.IsNullOrWhiteSpace(request.FileName)
          ? request.FileName
          : fileName;

        var vis = request.Visibility ?? "Public";
        var cmd = new MySqlCommand(@"
          INSERT INTO maxhanna.file_uploads (user_id, file_name, given_file_name, upload_date, folder_path, is_public, is_folder, file_size, width, height, last_updated, last_updated_by_user_id)
          VALUES (@uid, @fn, @gfn, UTC_TIMESTAMP(), @fp, @pub, 0, @fs, @w, @h, UTC_TIMESTAMP(), @uid);
          SELECT LAST_INSERT_ID();", conn);

        cmd.Parameters.AddWithValue("@uid", request.UserId);
        cmd.Parameters.AddWithValue("@fn", fileName);
        cmd.Parameters.AddWithValue("@gfn", givenFileName);
        cmd.Parameters.AddWithValue("@fp", uploadDir);
        cmd.Parameters.AddWithValue("@pub", vis == "Public" ? 1 : 0);
        cmd.Parameters.AddWithValue("@fs", (int)fileSize); 
        cmd.Parameters.AddWithValue("@w", request.Width ?? 0);
        cmd.Parameters.AddWithValue("@h", request.Height ?? 0);

        var result = await cmd.ExecuteScalarAsync();
        fileId = Convert.ToInt32(result ?? 0);

        if (request.FileId.HasValue && request.FileId.Value > 0)
        {
          var upd = new MySqlCommand(@"UPDATE maxhanna.file_uploads SET file_name = @fn, given_file_name = @gfn, file_size = @fs, width = @w, height = @h, last_updated = UTC_TIMESTAMP(), last_updated_by_user_id = @uid WHERE id = @fid;", conn);
          upd.Parameters.AddWithValue("@fn", fileName);
          upd.Parameters.AddWithValue("@gfn", givenFileName);
          upd.Parameters.AddWithValue("@fs", (int)fileSize);
          upd.Parameters.AddWithValue("@w", request.Width ?? 0);
          upd.Parameters.AddWithValue("@h", request.Height ?? 0);
          upd.Parameters.AddWithValue("@uid", request.UserId);
          upd.Parameters.AddWithValue("@fid", request.FileId.Value);
          await upd.ExecuteNonQueryAsync();
          fileId = request.FileId.Value;
        }
      }

      await _log.Db($"Paint saved: {fileName} (id={fileId})", request.UserId, "PAINT");

      return Ok(new PaintSaveResponse
      {
        FileId = fileId,
        FileName = fileName,
        FilePath = uploadDir + fileName,
        FileSize = (int)fileSize
      });
    }
    catch (Exception ex)
    {
      await _log.Db($"Error saving painting: {ex.Message}", request.UserId, "PAINT", true);
      return StatusCode(500, "Error saving painting.");
    }
  }

  [HttpPost("/Paint/Load", Name = "PaintLoad")]
  public async Task<IActionResult> LoadPainting([FromBody] PaintLoadRequest request)
  {
    if (request.FileId <= 0) return BadRequest("Invalid file ID.");
    try
    {
      var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      string? folderPath = null;
      string? fileName = null;
      using (var conn = new MySqlConnection(connStr))
      {
        await conn.OpenAsync();
        var cmd = new MySqlCommand(@"SELECT file_name, folder_path FROM maxhanna.file_uploads WHERE id = @id;", conn);
        cmd.Parameters.AddWithValue("@id", request.FileId);
        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
          fileName = reader.GetString("file_name");
          folderPath = reader.GetString("folder_path");
        }
      }
      if (fileName == null || folderPath == null) return NotFound("Painting not found.");

      var fullPath = Path.Combine(folderPath, fileName).Replace("\\", "/");
      if (!System.IO.File.Exists(fullPath)) return NotFound("File not found on disk.");

      var imageData = await System.IO.File.ReadAllBytesAsync(fullPath);
      var ext = Path.GetExtension(fullPath).TrimStart('.').ToLower();
      var base64 = Convert.ToBase64String(imageData);
      var dataUri = $"data:image/{ext};base64,{base64}";

      return Ok(new PaintLoadResponse { FileId = request.FileId, ImageData = dataUri });
    }
    catch (Exception ex)
    {
      await _log.Db($"Error loading painting: {ex.Message}", null, "PAINT", true);
      return StatusCode(500, "Error loading painting.");
    }
  }
}

public class PaintSaveRequest
{
  public int UserId { get; set; }
  public string ImageData { get; set; } = "";
  public string? FileName { get; set; }
  public int? FileId { get; set; }
  public string? Visibility { get; set; }
  public int? Width { get; set; }
  public int? Height { get; set; }
}

public class PaintSaveResponse
{
  public int FileId { get; set; }
  public string FileName { get; set; } = "";
  public string FilePath { get; set; } = "";
  public int FileSize { get; set; }
}

public class PaintLoadRequest
{
  public int FileId { get; set; }
}

public class PaintLoadResponse
{
  public int FileId { get; set; }
  public string ImageData { get; set; } = "";
}
