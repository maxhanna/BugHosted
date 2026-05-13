using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Net;
using maxhanna.Server.Controllers.DataContracts;
namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class RomController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly string _baseTarget = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Roms/";
    private readonly string[] saveExts = [".sav", ".srm", ".eep", ".sra", ".fla"];

    public RomController(Log log, IConfiguration config, IServiceScopeFactory scopeFactory)
    {
      _log = log;
      _config = config;
      _scopeFactory = scopeFactory;
    }

    [HttpPost("/Rom/IncrementResetVote", Name = "Rom_IncrementResetVote")]
    public async Task<IActionResult> IncrementResetVote([FromBody] int fileId)
    {
      if (fileId <= 0) return BadRequest("Invalid fileId");
      try
      {
        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        const string updateSql = @"
          UPDATE maxhanna.rom_igdb_enrichment
          SET reset_votes = COALESCE(reset_votes, 0) + 1,
              fetched_at = UTC_TIMESTAMP()
          WHERE file_id = @file_id;
          ";

        using (var cmd = new MySqlCommand(updateSql, conn, tx))
        {
          cmd.Parameters.AddWithValue("@file_id", fileId);
          await cmd.ExecuteNonQueryAsync();
        }

        int resetVotes = 0;
        using (var getCmd = new MySqlCommand("SELECT reset_votes FROM maxhanna.rom_igdb_enrichment WHERE file_id = @file_id", conn, tx))
        {
          getCmd.Parameters.AddWithValue("@file_id", fileId);
          var o = await getCmd.ExecuteScalarAsync();
          if (o != null && o != DBNull.Value) resetVotes = Convert.ToInt32(o);
        }

        await tx.CommitAsync();
        return Ok(new { ok = true, fileId, resetVotes });
      }
      catch (Exception ex)
      {
        _ = _log.Db("IncrementResetVote error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal error");
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

        // Expose file size via a custom header so the client can track download
        // progress even when the Express compression middleware strips Content-Length.
        Response.Headers.Append("X-File-Size", fileStream.Length.ToString());

        return File(fileStream, contentType, Path.GetFileName(filePath));
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while streaming the file." + ex.Message, userId, "ROM", true);
        return StatusCode(500, "An error occurred while streaming the file.");
      }
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
                AND (
                      (ep.save_time IS NOT NULL AND ep.save_time >= @cutoff)
                      OR (ep.start_time IS NOT NULL AND ep.start_time >= @cutoff)
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
          string sql = @"SELECT rom_file_name, IFNULL(SUM(duration_seconds),0) AS totalSeconds, IFNULL(SUM(plays),0) AS plays FROM maxhanna.emulation_play_time WHERE user_id = @UserId GROUP BY rom_file_name ORDER BY totalSeconds DESC, plays DESC;";
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
      if (fileId.HasValue)
      {
        await using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
        {
          await connection.OpenAsync();

          string sql = @"
                INSERT INTO file_access (file_id, user_id, last_access)
                VALUES (@FileId, @UserId, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE 
                file_id = VALUES(file_id), 
                last_access = VALUES(last_access),
                access_count = access_count + 1;
            ";

          await using var command = new MySqlCommand(sql, connection);
          command.Parameters.AddWithValue("@FileId", fileId.Value);
          command.Parameters.AddWithValue("@UserId", userId ?? 0);

          await command.ExecuteNonQueryAsync();
        }
      }
    }

    private async Task RecordRomSelectionAsync(int userId, string romFileName)
    {
      if (string.IsNullOrWhiteSpace(romFileName) || userId == 0) return;

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

    // ---------------------------------------------------------------
    // POST /Rom/SaveEmulatorJSState  (multipart/form-data)
    //   form fields: file, userId, romName
    //   Raw (uncompressed) bytes only.
    //   Mirrors the proven SaveN64State pattern: read to byte[], pass
    //   byte[] directly to MySqlConnector (no Stream parameter).
    //   Also records cumulative play-time via RecordRomPlayTimeAsync.
    // ---------------------------------------------------------------
    [HttpPost("/Rom/SaveEmulatorJSState")]
    [DisableRequestSizeLimit]
    [RequestFormLimits(MultipartBodyLengthLimit = 128 * 1024 * 1024)]
    public async Task<IActionResult> SaveEmulatorJSState(CancellationToken ct)
    {
      var swAll = System.Diagnostics.Stopwatch.StartNew();
      try
      {
        if (!Request.HasFormContentType)
          return BadRequest("Expected multipart/form-data");

        var form = await Request.ReadFormAsync(CancellationToken.None);
        var file = form.Files.GetFile("file");
        if (file == null || file.Length <= 0)
          return BadRequest("Missing 'file' in multipart request.");

        if (!int.TryParse(form["userId"], out var userId) || userId <= 0)
          return BadRequest("Missing or invalid 'userId'.");

        var romName = form["romName"].ToString();
        var core = form["core"].ToString();
        if (string.IsNullOrWhiteSpace(romName))
          return BadRequest("Missing 'romName'.");

        byte[] bytes;
        using (var ms = new MemoryStream())
        {
          await file.CopyToAsync(ms, CancellationToken.None);
          bytes = ms.ToArray();
        }

        // Capture all state here while the request is still alive, then let the client go.
        var romNameCopy = romName;
        var coreCopy = core;
        var userIdCopy = userId;
        var bytesCopy = bytes;
        var fileSize = bytes.Length;

        // Return OK immediately so the client doesn't wait for the DB write.
        _ = Task.Run(() => SaveStateBgAsync(userIdCopy, romNameCopy, coreCopy, bytesCopy, fileSize));

        swAll.Stop();
        return Ok(new { ok = true, userId, romName, fileSize, ms = swAll.ElapsedMilliseconds, queued = true });
      }
      catch (OperationCanceledException)
      {
        _ = _log.Db("SaveEmulatorJSState timed out / canceled", null, "ROM", true);
        return StatusCode(504, "Timed out saving emulator state");
      }
      catch (Exception ex)
      {
        _ = _log.Db("SaveEmulatorJSState error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Error saving emulator state");
      }
    }

    /// <summary>
    /// Background task: performs the DB save after we already returned OK to the client.
    /// </summary>
    private async Task SaveStateBgAsync(int userId, string romName, string core, byte[] data, int fileSize)
    {
      var sw = System.Diagnostics.Stopwatch.StartNew();
      try
      {
        // Use a scoped scope so we get fresh DI services for the background work.
        using var scope = _scopeFactory.CreateScope();
        var provider = scope.ServiceProvider;
        var log = provider.GetRequiredService<Log>();
        var config = provider.GetRequiredService<IConfiguration>();

        await using var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(CancellationToken.None);

        const string sql = @"
          INSERT INTO emulatorjs_save_states
            (user_id, rom_name, state_data, file_size, last_updated, core)
          VALUES
            (@UserId, @RomName, @StateData, @FileSize, CURRENT_TIMESTAMP, @Core)
          ON DUPLICATE KEY UPDATE
            core         = VALUES(core),
            state_data   = VALUES(state_data),
            file_size    = VALUES(file_size),
            last_updated = CURRENT_TIMESTAMP;";

        using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 180 };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = romName;
        cmd.Parameters.Add("@StateData", MySqlDbType.LongBlob).Value = data;
        cmd.Parameters.Add("@FileSize", MySqlDbType.Int32).Value = fileSize;
        cmd.Parameters.Add("@Core", MySqlDbType.VarChar).Value = string.IsNullOrWhiteSpace(core) ? (object)DBNull.Value : core;

        await cmd.PrepareAsync(CancellationToken.None);
        await cmd.ExecuteNonQueryAsync(CancellationToken.None);

        // Record play-time
        try
        {
          const string ptSql = @"UPDATE maxhanna.emulation_play_time 
            SET duration_seconds = COALESCE(duration_seconds, 0) 
                  + IF(start_time IS NULL AND save_time IS NULL, 0, 
                       TIMESTAMPDIFF(SECOND, 
                         IF(save_time IS NULL OR save_time < start_time, start_time, save_time), 
                         UTC_TIMESTAMP()
                       )
                    ),
                save_time = UTC_TIMESTAMP()
            WHERE user_id = @ptUser AND rom_file_name = @ptRom LIMIT 1;";
          using var ptCmd = new MySqlCommand(ptSql, conn);
          ptCmd.Parameters.AddWithValue("@ptUser", userId);
          ptCmd.Parameters.AddWithValue("@ptRom", romName);
          await ptCmd.ExecuteNonQueryAsync(CancellationToken.None);
        }
        catch
        {
          // Play-time recording is non-critical; ignore failures.
        }

        sw.Stop();
        _ = log.Db($"EJS save OK (bg): user={userId} rom={romName} size={fileSize} ms={sw.ElapsedMilliseconds}", userId, "ROM", true);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"SaveStateBgAsync error for user={userId} rom={romName}: {ex.Message}", userId, "ROM", true);
      }
    }

    [HttpPost("/Rom/GetEmulatorJSSaveState")]
    public async Task<IActionResult> GetEmulatorJSSaveState([FromBody] GetEmulatorJSSaveStateRequest req, CancellationToken ct = default)
    {
      try
      {
        if (string.IsNullOrWhiteSpace(req.RomName) || req.UserId <= 0)
          return BadRequest("Missing romName or invalid userId");

        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(ct);

        // Try exact core match if provided. If not found, fall back to core IS NULL.
        string sql = $"SELECT state_data FROM emulatorjs_save_states WHERE user_id=@UserId AND rom_name=@RomName {(!string.IsNullOrWhiteSpace(req.Core) ? " AND core=@Core" : "")} ;";
        await using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 120 };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = req.UserId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = req.RomName;
        if (!string.IsNullOrWhiteSpace(req.Core))
          cmd.Parameters.Add("@Core", MySqlDbType.VarChar).Value = req.Core;

        var result = await cmd.ExecuteScalarAsync(ct);
        if (result != null && result != DBNull.Value)
        {
          var bytes = (byte[])result;
          return File(bytes, "application/octet-stream", "savestate.state");
        }

        // If a core was specified but no matching row found, try a NULL-core fallback.
        if (!string.IsNullOrWhiteSpace(req.Core))
        {
          const string fallbackSql = "SELECT state_data FROM emulatorjs_save_states WHERE user_id=@UserId AND rom_name=@RomName AND core IS NULL;";
          await using var fallbackCmd = new MySqlCommand(fallbackSql, conn) { CommandTimeout = 120 };
          fallbackCmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = req.UserId;
          fallbackCmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = req.RomName;

          var fallbackResult = await fallbackCmd.ExecuteScalarAsync(ct);
          if (fallbackResult != null && fallbackResult != DBNull.Value)
          {
            var bytes = (byte[])fallbackResult;
            return File(bytes, "application/octet-stream", "savestate.state");
          }
        }

        return NotFound();
      }
      catch (Exception ex)
      {
        _ = _log.Db("GetEmulatorJSSaveState error: " + ex.Message, req.UserId, "ROM", true);
        return StatusCode(500, "Error retrieving save state");
      }
    }

    /// <summary>
    /// Saves (upserts) the user's system/core override for a ROM file.
    /// This persists which emulator core should be used for this particular file,
    /// overriding the auto-detection logic.
    /// </summary>
    [HttpPost("/Rom/SetSystemOverride", Name = "Rom_SetSystemOverride")]
    public async Task<IActionResult> SetSystemOverride([FromBody] SetSystemOverrideRequest req)
    {
      if (req.FileId <= 0 || string.IsNullOrWhiteSpace(req.SystemCore))
        return BadRequest("Invalid fileId or systemCore");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
          INSERT INTO maxhanna.rom_system_overrides (file_id, system_core, updated_at)
          VALUES (@FileId, @SystemCore, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE
            system_core = VALUES(system_core),
            updated_at  = UTC_TIMESTAMP();";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@FileId", req.FileId);
        cmd.Parameters.AddWithValue("@SystemCore", req.SystemCore);
        await cmd.ExecuteNonQueryAsync();

        return Ok(new { ok = true, fileId = req.FileId, systemCore = req.SystemCore });
      }
      catch (Exception ex)
      {
        _ = _log.Db("SetSystemOverride error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Gets the saved system/core override for a ROM file, if any.
    /// </summary>
    [HttpGet("/Rom/GetSystemOverride/{fileId}")]
    public async Task<IActionResult> GetSystemOverride(int fileId)
    {
      if (fileId <= 0) return BadRequest("Invalid fileId");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"SELECT system_core FROM maxhanna.rom_system_overrides WHERE file_id = @FileId;";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@FileId", fileId);
        var result = await cmd.ExecuteScalarAsync();

        if (result == null || result == DBNull.Value)
          return Ok(new { fileId, systemCore = (string?)null });

        return Ok(new { fileId, systemCore = result.ToString() });
      }
      catch (Exception ex)
      {
        _ = _log.Db("GetSystemOverride error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Clears (deletes) the saved system/core override for a ROM file.
    /// </summary>
    [HttpPost("/Rom/ClearSystemOverride", Name = "Rom_ClearSystemOverride")]
    public async Task<IActionResult> ClearSystemOverride([FromBody] int fileId)
    {
      if (fileId <= 0) return BadRequest("Invalid fileId");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"DELETE FROM maxhanna.rom_system_overrides WHERE file_id = @FileId;";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@FileId", fileId);
        await cmd.ExecuteNonQueryAsync();

        return Ok(new { ok = true, fileId });
      }
      catch (Exception ex)
      {
        _ = _log.Db("ClearSystemOverride error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    [HttpGet("/Rom/WasSharedWithUser/{userId}/{romId}", Name = "Rom_WasSharedWithUser")]
    public async Task<IActionResult> WasSharedWithUser(int userId, int romId)
    {
      if (userId <= 0 || romId <= 0)
        return BadRequest("Invalid userId or romId");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
          SELECT id, sharer_user_id, rom_file_name
          FROM maxhanna.rom_share_requests
          WHERE target_user_id = @TargetUserId AND rom_file_id = @RomFileId
          ORDER BY created_at DESC;";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@TargetUserId", userId);
        cmd.Parameters.AddWithValue("@RomFileId", romId);

        var sharerIds = new List<int>();
        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            sharerIds.Add(reader.GetInt32(reader.GetOrdinal("sharer_user_id")));
          }
        }

        return Ok(new { shared = sharerIds.Count > 0, sharerIds });
      }
      catch (Exception ex)
      {
        _ = _log.Db("WasSharedWithUser error: " + ex.Message, userId, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    [HttpPost("/Rom/Share", Name = "Rom_Share")]
    public async Task<IActionResult> ShareRom([FromBody] ShareRomRequest request)
    {
      if (request == null || request.UserId <= 0 || request.SharedWithUserIds == null || request.SharedWithUserIds.Count == 0)
        return BadRequest("Invalid request: must provide UserId and at least one SharedWithUserId.");
      if (!request.RomId.HasValue || request.RomId <= 0)
        return BadRequest("RomId is required.");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        // Look up the ROM file name from file_uploads
        string? romFileName = null;
        using (var lookupCmd = new MySqlCommand("SELECT file_name FROM maxhanna.file_uploads WHERE id = @FileId LIMIT 1", conn))
        {
          lookupCmd.Parameters.AddWithValue("@FileId", request.RomId.Value);
          var nameObj = await lookupCmd.ExecuteScalarAsync();
          if (nameObj != null && nameObj != DBNull.Value)
            romFileName = nameObj.ToString();
        }

        if (string.IsNullOrWhiteSpace(romFileName))
          return BadRequest("ROM file not found.");

        int inserted = 0;
        foreach (var targetUserId in request.SharedWithUserIds)
        {
          if (targetUserId <= 0 || targetUserId == request.UserId) continue;

          const string sql = @"
            INSERT INTO maxhanna.rom_share_requests
              (sharer_user_id, target_user_id, rom_file_id, rom_file_name, created_at)
            VALUES
              (@SharerUserId, @TargetUserId, @RomFileId, @RomFileName, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE
              rom_file_name = VALUES(rom_file_name),
              created_at    = UTC_TIMESTAMP();";

          using var cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@SharerUserId", request.UserId);
          cmd.Parameters.AddWithValue("@TargetUserId", targetUserId);
          cmd.Parameters.AddWithValue("@RomFileId", request.RomId.Value);
          cmd.Parameters.AddWithValue("@RomFileName", romFileName);
          await cmd.ExecuteNonQueryAsync();
          inserted++;
        }

        return Ok(new { ok = true, sharedWith = inserted });
      }
      catch (Exception ex)
      {
        _ = _log.Db("ShareRom error: " + ex.Message, request.UserId, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Deletes a share request — called when the recipient declines.
    /// </summary>
    [HttpPost("/Rom/DeleteShareRequest", Name = "Rom_DeleteShareRequest")]
    public async Task<IActionResult> DeleteShareRequest([FromBody] DeleteShareRequestPayload payload)
    {
      if (payload.TargetUserId <= 0 || payload.RomFileId <= 0 || payload.SharerUserId <= 0)
        return BadRequest("Invalid parameters");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
          DELETE FROM maxhanna.rom_share_requests
          WHERE sharer_user_id = @SharerUserId
            AND target_user_id = @TargetUserId
            AND rom_file_id    = @RomFileId;";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@SharerUserId", payload.SharerUserId);
        cmd.Parameters.AddWithValue("@TargetUserId", payload.TargetUserId);
        cmd.Parameters.AddWithValue("@RomFileId", payload.RomFileId);
        await cmd.ExecuteNonQueryAsync();

        return Ok(new { ok = true });
      }
      catch (Exception ex)
      {
        _ = _log.Db("DeleteShareRequest error: " + ex.Message, payload.TargetUserId, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Returns the save state of a sharer for a specific ROM, so the recipient can load it.
    /// </summary>
    [HttpPost("/Rom/GetSharedSaveState", Name = "Rom_GetSharedSaveState")]
    public async Task<IActionResult> GetSharedSaveState([FromBody] GetSharedSaveStateRequest req, CancellationToken ct = default)
    {
      if (req.SharerUserId <= 0 || req.TargetUserId <= 0 || string.IsNullOrWhiteSpace(req.RomName))
        return BadRequest("Invalid parameters");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(ct);

        // Verify that a share request actually exists
        const string verifySql = @"
          SELECT COUNT(*) FROM maxhanna.rom_share_requests
          WHERE sharer_user_id = @SharerUserId
            AND target_user_id = @TargetUserId
            AND rom_file_name  = @RomName;";

        await using var verifyCmd = new MySqlCommand(verifySql, conn);
        verifyCmd.Parameters.AddWithValue("@SharerUserId", req.SharerUserId);
        verifyCmd.Parameters.AddWithValue("@TargetUserId", req.TargetUserId);
        verifyCmd.Parameters.AddWithValue("@RomName", req.RomName);
        var count = Convert.ToInt32(await verifyCmd.ExecuteScalarAsync(ct));
        if (count == 0)
          return NotFound("No share request found");

        // Fetch the sharer's save state
        string sql = "SELECT state_data FROM emulatorjs_save_states WHERE user_id=@UserId AND rom_name=@RomName";
        if (!string.IsNullOrWhiteSpace(req.Core))
          sql += " AND core=@Core";
        sql += ";";

        await using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 120 };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = req.SharerUserId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = req.RomName;
        if (!string.IsNullOrWhiteSpace(req.Core))
          cmd.Parameters.Add("@Core", MySqlDbType.VarChar).Value = req.Core;

        var result = await cmd.ExecuteScalarAsync(ct);
        if (result != null && result != DBNull.Value)
        {
          var bytes = (byte[])result;
          return File(bytes, "application/octet-stream", "savestate.state");
        }

        return NotFound("Sharer has no save state for this ROM");
      }
      catch (Exception ex)
      {
        _ = _log.Db("GetSharedSaveState error: " + ex.Message, req.TargetUserId, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Returns all pending share requests for a user (checked when they open the emulator).
    /// </summary>
    [HttpGet("/Rom/GetPendingShares/{userId}", Name = "Rom_GetPendingShares")]
    public async Task<IActionResult> GetPendingShares(int userId)
    {
      if (userId <= 0) return BadRequest("Invalid userId");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
          SELECT r.id, r.sharer_user_id, r.rom_file_id, r.rom_file_name, r.created_at,
                 u.username AS sharer_username
          FROM maxhanna.rom_share_requests r
          JOIN maxhanna.users u ON u.id = r.sharer_user_id
          WHERE r.target_user_id = @UserId
          ORDER BY r.created_at DESC;";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);

        var shares = new List<object>();
        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            shares.Add(new
            {
              id = reader.GetInt32("id"),
              sharerUserId = reader.GetInt32("sharer_user_id"),
              sharerUsername = reader.GetString("sharer_username"),
              romFileId = reader.GetInt32("rom_file_id"),
              romFileName = reader.GetString("rom_file_name"),
              createdAt = reader.GetDateTime("created_at")
            });
          }
        }

        return Ok(shares);
      }
      catch (Exception ex)
      {
        _ = _log.Db("GetPendingShares error: " + ex.Message, userId, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Sets a user's preferred core for a specific ROM file.
    /// </summary>
    [HttpPost("/Rom/SetUserPreferredCore", Name = "Rom_SetUserPreferredCore")]
    public async Task<IActionResult> SetUserPreferredCore([FromBody] SetUserPreferredCoreRequest req)
    {
      if (req.FileId <= 0 || string.IsNullOrWhiteSpace(req.Core))
        return BadRequest("Invalid fileId or core");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        const string sql = @"
          INSERT INTO maxhanna.rom_user_preferred_cores (file_id, user_id, core, updated_at)
          VALUES (@FileId, @UserId, @Core, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE
            core = VALUES(core),
            updated_at = UTC_TIMESTAMP();";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@FileId", req.FileId);
        cmd.Parameters.AddWithValue("@UserId", req.UserId);
        cmd.Parameters.AddWithValue("@Core", req.Core);
        await cmd.ExecuteNonQueryAsync();

        return Ok(new { ok = true, fileId = req.FileId, core = req.Core });
      }
      catch (Exception ex)
      {
        _ = _log.Db("SetUserPreferredCore error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }

    /// <summary>
    /// Gets a user's preferred core for a specific ROM file.
    /// </summary>
    [HttpGet("/Rom/GetUserPreferredCore", Name = "Rom_GetUserPreferredCore")]
    public async Task<IActionResult> GetUserPreferredCore([FromBody] GetUserPreferredCoreRequest req)
    {
      if (req.FileId <= 0) return BadRequest("Invalid fileId");

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync();

        // Try to get user's preferred core first (if user is logged in)
        const string sql = @"
          SELECT core FROM maxhanna.rom_user_preferred_cores 
          WHERE file_id = @FileId AND user_id = @UserId
          ORDER BY updated_at DESC 
          LIMIT 1;";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@FileId", req.FileId);
        cmd.Parameters.AddWithValue("@UserId", req.UserId);
        var result = await cmd.ExecuteScalarAsync();

        if (result == null || result == DBNull.Value)
          return Ok(new { fileId = req.FileId, core = (string?)null });

        return Ok(new { fileId = req.FileId, core = result.ToString() });
      }
      catch (Exception ex)
      {
        _ = _log.Db("GetUserPreferredCore error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Internal error");
      }
    }
  }
}

public class SetUserPreferredCoreRequest
{
  public int FileId { get; set; }
  public int UserId { get; set; }
  public string Core { get; set; } = string.Empty;
}
public class GetUserPreferredCoreRequest
{
  public int FileId { get; set; }
  public int UserId { get; set; }
}