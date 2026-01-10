using FirebaseAdmin.Messaging;
using MySqlConnector;
using System.Data;
using System.Diagnostics;
using System.Diagnostics.Tracing;
using System.Security.Cryptography;
using System.Text;
public class Log
{
	private readonly IConfiguration _config;

private readonly AsyncDbLogger _asyncLogger;

public Log(IConfiguration config)
{
    _config = config;
    _asyncLogger = new AsyncDbLogger(config);
}

public Task Db(string message, int? userId = null, string? type = "SYSTEM", bool outputToConsole = false)
{
    _asyncLogger.TryEnqueue(message, type ?? "SYSTEM", userId);
    if (outputToConsole)
        Console.WriteLine($"[{DateTime.Now:HH:mm}] {type}: {message}");
    return Task.CompletedTask; // fire-and-forget to keep callers fast
}

  
	
public async Task<List<Dictionary<string, object?>>> GetLogs(
    int? userId = null,
    string? component = null,
    int limit = 1000,
    string keywords = "",
    // Keyset pagination tokens (optional): when provided, fetch rows older than this cursor
    DateTime? lastTimestamp = null,
    int? lastId = null,
    CancellationToken ct = default)
{
    var logs = new List<Dictionary<string, object?>>(Math.Min(Math.Max(limit, 1), 5000));
    int take = Math.Max(1, Math.Min(limit, 5000));

    // Build WHERE + ORDER BY with deterministic order
    var sb = new StringBuilder();
    sb.AppendLine("SELECT id, comment, component, user_id, `timestamp`");
    sb.AppendLine("FROM maxhanna.logs WHERE 1=1");

    if (userId.HasValue)
        sb.AppendLine("  AND user_id = @UserId");
    if (!string.IsNullOrWhiteSpace(component))
        sb.AppendLine("  AND component = @Component");

    bool hasKeywords = !string.IsNullOrWhiteSpace(keywords);
    if (hasKeywords)
    {  
       sb.AppendLine("  AND MATCH(comment) AGAINST (@Keywords IN BOOLEAN MODE)"); 
    }

    // Keyset pagination
    // If you don't pass cursor, you get the newest page. If you pass it, you get older rows.
    if (lastTimestamp.HasValue && lastId.HasValue)
    {
        sb.AppendLine("  AND ( `timestamp` < @LastTs OR (`timestamp` = @LastTs AND id < @LastId) )");
    }

    // Deterministic order; matches suggested indexes
    sb.AppendLine("ORDER BY `timestamp` DESC, id DESC");
    sb.AppendLine("LIMIT @Limit;");

    try
    {
        await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
        await conn.OpenAsync(ct);

        await using var cmd = new MySqlCommand(sb.ToString(), conn)
        {
            CommandTimeout = 15
        };
        cmd.Parameters.Add("@Limit", MySqlDbType.Int32).Value = take;

        if (userId.HasValue)
            cmd.Parameters.Add("@UserId", MySqlDbType.Int32).Value = userId.Value;
        if (!string.IsNullOrWhiteSpace(component))
            cmd.Parameters.Add("@Component", MySqlDbType.VarChar, 45).Value = component;

        if (hasKeywords)
        {
            // For FULLTEXT boolean mode, you may want to transform raw keywords to "+term*" format.
            // For now, pass as-is and let the caller control the boolean syntax.
            cmd.Parameters.Add("@Keywords", MySqlDbType.Text).Value = keywords;
        }

        if (lastTimestamp.HasValue && lastId.HasValue)
        {
            cmd.Parameters.Add("@LastTs", MySqlDbType.Timestamp).Value = lastTimestamp.Value;
            cmd.Parameters.Add("@LastId", MySqlDbType.Int32).Value = lastId.Value;
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
            var logEntry = new Dictionary<string, object?>(4)
            {
                ["id"]        = reader.IsDBNull(ordId) ? null : reader.GetInt32(ordId),
                ["comment"]   = reader.IsDBNull(ordComment) ? null : reader.GetString(ordComment),
                ["component"] = reader.IsDBNull(ordComponent) ? null : reader.GetString(ordComponent),
                ["user_id"]   = reader.IsDBNull(ordUserId) ? null : reader.GetInt32(ordUserId),
                ["timestamp"] = reader.IsDBNull(ordTs) ? null : reader.GetDateTime(ordTs).ToString("o") // ISO 8601
            };

            logs.Add(logEntry);
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("GetLogs Exception: " + ex.Message);
    }

    return logs;
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

		if (!string.IsNullOrEmpty(keywords))
		{
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
			int decryptedUserId = DecryptUserId(encryptedUserId);
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
    var cutoff = DateTime.UtcNow.AddDays(-1);

    try
    {
        await using var conn = new MySqlConnection(_config.GetConnectionString("maxhanna"));
        await conn.OpenAsync(ct);

        int totalDeleted = 0;

        // Use a loop to delete in batches until nothing left
        while (true)
        {
            const string batchSql = @"
              DELETE FROM maxhanna.logs
              WHERE id IN (
                SELECT id
                FROM (
                  SELECT id
                  FROM maxhanna.logs
                  WHERE `timestamp` < @cutoff
                  ORDER BY `timestamp` ASC, id ASC
                  LIMIT @lim
                ) x
              );";

            await using var cmd = new MySqlCommand(batchSql, conn) { CommandTimeout = 30 };
            cmd.Parameters.Add("@cutoff", MySqlDbType.DateTime).Value = cutoff;
            cmd.Parameters.Add("@lim", MySqlDbType.Int32).Value = batchSize;

            var affected = await cmd.ExecuteNonQueryAsync(ct);
            totalDeleted += affected;

            if (affected == 0) break; // finished this slice

            // small pause to reduce lock contention (optional)
            await Task.Delay(50, ct);
        }

        _ = Db($"Deleted {totalDeleted} old log(s)", null, "SYSTEM", true);
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
		try
		{
			string backupFolder = @"H:\Bughosted MYSQL backup";
			Directory.CreateDirectory(backupFolder); // Ensure the folder exists

			// Check for the most recent backup
			var existingBackups = Directory.GetFiles(backupFolder, "backup_*.sql");
			var latestBackup = existingBackups
				.Select(file =>
				{
					string fileName = Path.GetFileNameWithoutExtension(file);
					string datePart = fileName.Replace("backup_", "");
					if (DateTime.TryParseExact(datePart, "yyyy-MM-dd_HH-mm-ss", null, System.Globalization.DateTimeStyles.None, out var parsedDate))
						return parsedDate;
					return DateTime.MinValue;
				})
				.OrderByDescending(d => d)
				.FirstOrDefault();

			// Skip if most recent backup is under 10 days old
			if ((DateTime.UtcNow - latestBackup).TotalDays < 10)
			{
				await Db($"Skipped database backup: last backup is less than 10 days old ({GetTimeSince(latestBackup, true)}).", null, "SYSTEM", true);
				return false;
			}

			// Perform backup
			string fileName = $"backup_{DateTime.UtcNow:yyyy-MM-dd_HH-mm-ss}.sql";
			string backupPath = Path.Combine(backupFolder, fileName);

			string? host = _config?.GetValue<string>("MySQL:Host");
			string? user = _config?.GetValue<string>("MySQL:User");
			string? password = _config?.GetValue<string>("MySQL:Password");
			string? database = _config?.GetValue<string>("MySQL:Database");

			string mysqldumpPath = @"E:\MySQL\MySQL Server 8.3\bin\mysqldump.exe";
			string arguments = $"-h {host} -u {user} -p{password} {database}";

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

			string output = await process.StandardOutput.ReadToEndAsync();
			string error = await process.StandardError.ReadToEndAsync();

			await process.WaitForExitAsync();

			if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
			{
				await Db("BackupDatabase ERROR: " + error, null, "SYSTEM", true);
				return false;
			}

			await File.WriteAllTextAsync(backupPath, output);
			await Db($"Database backed up successfully to {backupPath}", null, "SYSTEM", true);

			// After backup, clean up old backups
			foreach (var file in existingBackups)
			{
				string name = Path.GetFileNameWithoutExtension(file);
				string datePart = name.Replace("backup_", "");
				if (DateTime.TryParseExact(datePart, "yyyy-MM-dd_HH-mm-ss", null, System.Globalization.DateTimeStyles.None, out var fileDate))
				{
					if ((DateTime.UtcNow - fileDate).TotalDays > 10)
					{
						File.Delete(file);
						await Db($"Deleted old backup: {file}", null, "SYSTEM", true);
					}
				}
			}

			return true;
		}
		catch (Exception ex)
		{
			await Db("BackupDatabase Exception: " + ex.Message, null, "SYSTEM", true);
			return false;
		}
	}

	public static int DecryptUserId(string base64Input)
	{
		byte[] combinedData = Convert.FromBase64String(base64Input);
		byte[] key = Encoding.UTF8.GetBytes("BHSN123!@#33@!".PadRight(32, '_'));
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