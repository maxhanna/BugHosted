using FirebaseAdmin.Messaging;
using MySqlConnector;
using System.Security.Cryptography;
using System.Text;
public class Log
{
	private readonly IConfiguration _config;

	public Log(IConfiguration config)
	{
		_config = config;
	}

	public async Task Db(string message, int? userId, string type = "SYSTEM", bool outputToConsole = false)
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
			Console.WriteLine($"[{DateTime.UtcNow}] {type}: {message}");
		}
	}
	public async Task<bool> ValidateUserLoggedIn(int userId)
	{
		try
		{
			const string sql = @"
				SELECT 1 
				FROM maxhanna.users 
				WHERE id = @UserId 
					AND LAST_SEEN > UTC_TIMESTAMP() - INTERVAL 1 MINUTE;";

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			cmd.Parameters.AddWithValue("@UserId", userId);

			using var reader = await cmd.ExecuteReaderAsync();
			bool access = await reader.ReadAsync();
			if (!access)
			{
				_ = Db("ValidateUserLoggedIn ACCESS DENIED", userId, "SYSTEM", true);
			}
			return access;
		}
		catch (Exception ex)
		{
			_ = Db("ValidateUserLoggedIn Exception: " + ex.Message, null, "SYSTEM", true);
			return false;
		}
	}
	public async Task<bool> DeleteOldLogs()
	{
		try
		{
			const string sql = @"
			DELETE FROM maxhanna.logs 
			WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 10 DAY;";

			using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await conn.OpenAsync();

			using var cmd = new MySqlCommand(sql, conn);
			int rowsAffected = await cmd.ExecuteNonQueryAsync();

			//_ = Db($"Deleted {rowsAffected} old log(s)", null, "SYSTEM", true);
			return true;
		}
		catch (Exception ex)
		{
			_ = Db("DeleteOldLogs Exception: " + ex.Message, null, "SYSTEM", true);
			return false;
		}
	} 
}