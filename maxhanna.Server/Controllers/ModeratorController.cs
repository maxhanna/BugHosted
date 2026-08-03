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
 
    private async Task<bool> IsGlobalModeratorAsync(int userId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        // Any moderator role grants panel access: the legacy global moderator
        // flag OR any scoped role (chat_moderator, topic_moderator, admin).
        // Scoped moderators can open the panel and view the moderator list,
        // role catalog, and logs; admin-only actions stay gated by IsAdminAsync.
        string sql = @"SELECT
            (SELECT COUNT(*) FROM maxhanna.user_roles WHERE user_id = @UserId AND role = 'moderator')
            + (SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId);";
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

      if (string.IsNullOrWhiteSpace(request.Role) || request.TargetUserId <= 0)
        return BadRequest("Invalid request.");

      string targetType = string.IsNullOrWhiteSpace(request.TargetType) ? "global" : request.TargetType!.Trim().ToLowerInvariant();
      int? targetId = targetType == "global" ? null : request.TargetId;

      // Low-level chat moderation: anyone who already moderates a chat room can
      // grant/revoke the chat_moderator role for THAT chat. Admins keep full
      // control over every role/scope; everyone else is rejected.
      bool isAdminCaller = request.CallerUserId == 1 || await IsAdminAsync(request.CallerUserId);
      bool isChatScopedAssign = request.Role.Equals("chat_moderator", StringComparison.OrdinalIgnoreCase)
        && targetType == "chat" && targetId.HasValue
        && await IsChatModeratorAsync(_config, request.CallerUserId, targetId.Value);
      if (!isAdminCaller && !isChatScopedAssign)
        return Unauthorized("Only admins or that chat room's moderators can change this role.");

      if (request.TargetUserId == 1 && request.Remove)
        return BadRequest("Cannot remove moderator status from the owner.");

      // A chat moderator cannot demote themselves from a chat they moderate —
      // that would let a room silently lose its last moderator (mirrors the
      // client rule, enforced here so the API can't bypass it).
      if (request.Remove && request.Role.Equals("chat_moderator", StringComparison.OrdinalIgnoreCase)
        && targetType == "chat" && request.TargetUserId == request.CallerUserId
        && await IsChatModeratorAsync(_config, request.CallerUserId, targetId ?? 0))
        return BadRequest("You cannot remove your own chat moderator role.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

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

     

    /// <summary>True when the user has an active (not lifted) ban in this chat.</summary>
    private async Task<bool> IsChatUserBannedAsync(MySqlConnection conn, int chatId, int userId)
    {
      string sql = "SELECT COUNT(*) FROM maxhanna.chat_bans WHERE chat_id = @ChatId AND user_id = @UserId AND lifted_at IS NULL;";
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@ChatId", chatId);
      cmd.Parameters.AddWithValue("@UserId", userId);
      return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    /// <summary>Public helper — used by ChatController to block banned senders.</summary>
    public static async Task<bool> IsChatUserBannedAsync(IConfiguration config, int chatId, int userId)
    {
      try
      {
        string connStr = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "SELECT COUNT(*) FROM maxhanna.chat_bans WHERE chat_id = @ChatId AND user_id = @UserId AND lifted_at IS NULL;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ChatId", chatId);
        cmd.Parameters.AddWithValue("@UserId", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }

    [HttpPost("/Moderator/BanChatUser", Name = "BanChatUser")]
    public async Task<IActionResult> BanChatUser(
      [FromBody] ChatBanRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.ChatId <= 0 || request.TargetUserId <= 0 || request.CallerUserId <= 0)
        return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (request.CallerUserId != 1 && !await IsAdminAsync(request.CallerUserId)
        && !await IsChatModeratorAsync(_config, request.CallerUserId, request.ChatId))
        return Unauthorized("Only that chat room's moderators can ban users here.");
      if (request.TargetUserId == 1) return BadRequest("Cannot ban the owner.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();


        string sql = @"INSERT INTO maxhanna.chat_bans (chat_id, user_id, banned_by, reason, created_at)
          VALUES (@ChatId, @UserId, @BannedBy, @Reason, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE lifted_at = NULL, lifted_by = NULL, reason = @Reason, banned_by = @BannedBy;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ChatId", request.ChatId);
        cmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
        cmd.Parameters.AddWithValue("@BannedBy", request.CallerUserId);
        cmd.Parameters.AddWithValue("@Reason", string.IsNullOrWhiteSpace(request.Reason) ? "Banned by a chat moderator." : request.Reason.Trim());
        await cmd.ExecuteNonQueryAsync();

        _ = _log.Db($"Moderator {request.CallerUserId} banned user {request.TargetUserId} from chat #{request.ChatId} ({request.Reason})", request.CallerUserId, "MODERATOR", true);
        return Ok(new { message = "User banned from this chat." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in BanChatUser: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to ban user from chat.");
      }
    }

    [HttpPost("/Moderator/UnbanChatUser", Name = "UnbanChatUser")]
    public async Task<IActionResult> UnbanChatUser(
      [FromBody] ChatBanRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.ChatId <= 0 || request.TargetUserId <= 0 || request.CallerUserId <= 0)
        return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (request.CallerUserId != 1 && !await IsAdminAsync(request.CallerUserId)
        && !await IsChatModeratorAsync(_config, request.CallerUserId, request.ChatId))
        return Unauthorized("Only that chat room's moderators can unban users here.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();


        string sql = "UPDATE maxhanna.chat_bans SET lifted_at = UTC_TIMESTAMP(), lifted_by = @By WHERE chat_id = @ChatId AND user_id = @UserId AND lifted_at IS NULL;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ChatId", request.ChatId);
        cmd.Parameters.AddWithValue("@UserId", request.TargetUserId);
        cmd.Parameters.AddWithValue("@By", request.CallerUserId);
        await cmd.ExecuteNonQueryAsync();

        _ = _log.Db($"Moderator {request.CallerUserId} un-banned user {request.TargetUserId} from chat #{request.ChatId}", request.CallerUserId, "MODERATOR", true);
        return Ok(new { message = "User un-banned from this chat." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in UnbanChatUser: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to unban user from chat.");
      }
    }

    [HttpPost("/Moderator/GetChatBans", Name = "GetChatBans")]
    public async Task<IActionResult> GetChatBans(
      [FromBody] GetChatBansRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.ChatId <= 0 || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (request.CallerUserId != 1 && !await IsAdminAsync(request.CallerUserId)
        && !await IsChatModeratorAsync(_config, request.CallerUserId, request.ChatId))
        return Unauthorized("Only that chat room's moderators can view bans.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();

        var bans = new List<object>();
        string sql = @"SELECT cb.id, cb.chat_id, cb.user_id, cb.banned_by, cb.reason, cb.created_at, cb.lifted_at, cb.lifted_by, u.username
          FROM maxhanna.chat_bans cb LEFT JOIN maxhanna.users u ON u.id = cb.user_id
          WHERE cb.chat_id = @ChatId ORDER BY cb.created_at DESC;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ChatId", request.ChatId);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          bans.Add(new
          {
            id = reader.GetInt32("id"),
            chatId = reader.GetInt32("chat_id"),
            userId = reader.GetInt32("user_id"),
            username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username"),
            bannedBy = reader.GetInt32("banned_by"),
            reason = reader.IsDBNull(reader.GetOrdinal("reason")) ? null : reader.GetString("reason"),
            createdAt = reader.GetDateTime("created_at"),
            liftedAt = reader.IsDBNull(reader.GetOrdinal("lifted_at")) ? null : (DateTime?)reader.GetDateTime("lifted_at"),
            liftedBy = reader.IsDBNull(reader.GetOrdinal("lifted_by")) ? null : (int?)reader.GetInt32("lifted_by"),
            isActive = reader.IsDBNull(reader.GetOrdinal("lifted_at"))
          });
        }
        return Ok(bans);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetChatBans: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get chat bans.");
      }
    }

    [HttpPost("/Moderator/AppealChatBan", Name = "AppealChatBan")]
    public async Task<IActionResult> AppealChatBan(
      [FromBody] ChatBanAppealRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.ChatId <= 0 || request.UserId <= 0 || string.IsNullOrWhiteSpace(request.AppealText))
        return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();


        // Only an actively banned user may appeal.
        if (!await IsChatUserBannedAsync(conn, request.ChatId, request.UserId))
          return BadRequest("You are not banned from this chat.");

        // One open appeal at a time per chat+user.
        string openSql = "SELECT COUNT(*) FROM maxhanna.chat_ban_appeal WHERE chat_id = @ChatId AND user_id = @UserId AND resolved_at IS NULL;";
        using var openCmd = new MySqlCommand(openSql, conn);
        openCmd.Parameters.AddWithValue("@ChatId", request.ChatId);
        openCmd.Parameters.AddWithValue("@UserId", request.UserId);
        if (Convert.ToInt32(await openCmd.ExecuteScalarAsync()) > 0)
          return BadRequest("You already have a pending appeal for this chat.");

        string sql = "INSERT INTO maxhanna.chat_ban_appeal (chat_id, user_id, appeal_text, created_at) VALUES (@ChatId, @UserId, @AppealText, UTC_TIMESTAMP());";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ChatId", request.ChatId);
        cmd.Parameters.AddWithValue("@UserId", request.UserId);
        cmd.Parameters.AddWithValue("@AppealText", request.AppealText.Trim());
        await cmd.ExecuteNonQueryAsync();

        _ = _log.Db($"User {request.UserId} appealed their ban in chat #{request.ChatId}", request.UserId, "MODERATOR", true);
        return Ok(new { message = "Appeal submitted to the chat's moderators." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in AppealChatBan: " + ex.Message, request.UserId, "MODERATOR", true);
        return StatusCode(500, "Failed to submit appeal.");
      }
    }

    [HttpPost("/Moderator/GetChatBanAppeals", Name = "GetChatBanAppeals")]
    public async Task<IActionResult> GetChatBanAppeals(
      [FromBody] GetChatBansRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.ChatId <= 0 || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (request.CallerUserId != 1 && !await IsAdminAsync(request.CallerUserId)
        && !await IsChatModeratorAsync(_config, request.CallerUserId, request.ChatId))
        return Unauthorized("Only that chat room's moderators can view appeals.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();

        var appeals = new List<object>();
        string sql = @"SELECT a.id, a.chat_id, a.user_id, a.appeal_text, a.created_at, a.resolved_at, a.resolved_by, a.resolution, u.username
          FROM maxhanna.chat_ban_appeal a LEFT JOIN maxhanna.users u ON u.id = a.user_id
          WHERE a.chat_id = @ChatId ORDER BY a.resolved_at IS NULL DESC, a.created_at DESC;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@ChatId", request.ChatId);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          appeals.Add(new
          {
            id = reader.GetInt32("id"),
            chatId = reader.GetInt32("chat_id"),
            userId = reader.GetInt32("user_id"),
            username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username"),
            appealText = reader.IsDBNull(reader.GetOrdinal("appeal_text")) ? null : reader.GetString("appeal_text"),
            createdAt = reader.GetDateTime("created_at"),
            resolvedAt = reader.IsDBNull(reader.GetOrdinal("resolved_at")) ? null : (DateTime?)reader.GetDateTime("resolved_at"),
            resolvedBy = reader.IsDBNull(reader.GetOrdinal("resolved_by")) ? null : (int?)reader.GetInt32("resolved_by"),
            resolution = reader.IsDBNull(reader.GetOrdinal("resolution")) ? null : reader.GetString("resolution")
          });
        }
        return Ok(appeals);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetChatBanAppeals: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get chat ban appeals.");
      }
    }

    [HttpPost("/Moderator/ResolveChatBanAppeal", Name = "ResolveChatBanAppeal")]
    public async Task<IActionResult> ResolveChatBanAppeal(
      [FromBody] ResolveChatBanAppealRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.AppealId <= 0 || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();


        // Load the appeal to find its chat, then verify the caller moderates it.
        int chatId = 0, userId = 0;
        string getSql = "SELECT chat_id, user_id FROM maxhanna.chat_ban_appeal WHERE id = @AppealId;";
        using (var getCmd = new MySqlCommand(getSql, conn))
        {
          getCmd.Parameters.AddWithValue("@AppealId", request.AppealId);
          using var reader = await getCmd.ExecuteReaderAsync();
          if (await reader.ReadAsync())
          {
            chatId = reader.GetInt32("chat_id");
            userId = reader.GetInt32("user_id");
          }
        }
        if (chatId <= 0) return NotFound("Appeal not found.");

        if (request.CallerUserId != 1 && !await IsAdminAsync(request.CallerUserId)
          && !await IsChatModeratorAsync(_config, request.CallerUserId, chatId))
          return Unauthorized("Only that chat room's moderators can resolve appeals.");

        string resolution = string.IsNullOrWhiteSpace(request.Resolution) ? "denied" : request.Resolution.Trim().ToLowerInvariant();
        string resolveSql = "UPDATE maxhanna.chat_ban_appeal SET resolved_at = UTC_TIMESTAMP(), resolved_by = @By, resolution = @Resolution WHERE id = @AppealId;";
        using var resolveCmd = new MySqlCommand(resolveSql, conn);
        resolveCmd.Parameters.AddWithValue("@AppealId", request.AppealId);
        resolveCmd.Parameters.AddWithValue("@By", request.CallerUserId);
        resolveCmd.Parameters.AddWithValue("@Resolution", resolution);
        await resolveCmd.ExecuteNonQueryAsync();

        // Approved appeal lifts the ban so the user can rejoin and chat again.
        if (resolution == "approved")
        {
          string liftSql = "UPDATE maxhanna.chat_bans SET lifted_at = UTC_TIMESTAMP(), lifted_by = @By WHERE chat_id = @ChatId AND user_id = @UserId AND lifted_at IS NULL;";
          using var liftCmd = new MySqlCommand(liftSql, conn);
          liftCmd.Parameters.AddWithValue("@ChatId", chatId);
          liftCmd.Parameters.AddWithValue("@UserId", userId);
          liftCmd.Parameters.AddWithValue("@By", request.CallerUserId);
          await liftCmd.ExecuteNonQueryAsync();
        }

        _ = _log.Db($"Moderator {request.CallerUserId} resolved chat #{chatId} ban appeal {request.AppealId} as '{resolution}'", request.CallerUserId, "MODERATOR", true);
        return Ok(new { message = "Appeal resolved." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in ResolveChatBanAppeal: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to resolve appeal.");
      }
    }

    /// <summary>Lets a user check their own ban status in a chat so the client can
    /// show a banned notice and appeal option without asking the moderators.</summary>
    [HttpPost("/Moderator/IsChatUserBanned", Name = "IsChatUserBanned")]
    public async Task<IActionResult> IsChatUserBanned(
      [FromBody] ChatBanAppealRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.ChatId <= 0 || request.UserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");

      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();

        bool isBanned = await IsChatUserBannedAsync(conn, request.ChatId, request.UserId);
        bool hasPendingAppeal = false;
        if (isBanned)
        {
          string sql = "SELECT COUNT(*) FROM maxhanna.chat_ban_appeal WHERE chat_id = @ChatId AND user_id = @UserId AND resolved_at IS NULL;";
          using var cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@ChatId", request.ChatId);
          cmd.Parameters.AddWithValue("@UserId", request.UserId);
          hasPendingAppeal = Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
        }
        return Ok(new { isBanned, hasPendingAppeal });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in IsChatUserBanned: " + ex.Message, request.UserId, "MODERATOR", true);
        return StatusCode(500, "Failed to check ban status.");
      }
    }

    /// <summary>Public helper used by other controllers to check chat moderation.</summary>
    public static async Task<bool> IsChatModeratorAsync(IConfiguration config, int userId, int chatId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId AND role = 'chat_moderator' AND target_type = 'chat' AND target_id = @ChatId;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        cmd.Parameters.AddWithValue("@ChatId", chatId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
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

  public class ChatBanRequest
  {
    public int ChatId { get; set; }
    public int TargetUserId { get; set; }
    public int CallerUserId { get; set; }
    public string? Reason { get; set; }
  }

  public class GetChatBansRequest
  {
    public int ChatId { get; set; }
    public int CallerUserId { get; set; }
  }

  public class ChatBanAppealRequest
  {
    public int ChatId { get; set; }
    public int UserId { get; set; }
    public string AppealText { get; set; } = "";
  }

  public class ResolveChatBanAppealRequest
  {
    public int AppealId { get; set; }
    public int CallerUserId { get; set; }
    public string? Resolution { get; set; }
  }
}
