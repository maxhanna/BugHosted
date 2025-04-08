using MySqlConnector; 

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


}