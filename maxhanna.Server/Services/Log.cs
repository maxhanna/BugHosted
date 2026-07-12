using FirebaseAdmin.Messaging;
using maxhanna.Infrastructure;
using MySqlConnector;
using System.Data;
using System.Diagnostics;
using System.Diagnostics.Tracing;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
public class Log
{
  private readonly IConfiguration _config;
  private readonly DbOperationQueue _dbQueue;

  private readonly AsyncDbLogger _asyncLogger;

  public Log(IConfiguration config, DbOperationQueue queue)
  {
    _config = config;
    _dbQueue = queue;
    _asyncLogger = new AsyncDbLogger(config);
  }

  public async Task Db(string message, int? userId = null, string? type = "SYSTEM", bool outputToConsole = false)
  {
    if (outputToConsole)
    {
      Console.WriteLine($"[{DateTime.Now:HH:mm}] {type}: {message}");
    }

    await _dbQueue.EnqueueAsync(async () =>
    {
      _asyncLogger.TryEnqueue(message, type ?? "SYSTEM", userId); 
    }); 
      
    return; // fire-and-forget to keep callers fast
  }



  public async Task<List<LogDto>> GetLogs(int? userId = null, string? component = null, int limit = 1000, string keywords = "", int page = 1, CancellationToken ct = default)
  {
    var list = new List<LogDto>(limit);
    int offset = (page - 1) * limit;

    // Build WHERE + ORDER BY with deterministic order
    var sb = new StringBuilder();
    sb.AppendLine("SELECT id, comment, component, user_id, `timestamp`");
    sb.AppendLine("FROM maxhanna.logs WHERE 1=1");

    if (userId.HasValue)
      sb.AppendLine("  AND user_id = @UserId");
    if (!string.IsNullOrWhiteSpace(component))
      sb.AppendLine("  AND component = @Component");
 
    bool hasKeywords = !string.IsNullOrEmpty(keywords);
    if (hasKeywords)
    {
      sb.AppendLine("  AND comment LIKE CONCAT('%', @Keywords, '%')");
    }
    sb.AppendLine("ORDER BY id DESC");
    sb.AppendLine("LIMIT @Limit OFFSET @Offset");
    try
    {
      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      await conn.OpenAsync(ct);

      await using var cmd = new MySqlCommand(sb.ToString(), conn)
      {
        CommandTimeout = 30
      };

      cmd.Parameters.Add("@Limit", MySqlDbType.Int32).Value = limit;
      cmd.Parameters.Add("@Offset", MySqlDbType.Int32).Value = offset;

      if (userId.HasValue)
      {
        cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId.Value;
      }
      if (!string.IsNullOrWhiteSpace(component))
      {
        cmd.Parameters.Add("@Component", MySqlDbType.VarChar, 45).Value = component;
      }
      if (hasKeywords)
      {
        cmd.Parameters.Add("@Keywords", MySqlDbType.Text).Value = keywords;
      }
      await using var reader = await cmd.ExecuteReaderAsync(CommandBehavior.SingleResult | CommandBehavior.SequentialAccess, ct);

      // Resolve ordinals once
      int ordId = reader.GetOrdinal("id");
      int ordComment = reader.GetOrdinal("comment");
      int ordComponent = reader.GetOrdinal("component");
      int ordUserId = reader.GetOrdinal("user_id");
      int ordTs = reader.GetOrdinal("timestamp");

      while (await reader.ReadAsync(ct))
      {
        list.Add(new LogDto(
          Id: reader.GetInt32(ordId),
          Comment: reader.IsDBNull(ordComment) ? null : reader.GetString(ordComment),
          Component: reader.GetString(ordComponent),
          UserId: reader.IsDBNull(ordUserId) ? null : reader.GetInt32(ordUserId),
          TimestampUtc: reader.GetDateTime(ordTs)));
      }
    }
    catch (Exception ex)
    {
      Console.WriteLine("GetLogs Exception: " + ex.Message);
    }

    return list;
  } 
  
  public async Task<int> GetLogsCount(int? userId = null, string? component = null, string keywords = "")
  {
    var sql = new StringBuilder("SELECT COUNT(*) FROM maxhanna.logs WHERE 1=1");

    if (userId != null)
    {
      sql.Append(" AND user_id = @UserId ");
    }

    if (!string.IsNullOrEmpty(component))
    {
      sql.Append(" AND component = @Component ");
    }
  
    if (!string.IsNullOrEmpty(keywords)) {
      sql.Append(" AND comment LIKE CONCAT('%', @Keywords, '%') ");
    }

    try
    {
      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var cmd = new MySqlCommand(sql.ToString(), conn);
      if (userId != null)
      {
        cmd.Parameters.AddWithValue("@UserId", userId);
      }
      if (!string.IsNullOrEmpty(component))
      {
        cmd.Parameters.AddWithValue("@Component", component);
      }
      if (!string.IsNullOrEmpty(keywords))
      {
        cmd.Parameters.AddWithValue("@Keywords", keywords);
      }

      var result = await cmd.ExecuteScalarAsync();
      return Convert.ToInt32(result);
    }
    catch (Exception ex)
    {
      Console.WriteLine("GetLogsCount Exception: " + ex.Message);
      return 0;
    }
  }

  public async Task<bool> ValidateUserLoggedIn(int userId, string encryptedUserId)
  {
    string? callingMethodName = new System.Diagnostics.StackTrace().GetFrame(1)?.GetMethod()?.Name;

    try
    {
      const string sql = "SELECT 1 FROM maxhanna.users WHERE id = @UserId AND LAST_SEEN > UTC_TIMESTAMP() - INTERVAL 60 MINUTE;";

      using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
      await conn.OpenAsync();

      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@UserId", userId);

      using var reader = await cmd.ExecuteReaderAsync();
      bool access = await reader.ReadAsync();
      if (!access)
      {
        _ = Db($"ValidateUserLoggedIn ACCESS DENIED userId:{userId}. User seen > 60 minutes.{(!string.IsNullOrEmpty(callingMethodName) ? " Calling method: " + callingMethodName : "")}", userId, "SYSTEM", true);
        return false;
      }
      string ki = _config.GetValue<string>("Encryption:Key") ?? ""; 
      int decryptedUserId = DecryptUserId(encryptedUserId, ki);
      if (decryptedUserId != userId)
      {
        _ = Db($"ValidateUserLoggedIn ACCESS DENIED userId:{userId}. Decryption key mismatch.{(!string.IsNullOrEmpty(callingMethodName) ? " Calling method: " + callingMethodName : "")}", userId, "SYSTEM", true);
        return false;
      }
      return true;
    }
    catch (Exception ex)
    {
      _ = Db("ValidateUserLoggedIn Exception: " + ex.Message + $".{(!string.IsNullOrEmpty(callingMethodName) ? " Calling method: " + callingMethodName : "")}", null, "SYSTEM", true);
      return false;
    }
  }
  public async Task<bool> DeleteOldLogs(CancellationToken ct = default)
  {
    const int batchSize = 1000; // tune: 1k–20k depending on row size & I/O 

    try
    {
      await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
      await conn.OpenAsync(ct);

      int totalDeleted = 0;

      // Use a loop to delete in batches until nothing left
      while (true)
      {
        const string batchSql = @"DELETE FROM maxhanna.logs LIMIT @lim";

        await using var cmd = new MySqlCommand(batchSql, conn) { CommandTimeout = 30 }; 
        cmd.Parameters.Add("@lim", MySqlDbType.Int32).Value = batchSize;

        var affected = await cmd.ExecuteNonQueryAsync(ct);
        totalDeleted += affected;
        Console.WriteLine($"Deleted {affected} old log(s) in this batch. Total deleted so far: {totalDeleted}.");
        if (affected == 0)
        {
          Console.WriteLine("No more logs to delete. Exiting deletion loop.");
          break; // finished this slice
        }
        // small pause to reduce lock contention (optional)
        await Task.Delay(50, ct);
      }

      //_ = Db($"Deleted {totalDeleted} old log(s)", null, "SYSTEM", true);
      Console.WriteLine($"Deleted {totalDeleted} old log(s)");
      return true;
    }
    catch (Exception ex)
    {
      _ = Db("DeleteOldLogs Exception: " + ex.Message, null, "SYSTEM", true);
      return false;
    }
  }

  public async Task<bool> BackupDatabase()
  {
    await Db($"Saving DB Backup.", null, "BACKUP", true);

    try
    {
      string backupFolder = @"H:\Bughosted MYSQL backup";
      var dir = Directory.CreateDirectory(backupFolder);

      await Db($"Found directory: {dir.FullName}", null, "BACKUP", true);
      // Check most recent completed backup
      var existingBackups = Directory.GetFiles(backupFolder, "backup_*.sql.gz")
        .Select(file =>
        {
          string nameNoExt = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(file));
          string datePart = nameNoExt.Replace("backup_", "");
          if (DateTime.TryParseExact(datePart, "yyyy-MM-dd_HH-mm-ss", null, System.Globalization.DateTimeStyles.None, out var parsedDate))
            return parsedDate;
          return DateTime.MinValue;
        })
        .Where(d => d != DateTime.MinValue)
        .OrderByDescending(d => d)
        .ToList();

      var latestDate = existingBackups.FirstOrDefault();
      await Db($"Latest Backup: {latestDate}", null, "BACKUP", true);

      if (latestDate != DateTime.MinValue && (DateTime.UtcNow - latestDate).TotalDays < 10)
      {
        await Db($"Skipped database backup: last backup is less than 10 days old ({GetTimeSince(latestDate, true)}).", null, "BACKUP", true);
        return false;
      }

      string? host = _config?.GetValue<string>("MySQL:Host");
      string? user = _config?.GetValue<string>("MySQL:User");
      string? password = _config?.GetValue<string>("MySQL:Password");
      string? database = _config?.GetValue<string>("MySQL:Database");

      string mysqldumpPath = @"E:\MySQL\MySQL Server 8.3\bin\mysqldump.exe";

      // ── Phase 1: build manifest of ALL tables upfront, then dump one by one ─────

      string inprogressDir = Path.Combine(backupFolder, "backup_inprogress");
      string manifestPath = Path.Combine(inprogressDir, "manifest.txt");
      Directory.CreateDirectory(inprogressDir);

      // Get current table list from DB
      var tables = new List<string>();
      using (var conn = new MySqlConnection(_config?.GetValue<string>("ConnectionStrings:maxhanna")))
      {
        await conn.OpenAsync();
        using var cmd = new MySqlCommand("SHOW FULL TABLES WHERE Table_Type = 'BASE TABLE'", conn);
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
          tables.Add(r.GetString(0));
      }

      // Build manifest: ALL tables are listed from the start; completed ones have " -- done"
      var manifestLines = new List<string>();
      if (File.Exists(manifestPath))
        manifestLines = (await File.ReadAllLinesAsync(manifestPath)).ToList();

      // Add any tables not yet in manifest (new tables added after a partial backup)
      bool manifestChanged = false;
      foreach (var t in tables)
      {
        if (!manifestLines.Any(line => line.TrimEnd().Equals(t, StringComparison.OrdinalIgnoreCase) ||
                                       line.TrimEnd().StartsWith(t + " -- done", StringComparison.OrdinalIgnoreCase)))
        {
          manifestLines.Add(t);
          manifestChanged = true;
        }
      }

      // Ensure 00_schema is first
      if (!manifestLines.Any(line => line.TrimEnd() == "00_schema" || line.TrimEnd().StartsWith("00_schema -- done")))
      {
        manifestLines.Insert(0, "00_schema");
        manifestChanged = true;
      }

      if (manifestChanged)
        await File.WriteAllLinesAsync(manifestPath, manifestLines);

      // Read the set of completed tables from manifest
      HashSet<string> completed = manifestLines
        .Where(line => line.TrimEnd().EndsWith(" -- done"))
        .Select(line => line.TrimEnd()[..^7].Trim())
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

      var schemaArgs = $"-h {host} -u {user} -p{password} --no-data --single-transaction --quick --skip-lock-tables --routines --events {database}";
      var tableArgsBase = $"-h {host} -u {user} -p{password} --single-transaction --quick --skip-lock-tables --no-autocommit --extended-insert --hex-blob {database}";

      // Always re-dump schema so new tables are captured even when resuming
      string schemaFile = Path.Combine(inprogressDir, "00_schema.sql.gz");
      try { if (File.Exists(schemaFile)) File.Delete(schemaFile); } catch { }
      await Db($"Dumping database schema ({tables.Count} tables)...", null, "BACKUP", true);
      if (await DumpTable(mysqldumpPath, schemaArgs, schemaFile))
      {
        MarkManifestDone(manifestLines, "00_schema");
        completed.Add("00_schema");
        await File.WriteAllLinesAsync(manifestPath, manifestLines);
        await Db($"Schema dumped.", null, "BACKUP", true);
      }

      int total = tables.Count;
      int done = completed.Count(t => tables.Contains(t));
      long totalBytes = 0;

      foreach (var t in completed)
      {
        if (t == "00_schema") continue;
        string fp = Path.Combine(inprogressDir, $"{t}.sql.gz");
        if (File.Exists(fp)) totalBytes += new FileInfo(fp).Length;
      }

      var swTotal = System.Diagnostics.Stopwatch.StartNew();

      // Walk tables in declared order; skip any already marked "-- done"
      foreach (var table in tables)
      {
        if (completed.Contains(table))
          continue;

        string outFile = Path.Combine(inprogressDir, $"{table}.sql.gz");
        string args = $"{tableArgsBase} {table}";

        var swTable = System.Diagnostics.Stopwatch.StartNew();
        bool ok = await DumpTable(mysqldumpPath, args, outFile);
        swTable.Stop();

        if (ok)
        {
          MarkManifestDone(manifestLines, table);
          completed.Add(table);
          await File.WriteAllLinesAsync(manifestPath, manifestLines);
          done++;
          var fi = new FileInfo(outFile);
          long mb = fi.Length / (1024 * 1024);
          totalBytes += fi.Length;
          await Db($"[{done}/{total}] {table} — {mb} MB compressed in {swTable.Elapsed.TotalSeconds:F1}s", null, "BACKUP", true);
        }
        else
        {
          done++;
          await Db($"[{done}/{total}] {table} — FAILED (will retry next run)", null, "BACKUP", true);
        }
      }

      swTotal.Stop();

      if (!tables.All(t => completed.Contains(t)))
      {
        await Db($"Backup incomplete: {done}/{total} tables done. Will resume next run.", null, "BACKUP", true);
        return false;
      }

      long totalMb = totalBytes / (1024 * 1024);
      await Db($"All {total} tables dumped ({totalMb} MB compressed, {swTotal.Elapsed.TotalMinutes:F1} min). Combining...", null, "BACKUP", true);

      // ── Phase 2: create single-file combined backup ─────────────────────────
      string timestamp = DateTime.UtcNow.ToString("yyyy-MM-dd_HH-mm-ss");
      string combinedPath = Path.Combine(backupFolder, $"backup_{timestamp}.sql.gz");
      using (var combinedStream = new FileStream(combinedPath, FileMode.Create, FileAccess.Write))
      {
        foreach (var table in tables.Prepend("00_schema"))
        {
          string partPath = Path.Combine(inprogressDir, $"{table}.sql.gz");
          if (File.Exists(partPath))
          {
            using var partStream = new FileStream(partPath, FileMode.Open, FileAccess.Read);
            await partStream.CopyToAsync(combinedStream);
          }
        }
      }

      // Remove inprogress directory
      Directory.Delete(inprogressDir, recursive: true);

      await Db($"Database backup complete: {combinedPath} ({totalMb} MB)", null, "BACKUP", true);

      // Clean up backups older than 10 days
      foreach (var file in Directory.GetFiles(backupFolder, "backup_*.sql.gz"))
      {
        string nameNoExt = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(file));
        string datePart = nameNoExt.Replace("backup_", "");
        if (DateTime.TryParseExact(datePart, "yyyy-MM-dd_HH-mm-ss", null, System.Globalization.DateTimeStyles.None, out var fileDate))
        {
          if ((DateTime.UtcNow - fileDate).TotalDays > 10)
          {
            File.Delete(file);
            await Db($"Deleted old backup: {file}", null, "BACKUP", true);
          }
        }
      }

      // Clean up old-format .sql files
      foreach (var file in Directory.GetFiles(backupFolder, "backup_*.sql"))
      {
        File.Delete(file);
      }

      return true;
    }
    catch (Exception ex)
    {
      await Db("BackupDatabase Exception: " + ex.Message, null, "BACKUP", true);
      return false;
    }
  }

  /// <summary>Mark a table as "-- done" in the in-memory manifest list.</summary>
  private static void MarkManifestDone(List<string> manifestLines, string table)
  {
    for (int i = 0; i < manifestLines.Count; i++)
    {
      var trimmed = manifestLines[i].TrimEnd();
      if (trimmed == table || trimmed.StartsWith(table + " -- done", StringComparison.OrdinalIgnoreCase))
      {
        manifestLines[i] = $"{table} -- done";
        return;
      }
    }
    // If not found (shouldn't happen), append
    manifestLines.Add($"{table} -- done");
  }

  /// <summary>Dump a single table via mysqldump with timeout. Returns false if it times out or fails.</summary>
  private async Task<bool> DumpTable(string mysqldumpPath, string arguments, string outputPath)
  {
    // Per-table timeout: 30 minutes. mysqldump should never take this long for a single table.
    using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(30));

    using var process = new Process
    {
      StartInfo = new ProcessStartInfo
      {
        FileName = mysqldumpPath,
        Arguments = arguments,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true
      }
    };

    process.Start();

    var stderrTask = process.StandardError.ReadToEndAsync();
    string? tmpPath = outputPath + ".tmp";

    try
    {
      using var fileStream = new FileStream(tmpPath, FileMode.Create, FileAccess.Write);
      using var gzipStream = new System.IO.Compression.GZipStream(fileStream, System.IO.Compression.CompressionLevel.Fastest);

      // Register the process kill on cancellation
      await using (cts.Token.Register(() => { try { process.Kill(entireProcessTree: true); } catch { } }))
      {
        await process.StandardOutput.BaseStream.CopyToAsync(gzipStream, cts.Token);
      }

      await process.WaitForExitAsync(cts.Token);
    }
    catch (OperationCanceledException)
    {
      await Db($"BackupDatabase TIMEOUT: mysqldump killed for {arguments}", null, "BACKUP", true);
      try { File.Delete(tmpPath); } catch { }
      return false;
    }
    catch
    {
      try { process.Kill(entireProcessTree: true); } catch { }
      await process.WaitForExitAsync();
      try { File.Delete(tmpPath); } catch { }
      throw;
    }

    string stderr = await stderrTask;

    if (process.ExitCode != 0)
    {
      await Db($"BackupDatabase ERROR (exit {process.ExitCode}): {stderr}", null, "BACKUP", true);
      try { File.Delete(tmpPath); } catch { }
      return false;
    }

    if (File.Exists(outputPath)) File.Delete(outputPath);
    File.Move(tmpPath, outputPath);
    return true;
  }

  public static int DecryptUserId(string base64Input, string ki)
  {
    byte[] combinedData = Convert.FromBase64String(base64Input); 
    byte[] key = Encoding.UTF8.GetBytes(ki.PadRight(32, '_'));
    byte[] iv = combinedData.Take(12).ToArray(); // AES-GCM IV is 12 bytes
    byte[] ciphertext = combinedData.Skip(12).ToArray();

    byte[] plaintextBytes = new byte[ciphertext.Length - 16]; // Last 16 bytes are the tag
    byte[] tag = ciphertext.Skip(ciphertext.Length - 16).ToArray();
    byte[] encryptedData = ciphertext.Take(ciphertext.Length - 16).ToArray();
    using var aes = new AesGcm(key, 16);
    aes.Decrypt(iv, encryptedData, tag, plaintextBytes);

    return int.Parse(Encoding.UTF8.GetString(plaintextBytes));
  }

  public string GetTimeSince(object? input, bool isUtc = true, bool inputIsSeconds = false)
  {
    if (input == null) return "just now";

    TimeSpan elapsed;

    switch (input)
    {
      case int timeUnits:
        elapsed = inputIsSeconds
          ? TimeSpan.FromSeconds(timeUnits)
          : TimeSpan.FromMinutes(timeUnits);
        break;

      case DateTime timestamp:
        elapsed = isUtc
          ? DateTime.UtcNow - timestamp
          : DateTime.Now - timestamp;
        break;

      case TimeSpan timeSpan:
        elapsed = timeSpan;
        break;

      default:
        return "invalid input";
    }

    return FormatElapsedTime(elapsed);
  }


  private string FormatElapsedTime(TimeSpan elapsed)
  {
    if (elapsed.TotalSeconds < 1) return "just now";
    if (elapsed.TotalSeconds < 60) return $"{elapsed.Seconds}s ago";
    if (elapsed.TotalMinutes < 60) return $"{elapsed.Minutes}m ago";
    if (elapsed.TotalHours < 24) return $"{elapsed.Hours}h ago";
    if (elapsed.TotalDays < 30) return $"{elapsed.Days}d ago";

    int months = (int)(elapsed.TotalDays / 30);
    if (months < 12) return $"{months}mo ago";

    int years = months / 12;
    return $"{years}y ago";
  }
  public string EncryptContent(string message, string password = "defaultPassword")
  {
    try
    {
      byte[] msgBytes = System.Text.Encoding.UTF8.GetBytes(message);
      byte[] pwdBytes = System.Text.Encoding.UTF8.GetBytes(password);

      byte[] result = new byte[msgBytes.Length];

      for (int i = 0; i < msgBytes.Length; i++)
      {
        // Cycle password bytes
        byte pwdByte = pwdBytes[i % pwdBytes.Length];

        // Multi-layer transformation
        int transformed = msgBytes[i] ^ pwdByte; // XOR with password
        transformed = (transformed + 7) % 256;   // Add constant
        transformed = ((transformed << 4) | (transformed >> 4)) & 0xFF; // Rotate bits

        result[i] = (byte)transformed;
      }

      // Convert to hex string for easy storage
      return BitConverter.ToString(result).Replace("-", "").ToLower();
    }
    catch (Exception ex)
    {
      Console.WriteLine("Encryption error: " + ex.Message);
      return message;
    }
  }

  public string DecryptContent(string hexMessage, string password = "defaultPassword")
  {
    if (string.IsNullOrEmpty(hexMessage)) return hexMessage;
    if (hexMessage.Length % 2 != 0 || !System.Text.RegularExpressions.Regex.IsMatch(hexMessage, @"\A[0-9a-fA-F]+\z"))
    {
      return hexMessage;
    }

    try
    {
      // Convert hex string to byte array
      byte[] msgBytes = new byte[hexMessage.Length / 2];
      for (int i = 0; i < hexMessage.Length; i += 2)
      {
        msgBytes[i / 2] = Convert.ToByte(hexMessage.Substring(i, 2), 16);
      }

      byte[] pwdBytes = System.Text.Encoding.UTF8.GetBytes(password);
      byte[] result = new byte[msgBytes.Length];

      for (int i = 0; i < msgBytes.Length; i++)
      {
        // Cycle password bytes
        byte pwdByte = pwdBytes[i % pwdBytes.Length];

        // Reverse transformations in opposite order
        int transformed = msgBytes[i];
        // Reverse bit rotation: (transformed << 4) | (transformed >> 4)
        transformed = ((transformed >> 4) | (transformed << 4)) & 0xFF;
        // Reverse addition: subtract 7 (modulo 256)
        transformed = (transformed - 7 + 256) % 256;
        // Reverse XOR with password
        transformed = transformed ^ pwdByte;

        result[i] = (byte)transformed;
      }

      // Convert result bytes to string
      return System.Text.Encoding.UTF8.GetString(result);
    }
    catch (Exception ex)
    {
      Console.WriteLine("Decryption error: " + ex.Message);
      Console.WriteLine("hexMessage: " + hexMessage);
      Console.WriteLine("password: " + password);
      return hexMessage;
    }
  }
}

public sealed record LogDto(
    int Id,
    string? Comment,
    string Component,
    int? UserId,
    DateTime TimestampUtc);
