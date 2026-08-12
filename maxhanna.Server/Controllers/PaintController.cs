using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

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
      var ext = match.Groups[1].Value == "png" ? "png" : match.Groups[1].Value == "webp" ? "webp" : "jpg";
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

      // Re-save: reuse the existing row/file so we update in place instead of
      // inserting a duplicate row (which trips the file_name unique key).
      string? existingFileName = null;
      string? existingFolderPath = null;
      string? existingGivenName = null;
      if (request.FileId.HasValue && request.FileId.Value > 0)
      {
        using (var infoConn = new MySqlConnection(connStr))
        {
          await infoConn.OpenAsync();
          var infoCmd = new MySqlCommand("SELECT file_name, folder_path, given_file_name FROM maxhanna.file_uploads WHERE id = @fid AND user_id = @uid;", infoConn);
          infoCmd.Parameters.AddWithValue("@fid", request.FileId.Value);
          infoCmd.Parameters.AddWithValue("@uid", request.UserId);
          using var infoReader = await infoCmd.ExecuteReaderAsync();
          if (await infoReader.ReadAsync())
          {
            existingFileName = infoReader.IsDBNull(0) ? null : infoReader.GetString(0);
            existingFolderPath = infoReader.IsDBNull(1) ? null : infoReader.GetString(1);
            existingGivenName = infoReader.IsDBNull(2) ? null : infoReader.GetString(2);
          }
        }
        // Stale/foreign fileId: don't silently succeed or orphan a written file.
        if (string.IsNullOrEmpty(existingFileName)) return NotFound("Painting not found.");
      }

      string fileName;
      string writeDir = uploadDir;
      if (string.IsNullOrEmpty(existingFileName))
      {
        // Fresh save.
        fileName = $"paint_{request.UserId}_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid():N}.{ext}";
        if (!string.IsNullOrWhiteSpace(request.FileName))
        {
          var safeName = Regex.Replace(request.FileName, @"[^\w\-_\. ]", "");
          if (!string.IsNullOrWhiteSpace(safeName)) fileName = $"{safeName}_{Guid.NewGuid():N}.{ext}";
        }
      }
      else
      {
        // Re-save: same name as the stored file -> overwrite in place. Changed
        // name -> write a fresh file (rename) and drop the old one afterwards.
        writeDir = existingFolderPath ?? uploadDir;
        var safeName = string.IsNullOrWhiteSpace(request.FileName)
          ? existingFileName
          : Regex.Replace(request.FileName, @"[^\w\-_\. ]", "");
        fileName = string.IsNullOrWhiteSpace(safeName)
          ? existingFileName
          : $"{safeName}_{Guid.NewGuid():N}.{ext}";
        if (string.Equals(fileName, existingFileName, StringComparison.OrdinalIgnoreCase))
          fileName = existingFileName;
      }

      if (!writeDir.EndsWith("/")) writeDir += "/";
      var filePath = Path.Combine(writeDir, fileName).Replace("\\", "/");

      await System.IO.File.WriteAllBytesAsync(filePath, bytes);

      var fileSize = new FileInfo(filePath).Length;

      int fileId;
      using (var conn = new MySqlConnection(connStr))
      {
        await conn.OpenAsync();

        var givenFileName = !string.IsNullOrWhiteSpace(request.FileName)
          ? request.FileName
          : fileName;
        // Keep the original display name when re-saving with the same name so it
        // isn't clobbered by the generated (GUID-suffixed) file name.
        if (!string.IsNullOrEmpty(existingGivenName) &&
            string.Equals(fileName, existingFileName, StringComparison.OrdinalIgnoreCase))
        {
          givenFileName = existingGivenName;
        }

        var vis = request.Visibility ?? "Public";

        if (request.FileId.HasValue && request.FileId.Value > 0)
        {
          // Update the existing row in place - never insert a second row for the
          // same painting (file_name is unique; insert+update = duplicate key).
          var upd = new MySqlCommand(@"UPDATE maxhanna.file_uploads SET file_name = @fn, given_file_name = @gfn, folder_path = @fp, is_public = @pub, file_size = @fs, width = @w, height = @h, last_updated = UTC_TIMESTAMP(), last_updated_by_user_id = @uid WHERE id = @fid AND user_id = @uid;", conn);
          upd.Parameters.AddWithValue("@fn", fileName);
          upd.Parameters.AddWithValue("@gfn", givenFileName);
          upd.Parameters.AddWithValue("@fp", writeDir);
          upd.Parameters.AddWithValue("@pub", vis == "Public" ? 1 : 0);
          upd.Parameters.AddWithValue("@fs", (int)fileSize);
          upd.Parameters.AddWithValue("@w", request.Width ?? 0);
          upd.Parameters.AddWithValue("@h", request.Height ?? 0);
          upd.Parameters.AddWithValue("@uid", request.UserId);
          upd.Parameters.AddWithValue("@fid", request.FileId.Value);
          await upd.ExecuteNonQueryAsync();
          fileId = request.FileId.Value;

          // Renamed? Remove the superseded file from disk.
          if (!string.IsNullOrEmpty(existingFileName) &&
              !string.Equals(existingFileName, fileName, StringComparison.OrdinalIgnoreCase) &&
              !string.IsNullOrEmpty(existingFolderPath))
          {
            try
            {
              var oldPath = Path.Combine(existingFolderPath, existingFileName).Replace("\\", "/");
              if (System.IO.File.Exists(oldPath) && !string.Equals(oldPath, filePath, StringComparison.OrdinalIgnoreCase))
                System.IO.File.Delete(oldPath);
            }
            catch { }
          }
        }
        else
        {
          var cmd = new MySqlCommand(@"
          INSERT INTO maxhanna.file_uploads (user_id, file_name, given_file_name, upload_date, folder_path, is_public, is_folder, file_size, width, height, last_updated, last_updated_by_user_id)
          VALUES (@uid, @fn, @gfn, UTC_TIMESTAMP(), @fp, @pub, 0, @fs, @w, @h, UTC_TIMESTAMP(), @uid);
          SELECT LAST_INSERT_ID();", conn);

          cmd.Parameters.AddWithValue("@uid", request.UserId);
          cmd.Parameters.AddWithValue("@fn", fileName);
          cmd.Parameters.AddWithValue("@gfn", givenFileName);
          cmd.Parameters.AddWithValue("@fp", writeDir);
          cmd.Parameters.AddWithValue("@pub", vis == "Public" ? 1 : 0);
          cmd.Parameters.AddWithValue("@fs", (int)fileSize);
          cmd.Parameters.AddWithValue("@w", request.Width ?? 0);
          cmd.Parameters.AddWithValue("@h", request.Height ?? 0);

          var result = await cmd.ExecuteScalarAsync();
          fileId = Convert.ToInt32(result ?? 0);
        }
      }

      await _log.Db($"Paint saved: {fileName} (id={fileId})", request.UserId, "PAINT");

      return Ok(new PaintSaveResponse
      {
        FileId = fileId,
        FileName = fileName,
        FilePath = writeDir + fileName,
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
      // Normalize "jpg" to the canonical "jpeg" mime type in the data URI so
      // browsers decode the image reliably regardless of the file extension.
      var mime = ext == "jpg" ? "jpeg" : ext;
      var base64 = Convert.ToBase64String(imageData);
      var dataUri = $"data:image/{mime};base64,{base64}";

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
