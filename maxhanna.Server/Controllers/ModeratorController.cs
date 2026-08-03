using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;

namespace maxhanna.Server.Controllers
{
  [ApiController]
  [Route("[controller]")]
  public class ModeratorController : ControllerBase
  {
    private readonly Log _log;
    private readonly IConfiguration _config;

    public ModeratorController(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
    }

    private static void EnsureSchema(string connStr)
    {
      try
      {
        using var conn = new MySqlConnection(connStr);
        conn.Open();
        string sql = @"CREATE TABLE IF NOT EXISTS maxhanna.moderator_roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            role VARCHAR(50) NOT NULL,
            target_type VARCHAR(20) NULL,
            target_id INT NULL,
            assigned_by INT NULL,
            assigned_at DATETIME DEFAULT UTC_TIMESTAMP(),
            UNIQUE KEY uq_user_role_target (user_id, role, target_type, target_id)
          );";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.ExecuteNonQuery();
      }
      catch (Exception ex)
      {
        Console.WriteLine("ModeratorController.EnsureSchema failed: " + ex.Message);
      }
    }

    private async Task<bool> IsGlobalModeratorAsync(int userId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "SELECT COUNT(*) FROM maxhanna.user_roles WHERE user_id = @UserId AND role = 'moderator';";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }

    // Admin is a moderator role with extra privileges (add moderators, manage
    // appeals). The owner is always an admin.
    private Task<bool> IsAdminAsync(int userId) => IsAdminAsync(_config, userId);

    /// <summary>Public helper used by other controllers to check admin privileges.</summary>
    public static async Task<bool> IsAdminAsync(IConfiguration config, int userId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        // Only the global admin role grants panel-admin power. Scoped 'admin'
        // rows must NOT count, or a non-global row would grant admin while
        // escaping the lockout protection (which guards global 'admin' only).
        string sql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId AND role = 'admin' AND target_type = 'global';";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }

    [HttpPost("/Moderator/GetRoleCatalog", Name = "GetRoleCatalog")]
    public async Task<IActionResult> GetRoleCatalog(
      [FromBody] int callerUserId,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(callerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (!await IsGlobalModeratorAsync(callerUserId)) return Unauthorized("Only moderators can view the role catalog.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      EnsureSchema(connStr);
      var catalog = new List<RoleDefinition>();
      var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

      // Built-in catalog — dynamically extended with any roles already present in the DB.
      catalog.Add(new RoleDefinition { Role = "moderator", Label = "Moderator", Description = "Global moderator — can moderate everywhere.", TargetType = "global" });
      catalog.Add(new RoleDefinition { Role = "chat_moderator", Label = "Chat Moderator", Description = "Can moderate a specific chat room.", TargetType = "chat" });
      catalog.Add(new RoleDefinition { Role = "topic_moderator", Label = "Topic Moderator", Description = "Can edit/delete posts in a specific topic.", TargetType = "topic" });
      catalog.Add(new RoleDefinition { Role = "admin", Label = "Admin", Description = "Admin — can add other moderators and manage appeals.", TargetType = "global" });
      catalog.ForEach(r => seen.Add(r.Role + "|" + (r.TargetType ?? "")));

      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "SELECT DISTINCT role, target_type FROM maxhanna.moderator_roles;";
        using var cmd = new MySqlCommand(sql, conn);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          string role = reader.GetString("role");
          string? tt = reader.IsDBNull(reader.GetOrdinal("target_type")) ? null : reader.GetString("target_type");
          if (seen.Add(role + "|" + (tt ?? "")))
          {
            catalog.Add(new RoleDefinition
            {
              Role = role,
              Label = role.Replace("_", " ").ToUpperInvariant(),
              Description = $"Role '{role}'" + (string.IsNullOrEmpty(tt) ? "" : $" scoped to {tt}."),
              TargetType = tt
            });
          }
        }
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetRoleCatalog: " + ex.Message, callerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get role catalog.");
      }
      return Ok(catalog);
    }

    [HttpPost("/Moderator/GetModerators", Name = "GetModeratorsWithRoles")]
    public async Task<IActionResult> GetModerators(
      [FromBody] int callerUserId,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(callerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (!await IsGlobalModeratorAsync(callerUserId)) return Unauthorized("Only moderators can view moderators.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      EnsureSchema(connStr);
      var result = new List<ModeratorInfo>();
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();

        // Global moderators (legacy user_roles table) + scoped roles (moderator_roles table)
        string sql = @"
          SELECT u.id AS user_id, u.username, u.last_seen, udp.file_id AS display_file_id,
                 'moderator' AS role, 'global' AS target_type, NULL AS target_id, ur.assigned_at, ur.assigned_by
          FROM maxhanna.user_roles ur
          JOIN maxhanna.users u ON u.id = ur.user_id
          LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
          WHERE ur.role = 'moderator'
          UNION ALL
          SELECT u.id AS user_id, u.username, u.last_seen, udp.file_id AS display_file_id,
                 mr.role, mr.target_type, mr.target_id, mr.assigned_at, mr.assigned_by
          FROM maxhanna.moderator_roles mr
          JOIN maxhanna.users u ON u.id = mr.user_id
          LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id;";

        using var cmd = new MySqlCommand(sql, conn);
        using var reader = await cmd.ExecuteReaderAsync();
        var byUser = new Dictionary<int, ModeratorInfo>();
        var order = new List<int>();

        while (await reader.ReadAsync())
        {
          int userId = reader.GetInt32("user_id");
          if (!byUser.TryGetValue(userId, out var info))
          {
            info = new ModeratorInfo
            {
              User = new User(
                userId,
                reader.GetString("username"),
                reader.IsDBNull(reader.GetOrdinal("display_file_id")) ? null : new FileEntry(reader.GetInt32("display_file_id"))
              )
              {
                LastSeen = reader.IsDBNull(reader.GetOrdinal("last_seen")) ? null : reader.GetDateTime("last_seen")
              },
              Roles = new List<ModeratorRole>()
            };
            byUser[userId] = info;
            order.Add(userId);
          }
          info.Roles.Add(new ModeratorRole
          {
            UserId = userId,
            Role = reader.GetString("role"),
            TargetType = reader.IsDBNull(reader.GetOrdinal("target_type")) ? null : reader.GetString("target_type"),
            TargetId = reader.IsDBNull(reader.GetOrdinal("target_id")) ? null : reader.GetInt32("target_id"),
            AssignedBy = reader.IsDBNull(reader.GetOrdinal("assigned_by")) ? null : reader.GetInt32("assigned_by"),
            AssignedAt = reader.IsDBNull(reader.GetOrdinal("assigned_at")) ? null : reader.GetDateTime("assigned_at")
          });
        }

        // Owner is implicitly a moderator.
        if (!byUser.ContainsKey(1))
        {
          byUser[1] = new ModeratorInfo
          {
            User = new User(1, "Max"),
            Roles = new List<ModeratorRole> { new ModeratorRole { UserId = 1, Role = "moderator", TargetType = "global" } }
          };
          order.Insert(0, 1);
        }

        foreach (var id in order)
        {
          var info = byUser[id];
          await ResolveTargetNamesAsync(conn, info.Roles);
          result.Add(info);
        }
        return Ok(result);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetModerators: " + ex.Message, callerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get moderators.");
      }
    }

    private async Task ResolveTargetNamesAsync(MySqlConnection conn, List<ModeratorRole> roles)
    {
      foreach (var role in roles)
      {
        if (role.TargetType == "chat" && role.TargetId.HasValue)
        {
          string sql = "SELECT name FROM maxhanna.chat_rooms WHERE chat_id = @Id LIMIT 1;";
          using var cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@Id", role.TargetId.Value);
          var name = await cmd.ExecuteScalarAsync();
          role.TargetName = name == null || name == DBNull.Value ? "Chat #" + role.TargetId : name.ToString();
        }
        else if (role.TargetType == "topic" && role.TargetId.HasValue)
        {
          string sql = "SELECT topic FROM maxhanna.topics WHERE id = @Id LIMIT 1;";
          using var cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@Id", role.TargetId.Value);
          var name = await cmd.ExecuteScalarAsync();
          role.TargetName = name == null || name == DBNull.Value ? "Topic #" + role.TargetId : name.ToString();
        }
      }
    }

    [HttpPost("/Moderator/SetRole", Name = "SetScopedRole")]
    public async Task<IActionResult> SetRole(
      [FromBody] SetScopedRoleRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (request.CallerUserId != 1 && !await IsAdminAsync(request.CallerUserId))
        return Unauthorized("Only admins can change roles.");

      if (string.IsNullOrWhiteSpace(request.Role) || request.TargetUserId <= 0)
        return BadRequest("Invalid request.");

      if (request.TargetUserId == 1 && request.Remove)
        return BadRequest("Cannot remove moderator status from the owner.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      EnsureSchema(connStr);
      string targetType = string.IsNullOrWhiteSpace(request.TargetType) ? "global" : request.TargetType!.Trim().ToLowerInvariant();
      int? targetId = targetType == "global" ? null : request.TargetId;

      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();

        // ── Admin-role lockout protection ───────────────────────────────────
        // An admin can never remove their own admin role, and the last admin
        // can never be demoted, so the panel can never lock itself out.
        if (request.Remove && targetType == "global" &&
            request.Role.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
          // Rule 1: you cannot strip your own admin role.
          if (request.TargetUserId == request.CallerUserId)
            return BadRequest("You cannot remove your own admin role.");

          // Rule 2: the last admin cannot be demoted. Only enforce when the
          // target actually holds a global admin role AND is the only one left
          // (the owner is an implicit admin, but we keep the explicit role row
          // protected so the panel can't be emptied of manage-able admins).
          string hasSql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId AND role = 'admin' AND target_type = 'global';";
          using var hasCmd = new MySqlCommand(hasSql, conn);
          hasCmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
          bool targetIsAdmin = Convert.ToInt32(await hasCmd.ExecuteScalarAsync()) > 0;

          string totalSql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE role = 'admin' AND target_type = 'global';";
          using var totalCmd = new MySqlCommand(totalSql, conn);
          int adminCount = Convert.ToInt32(await totalCmd.ExecuteScalarAsync());

          if (targetIsAdmin && adminCount <= 1)
            return BadRequest("Cannot demote the last admin — the moderator panel would lock itself out.");
        }

        if (request.Remove)
        {
          string delSql = @"DELETE FROM maxhanna.moderator_roles
            WHERE user_id = @UserId AND role = @Role AND target_type = @TargetType AND target_id = @TargetId;";
          using var delCmd = new MySqlCommand(delSql, conn);
          delCmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
          delCmd.Parameters.AddWithValue("@Role", request.Role);
          delCmd.Parameters.AddWithValue("@TargetType", targetType);
          delCmd.Parameters.AddWithValue("@TargetId", targetId ?? 0);
          await delCmd.ExecuteNonQueryAsync();

          // Keep the legacy global moderator flag in sync. Admins get the legacy
          // moderator row too so the panel stays visible and global-mod checks
          // (login role, IsGlobalModeratorAsync) keep working for them. Only
          // drop the legacy flag when NO global moderator/admin role remains —
          // removing just 'admin' from someone who is also a plain moderator
          // must not strip their moderator status.
          if (targetType == "global" &&
              (request.Role.Equals("moderator", StringComparison.OrdinalIgnoreCase) ||
               request.Role.Equals("admin", StringComparison.OrdinalIgnoreCase)))
          {
            string remainingSql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId AND role IN ('moderator', 'admin') AND target_type = 'global';";
            using var remainingCmd = new MySqlCommand(remainingSql, conn);
            remainingCmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
            bool stillGlobalMod = Convert.ToInt32(await remainingCmd.ExecuteScalarAsync()) > 0;
            if (!stillGlobalMod)
            {
              string delLegacy = "DELETE FROM maxhanna.user_roles WHERE user_id = @UserId AND role = 'moderator';";
              using var legacyCmd = new MySqlCommand(delLegacy, conn);
              legacyCmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
              await legacyCmd.ExecuteNonQueryAsync();
            }
          }
          _ = _log.Db($"Moderator {request.CallerUserId} removed role '{request.Role}' ({targetType}/{targetId}) from user {request.TargetUserId}", request.CallerUserId, "MODERATOR", true);
          return Ok(new { message = "Role removed." });
        }

        string upsertSql = @"INSERT INTO maxhanna.moderator_roles (user_id, role, target_type, target_id, assigned_by, assigned_at)
          VALUES (@UserId, @Role, @TargetType, @TargetId, @AssignedBy, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE assigned_by = @AssignedBy, assigned_at = UTC_TIMESTAMP();";
        using var upsCmd = new MySqlCommand(upsertSql, conn);
        upsCmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
        upsCmd.Parameters.AddWithValue("@Role", request.Role);
        upsCmd.Parameters.AddWithValue("@TargetType", targetType);
        upsCmd.Parameters.AddWithValue("@TargetId", targetId ?? 0);
        upsCmd.Parameters.AddWithValue("@AssignedBy", request.CallerUserId);
        await upsCmd.ExecuteNonQueryAsync();

        // Keep the legacy global moderator flag in sync so login/other checks keep working.
        if (targetType == "global" &&
            (request.Role.Equals("moderator", StringComparison.OrdinalIgnoreCase) ||
             request.Role.Equals("admin", StringComparison.OrdinalIgnoreCase)))
        {
          string legacySql = "REPLACE INTO maxhanna.user_roles (user_id, role, assigned_by, assigned_at) VALUES (@UserId, 'moderator', @AssignedBy, UTC_TIMESTAMP());";
          using var legacyCmd = new MySqlCommand(legacySql, conn);
          legacyCmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
          legacyCmd.Parameters.AddWithValue("@AssignedBy", request.CallerUserId);
          await legacyCmd.ExecuteNonQueryAsync();
        }

        _ = _log.Db($"Moderator {request.CallerUserId} assigned role '{request.Role}' ({targetType}/{targetId}) to user {request.TargetUserId}", request.CallerUserId, "MODERATOR", true);
        return Ok(new { message = "Role assigned." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in SetRole: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to set role.");
      }
    }

    [HttpPost("/Moderator/GetMyRoles", Name = "GetMyRoles")]
    public async Task<IActionResult> GetMyRoles(
      [FromBody] int userId,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      EnsureSchema(connStr);
      var roles = new List<ModeratorRole>();
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();

        if (userId == 1)
        {
          roles.Add(new ModeratorRole { UserId = userId, Role = "moderator", TargetType = "global" });
        }
        else
        {
          string globalSql = "SELECT COUNT(*) FROM maxhanna.user_roles WHERE user_id = @UserId AND role = 'moderator';";
          using var globalCmd = new MySqlCommand(globalSql, conn);
          globalCmd.Parameters.AddWithValue("@UserId", userId);
          if (Convert.ToInt32(await globalCmd.ExecuteScalarAsync()) > 0)
          {
            roles.Add(new ModeratorRole { UserId = userId, Role = "moderator", TargetType = "global" });
          }
        }

        string sql = @"SELECT role, target_type, target_id, assigned_at FROM maxhanna.moderator_roles WHERE user_id = @UserId;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          roles.Add(new ModeratorRole
          {
            UserId = userId,
            Role = reader.GetString("role"),
            TargetType = reader.IsDBNull(reader.GetOrdinal("target_type")) ? null : reader.GetString("target_type"),
            TargetId = reader.IsDBNull(reader.GetOrdinal("target_id")) ? null : reader.GetInt32("target_id"),
            AssignedAt = reader.IsDBNull(reader.GetOrdinal("assigned_at")) ? null : reader.GetDateTime("assigned_at")
          });
        }
        await ResolveTargetNamesAsync(conn, roles);
        return Ok(roles);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetMyRoles: " + ex.Message, userId, "MODERATOR", true);
        return StatusCode(500, "Failed to get roles.");
      }
    }

    [HttpPost("/Moderator/GetModeratorLogs", Name = "GetModeratorLogs")]
    public async Task<IActionResult> GetModeratorLogs(
      [FromBody] GetModeratorLogsRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (!await IsGlobalModeratorAsync(request.CallerUserId)) return Unauthorized("Only moderators can view logs.");

      try
      {
        int limit = request.Limit > 0 && request.Limit <= 500 ? request.Limit : 200;
        var logs = await _log.GetLogs(component: "MODERATOR", limit: limit);
        return Ok(logs);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetModeratorLogs: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get moderator logs.");
      }
    }

    /// <summary>Public helper used by other controllers to check topic moderation.</summary>
    public static async Task<bool> IsTopicModeratorAsync(IConfiguration config, int userId, int storyId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = @"
          SELECT COUNT(*) FROM maxhanna.moderator_roles mr
          JOIN maxhanna.story_topics st ON mr.target_type = 'topic' AND mr.target_id = st.topic_id
          WHERE mr.user_id = @UserId AND mr.role = 'topic_moderator' AND st.story_id = @StoryId;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        cmd.Parameters.AddWithValue("@StoryId", storyId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }
  }

  public class RoleDefinition
  {
    public string Role { get; set; } = "";
    public string Label { get; set; } = "";
    public string Description { get; set; } = "";
    public string? TargetType { get; set; }
  }

  public class ModeratorRole
  {
    public int UserId { get; set; }
    public string Role { get; set; } = "";
    public string? TargetType { get; set; }
    public int? TargetId { get; set; }
    public string? TargetName { get; set; }
    public int? AssignedBy { get; set; }
    public DateTime? AssignedAt { get; set; }
  }

  public class ModeratorInfo
  {
    public User? User { get; set; }
    public List<ModeratorRole> Roles { get; set; } = new List<ModeratorRole>();
  }

  public class SetScopedRoleRequest
  {
    public int TargetUserId { get; set; }
    public string Role { get; set; } = "moderator";
    public string? TargetType { get; set; }
    public int? TargetId { get; set; }
    public int CallerUserId { get; set; }
    public bool Remove { get; set; }
  }

  public class GetModeratorLogsRequest
  {
    public int CallerUserId { get; set; }
    public int Limit { get; set; } = 200;
  }
}
