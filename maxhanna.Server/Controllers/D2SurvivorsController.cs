using System.Text.Json;
using maxhanna.Server.Services;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
  public class D2SGetSaveRequest
  {
    public int UserId { get; set; }
  }

  public class D2SSaveRequest
  {
    public int UserId { get; set; }
    public int Gold { get; set; }
    public int Potions { get; set; }
    public string? Inventory { get; set; }
    public string? Equipped { get; set; }
    public string? RunSnapshot { get; set; }
  }

  public class D2SRecordRunRequest
  {
    public int UserId { get; set; }
    public int TimeSeconds { get; set; }
    public int Kills { get; set; }
    public int Level { get; set; }
    public bool Victory { get; set; }
  }

  [ApiController]
  public class D2SurvivorsController : ControllerBase
  {
    private const int MaxSaveBytes = 262144;
    private const int MaxLobbyMessageLength = 500;

    private readonly Log _log;
    private readonly string _connectionString;
    private readonly D2SurvivorsLobbyService _lobbyService;

    public D2SurvivorsController(Log log, IConfiguration config, D2SurvivorsLobbyService lobbyService)
    {
      _log = log;
      _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      _lobbyService = lobbyService;
    }


    public sealed class D2SLeaderboardEntry
    {
      public long Id { get; set; }
      public int UserId { get; set; }
      public string CharacterName { get; set; } = "";
      public string ClassId { get; set; } = "";
      public string Username { get; set; } = "Anonymous";
      public int Score { get; set; }
      public int TimeSeconds { get; set; }
      public int Kills { get; set; }
      public int Level { get; set; }
      public bool Victory { get; set; }
      public bool Died { get; set; }
      public DateTime CreatedAt { get; set; }
    }

    public sealed class D2SLobbyMessage
    {
      public long Id { get; set; }
      public int UserId { get; set; }
      public string Username { get; set; } = "Anonymous";
      public string Message { get; set; } = "";
      public DateTime CreatedAt { get; set; }
    }

    public sealed class D2SRecordCharacterRequest
    {
      public int UserId { get; set; }
      public string RunId { get; set; } = "";
      public string CharacterName { get; set; } = "";
      public string ClassId { get; set; } = "";
      public int TimeSeconds { get; set; }
      public int Kills { get; set; }
      public int Level { get; set; }
      public bool Victory { get; set; }
      public int Score { get; set; }
    }

    public sealed class D2SLobbyMessageRequest
    {
      public int UserId { get; set; }
      public string Message { get; set; } = "";
    }

    private static bool IsValidJson(string text)
    {
      try
      {
        using var doc = JsonDocument.Parse(text);
        return true;
      }
      catch (JsonException)
      {
        return false;
      }
    }

    [HttpPost("/D2Survivors/GetSave", Name = "D2Survivors_GetSave")]
    public async Task<IActionResult> GetSave([FromBody] D2SGetSaveRequest req, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
    {
      if (req == null || req.UserId <= 0) return BadRequest("userId required.");
      try
      {
        if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? "")) return Unauthorized();

        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        const string sql = "SELECT gold, potions, inventory, equipped, run_snapshot FROM maxhanna.d2survivors_save WHERE user_id = @UserId LIMIT 1;";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", req.UserId);
        await using var rdr = await cmd.ExecuteReaderAsync();
        if (!await rdr.ReadAsync()) return Ok(new { exists = false });

        return Ok(new
        {
          exists = true,
          gold = rdr.GetInt32("gold"),
          potions = rdr.GetInt32("potions"),
          inventory = rdr.GetString("inventory"),
          equipped = rdr.GetString("equipped"),
          runSnapshot = rdr.IsDBNull(rdr.GetOrdinal("run_snapshot")) ? null : rdr.GetString("run_snapshot")
        });
      }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors GetSave failed: " + ex.Message, req.UserId, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/Save", Name = "D2Survivors_Save")]
    public async Task<IActionResult> Save([FromBody] D2SSaveRequest req, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
    {
      if (req == null || req.UserId <= 0) return BadRequest("userId required.");
      if (req.Gold < 0 || req.Potions < 0) return BadRequest("Invalid values.");
      string inventory = req.Inventory ?? "[]";
      string equipped = req.Equipped ?? "{}";
      if (inventory.Length > MaxSaveBytes || equipped.Length > MaxSaveBytes || (req.RunSnapshot?.Length ?? 0) > MaxSaveBytes)
        return BadRequest("Save data too large.");
      if (!IsValidJson(inventory) || !IsValidJson(equipped) || (req.RunSnapshot != null && !IsValidJson(req.RunSnapshot)))
        return BadRequest("Invalid save data.");

      try
      {
        if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? "")) return Unauthorized();

        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        const string sql = @"INSERT INTO maxhanna.d2survivors_save (user_id, gold, potions, inventory, equipped, run_snapshot, updated_at)
            VALUES (@UserId, @Gold, @Potions, @Inventory, @Equipped, @RunSnapshot, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE gold = VALUES(gold), potions = VALUES(potions), inventory = VALUES(inventory),
              equipped = VALUES(equipped), run_snapshot = VALUES(run_snapshot), updated_at = VALUES(updated_at);";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", req.UserId);
        cmd.Parameters.AddWithValue("@Gold", req.Gold);
        cmd.Parameters.AddWithValue("@Potions", req.Potions);
        cmd.Parameters.AddWithValue("@Inventory", inventory);
        cmd.Parameters.AddWithValue("@Equipped", equipped);
        cmd.Parameters.AddWithValue("@RunSnapshot", (object?)req.RunSnapshot ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
        return Ok();
      }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors Save failed: " + ex.Message, req.UserId, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/RecordRun", Name = "D2Survivors_RecordRun")]
    public async Task<IActionResult> RecordRun([FromBody] D2SRecordRunRequest req, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
    {
      if (req == null || req.UserId <= 0) return BadRequest("userId required.");
      int timeSeconds = Math.Clamp(req.TimeSeconds, 0, 3600);
      int kills = Math.Clamp(req.Kills, 0, 1000000);
      int level = Math.Clamp(req.Level, 1, 200);
      // Score is computed here, not trusted from the client.
      int score = timeSeconds + kills * 5 + level * 20 + (req.Victory ? 500 : 0);

      try
      {
        if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? "")) return Unauthorized();

        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();

        const string insertSql = @"INSERT INTO maxhanna.d2survivors_highscore (user_id, score, time_seconds, kills, level, victory, created_at)
            VALUES (@UserId, @Score, @Time, @Kills, @Level, @Victory, UTC_TIMESTAMP());";
        await using (var insert = new MySqlCommand(insertSql, conn, tx))
        {
          insert.Parameters.AddWithValue("@UserId", req.UserId);
          insert.Parameters.AddWithValue("@Score", score);
          insert.Parameters.AddWithValue("@Time", timeSeconds);
          insert.Parameters.AddWithValue("@Kills", kills);
          insert.Parameters.AddWithValue("@Level", level);
          insert.Parameters.AddWithValue("@Victory", req.Victory ? 1 : 0);
          await insert.ExecuteNonQueryAsync();
        }

        const string clearSql = "UPDATE maxhanna.d2survivors_save SET run_snapshot = NULL, updated_at = UTC_TIMESTAMP() WHERE user_id = @UserId;";
        await using (var clear = new MySqlCommand(clearSql, conn, tx))
        {
          clear.Parameters.AddWithValue("@UserId", req.UserId);
          await clear.ExecuteNonQueryAsync();
        }

        await tx.CommitAsync();
        return Ok(new { score });
      }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors RecordRun failed: " + ex.Message, req.UserId, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/RecordCharacter", Name = "D2Survivors_RecordCharacter")]
    public async Task<IActionResult> RecordCharacter([FromBody] D2SRecordCharacterRequest req, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
    {
      if (req == null || req.UserId <= 0) return BadRequest("userId required.");
      string characterName = (req.CharacterName ?? "").Trim();
      string classId = (req.ClassId ?? "").Trim().ToLowerInvariant();
      string[] validClasses = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"];
      if (!Guid.TryParse(req.RunId, out var runId) || characterName.Length is < 1 or > 48 || characterName.Any(char.IsControl) || !validClasses.Contains(classId))
        return BadRequest("Invalid character data.");
      req.RunId = runId.ToString("D");
      req.CharacterName = characterName;
      req.ClassId = classId;
      req.TimeSeconds = Math.Clamp(req.TimeSeconds, 0, 31_536_000);
      req.Kills = Math.Clamp(req.Kills, 0, 10_000_000);
      req.Level = Math.Clamp(req.Level, 1, 200);
      req.Score = req.TimeSeconds + req.Kills * 5 + req.Level * 20 + (req.Victory ? 500 : 0);
      try
      {
        if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? "")) return Unauthorized();
        await _lobbyService.RecordCharacterAsync(req);
        return Ok(new { score = req.Score });
      }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors RecordCharacter failed: " + ex.Message, req.UserId, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/Leaderboard", Name = "D2Survivors_Leaderboard")]
    public async Task<IActionResult> Leaderboard([FromBody] int limit)
    {
      limit = Math.Clamp(limit, 1, 100);
      try { return Ok(await _lobbyService.GetLeaderboardAsync(limit)); }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors Leaderboard failed: " + ex.Message, null, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/LobbyHistory", Name = "D2Survivors_LobbyHistory")]
    public async Task<IActionResult> LobbyHistory([FromBody] int limit)
    {
      limit = Math.Clamp(limit, 1, 100);
      try { return Ok(await _lobbyService.GetChatHistoryAsync(limit)); }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors LobbyHistory failed: " + ex.Message, null, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/LobbyMessage", Name = "D2Survivors_LobbyMessage")]
    public async Task<IActionResult> LobbyMessage([FromBody] D2SLobbyMessageRequest req, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
    {
      string message = req?.Message?.Trim() ?? "";
      if (req == null || req.UserId <= 0) return BadRequest("userId required.");
      if (message.Length is < 1 or > MaxLobbyMessageLength || message.Any(char.IsControl)) return BadRequest("Invalid chat message.");
      try
      {
        if (!await _log.ValidateUserLoggedIn(req.UserId, encryptedUserIdHeader ?? "")) return Unauthorized();
        req.Message = message;
        return Ok(await _lobbyService.SendChatMessageAsync(req));
      }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors LobbyMessage failed: " + ex.Message, req.UserId, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }

    [HttpPost("/D2Survivors/HighScores", Name = "D2Survivors_HighScores")]
    public async Task<IActionResult> HighScores([FromBody] int limit)
    {
      if (limit <= 0 || limit > 50) limit = 10;
      try
      {
        await using var conn = new MySqlConnection(_connectionString);
        await conn.OpenAsync();
        const string sql = @"SELECT h.id, h.user_id, u.username, h.score, h.time_seconds, h.kills, h.level, h.victory, h.created_at
            FROM maxhanna.d2survivors_highscore h
            LEFT JOIN maxhanna.users u ON u.id = h.user_id
            ORDER BY h.score DESC, h.created_at ASC
            LIMIT @Limit;";
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@Limit", limit);
        await using var rdr = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await rdr.ReadAsync())
        {
          list.Add(new
          {
            id = rdr.GetInt32("id"),
            userId = rdr.GetInt32("user_id"),
            username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : rdr.GetString("username"),
            score = rdr.GetInt32("score"),
            timeSeconds = rdr.GetInt32("time_seconds"),
            kills = rdr.GetInt32("kills"),
            level = rdr.GetInt32("level"),
            victory = rdr.GetBoolean("victory"),
            createdAt = rdr.GetDateTime("created_at")
          });
        }
        return Ok(list);
      }
      catch (Exception ex)
      {
        _ = _log.Db("D2Survivors HighScores failed: " + ex.Message, null, "D2SURVIVORS", true);
        return StatusCode(500, "Internal server error.");
      }
    }
  }
}
