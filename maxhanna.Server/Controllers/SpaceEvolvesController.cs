using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.Json;

namespace maxhanna.Server.Controllers;

[ApiController]
[Route("spaceevolves")]
public sealed class SpaceEvolvesController : ControllerBase
{
    private readonly string _connectionString;
    public SpaceEvolvesController(IConfiguration configuration)
        => _connectionString = configuration.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

    [HttpGet("run/{userId:int}")]
    public async Task<IActionResult> GetRun(int userId)
    {
        if (userId <= 0) return BadRequest();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        const string sql = "SELECT run_id, payload_json FROM space_evolves_runs WHERE user_id=@userId AND active=1 LIMIT 1";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@userId", userId);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return NoContent();
        try
        {
            var payload = JsonSerializer.Deserialize<Dictionary<string, object?>>(reader.GetString("payload_json")) ?? new();
            payload["runId"] = reader.GetString("run_id");
            return Ok(payload);
        }
        catch { return NoContent(); }
    }

    [HttpPut("run")]
    public async Task<IActionResult> SaveRun([FromBody] JsonElement request)
    {
        if (!request.TryGetProperty("userId", out var userIdElement) || userIdElement.GetInt32() <= 0) return BadRequest();
        var userId = userIdElement.GetInt32();
        var runId = request.TryGetProperty("runId", out var runIdElement) && runIdElement.ValueKind == JsonValueKind.String
            ? runIdElement.GetString() : Guid.NewGuid().ToString("N");
        var payload = request.GetRawText();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        const string sql = @"INSERT INTO space_evolves_runs (user_id, run_id, payload_json, active, updated_at)
                             VALUES (@userId,@runId,@payload,1,UTC_TIMESTAMP())
                             ON DUPLICATE KEY UPDATE payload_json=@payload, active=1, updated_at=UTC_TIMESTAMP()";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@userId", userId);
        command.Parameters.AddWithValue("@runId", runId);
        command.Parameters.AddWithValue("@payload", payload);
        await command.ExecuteNonQueryAsync();
        return Ok(new { runId });
    }

    [HttpPost("run/end")]
    public async Task<IActionResult> EndRun([FromBody] JsonElement request)
    {
        if (!request.TryGetProperty("userId", out var userIdElement) || userIdElement.GetInt32() <= 0) return BadRequest();
        var userId = userIdElement.GetInt32();
        var score = request.TryGetProperty("score", out var scoreElement) ? scoreElement.GetInt32() : 0;
        var wave = request.TryGetProperty("wave", out var waveElement) ? waveElement.GetInt32() : 1;
        var payload = request.GetRawText();
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        const string endSql = "UPDATE space_evolves_runs SET active=0, payload_json=@payload, updated_at=UTC_TIMESTAMP() WHERE user_id=@userId AND active=1";
        await using (var end = new MySqlCommand(endSql, connection, transaction))
        {
            end.Parameters.AddWithValue("@userId", userId); end.Parameters.AddWithValue("@payload", payload); await end.ExecuteNonQueryAsync();
        }
        const string scoreSql = "INSERT INTO space_evolves_scores (user_id, score, wave, payload_json, created_at) VALUES (@userId,@score,@wave,@payload,UTC_TIMESTAMP())";
        await using (var scoreCommand = new MySqlCommand(scoreSql, connection, transaction))
        {
            scoreCommand.Parameters.AddWithValue("@userId", userId); scoreCommand.Parameters.AddWithValue("@score", score); scoreCommand.Parameters.AddWithValue("@wave", wave); scoreCommand.Parameters.AddWithValue("@payload", payload); await scoreCommand.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
        return Ok();
    }

    [HttpGet("highscores")]
    public async Task<IActionResult> HighScores([FromQuery] int limit = 10)
    {
        limit = Math.Clamp(limit, 1, 100);
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();
        const string sql = @"SELECT s.score, s.wave, u.username FROM space_evolves_scores s
                             LEFT JOIN maxhanna.users u ON u.id=s.user_id
                             ORDER BY s.score DESC, s.wave DESC, s.created_at ASC LIMIT @limit";
        await using var command = new MySqlCommand(sql, connection);
        command.Parameters.AddWithValue("@limit", limit);
        await using var reader = await command.ExecuteReaderAsync();
        var results = new List<object>();
        while (await reader.ReadAsync()) results.Add(new { username = reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString(reader.GetOrdinal("username")), score = Convert.ToInt32(reader["score"]), wave = Convert.ToInt32(reader["wave"]) });
        return Ok(results);
    }
}
