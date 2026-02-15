using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System.Net;
using maxhanna.Server.Controllers.DataContracts.Rom;
using System.Data;
using System.Threading;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class RomController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly string _baseTarget = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Roms/";
    private readonly string[] saveExts = [".sav", ".srm", ".eep", ".sra", ".fla"];
    private readonly HashSet<string> emulatorJSExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
      // Nintendo
      ".gba", ".gbc", ".gb", ".nes", ".snes", ".sfc", ".n64", ".z64", ".v64", ".nds",
      // Sega
      ".smd", ".gen", ".bin", ".32x", ".gg", ".sms",
      // PlayStation
      ".cue", ".iso", ".chd", ".pbp",
      // Other Handhelds
      ".pce", ".ngp", ".ngc", ".ws", ".wsc", ".lnx",
      // Atari
      ".col", ".a26", ".a78", ".jag",
      // Computer Systems
      ".adf", ".d64", ".exe", ".com", ".bat",
      // Arcade
      ".zip",
      // Other
      ".wad", ".ccd"
    };
    private readonly HashSet<string> n64Extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        ".z64", ".n64", ".v64", ".bin", ".zip"
    };

    public RomController(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
    }

    [HttpPost("/Rom/Uploadrom", Name = "Uploadrom")]
    public async Task<IActionResult> UploadRom()
    {
      try
      {
        if (Request.Form["userId"].Count <= 0)
        {
          _ = _log.Db($"Invalid user! Returning null.", null, "ROM", true);
          return BadRequest("No user logged in.");
        }

        int userId = JsonConvert.DeserializeObject<int>(Request.Form["userId"]!);
        var files = Request.Form.Files; // Get all uploaded files
        if (userId == 0)
        {
          _ = _log.Db($"Invalid user! Returning null.", null, "ROM", true);
          return BadRequest("No user logged in.");

        }
        if (files == null || files.Count == 0)
        {
          _ = _log.Db($"No File Uploaded!", userId, "ROM", true);
          return BadRequest("No files uploaded.");
        }

        foreach (var file in files)
        {
          if (file.Length == 0)
          {
            _ = _log.Db($"File length is empty!", userId, "ROM", true);
            continue; // Skip empty files
          }

          var ext = Path.GetExtension(file.FileName)?.ToLowerInvariant() ?? string.Empty;
          bool isSaveFile = saveExts.Contains(ext);

          // For user-specific save files, keep your naming convention: <basename>_<userId><ext>
          string newFilename = "";
          if (isSaveFile)
          {
            string filenameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
            newFilename = filenameWithoutExtension + "_" + userId + ext.Replace("\\", "/");
          }

          var filePath = string.IsNullOrEmpty(newFilename) ? file.FileName : newFilename;
          filePath = Path.Combine(_baseTarget, filePath).Replace("\\", "/");

          if (!Directory.Exists(_baseTarget))
          {
            Directory.CreateDirectory(_baseTarget);
          }

          using (var stream = new FileStream(filePath, FileMode.Create))
          {
            await file.CopyToAsync(stream);
          }

          using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
          {
            await connection.OpenAsync();

            var fileExists = false;
            if (!isSaveFile)
            {
              var checkCommand = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.file_uploads WHERE file_name = @fileName AND folder_path = @folderPath", connection);
              checkCommand.Parameters.AddWithValue("@fileName", file.FileName);
              checkCommand.Parameters.AddWithValue("@folderPath", _baseTarget);
              fileExists = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;
            }

            if (!fileExists && !isSaveFile)
            {
              // Determine file type based on extension
              var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant().Trim('.') ?? string.Empty;
              string fileType = ext.Trim('.');
              var command = new MySqlCommand("INSERT INTO maxhanna.file_uploads (user_id, file_name, upload_date, last_access, last_updated, last_updated_by_user_id, folder_path, is_public, is_folder, file_size) VALUES (@user_id, @fileName, @uploadDate, @lastAccess, @lastUpdated, @user_id, @folderPath, @isPublic, @isFolder, @fileSize)", connection);
              var now = DateTime.UtcNow;
              command.Parameters.AddWithValue("@user_id", userId);
              command.Parameters.AddWithValue("@fileSize", file.Length);
              command.Parameters.AddWithValue("@fileName", file.FileName);
              command.Parameters.AddWithValue("@uploadDate", now);
              command.Parameters.AddWithValue("@lastAccess", now);
              command.Parameters.AddWithValue("@lastUpdated", now);
              command.Parameters.AddWithValue("@folderPath", _baseTarget);
              command.Parameters.AddWithValue("@isPublic", 1);
              command.Parameters.AddWithValue("@isFolder", 0);

              await command.ExecuteNonQueryAsync();
              _ = _log.Db($"Uploaded rom file: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}, Type: {fileType}, isSaveFile: {isSaveFile}", userId, "ROM", true);

            }
            else if (isSaveFile)
            {
              // Update last_access to reflect current interaction (especially for .sav updates)
              var updateLastAccess = new MySqlCommand("UPDATE maxhanna.file_uploads SET last_access = UTC_TIMESTAMP(), last_updated = UTC_TIMESTAMP(), last_updated_by_user_id = @user_id WHERE file_name = @fileName AND folder_path = @folderPath LIMIT 1;", connection);
              updateLastAccess.Parameters.AddWithValue("@fileName", file.FileName);
              updateLastAccess.Parameters.AddWithValue("@user_id", userId);
              updateLastAccess.Parameters.AddWithValue("@folderPath", _baseTarget);
              await updateLastAccess.ExecuteNonQueryAsync();
              if (!isSaveFile)
                _ = _log.Db($"Rom file already exists: {(isSaveFile ? newFilename : file.FileName)}, Size: {file.Length} bytes, Path: {filePath}, isSaveFile: {isSaveFile}", userId, "ROM", true);
            }

            // If this was a save file upload, check for optional timing fields and persist playtime
            if (isSaveFile)
            {
              try
              {
                // Form keys expected: startTimeMs, saveTimeMs, durationSeconds
                long startMs = 0;
                long saveMs = 0;
                int durationSeconds = 0;
                if (Request.Form.ContainsKey("startTimeMs") && long.TryParse(Request.Form["startTimeMs"], out var sm)) startMs = sm;
                if (Request.Form.ContainsKey("saveTimeMs") && long.TryParse(Request.Form["saveTimeMs"], out var svm)) saveMs = svm;
                if (Request.Form.ContainsKey("durationSeconds") && int.TryParse(Request.Form["durationSeconds"], out var ds)) durationSeconds = ds;

                // When a user uploads a .sav (save file), only update save_time and duration_seconds.
                // Do NOT modify start_time or plays here — plays should be incremented when the user
                // actually selects/starts the ROM for play (handled in RecordRomSelectionAsync).
                try
                {
                  string updateSql = @"UPDATE maxhanna.emulation_play_time
										SET save_time = UTC_TIMESTAMP(),
											duration_seconds = IFNULL(duration_seconds, 0) + @DurationSeconds
										WHERE user_id = @UserId AND rom_file_name = @RomFileName LIMIT 1;";

                  using (var upd = new MySqlCommand(updateSql, connection))
                  {
                    upd.Parameters.AddWithValue("@UserId", userId);
                    upd.Parameters.AddWithValue("@RomFileName", file.FileName);
                    upd.Parameters.AddWithValue("@SaveMs", saveMs);
                    upd.Parameters.AddWithValue("@DurationSeconds", durationSeconds);
                    int rows = await upd.ExecuteNonQueryAsync();

                    if (rows == 0)
                    {
                      // No existing row: insert a new record with plays = 0 (since user hasn't started a play session yet)
                      string insertSql = @"INSERT INTO maxhanna.emulation_play_time (user_id, rom_file_name, start_time, save_time, duration_seconds, plays, created_at)
												VALUES (@UserId, @RomFileName, UTC_TIMESTAMP(), UTC_TIMESTAMP(), @DurationSeconds, 0, UTC_TIMESTAMP());";
                      using var ins = new MySqlCommand(insertSql, connection);
                      ins.Parameters.AddWithValue("@UserId", userId);
                      ins.Parameters.AddWithValue("@RomFileName", file.FileName);
                      ins.Parameters.AddWithValue("@SaveMs", saveMs);
                      ins.Parameters.AddWithValue("@DurationSeconds", durationSeconds);
                      await ins.ExecuteNonQueryAsync();
                    }
                  }
                }
                catch (MySqlException mex)
                {
                  _ = _log.Db("Error recording playtime on upload (DB error): " + mex.Message, userId, "ROM", true);
                }
              }
              catch (Exception ex)
              {
                _ = _log.Db("Error recording playtime on upload: " + ex.Message, userId, "ROM", true);
              }
            }
          }

        }

        return Ok("ROM uploaded successfully.");
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while uploading files." + ex.Message, null, "ROM", true);
        return StatusCode(500, "An error occurred while uploading files.");
      }
    }

    [HttpPost("/Rom/GetRomFile/{filePath}", Name = "GetRomFile")]
    public async Task<IActionResult> GetRomFile([FromRoute] string filePath, [FromBody] GetRomFileRequest req)
    {
      int? fileId = req.FileId;
      int? userId = req.UserId;
      filePath = Path.Combine(_baseTarget, WebUtility.UrlDecode(filePath) ?? "").Replace("\\", "/");
      string fileName = Path.GetFileName(filePath);
      string fileExt = Path.GetExtension(filePath);
      if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {_baseTarget}"); }
      Console.WriteLine($"Getting Rom file with fileName: {fileName}, fileExt: {fileExt} and filePath: {filePath}");
      try
      {
        if (string.IsNullOrEmpty(filePath))
        {
          _ = _log.Db($"File path is missing.", null, "ROM", true);
          return BadRequest("File path is missing.");
        }
        if (userId != null && saveExts.Contains(fileExt))
        {
          string filenameWithoutExtension = Path.GetFileNameWithoutExtension(filePath);
          string tmpUserId = filenameWithoutExtension.EndsWith("_" + userId) ? "" : ("_" + userId);
          string newFilename = filenameWithoutExtension + tmpUserId + fileExt.Replace("\\", "/");
          string userSpecificPath = Path.Combine(_baseTarget, newFilename).Replace("\\", "/");

          if (System.IO.File.Exists(userSpecificPath))
          {
            filePath = userSpecificPath;
          }
          else
          {
            _ = _log.Db($"File not found at {filePath} or {userSpecificPath}", userId, "ROM", true);
            return NotFound();
          }
          //_ = _log.Db($"File path changed . New FilePath: " + filePath, userId, "ROM", true);
        }
        else if (userId == null && saveExts.Contains(fileExt))
        {
          return BadRequest("Must be logged in to access save files!");
        }

        var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
        string contentType = "application/octet-stream";

        // Record user's selection/play start in emulation_play_time when logged in
        if (userId != null)
        {
          try
          {
            await RecordRomSelectionAsync(userId.Value, fileName);
          }
          catch (Exception ex)
          {
            _ = _log.Db($"Error recording rom selection: {ex.Message}", userId, "ROM", true);
          }
        }

        _ = UpdateLastAccessForRom(fileName, userId, fileId);
        return File(fileStream, contentType, Path.GetFileName(filePath));
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while streaming the file." + ex.Message, userId, "ROM", true);
        return StatusCode(500, "An error occurred while streaming the file.");
      }
    }

    // ---------------------------
    // POST /rom/saven64state
    // FormData:
    //  - file        : IFormFile (save bytes)  [required]
    //  - userId      : number                  [required]
    //  - romName     : string                  [required]
    //  - filename    : string (e.g. "Game.sra") [optional; fallback to file.FileName]
    //  - saveTimeMs  : number (optional)
    // ---------------------------
    [HttpPost("saven64state")]
    [RequestSizeLimit(2_000_000)] // 2 MB safety cap
    public async Task<IActionResult> SaveN64State()
    {
      var form = await Request.ReadFormAsync();
      var file = form.Files.GetFile("file");
      if (file == null || file.Length <= 0)
        return BadRequest("Missing 'file'");

      if (!int.TryParse(form["userId"], out var userId) || userId <= 0)
        return BadRequest("Invalid 'userId'");

      var romName = form["romName"].ToString();
      if (string.IsNullOrWhiteSpace(romName))
        return BadRequest("Missing 'romName'");

      var providedFilename = form["filename"].ToString();
      var fileName = string.IsNullOrWhiteSpace(providedFilename) ? file.FileName : providedFilename;

      if (string.IsNullOrWhiteSpace(fileName))
        return BadRequest("Missing 'filename'");

      // Validate extension
      var ext = Path.GetExtension(fileName).ToLowerInvariant();
      if (ext != ".eep" && ext != ".sra" && ext != ".fla")
        return BadRequest("Unsupported save type. Allowed: .eep, .sra, .fla");

      // Read bytes
      byte[] bytes;
      using (var ms = new MemoryStream())
      {
        await file.CopyToAsync(ms);
        bytes = ms.ToArray();
      }
      var size = bytes.Length;

      // Domain-enforced sizes
      if (!IsValidSize(ext, size, out var saveType))
        return BadRequest($"Invalid {ext} size: {size} bytes");

      // UPSERT into MySQL
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      const string sql = @"
INSERT INTO n64_user_saves
    (user_id, rom_name, save_file_name, save_type, save_data, file_size, last_write)
VALUES
    (@UserId, @RomName, @SaveFileName, @SaveType, @SaveData, @FileSize, CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
    save_type  = VALUES(save_type),
    save_data  = VALUES(save_data),
    file_size  = VALUES(file_size),
    last_write = CURRENT_TIMESTAMP;";

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
      cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = romName;
      cmd.Parameters.Add("@SaveFileName", MySqlDbType.VarChar).Value = fileName;
      cmd.Parameters.Add("@SaveType", MySqlDbType.VarChar).Value = saveType; // 'eep'|'sra'|'fla'
      cmd.Parameters.Add("@SaveData", MySqlDbType.MediumBlob).Value = bytes;
      cmd.Parameters.Add("@FileSize", MySqlDbType.Int32).Value = size;

      await cmd.ExecuteNonQueryAsync();

      return Ok(new
      {
        ok = true,
        userId,
        romName,
        fileName,
        saveType,
        fileSize = size
      });
    }

    // ---------------------------
    // POST /rom/GetN64SaveByName/{romName}
    // Body: userId (raw JSON number)
    // Returns: octet-stream with *save_file_name* as download filename
    // ---------------------------
    [HttpPost("GetN64SaveByName/{romName}")]
    public async Task<IActionResult> GetN64SaveByName([FromRoute] string romName, [FromBody] int userId)
    {
      if (string.IsNullOrWhiteSpace(romName) || userId <= 0)
        return BadRequest("Missing romName or invalid userId");

      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      const string sql = @"
        SELECT save_file_name, save_data
        FROM n64_user_saves
        WHERE user_id = @UserId
          AND rom_name = @RomName
        ORDER BY last_write DESC
        LIMIT 1;";

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
      cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = romName;

      using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SequentialAccess);
      if (!await reader.ReadAsync())
        return NotFound("No save found for this ROM");

      var fileName = reader.GetString(0);
      byte[] data;

      // Read blob efficiently
      const int chunk = 81920;
      using (var ms = new MemoryStream())
      {
        long offset = 0;
        long bytesRead;
        do
        {
          var buffer = new byte[chunk];
          bytesRead = reader.GetBytes(1, offset, buffer, 0, buffer.Length);
          if (bytesRead > 0)
          {
            ms.Write(buffer, 0, (int)bytesRead);
            offset += bytesRead;
          }
        } while (bytesRead > 0);
        data = ms.ToArray();
      }

      // Return exact emulator filename → your frontend feeds this to importInGameSaveRam (no rename)
      return File(data, "application/octet-stream", fileName);
    }


    [HttpPost("/Rom/ActivePlayers", Name = "Rom_ActivePlayers")]
    public async Task<IActionResult> ActivePlayers([FromBody] int? minutes, CancellationToken ct = default)
    {
      var windowMinutes = Math.Clamp(minutes ?? 2, 1, 24 * 60);
      var cutoffUtc = DateTime.UtcNow.AddMinutes(-windowMinutes);

      try
      {
        await using var connection = new MySqlConnection(
            _config.GetValue<string>("ConnectionStrings:maxhanna"));
        await connection.OpenAsync(ct).ConfigureAwait(false);

        const string sql = @"
            SELECT COUNT(*) AS cnt
            FROM (
              SELECT ep.user_id
              FROM maxhanna.emulation_play_time AS ep
              WHERE ep.user_id IS NOT NULL
                AND ep.save_time IS NOT NULL
                AND ep.save_time >= @cutoff
            ) AS recent;";

        await using var cmd = new MySqlCommand(sql, connection)
        {
          CommandTimeout = 5
        };
        cmd.Parameters.Add("@cutoff", MySqlDbType.DateTime).Value = cutoffUtc;

        var obj = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        int count = (obj == null || obj == DBNull.Value) ? 0 : Convert.ToInt32(obj);

        return Ok(new { count });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Rom ActivePlayers error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal server error");
      }
    }



    [HttpGet("/Rom/UserStats/{userId}")]
    public async Task<IActionResult> UserStats(int userId)
    {
      try
      {
        using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();
          string totalSql = @"SELECT IFNULL(SUM(duration_seconds),0) AS totalSeconds FROM maxhanna.emulation_play_time WHERE user_id = @UserId;";
          var totalCmd = new MySqlCommand(totalSql, connection);
          totalCmd.Parameters.AddWithValue("@UserId", userId);
          var totalSecondsObj = await totalCmd.ExecuteScalarAsync();
          int totalSeconds = Convert.ToInt32(totalSecondsObj ?? 0);

          // Count distinct ROM uploads for this user (files in folder_path = 'roms')
          string romCountSql = @"SELECT COUNT(*) FROM maxhanna.file_uploads WHERE user_id = @UserId AND folder_path = @FolderPath;";
          var romCountCmd = new MySqlCommand(romCountSql, connection);
          romCountCmd.Parameters.AddWithValue("@UserId", userId);
          romCountCmd.Parameters.AddWithValue("@FolderPath", _baseTarget);
          var romCountObj = await romCountCmd.ExecuteScalarAsync();
          int romCount = Convert.ToInt32(romCountObj ?? 0);

          string topSql = @"SELECT rom_file_name, plays FROM maxhanna.emulation_play_time WHERE user_id = @UserId ORDER BY plays DESC LIMIT 1;";
          var topCmd = new MySqlCommand(topSql, connection);
          topCmd.Parameters.AddWithValue("@UserId", userId);
          using (var reader = await topCmd.ExecuteReaderAsync())
          {
            string? topName = null;
            int topPlays = 0;
            if (await reader.ReadAsync())
            {
              topName = reader.IsDBNull(0) ? null : reader.GetString(0);
              topPlays = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
            }
            return Ok(new { totalSeconds = totalSeconds, topGameName = topName, topGamePlays = topPlays, romCount = romCount });
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error fetching user emulation stats: " + ex.Message, userId, "ROM", true);
        return StatusCode(500, "Error fetching stats");
      }
    }


    [HttpGet("/Rom/UserGameBreakdown/{userId}")]
    public async Task<IActionResult> UserGameBreakdown(int userId)
    {
      try
      {
        using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();
          string sql = @"SELECT rom_file_name, IFNULL(SUM(duration_seconds),0) AS totalSeconds, IFNULL(SUM(plays),0) AS plays FROM maxhanna.emulation_play_time WHERE user_id = @UserId GROUP BY rom_file_name ORDER BY totalSeconds DESC;";
          var cmd = new MySqlCommand(sql, connection);
          cmd.Parameters.AddWithValue("@UserId", userId);
          using (var reader = await cmd.ExecuteReaderAsync())
          {
            var list = new List<object>();
            while (await reader.ReadAsync())
            {
              string? name = reader.IsDBNull(0) ? null : reader.GetString(0);
              int totalSeconds = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
              int plays = reader.IsDBNull(2) ? 0 : reader.GetInt32(2);
              list.Add(new { romFileName = name, totalSeconds = totalSeconds, plays = plays });
            }
            return Ok(list);
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error fetching user emulation breakdown: " + ex.Message, userId, "ROM", true);
        return StatusCode(500, "Error fetching breakdown");
      }
    }


    private bool ValidatePath(string directory)
    {
      if (!directory.Contains(_baseTarget))
      {
        _ = _log.Db($"'{directory}'Must be within '{_baseTarget}'", null, "ROM", true);
        return false;
      }
      else
      {
        return true;
      }
    }

    private static bool IsValidSize(string ext, int size, out string saveType)
    {
      saveType = ext.TrimStart('.'); // 'eep'|'sra'|'fla'
      switch (ext)
      {
        case ".eep": return size == 512 || size == 2048;
        case ".sra": return size == 32768;
        case ".fla": return size == 131072;
        default: return false;
      }
    }

    [HttpPost("/Rom/GetMappings")]
    public async Task<IActionResult> GetMappings([FromBody] int UserId)
    {
      try
      {
        var list = new List<string>();
        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();
        string sql = "SELECT name FROM rom_mappings WHERE user_id = @user_id ORDER BY name;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@user_id", UserId);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          list.Add(reader[0]?.ToString() ?? "");
        }

        return Ok(list);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"RomController.GetMappings failed: {ex.Message}", UserId, "ROM", true);
        return StatusCode(500, "Error retrieving mappings");
      }
    }

    [HttpPost("/Rom/GetMapping")]
    public async Task<IActionResult> GetMapping([FromBody] GetMappingRequest request)
    {
      try
      {
        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();
        string sql = "SELECT mapping_json FROM rom_mappings WHERE user_id = @user_id AND name = @name LIMIT 1;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@user_id", request.UserId);
        cmd.Parameters.AddWithValue("@name", request.Name);
        var obj = await cmd.ExecuteScalarAsync();
        if (obj == null || obj == DBNull.Value) return NotFound("Mapping not found");
        var json = obj as string ?? "{}";
        var dict = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, maxhanna.Server.Controllers.DataContracts.Rom.MappingEntry>>(json);
        return Ok(dict ?? new Dictionary<string, maxhanna.Server.Controllers.DataContracts.Rom.MappingEntry>());
      }
      catch (Exception ex)
      {
        _ = _log.Db($"RomController.GetMapping failed: {ex.Message}", request?.UserId, "ROM", true);
        return StatusCode(500, "Error retrieving mapping");
      }
    }

    [HttpPost("/Rom/SaveMapping")]
    public async Task<IActionResult> SaveMapping([FromBody] SaveMappingRequest request)
    {
      try
      {
        // Serialize strongly-typed mapping dictionary to JSON text for storage
        string mappingJson = System.Text.Json.JsonSerializer.Serialize(request.Mapping ?? new Dictionary<string, maxhanna.Server.Controllers.DataContracts.Rom.MappingEntry>());

        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        // Check how many mappings the user currently has
        string countSql = "SELECT COUNT(*) FROM rom_mappings WHERE user_id = @user_id;";
        using (var countCmd = new MySqlCommand(countSql, conn))
        {
          countCmd.Parameters.AddWithValue("@user_id", request.UserId);
          var cntObj = await countCmd.ExecuteScalarAsync();
          int existingCount = Convert.ToInt32(cntObj ?? 0);

          // Check if a mapping with this name already exists (update allowed)
          string existsSql = "SELECT COUNT(*) FROM rom_mappings WHERE user_id = @user_id AND name = @name LIMIT 1;";
          using var existsCmd = new MySqlCommand(existsSql, conn);
          existsCmd.Parameters.AddWithValue("@user_id", request.UserId);
          existsCmd.Parameters.AddWithValue("@name", request.Name);
          var existsObj = await existsCmd.ExecuteScalarAsync();
          int nameExists = Convert.ToInt32(existsObj ?? 0);

          const int MaxMappings = 50;
          if (existingCount >= MaxMappings && nameExists == 0)
          {
            return StatusCode(403, $"Mapping limit reached ({MaxMappings}). Delete an existing mapping before adding a new one.");
          }
        }

        // Ensure there's a unique key on (user_id, name) in DB for ON DUPLICATE KEY to work.
        string sql = @"
							INSERT INTO rom_mappings (user_id, name, mapping_json, created_at, updated_at)
							VALUES (@user_id, @name, @mapping_json, UTC_TIMESTAMP(), UTC_TIMESTAMP())
							ON DUPLICATE KEY UPDATE mapping_json = VALUES(mapping_json), updated_at = UTC_TIMESTAMP();";

        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@user_id", request.UserId);
        cmd.Parameters.AddWithValue("@name", request.Name);
        cmd.Parameters.AddWithValue("@mapping_json", mappingJson);
        await cmd.ExecuteNonQueryAsync();

        return Ok("Saved");
      }
      catch (Exception ex)
      {
        _ = _log.Db($"RomController.SaveMapping failed: {ex.Message}", request?.UserId, "ROM", true);
        return StatusCode(500, "Error saving mapping");
      }
    }

    [HttpPost("/Rom/DeleteMapping")]
    public async Task<IActionResult> DeleteMapping([FromBody] GetMappingRequest request)
    {
      try
      {
        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();
        string sql = "DELETE FROM rom_mappings WHERE user_id = @user_id AND name = @name LIMIT 1;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@user_id", request.UserId);
        cmd.Parameters.AddWithValue("@name", request.Name);
        var affected = await cmd.ExecuteNonQueryAsync();
        if (affected == 0) return NotFound("Mapping not found");
        return Ok("Deleted");
      }
      catch (Exception ex)
      {
        _ = _log.Db($"RomController.DeleteMapping failed: {ex.Message}", request?.UserId, "ROM", true);
        return StatusCode(500, "Error deleting mapping");
      }
    }


    [HttpPost("/Rom/GetLastInputSelection")]
    public async Task<IActionResult> GetLastInputSelection([FromBody] GetLastInputSelectionRequest request)
    {
      if (request == null || request.UserId <= 0 || string.IsNullOrWhiteSpace(request.RomToken))
        return BadRequest("Missing userId or romToken");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
      SELECT user_id, rom_token, mapping_name, gamepad_id, UNIX_TIMESTAMP(updated_at)*1000 AS updated_ms
        FROM maxhanna.n64_last_input_selection
       WHERE user_id = @user_id AND rom_token = @rom_token
       LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@user_id", request.UserId);
        cmd.Parameters.AddWithValue("@rom_token", request.RomToken);
        await using var reader = await cmd.ExecuteReaderAsync();

        if (!await reader.ReadAsync()) return NotFound();

        var resp = new LastInputSelectionResponse
        {
          UserId = reader.IsDBNull(0) ? 0 : reader.GetInt32(0),
          RomToken = reader.IsDBNull(1) ? "" : reader.GetString(1),
          MappingName = reader.IsDBNull(2) ? null : reader.GetString(2),
          GamepadId = reader.IsDBNull(3) ? null : reader.GetString(3),
          UpdatedAtMs = reader.IsDBNull(4) ? 0 : reader.GetInt64(4)
        };

        return Ok(resp);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"RomController.GetLastInputSelection failed: {ex.Message}", request?.UserId, "ROM", true);
        return StatusCode(500, "Error fetching last input selection");
      }
    }

    [HttpPost("/Rom/SaveLastInputSelection")]
    public async Task<IActionResult> SaveLastInputSelection([FromBody] LastInputSelectionRequest request)
    {
      if (request == null || request.UserId <= 0 || string.IsNullOrWhiteSpace(request.RomToken))
        return BadRequest("Missing userId or romToken");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
      INSERT INTO maxhanna.n64_last_input_selection (user_id, rom_token, mapping_name, gamepad_id, updated_at)
      VALUES (@user_id, @rom_token, @mapping_name, @gamepad_id, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        mapping_name = VALUES(mapping_name),
        gamepad_id   = VALUES(gamepad_id),
        updated_at   = UTC_TIMESTAMP();";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@user_id", request.UserId);
        cmd.Parameters.AddWithValue("@rom_token", request.RomToken);
        cmd.Parameters.AddWithValue("@mapping_name", (object?)request.MappingName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@gamepad_id", (object?)request.GamepadId ?? DBNull.Value);

        await cmd.ExecuteNonQueryAsync();
        return Ok("Saved");
      }
      catch (Exception ex)
      {
        _ = _log.Db($"RomController.SaveLastInputSelection failed: {ex.Message}", request?.UserId, "ROM", true);
        return StatusCode(500, "Error saving last input selection");
      }
    }

    private async Task UpdateLastAccessForRom(string fileName, int? userId, int? fileId)
    {
      // First: update last_access and get file_id + folder_path
      await using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        await connection.OpenAsync();

        string sql = @"
            UPDATE maxhanna.file_uploads 
            SET last_access = UTC_TIMESTAMP(), access_count = access_count + 1 
            WHERE id = @FileId 
            LIMIT 1; 
        ";

        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@FileId", fileId);

        // Execute both statements
        await using var reader = await command.ExecuteReaderAsync();
        // Move to second result set
        if (await reader.NextResultAsync() && await reader.ReadAsync())
        {
          fileId = reader.GetInt32(reader.GetOrdinal("id"));
        }
      }

      // Second: insert into file_access if we have userId and fileId
      if (userId.HasValue && fileId.HasValue)
      {
        await using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();

          string sql = @"
                INSERT INTO file_access (file_id, user_id)
                VALUES (@FileId, @UserId)
                ON DUPLICATE KEY UPDATE file_id = VALUES(file_id);
            ";

          await using var command = new MySqlCommand(sql, connection);
          command.Parameters.AddWithValue("@FileId", fileId.Value);
          command.Parameters.AddWithValue("@UserId", userId.Value);

          await command.ExecuteNonQueryAsync();
        }
      }
    }

    [HttpPost("/Rom/ActiveN64Players", Name = "Rom_ActiveN64Players")]
    public async Task<IActionResult> ActiveN64Players([FromBody] int? minutes, CancellationToken ct = default)
    {
      var windowMinutes = Math.Clamp(minutes ?? 2, 1, 24 * 60);
      var cutoffUtc = DateTime.UtcNow.AddMinutes(-windowMinutes);

      try
      {
        await using var connection = new MySqlConnection(
            _config.GetValue<string>("ConnectionStrings:maxhanna"));
        await connection.OpenAsync(ct).ConfigureAwait(false);

        const string sql = @" 
          SELECT COUNT(*) AS cnt
          FROM (
            SELECT ep.user_id
            FROM maxhanna.emulation_play_time AS ep
            WHERE ep.user_id IS NOT NULL
              AND ep.save_time IS NOT NULL
              AND (ep.save_time >= @cutoff OR ep.start_time >= @cutoff)
              AND (
                ep.rom_file_name LIKE '%.sra'
                  OR ep.rom_file_name LIKE '%.eep' 
                  OR ep.rom_file_name LIKE '%.fla'
                  OR ep.rom_file_name LIKE '%.z64'
                  OR ep.rom_file_name LIKE '%.n64'
                  OR ep.rom_file_name LIKE '%.v64'
              )
          ) AS recent;";

        await using var cmd = new MySqlCommand(sql, connection)
        {
          CommandTimeout = 5
        };
        cmd.Parameters.Add("@cutoff", MySqlDbType.DateTime).Value = cutoffUtc;

        var obj = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
        int count = (obj == null || obj == DBNull.Value) ? 0 : Convert.ToInt32(obj);

        return Ok(new { count });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Rom ActiveN64Players error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal server error");
      }
    }


    private async Task RecordRomSelectionAsync(int userId, string romFileName)
    {
      if (string.IsNullOrWhiteSpace(romFileName) || userId == 0) return;
      var ext = Path.GetExtension(romFileName);
      if (!n64Extensions.Contains(ext))
      {
        string baseName = Path.GetFileNameWithoutExtension(romFileName);
        romFileName = baseName + ".sav";
      }

      try
      {
        using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();
          // Try an update first so we don't rely on a specific unique key being present.
          string updateSql = @"UPDATE maxhanna.emulation_play_time 
					SET start_time = UTC_TIMESTAMP(), plays = plays + 1 
					WHERE user_id = @UserId AND rom_file_name = @RomFileName LIMIT 1;";

          using (var upd = new MySqlCommand(updateSql, connection))
          {
            upd.Parameters.AddWithValue("@UserId", userId);
            upd.Parameters.AddWithValue("@RomFileName", romFileName);
            int rows = await upd.ExecuteNonQueryAsync();

            if (rows == 0)
            {
              string insertSql = @"INSERT INTO maxhanna.emulation_play_time (user_id, rom_file_name, start_time, plays, created_at)
							VALUES (@UserId, @RomFileName, UTC_TIMESTAMP(), 1, UTC_TIMESTAMP());";
              using var ins = new MySqlCommand(insertSql, connection);
              ins.Parameters.AddWithValue("@UserId", userId);
              ins.Parameters.AddWithValue("@RomFileName", romFileName);
              await ins.ExecuteNonQueryAsync();
            }
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Error in RecordRomSelectionAsync: {ex.Message}", userId, "ROM", true);
      }
    }

    [HttpPost("/Rom/SaveEmulatorJSState")]
    [RequestSizeLimit(64 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 64 * 1024 * 1024, ValueLengthLimit = int.MaxValue, MultipartHeadersLengthLimit = int.MaxValue)]
    public async Task<IActionResult> SaveEmulatorJSState()
    {
      var swAll = System.Diagnostics.Stopwatch.StartNew();
      try
      {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        // 1) Read the multipart form
        var form = await Request.ReadFormAsync(HttpContext.RequestAborted);
        var tForm = sw.Elapsed; sw.Restart();

        var file = form.Files.GetFile("file");
        if (file == null || file.Length <= 0) return BadRequest("Missing 'file'");

        if (!int.TryParse(form["userId"], out var userId) || userId <= 0) return BadRequest("Invalid 'userId'");
        var romName = form["romName"].ToString();
        if (string.IsNullOrWhiteSpace(romName)) return BadRequest("Missing 'romName'");

        // 2) Buffer file to memory (optional: stream; see section 4)
        byte[] stateBytes;
        using (var ms = new MemoryStream((int)Math.Min(file.Length, 32 * 1024 * 1024))) // pre-allocate best-effort
        {
          await file.CopyToAsync(ms, HttpContext.RequestAborted);
          stateBytes = ms.ToArray();
        }
        var tReadFile = sw.Elapsed; sw.Restart();

        // 3) Insert/Upsert
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(HttpContext.RequestAborted);

        const string sql = @"
      INSERT INTO emulatorjs_save_states
        (user_id, rom_name, state_data, file_size, last_updated)
      VALUES
        (@UserId, @RomName, @StateData, @FileSize, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        state_data = VALUES(state_data),
        file_size = VALUES(file_size),
        last_updated = CURRENT_TIMESTAMP;";

        await using var cmd = new MySqlCommand(sql, conn)
        {
          // ⬇️ Give the insert enough time for large payloads (e.g., 180s)
          CommandTimeout = 180
        };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = romName;
        cmd.Parameters.Add("@StateData", MySqlDbType.LongBlob).Value = stateBytes; // LONGBLOB column
        cmd.Parameters.Add("@FileSize", MySqlDbType.Int32).Value = stateBytes.Length;

        await cmd.ExecuteNonQueryAsync(HttpContext.RequestAborted);
        var tDb = sw.Elapsed;

        // Optional: structured logging with durations
        _ = _log.Db($"EJS Save: form={tForm.TotalMilliseconds:F0}ms, read={tReadFile.TotalMilliseconds:F0}ms, db={tDb.TotalMilliseconds:F0}ms, total={swAll.Elapsed.TotalMilliseconds:F0}ms",
                    userId, "ROM", true);

        return Ok(new { ok = true, userId, romName, fileSize = stateBytes.Length });
      }
      catch (Exception ex)
      {
        _ = _log.Db("SaveEmulatorJSState error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Error saving emulator state");
      }
    }


    [HttpPost("/Rom/GetEmulatorJSSaveState")]
    public async Task<IActionResult> GetEmulatorJSSaveState([FromBody] GetEmulatorJSSaveStateRequest req, CancellationToken ct = default)
    {
      try
      {
        if (string.IsNullOrWhiteSpace(req.RomName) || req.UserId <= 0)
          return BadRequest("Missing romName or invalid userId");

        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(ct);

        const string sql = @"
          SELECT state_data
          FROM emulatorjs_save_states
          WHERE user_id = @UserId
            AND rom_name = @RomName
          ORDER BY last_updated DESC
          LIMIT 1;";

        using var cmd = new MySqlCommand(sql, conn);
        cmd.CommandTimeout = 0; // allow longer reads for large blobs
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = req.UserId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = req.RomName;
 
        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct);
        if (!await reader.ReadAsync(ct)) return NotFound();

        const int chunkSize = 128 * 1024; // 128 KB
        var buffer = new byte[chunkSize];

        await using var ms = new MemoryStream();
        long read;
        long offset = 0;
        do
        {
          read = reader.GetBytes(0, offset, buffer, 0, buffer.Length);
          if (read > 0)
          {
            await ms.WriteAsync(buffer.AsMemory(0, (int)read), ct);
            offset += read;
          }
        } while (read > 0);

        ms.Position = 0;
        return File(ms, "application/octet-stream", "savestate.state");

      }
      catch (Exception ex)
      {
        _ = _log.Db("GetEmulatorJSSaveState error: " + ex.Message, req.UserId, "ROM", true);
        return StatusCode(500, "Error retrieving save state");
      }
    }
  }
}
public class GetEmulatorJSSaveStateRequest
{
  public int UserId { get; set; }
  public string RomName { get; set; } = string.Empty;
}
public class GetLastInputSelectionRequest
{
  public int UserId { get; set; }
  public string RomToken { get; set; } = string.Empty;
}

public class LastInputSelectionRequest
{
  public int UserId { get; set; }
  public string RomToken { get; set; } = string.Empty;
  public string? MappingName { get; set; }
  public string? GamepadId { get; set; }
}

public class LastInputSelectionResponse
{
  public int UserId { get; set; }
  public string RomToken { get; set; } = string.Empty;
  public string? MappingName { get; set; }
  public string? GamepadId { get; set; }
  public long UpdatedAtMs { get; set; }
}

public class GetRomFileRequest
{
  public int? UserId { get; set; }
  public int? FileId { get; set; }
}
