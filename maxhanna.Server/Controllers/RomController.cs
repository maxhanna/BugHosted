using System.Net;
using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
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
    /// <summary>
    /// Root folder for emulator save states — hardcoded next to the ROM folder,
    /// same style as <see cref="_baseTarget"/>. States are plain files here, never
    /// database blobs: a 40 MB PSP state is a single sequential write instead of a
    /// LONGBLOB upsert.
    /// assets/Uploads is served statically by Express, so prod-server.js returns
    /// 404 for this folder; states are only readable through
    /// /Rom/GetEmulatorJSSaveState, and only for the caller's own user folder.
    /// Layout: {root}/{userId}/{rom-stem}[__{core}].state
    /// </summary>
    private readonly string _saveStateRoot = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/RomSaveFiles/";

    public RomController(Log log, IConfiguration config, IServiceScopeFactory scopeFactory)
    {
      _log = log;
      _config = config;
      _scopeFactory = scopeFactory;
      try
      {
        Directory.CreateDirectory(_saveStateRoot);
      }
      catch (Exception ex)
      {
        _ = _log.Db($"Could not create save-state root {_saveStateRoot}: {ex.Message}", null, "ROM", true);
      }
    }

    /// <summary>
    /// User id from the authenticated session token, when the request carries one.
    /// Used to make sure saves land in (and are read from) the caller's own folder.
    /// </summary>
    private int? AuthenticatedUserId()
    {
      var claim = User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
      return int.TryParse(claim, out var id) && id > 0 ? id : null;
    }

    /// <summary>Filesystem-safe file name segment for a ROM or core name.</summary>
    private static string SafeFileStem(string value)
    {
      if (string.IsNullOrWhiteSpace(value)) return "rom";
      var invalid = Path.GetInvalidFileNameChars();
      var chars = value
        .Select(c => Array.IndexOf(invalid, c) >= 0 || c == '/' || c == '\\' || c == '*' || c == '?' || c == ':' ? '_' : c)
        .ToArray();
      var cleaned = new string(chars).Trim().TrimEnd('.');
      if (cleaned.Length == 0) cleaned = "rom";
      return cleaned.Length <= 120 ? cleaned : cleaned[..120];
    }

    /// <summary>
    /// Path for a user's save state of a ROM:
    ///   {root}/{userId}/{rom-stem}[__{core}].state
    /// The per-user folder is what keeps players from loading each other's
    /// states. With <paramref name="createDirectory"/> false nothing is
    /// created: the exact core match is returned when it exists, otherwise any
    /// saved core for that ROM (newest first).
    /// </summary>
    private string? ResolveSaveStatePath(int userId, string romName, string? core, bool createDirectory)
    {
      var dir = Path.Combine(_saveStateRoot, userId.ToString());
      var stem = SafeFileStem(romName);
      var coreStem = string.IsNullOrWhiteSpace(core) ? null : SafeFileStem(core!);

      if (createDirectory)
      {
        Directory.CreateDirectory(dir);
        return coreStem == null
          ? Path.Combine(dir, $"{stem}.state")
          : Path.Combine(dir, $"{stem}__{coreStem}.state");
      }

      if (!Directory.Exists(dir)) return null;

      if (coreStem != null)
      {
        var exact = Path.Combine(dir, $"{stem}__{coreStem}.state");
        if (System.IO.File.Exists(exact)) return exact;
      }

      var plain = Path.Combine(dir, $"{stem}.state");
      if (System.IO.File.Exists(plain)) return plain;

      try
      {
        return Directory.EnumerateFiles(dir, $"{stem}__*.state")
          .OrderByDescending(System.IO.File.GetLastWriteTimeUtc)
          .FirstOrDefault();
      }
      catch
      {
        return null;
      }
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
        
        try
        {
          await RecordRomSelectionAsync(userId.GetValueOrDefault(0), fileName, fileId);
        }
        catch (Exception ex)
        {
          _ = _log.Db($"Error recording rom selection: {ex.Message}", userId, "ROM", true);
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

    private async Task RecordRomSelectionAsync(int userId, string romFileName, int? fileId)
    {
      if (string.IsNullOrWhiteSpace(romFileName)) return;

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
        try
        {
            string romDisplay = System.IO.Path.GetFileNameWithoutExtension(romFileName);
            string eventText = $"is playing {romDisplay}";
            await UserEventController.InsertUserEventStatic(userId, "emulator_play", eventText, fileId, null, _config, _log);
        }
        catch (Exception ex)
        {
            _ = _log.Db($"Error recording user event in RecordRomSelectionAsync: {ex.Message}", userId, "ROM", true);
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

        // Save states are written straight to the user's folder on disk — no
        // blob insert, so the request only costs the bytes we actually write.
        if (AuthenticatedUserId() is int sessionUser && sessionUser != userId)
          userId = sessionUser;

        var fileSize = (int)file.Length;
        var path = ResolveSaveStatePath(userId, romName, core, createDirectory: true)!;
        var tmp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
          await using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous))
          {
            await file.CopyToAsync(fs, CancellationToken.None);
          }
          System.IO.File.Move(tmp, path, overwrite: true);
        }
        catch
        {
          try { System.IO.File.Delete(tmp); } catch { }
          throw;
        }

        // Play-time bookkeeping is the only DB work left; keep it off the request.
        var playRom = romName;
        _ = Task.Run(() => RecordSavePlayTimeBg(userId, playRom));

        swAll.Stop();
        _ = _log.Db($"EJS save OK (file): user={userId} rom={romName} size={fileSize} ms={swAll.ElapsedMilliseconds} file={Path.GetFileName(path)}", userId, "ROM", true);
        return Ok(new { ok = true, userId, romName, fileSize, ms = swAll.ElapsedMilliseconds, stored = Path.GetFileName(path) });
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
    /// Play-time bookkeeping after a save. Runs off the request path; failures
    /// are ignored because they never affect the stored state.
    /// </summary>
    private async Task RecordSavePlayTimeBg(int userId, string romName)
    {
      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(CancellationToken.None);

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
        using var ptCmd = new MySqlCommand(ptSql, conn) { CommandTimeout = 30 };
        ptCmd.Parameters.AddWithValue("@ptUser", userId);
        ptCmd.Parameters.AddWithValue("@ptRom", romName);
        await ptCmd.ExecuteNonQueryAsync(CancellationToken.None);
      }
      catch (Exception ex)
      {
        // Play-time recording is non-critical; ignore failures.
        _ = _log.Db($"RecordSavePlayTimeBg error for user={userId} rom={romName}: {ex.Message}", userId, "ROM", true);
      }
    }

    // ---------------------------------------------------------------
    // POST /Rom/MigrateSaveStates   (one-time: DB blobs -> per-user files)
    //   Header X-Migration-Key (or ?key=) must match
    //   EmulatorSaveStates:MigrationKey; with no key configured the endpoint
    //   refuses to run.
    //   ?batch=25      rows handled per call, so a single request stays short
    //   ?purge=true    (default) delete each row once its file is on disk — this
    //                  is what makes repeated calls make progress
    //   ?dryRun=true   write the files but keep every row, for a small first check
    //   A file already on disk is never overwritten: it is complete (writes are
    //   atomic) and is now the source of truth, so its row is just purged.
    // ---------------------------------------------------------------
    [HttpPost("/Rom/MigrateSaveStates")]
    public async Task<IActionResult> MigrateSaveStates([FromQuery] int batch = 25, [FromQuery] bool purge = true, [FromQuery] bool dryRun = false, CancellationToken ct = default)
    {
      var expectedKey = _config.GetValue<string>("EmulatorSaveStates:MigrationKey");
      if (string.IsNullOrWhiteSpace(expectedKey))
        return StatusCode(503, "Set EmulatorSaveStates:MigrationKey in configuration first.");

      var suppliedKey = Request.Headers["X-Migration-Key"].ToString();
      if (string.IsNullOrWhiteSpace(suppliedKey))
        suppliedKey = Request.Query["key"].ToString();
      if (!string.Equals(suppliedKey, expectedKey, StringComparison.Ordinal))
        return Unauthorized("Bad or missing migration key.");

      batch = Math.Clamp(batch, 1, 500);
      var migrated = 0;
      var skipped = 0;
      var failed = 0;
      long bytesWritten = 0;
      var written = new List<(int UserId, string RomName, string? Core)>();

      try
      {
        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(ct);

        await using (var cmd = new MySqlCommand(@"
          SELECT user_id, rom_name, core, state_data
          FROM maxhanna.emulatorjs_save_states
          ORDER BY user_id, rom_name
          LIMIT @Batch;", conn) { CommandTimeout = 300 })
        {
          cmd.Parameters.AddWithValue("@Batch", batch);

          await using var reader = await cmd.ExecuteReaderAsync(ct);
          while (await reader.ReadAsync(ct))
          {
            var rowUser = reader.GetInt32(0);
            var rowRom = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
            var rowCore = reader.IsDBNull(2) ? null : reader.GetString(2);
            if (string.IsNullOrWhiteSpace(rowRom))
            {
              failed++;
              continue;
            }

            try
            {
              var data = reader.IsDBNull(3) ? Array.Empty<byte>() : (byte[])reader[3];
              if (data.Length == 0)
              {
                skipped++;
                continue;
              }

              var path = ResolveSaveStatePath(rowUser, rowRom, rowCore, createDirectory: true)!;
              // Never overwrite an existing file: it is complete (writes are atomic)
              // and it is the source of truth from now on. Its row is still purged.
              if (System.IO.File.Exists(path))
              {
                skipped++;
                written.Add((rowUser, rowRom, rowCore));
                continue;
              }

              Directory.CreateDirectory(Path.GetDirectoryName(path)!);
              var tmp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
              await System.IO.File.WriteAllBytesAsync(tmp, data, ct);
              System.IO.File.Move(tmp, path, overwrite: true);

              migrated++;
              bytesWritten += data.Length;
              written.Add((rowUser, rowRom, rowCore));
            }
            catch (Exception ex)
            {
              failed++;
              _ = _log.Db($"MigrateSaveStates row failed (user={rowUser} rom={rowRom}): {ex.Message}", rowUser, "ROM", true);
            }
          }
        }

        var purged = 0;
        if (purge && !dryRun && written.Count > 0)
        {
          foreach (var row in written)
          {
            await using var del = new MySqlCommand(@"DELETE FROM maxhanna.emulatorjs_save_states
              WHERE user_id = @U AND rom_name = @R AND core <=> @C LIMIT 1;", conn) { CommandTimeout = 60 };
            del.Parameters.AddWithValue("@U", row.UserId);
            del.Parameters.AddWithValue("@R", row.RomName);
            del.Parameters.AddWithValue("@C", (object?)row.Core ?? DBNull.Value);
            purged += await del.ExecuteNonQueryAsync(ct);
          }
        }

        await using var countCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.emulatorjs_save_states;", conn);
        var remaining = Convert.ToInt32(await countCmd.ExecuteScalarAsync(ct));

        _ = _log.Db($"MigrateSaveStates: migrated={migrated} skipped={skipped} failed={failed} purged={purged} remaining={remaining} bytes={bytesWritten} root={_saveStateRoot}", null, "ROM", true);
        return Ok(new
        {
          ok = failed == 0,
          root = _saveStateRoot,
          dryRun,
          migrated,
          skipped,
          failed,
          purged,
          remaining,
          bytesWritten,
          note = remaining > 0
            ? "Call the same URL again until remaining is 0."
            : "Migration complete — the table is empty and can be dropped."
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db("MigrateSaveStates error: " + ex.Message, null, "ROM", true);
        return StatusCode(500, "Migration failed: " + ex.Message);
      }
    }

    [HttpPost("/Rom/GetEmulatorJSSaveState")]
    public async Task<IActionResult> GetEmulatorJSSaveState([FromBody] GetEmulatorJSSaveStateRequest req, CancellationToken ct = default)
    {
      try
      {
        if (string.IsNullOrWhiteSpace(req.RomName) || req.UserId <= 0)
          return BadRequest("Missing romName or invalid userId");

        // Only the caller's own folder is ever searched.
        var owner = AuthenticatedUserId() ?? req.UserId;
        var path = ResolveSaveStatePath(owner, req.RomName, req.Core, createDirectory: false);
        if (path == null || !System.IO.File.Exists(path))
          return NotFound();

        var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return File(stream, "application/octet-stream");
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

        // Serve the sharer's own file from their folder.
        var sharerPath = ResolveSaveStatePath(req.SharerUserId, req.RomName, req.Core, createDirectory: false);
        if (sharerPath == null || !System.IO.File.Exists(sharerPath))
          return NotFound("Sharer has no save state for this ROM");

        var sharerStream = new FileStream(sharerPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return File(sharerStream, "application/octet-stream");
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
    [HttpPost("/Rom/GetUserPreferredCore", Name = "Rom_GetUserPreferredCore")]
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