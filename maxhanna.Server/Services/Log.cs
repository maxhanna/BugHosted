using FirebaseAdmin.Messaging;
using MySqlConnector;
using System.Diagnostics;
using System.Diagnostics.Tracing;
using System.Security.Cryptography;
using System.Text;
public class Log
{
	private readonly IConfiguration _config;

	public Log(IConfiguration config)
	{
		_config = config;
	}

	public async Task Db(string message, int? userId = null, string? type = "SYSTEM", bool outputToConsole = false)
	{
		string sql = @"INSERT INTO maxhanna.logs (comment, component, user_id, timestamp) VALUES (@comment, @component, @userId, UTC_TIMESTAMP());";

		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();
			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@comment", message);
			cmd.Parameters.AddWithValue("@component", type);
			cmd.Parameters.AddWithValue("@userId", userId != null ? userId : DBNull.Value);
			await cmd.ExecuteReaderAsync();
		}
		catch (Exception ex)
		{
			Console.WriteLine("Log.Db Exception: " + ex.Message);
		}

		if (outputToConsole)
		{
			Console.WriteLine($"[{DateTime.Now.ToShortTimeString()}] {type}: {message}");
		}
	}
	public async Task<List<Dictionary<string, object?>>> GetLogs(int? userId = null, string? component = null, int limit = 1000, string keywords = "", int page = 1)
	{
		var logs = new List<Dictionary<string, object?>>();
		int offset = (page - 1) * limit;

		var sql = new StringBuilder("SELECT comment, component, user_id, timestamp FROM maxhanna.logs WHERE 1=1");

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

		sql.Append(" ORDER BY timestamp DESC LIMIT @Limit OFFSET @Offset;");

		try
		{
			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql.ToString(), conn);
			cmd.Parameters.AddWithValue("@Limit", limit);
			cmd.Parameters.AddWithValue("@Offset", offset);
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

			using var reader = await cmd.ExecuteReaderAsync();

			while (await reader.ReadAsync())
			{
				var logEntry = new Dictionary<string, object?>
				{
					["comment"] = reader["comment"],
					["component"] = reader["component"],
					["user_id"] = reader["user_id"] == DBNull.Value ? null : reader["user_id"],
					["timestamp"] = Convert.ToDateTime(reader["timestamp"]).ToString("o") // ISO 8601
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
	public async Task<bool> DeleteOldLogs()
	{
		try
		{
			const string sql = @"
			DELETE FROM maxhanna.logs 
			WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 1 DAY;";

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			int rowsAffected = await cmd.ExecuteNonQueryAsync();

			_ = Db($"Deleted {rowsAffected} old log(s)", null, "SYSTEM", true);
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

}