using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System.Net;
using maxhanna.Server.Controllers.DataContracts.Rom;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class RomController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly string _baseTarget = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Roms/";


    public RomController(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
    }

    [HttpPost("/Rom/ActivePlayers", Name = "Rom_ActivePlayers")]
    public async Task<IActionResult> ActivePlayers([FromBody] int? minutes)
    {
      int windowMinutes = minutes ?? 2;
      if (windowMinutes <= 0) windowMinutes = 2;
      if (windowMinutes > 24 * 60) windowMinutes = 24 * 60;
      try
      {
        await using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await connection.OpenAsync();
        // Count distinct users who have recent play/save activity OR recent save file creation/access (.sav in file_uploads)
        string sql = @"SELECT COUNT(DISTINCT user_id) AS cnt FROM (
					SELECT user_id FROM maxhanna.emulation_play_time 
					WHERE (save_time IS NOT NULL AND save_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @Minutes MINUTE))
					   OR (start_time IS NOT NULL AND start_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @Minutes MINUTE))
					UNION
					SELECT user_id FROM maxhanna.file_uploads 
					WHERE ( (file_type = 'sav' OR file_name LIKE '%.sav')
					  AND (
					       (upload_date IS NOT NULL AND upload_date >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @Minutes MINUTE))
					    OR (last_access IS NOT NULL AND last_access >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL @Minutes MINUTE))
					     )
					    )
					) AS recent;";
        await using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@Minutes", windowMinutes);
        var result = await cmd.ExecuteScalarAsync();
        int count = result == null || result == DBNull.Value ? 0 : Convert.ToInt32(result);
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
          string romCountSql = @"SELECT COUNT(*) FROM maxhanna.file_uploads WHERE user_id = @UserId AND folder_path = @FolderPath and file_type != 'sav';";
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
          var saveExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
          { ".sav", ".srm", ".eep", ".sra", ".fla" };

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

            var checkCommand = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.file_uploads WHERE file_name = @fileName AND folder_path = @folderPath", connection);
            checkCommand.Parameters.AddWithValue("@fileName", isSaveFile ? newFilename : file.FileName);
            checkCommand.Parameters.AddWithValue("@folderPath", _baseTarget);

            var fileExists = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;

            if (!fileExists)
            {
              // Determine file type based on extension (save files explicitly 'sav')
              var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant().Trim('.') ?? string.Empty;
              string fileType = ext.Trim('.');
              var command = new MySqlCommand("INSERT INTO maxhanna.file_uploads (user_id, file_name, upload_date, last_access, folder_path, is_public, is_folder, file_size) VALUES (@user_id, @fileName, @uploadDate, @lastAccess, @folderPath, @isPublic, @isFolder, @fileSize)", connection);
              var now = DateTime.UtcNow;
              command.Parameters.AddWithValue("@user_id", userId);
              command.Parameters.AddWithValue("@fileSize", file.Length);
              command.Parameters.AddWithValue("@fileName", isSaveFile ? newFilename : file.FileName);
              command.Parameters.AddWithValue("@uploadDate", now);
              command.Parameters.AddWithValue("@lastAccess", now);
              command.Parameters.AddWithValue("@folderPath", _baseTarget);
              command.Parameters.AddWithValue("@isPublic", 1);
              command.Parameters.AddWithValue("@isFolder", 0);

              await command.ExecuteNonQueryAsync();
              _ = _log.Db($"Uploaded rom file: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}, Type: {fileType}, isSaveFile: {isSaveFile}", userId, "ROM", true);

            }
            else
            {
              // Update last_access to reflect current interaction (especially for .sav updates)
              var updateLastAccess = new MySqlCommand("UPDATE maxhanna.file_uploads SET last_access = UTC_TIMESTAMP() WHERE file_name = @fileName AND folder_path = @folderPath LIMIT 1;", connection);
              updateLastAccess.Parameters.AddWithValue("@fileName", file.FileName);
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
										SET save_time = FROM_UNIXTIME(@SaveMs/1000),
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
                      string insertSql = @"INSERT INTO maxhanna.emulation_play_time (user_id, rom_file_name, save_time, duration_seconds, plays, created_at)
												VALUES (@UserId, @RomFileName, FROM_UNIXTIME(@SaveMs/1000), @DurationSeconds, 0, UTC_TIMESTAMP());";
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
    public async Task<IActionResult> GetRomFile(
    [FromRoute] string filePath,
    [FromQuery] int? userId,
    [FromQuery] int? fileId) 
    {
      filePath = Path.Combine(_baseTarget, WebUtility.UrlDecode(filePath) ?? "").Replace("\\", "/");
      string fileName = Path.GetFileName(filePath);
      if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {_baseTarget}"); }

      try
      {
        if (string.IsNullOrEmpty(filePath))
        {
          _ = _log.Db($"File path is missing.", null, "ROM", true);
          return BadRequest("File path is missing.");
        }
        if (userId != null && (filePath.Contains(".sav") || filePath.Contains(".srm")))
        {
          string filenameWithoutExtension = Path.GetFileNameWithoutExtension(filePath);
          string newFilename = filenameWithoutExtension + "_" + userId + Path.GetExtension(filePath).Replace("\\", "/");
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
        else if (userId == null && (filePath.Contains(".sav") || filePath.Contains(".srm")))
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

    [HttpPost("/Rom/GetN64StateFile/{romName}", Name = "GetN64StateFile")]
    public async Task<IActionResult> GetN64StateFile([FromBody] int? userId, string romName)
    {
      // Require login for save files (same rule as GetRomFile)
      if (userId == null || userId == 0)
        return BadRequest("Must be logged in to access save files!");

      // Normalized ROM base (without extension)
      var decodedRom = WebUtility.UrlDecode(romName) ?? string.Empty;
      var romBase = Path.GetFileNameWithoutExtension(decodedRom);
      if (string.IsNullOrWhiteSpace(romBase))
        return BadRequest("Invalid ROM name.");

      // Known N64 save/savestate extensions (priority order)
      // .sav / .srm (savestate containers) then battery saves (.eep/.sra/.fla)
      var saveExts = new[] { ".sav", ".srm", ".eep", ".sra", ".fla" };

      // 1) Try physical on disk (user-specific first), using your naming convention: <base>_<userId><ext>
      foreach (var ext in saveExts)
      {
        var userSpecificName = $"{romBase}_{userId}{ext}";
        var userSpecificPath = Path.Combine(_baseTarget, userSpecificName).Replace("\\", "/");
        if (System.IO.File.Exists(userSpecificPath))
        {
          // Reuse GetRomFile to stream + update last_access + record selection
          return await GetRomFile(userId, null, $"{romBase}_{userId}{ext}");
        }

        // If no per-user file, try the global file (without _userId)
        var globalName = $"{romBase}{ext}";
        var globalPath = Path.Combine(_baseTarget, globalName).Replace("\\", "/");
        if (System.IO.File.Exists(globalPath))
        {
          return await GetRomFile(userId, null, $"{romBase}{ext}");
        }
      }

      // 2) If not found physically, look up DB rows in file_uploads by file_type and name
      try
      {
        await using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await connection.OpenAsync();

        // Preferred: file_type 'sav' (unified for all save formats if you applied the earlier change);
        // otherwise fall back to extension checks in SQL.
        string sql = @"
            SELECT file_name
              FROM maxhanna.file_uploads
             WHERE folder_path = @FolderPath
               AND user_id      = @UserId
               AND (file_type = 'sav'
                    OR file_name LIKE CONCAT(@RomBase, '%.sav')
                    OR file_name LIKE CONCAT(@RomBase, '%.srm')
                    OR file_name LIKE CONCAT(@RomBase, '%.eep')
                    OR file_name LIKE CONCAT(@RomBase, '%.sra')
                    OR file_name LIKE CONCAT(@RomBase, '%.fla'))
             ORDER BY upload_date DESC, last_access DESC
             LIMIT 1;";

        using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@FolderPath", _baseTarget);
        cmd.Parameters.AddWithValue("@UserId", userId);
        cmd.Parameters.AddWithValue("@RomBase", romBase);

        var obj = await cmd.ExecuteScalarAsync();
        var dbFileName = obj as string;

        if (!string.IsNullOrWhiteSpace(dbFileName))
        {
          // The physical file on disk uses <base>_<userId><ext> for saves.
          // We can delegate streaming to GetRomFile by passing the "logical" filename (<base><ext>).
          // GetRomFile will rewrite to per-user path automatically.
          var ext = Path.GetExtension(dbFileName)?.ToLowerInvariant() ?? ".sav";
          return await GetRomFile(userId, null, $"{romBase}{ext}");
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("GetN64StateFile DB lookup error: " + ex.Message, userId, "ROM", true);
        // Continue to 404 if DB lookup fails; you can return 500 if you prefer.
      }

      _ = _log.Db($"No save/savestate found for ROM '{romBase}' (user {userId}).", userId, "ROM", true);
      return NotFound($"No N64 save/savestate found for '{romBase}'.");
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


    private async Task RecordRomSelectionAsync(int userId, string romFileName)
    {
      if (string.IsNullOrWhiteSpace(romFileName) || userId == 0) return;
      var baseName = Path.GetFileNameWithoutExtension(romFileName);
      if (string.IsNullOrWhiteSpace(baseName)) return;
      romFileName = baseName + ".sav";

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
  }
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
