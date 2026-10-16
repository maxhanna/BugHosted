using System.Text.Json;
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
    private static bool _tablesReady;
    private static readonly SemaphoreSlim _tableLock = new(1, 1);

    private readonly Log _log;
    private readonly string _connectionString;

    public D2SurvivorsController(Log log, IConfiguration config)
    {
      _log = log;
      _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
    }

    /// <summary>Creates the D2 Survivors tables once per process. Safe to call from other controllers.</summary>
    public static async Task EnsureTablesAsync(string connectionString)
    {
      if (_tablesReady) return;
      await _tableLock.WaitAsync();
      try
      {
        if (_tablesReady) return;
        await using var conn = new MySqlConnection(connectionString);
        await conn.OpenAsync();
        string[] statements = {
          @"CREATE TABLE IF NOT EXISTS maxhanna.d2survivors_save (
              user_id INT NOT NULL PRIMARY KEY,
              gold INT NOT NULL DEFAULT 0,
              potions INT NOT NULL DEFAULT 0,
              inventory TEXT NOT NULL,
              equipped TEXT NOT NULL,
              run_snapshot MEDIUMTEXT NULL,
              updated_at DATETIME NOT NULL
            );",
          @"CREATE TABLE IF NOT EXISTS maxhanna.d2survivors_highscore (
              id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              score INT NOT NULL,
              time_seconds INT NOT NULL,
              kills INT NOT NULL,
              level INT NOT NULL,
              victory TINYINT(1) NOT NULL DEFAULT 0,
              created_at DATETIME NOT NULL,
              INDEX idx_d2s_score (score),
              INDEX idx_d2s_user (user_id)
            );"
        };
        foreach (var sql in statements)
        {
          await using var cmd = new MySqlCommand(sql, conn);
          await cmd.ExecuteNonQueryAsync();
        }
        _tablesReady = true;
      }
      finally
      {
        _tableLock.Release();
      }
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
        await EnsureTablesAsync(_connectionString);

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
        await EnsureTablesAsync(_connectionString);

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
        await EnsureTablesAsync(_connectionString);

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

        // The run is over, so drop its snapshot.
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

    [HttpPost("/D2Survivors/HighScores", Name = "D2Survivors_HighScores")]
    public async Task<IActionResult> HighScores([FromBody] int limit)
    {
      if (limit <= 0 || limit > 50) limit = 10;
      try
      {
        await EnsureTablesAsync(_connectionString);
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
