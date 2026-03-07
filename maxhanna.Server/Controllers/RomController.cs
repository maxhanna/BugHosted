using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Net;
using System.Data;

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

    public RomController(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
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
        // 1) Validate multipart
        if (!Request.HasFormContentType)
          return BadRequest("Expected multipart/form-data");

        // NOTE: Do NOT pass the request CancellationToken (ct) to I/O ops below.
        // The Express prod-server proxy may signal cancellation before the DB
        // write completes.  We still want the save to finish server-side.
        var form = await Request.ReadFormAsync(CancellationToken.None);
        var file = form.Files.GetFile("file");
        if (file == null || file.Length <= 0)
          return BadRequest("Missing 'file' in multipart request.");

        if (!int.TryParse(form["userId"], out var userId) || userId <= 0)
          return BadRequest("Missing or invalid 'userId'.");

        var romName = form["romName"].ToString();
        if (string.IsNullOrWhiteSpace(romName))
          return BadRequest("Missing 'romName'.");

        // 2) Read file into byte[] (same pattern as SaveN64State — MySqlConnector needs byte[])
        byte[] bytes;
        using (var ms = new MemoryStream())
        {
          await file.CopyToAsync(ms, CancellationToken.None);
          bytes = ms.ToArray();
        }

        // 3) UPSERT into MySQL
        //    PrepareAsync() switches MySqlConnector to the binary protocol,
        //    which sends LONGBLOB bytes raw instead of hex-encoding them.
        //    For a 16 MB N64 save this roughly halves the data on the wire
        //    and can cut save time from 50s+ down to a few seconds.
        using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(CancellationToken.None);

        const string sql = @"
          INSERT INTO emulatorjs_save_states
            (user_id, rom_name, state_data, file_size, last_updated)
          VALUES
            (@UserId, @RomName, @StateData, @FileSize, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE
            state_data   = VALUES(state_data),
            file_size    = VALUES(file_size),
            last_updated = CURRENT_TIMESTAMP;";

        using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 180 };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = romName;
        cmd.Parameters.Add("@StateData", MySqlDbType.LongBlob).Value = bytes;
        cmd.Parameters.Add("@FileSize", MySqlDbType.Int32).Value = bytes.Length;

        await cmd.PrepareAsync(CancellationToken.None);
        await cmd.ExecuteNonQueryAsync(CancellationToken.None);

        // 4) Record play-time on the same open connection (avoids second connection round-trip)
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
        catch (Exception ptEx)
        {
          _ = _log.Db($"Error recording play-time: {ptEx.Message}", userId, "ROM", true);
        }

        _ = _log.Db($"EJS save OK: user={userId} rom={romName} size={bytes.Length} ms={swAll.ElapsedMilliseconds}", userId, "ROM", true);

        return Ok(new { ok = true, userId, romName, fileSize = bytes.Length, ms = swAll.ElapsedMilliseconds });
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

    [HttpPost("/Rom/GetEmulatorJSSaveState")]
    public async Task<IActionResult> GetEmulatorJSSaveState([FromBody] GetEmulatorJSSaveStateRequest req, CancellationToken ct = default)
    {
      try
      {
        if (string.IsNullOrWhiteSpace(req.RomName) || req.UserId <= 0)
          return BadRequest("Missing romName or invalid userId");

        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
        await conn.OpenAsync(ct);

        // UNIQUE(user_id, rom_name) guarantees at most one row; ORDER BY ... LIMIT 1 is unnecessary work.
        const string sql = @"SELECT state_data FROM emulatorjs_save_states WHERE user_id=@UserId AND rom_name=@RomName;";
        await using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 120 };
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = req.UserId;
        cmd.Parameters.Add("@RomName", MySqlDbType.VarChar).Value = req.RomName;

        await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SequentialAccess, ct);
        if (!await reader.ReadAsync(ct)) return NotFound();

        var bytes = await reader.GetFieldValueAsync<byte[]>(0, ct);
        return File(bytes, "application/octet-stream", "savestate.state");
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

public class GetRomFileRequest
{
  public int? UserId { get; set; }
  public int? FileId { get; set; }
}