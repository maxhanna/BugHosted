using maxhanna.Server.Controllers;
using Microsoft.AspNetCore.SignalR;
using MySqlConnector;
using maxhanna.Server.Hubs;

namespace maxhanna.Server.Services
{
  public sealed class D2SurvivorsLobbyService
  {
    private readonly string _connectionString;
    private readonly IHubContext<D2SurvivorsLobbyHub> _hub;

    public D2SurvivorsLobbyService(IConfiguration config, IHubContext<D2SurvivorsLobbyHub> hub)
    {
      _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      _hub = hub;
    }

    public async Task RecordCharacterAsync(D2SurvivorsController.D2SRecordCharacterRequest request)
    {
      await using var conn = new MySqlConnection(_connectionString);
      await conn.OpenAsync();
      const string sql = @"INSERT INTO maxhanna.d2survivors_character_history
          (run_id, user_id, character_name, class_id, score, time_seconds, kills, level, victory, died, created_at)
          VALUES (@RunId, @UserId, @CharacterName, @ClassId, @Score, @Time, @Kills, @Level, @Victory, @Died, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE run_id = run_id;";
      await using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@RunId", request.RunId);
      cmd.Parameters.AddWithValue("@UserId", request.UserId);
      cmd.Parameters.AddWithValue("@CharacterName", request.CharacterName);
      cmd.Parameters.AddWithValue("@ClassId", request.ClassId);
      cmd.Parameters.AddWithValue("@Score", request.Score);
      cmd.Parameters.AddWithValue("@Time", request.TimeSeconds);
      cmd.Parameters.AddWithValue("@Kills", request.Kills);
      cmd.Parameters.AddWithValue("@Level", request.Level);
      cmd.Parameters.AddWithValue("@Victory", request.Victory ? 1 : 0);
      cmd.Parameters.AddWithValue("@Died", request.Victory ? 0 : 1);
      await cmd.ExecuteNonQueryAsync();
      await _hub.Clients.Group(D2SurvivorsLobbyHub.GroupName).SendAsync("OnLeaderboardUpdated");
    }

    public async Task<List<D2SurvivorsController.D2SLeaderboardEntry>> GetLeaderboardAsync(int limit)
    {
      await using var conn = new MySqlConnection(_connectionString);
      await conn.OpenAsync();
      const string sql = @"SELECT h.id, h.user_id, h.character_name, h.class_id,
              COALESCE(u.username, 'Anonymous') AS username,
              h.score, h.time_seconds, h.kills, h.level, h.victory, h.died, h.created_at
          FROM maxhanna.d2survivors_character_history h
          LEFT JOIN maxhanna.users u ON u.id = h.user_id
          ORDER BY h.score DESC, h.created_at ASC, h.id ASC
          LIMIT @Limit;";
      await using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@Limit", limit);
      await using var rdr = await cmd.ExecuteReaderAsync();
      var entries = new List<D2SurvivorsController.D2SLeaderboardEntry>();
      while (await rdr.ReadAsync())
      {
        entries.Add(new D2SurvivorsController.D2SLeaderboardEntry
        {
          Id = rdr.GetInt64("id"), UserId = rdr.GetInt32("user_id"),
          CharacterName = rdr.GetString("character_name"), ClassId = rdr.GetString("class_id"),
          Username = rdr.GetString("username"), Score = rdr.GetInt32("score"),
          TimeSeconds = rdr.GetInt32("time_seconds"), Kills = rdr.GetInt32("kills"),
          Level = rdr.GetInt32("level"), Victory = rdr.GetBoolean("victory"),
          Died = rdr.GetBoolean("died"), CreatedAt = rdr.GetDateTime("created_at")
        });
      }
      return entries;
    }

    public async Task<List<D2SurvivorsController.D2SLobbyMessage>> GetChatHistoryAsync(int limit)
    {
      await using var conn = new MySqlConnection(_connectionString);
      await conn.OpenAsync();
      const string sql = @"SELECT m.id, m.user_id, COALESCE(u.username, 'Anonymous') AS username, m.message, m.created_at
          FROM maxhanna.d2survivors_lobby_chat m
          LEFT JOIN maxhanna.users u ON u.id = m.user_id
          ORDER BY m.id DESC LIMIT @Limit;";
      await using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@Limit", limit);
      await using var rdr = await cmd.ExecuteReaderAsync();
      var messages = new List<D2SurvivorsController.D2SLobbyMessage>();
      while (await rdr.ReadAsync())
      {
        messages.Add(new D2SurvivorsController.D2SLobbyMessage
        {
          Id = rdr.GetInt64("id"), UserId = rdr.GetInt32("user_id"),
          Username = rdr.GetString("username"), Message = rdr.GetString("message"),
          CreatedAt = rdr.GetDateTime("created_at")
        });
      }
      messages.Reverse();
      return messages;
    }

    public async Task<D2SurvivorsController.D2SLobbyMessage> SendChatMessageAsync(D2SurvivorsController.D2SLobbyMessageRequest request)
    {
      await using var conn = new MySqlConnection(_connectionString);
      await conn.OpenAsync();
      const string insertSql = @"INSERT INTO maxhanna.d2survivors_lobby_chat (user_id, message, created_at)
          VALUES (@UserId, @Message, UTC_TIMESTAMP()); SELECT LAST_INSERT_ID();";
      await using var cmd = new MySqlCommand(insertSql, conn);
      cmd.Parameters.AddWithValue("@UserId", request.UserId);
      cmd.Parameters.AddWithValue("@Message", request.Message);
      var id = Convert.ToInt64(await cmd.ExecuteScalarAsync());
      string username = "Anonymous";
      await using (var userCmd = new MySqlCommand("SELECT username FROM maxhanna.users WHERE id = @UserId LIMIT 1;", conn))
      {
        userCmd.Parameters.AddWithValue("@UserId", request.UserId);
        var result = await userCmd.ExecuteScalarAsync();
        if (result is string name && !string.IsNullOrWhiteSpace(name)) username = name;
      }
      var message = new D2SurvivorsController.D2SLobbyMessage
      {
        Id = id, UserId = request.UserId, Username = username,
        Message = request.Message, CreatedAt = DateTime.UtcNow
      };
      await _hub.Clients.Group(D2SurvivorsLobbyHub.GroupName).SendAsync("OnLobbyMessage", message);
      return message;
    }
  }
}
