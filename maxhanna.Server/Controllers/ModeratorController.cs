using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using FirebaseAdmin.Messaging;
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
        string sql = @"SELECT
            (SELECT COUNT(*) FROM maxhanna.user_roles WHERE user_id = @UserId AND role = 'moderator')
            + (SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId);";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }
    private Task<bool> IsAdminAsync(int userId) => IsAdminAsync(_config, userId);
    public static async Task<bool> IsAdminAsync(IConfiguration config, int userId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
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
      catalog.Add(new RoleDefinition { Role = "moderator", Label = "Moderator", Description = "Global moderator — can moderate everywhere.", TargetType = "global" });
      catalog.Add(new RoleDefinition { Role = "chat_moderator", Label = "Chat Moderator", Description = "Can moderate a specific chat room.", TargetType = "chat" });
      catalog.Add(new RoleDefinition { Role = "topic_moderator", Label = "Topic Moderator", Description = "Can edit/delete posts in a specific topic.", TargetType = "topic" });
      catalog.Add(new RoleDefinition { Role = "admin", Label = "Admin", Description = "Admin — can add other moderators and manage appeals.", TargetType = "global" });
      catalog.Add(new RoleDefinition { Role = "weaver_admin", Label = "Weaver Admin", Description = "Can view and delete Weaver feedback messages.", TargetType = "global" });
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
        var byUser = new Dictionary<int, ModeratorInfo>();
        var order = new List<int>();
        using (var reader = await cmd.ExecuteReaderAsync())
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
    [HttpPost("/Moderator/GetModeratorsFor", Name = "GetModeratorsFor")]
    public async Task<IActionResult> GetModeratorsFor(
      [FromBody] GetModeratorsForRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql;
        if (request.TopicId > 0)
        {
          sql = @"
            SELECT u.id AS user_id, u.username, udp.file_id AS display_file_id, mr.role, mr.target_type, mr.target_id
            FROM maxhanna.moderator_roles mr
            JOIN maxhanna.users u ON u.id = mr.user_id
            LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
            WHERE mr.target_type = 'topic' AND mr.target_id = @TopicId
            UNION ALL
            SELECT u.id AS user_id, u.username, udp.file_id AS display_file_id, mr.role, mr.target_type, mr.target_id
            FROM maxhanna.moderator_roles mr
            JOIN maxhanna.users u ON u.id = mr.user_id
            LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
            WHERE mr.target_type = 'global'
            UNION ALL
            SELECT u.id AS user_id, u.username, udp.file_id AS display_file_id, ur.role, 'global' AS target_type, NULL AS target_id
            FROM maxhanna.user_roles ur
            JOIN maxhanna.users u ON u.id = ur.user_id
            LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
            WHERE ur.role = 'moderator';"
            + (request.CallerUserId != 1
              ? " UNION ALL SELECT 1, 'Owner', NULL, 'admin', 'global', NULL"
              : "");
        }
        else
        {
          sql = @"
            SELECT u.id AS user_id, u.username, udp.file_id AS display_file_id, mr.role, mr.target_type, mr.target_id
            FROM maxhanna.moderator_roles mr
            JOIN maxhanna.users u ON u.id = mr.user_id
            LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
            WHERE mr.target_type = 'global'
            UNION ALL
            SELECT u.id AS user_id, u.username, udp.file_id AS display_file_id, ur.role, 'global' AS target_type, NULL AS target_id
            FROM maxhanna.user_roles ur
            JOIN maxhanna.users u ON u.id = ur.user_id
            LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
            WHERE ur.role = 'moderator';"
            + (request.CallerUserId != 1
              ? " UNION ALL SELECT 1, 'Owner', NULL, 'admin', 'global', NULL"
              : "");
        }
        using var cmd = new MySqlCommand(sql, conn);
        if (request.TopicId > 0) cmd.Parameters.AddWithValue("@TopicId", request.TopicId);
        var byUser = new Dictionary<int, object>();
        var order = new List<int>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          int userId = reader.GetInt32("user_id");
          if (byUser.ContainsKey(userId)) continue;
          byUser[userId] = new
          {
            userId,
            username = reader.GetString("username"),
            displayFileId = reader.IsDBNull(reader.GetOrdinal("display_file_id")) ? (int?)null : reader.GetInt32("display_file_id"),
            role = reader.IsDBNull(reader.GetOrdinal("role")) ? null : reader.GetString("role")
          };
          order.Add(userId);
        }
        return Ok(order.Select(id => byUser[id]));
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetModeratorsFor: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get moderators.");
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
      bool isAdminCaller = request.CallerUserId == 1 || await IsAdminAsync(request.CallerUserId);
      bool isChatScopedAssign = request.Role.Equals("chat_moderator", StringComparison.OrdinalIgnoreCase)
        && targetType == "chat" && targetId.HasValue
        && await IsChatModeratorAsync(_config, request.CallerUserId, targetId.Value);
      if (!isAdminCaller && !isChatScopedAssign)
        return Unauthorized("Only admins or that chat room's moderators can change this role.");
      if (request.TargetUserId == 1 && request.Remove)
        return BadRequest("Cannot remove moderator status from the owner.");
      if (request.Remove && request.Role.Equals("chat_moderator", StringComparison.OrdinalIgnoreCase)
        && targetType == "chat" && request.TargetUserId == request.CallerUserId
        && await IsChatModeratorAsync(_config, request.CallerUserId, targetId ?? 0))
        return BadRequest("You cannot remove your own chat moderator role.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        if (request.Remove && targetType == "global" &&
            request.Role.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
          if (request.TargetUserId == request.CallerUserId)
            return BadRequest("You cannot remove your own admin role.");
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
        using (var reader = await cmd.ExecuteReaderAsync())
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
    [HttpPost("/Moderator/GetWeaverFeedback", Name = "GetWeaverFeedback")]
    public async Task<IActionResult> GetWeaverFeedback(
      [FromBody] GetWeaverFeedbackRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (!await IsWeaverFeedbackModeratorAsync(request.CallerUserId)) return Unauthorized("Only weaver admins can view feedback.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        int page = request.Page < 1 ? 1 : request.Page;
        int pageSize = request.PageSize < 1 || request.PageSize > 100 ? 25 : request.PageSize;
        int offset = (page - 1) * pageSize;
        string countSql = "SELECT COUNT(*) FROM maxhanna.weaver_feedback;";
        using var countCmd = new MySqlCommand(countSql, conn);
        int total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
        string sql = @"
          SELECT id, user_id, username, card_id, card_text, message, created_at
          FROM maxhanna.weaver_feedback
          ORDER BY created_at DESC, id DESC
          LIMIT @Offset, @PageSize";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@Offset", offset);
        cmd.Parameters.AddWithValue("@PageSize", pageSize);
        using var reader = await cmd.ExecuteReaderAsync();
        var items = new List<object>();
        while (await reader.ReadAsync())
        {
          items.Add(new
          {
            id = reader.GetInt32("id"),
            userId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id"),
            username = reader.IsDBNull(reader.GetOrdinal("username")) ? "" : reader.GetString("username"),
            cardId = reader.IsDBNull(reader.GetOrdinal("card_id")) ? "" : reader.GetString("card_id"),
            cardText = reader.IsDBNull(reader.GetOrdinal("card_text")) ? null : reader.GetString("card_text"),
            message = reader.GetString("message"),
            createdAt = reader.GetDateTime("created_at").ToString("yyyy-MM-dd HH:mm:ss")
          });
        }
        return Ok(new { items, total, page, pageSize });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetWeaverFeedback: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get weaver feedback.");
      }
    }
    [HttpPost("/Moderator/DeleteWeaverFeedback", Name = "DeleteWeaverFeedback")]
    public async Task<IActionResult> DeleteWeaverFeedback(
      [FromBody] DeleteWeaverFeedbackRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.Id <= 0 || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      if (!await IsWeaverFeedbackModeratorAsync(request.CallerUserId)) return Unauthorized("Only weaver admins can delete feedback.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "DELETE FROM maxhanna.weaver_feedback WHERE id = @Id";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@Id", request.Id);
        int removed = await cmd.ExecuteNonQueryAsync();
        if (removed == 0) return NotFound("Feedback not found.");
        _ = _log.Db("Deleted weaver feedback #" + request.Id + " by user " + request.CallerUserId, request.CallerUserId, "MODERATOR", false);
        return Ok(new { status = "ok", deleted = request.Id });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in DeleteWeaverFeedback: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to delete weaver feedback.");
      }
    }
    private async Task<bool> IsWeaverFeedbackModeratorAsync(int userId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId AND target_type = 'global' AND role IN ('admin', 'weaver_admin');";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }
    private async Task<bool> IsChatUserBannedAsync(MySqlConnection conn, int chatId, int userId)

    {
      string sql = "SELECT COUNT(*) FROM maxhanna.chat_bans WHERE chat_id = @ChatId AND user_id = @UserId AND lifted_at IS NULL;";
      using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@ChatId", chatId);
      cmd.Parameters.AddWithValue("@UserId", userId);
      return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }
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
        if (!await IsChatUserBannedAsync(conn, request.ChatId, request.UserId))
          return BadRequest("You are not banned from this chat.");
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
    [HttpPost("/Moderator/RequestModerator", Name = "RequestModerator")]
    public async Task<IActionResult> RequestModerator(
      [FromBody] ModeratorRequestRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.UserId <= 0) return BadRequest("Invalid request.");
      int topicId = request.TopicId ?? 0;
      int chatId = topicId > 0 ? 0 : request.ChatId;
      if (chatId <= 0 && topicId <= 0) return BadRequest("Invalid request — a chat or topic is required.");
      if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        if (topicId > 0)
        {
          string topicSql = "SELECT COUNT(*) FROM maxhanna.topics WHERE id = @TopicId;";
          using (var topicCmd = new MySqlCommand(topicSql, conn))
          {
            topicCmd.Parameters.AddWithValue("@TopicId", topicId);
            if (Convert.ToInt32(await topicCmd.ExecuteScalarAsync()) == 0)
              return NotFound("Topic not found.");
          }
          if (request.UserId == 1 || await IsGlobalModeratorAsync(request.UserId)
            || await IsTopicModeratorForTopicAsync(_config, request.UserId, topicId))
            return BadRequest("You are already a moderator of this topic.");
          string topicOpenSql = "SELECT COUNT(*) FROM maxhanna.moderator_request WHERE chat_id = 0 AND topic_id = @TopicId AND user_id = @UserId AND resolved_at IS NULL;";
          using (var topicOpenCmd = new MySqlCommand(topicOpenSql, conn))
          {
            topicOpenCmd.Parameters.AddWithValue("@TopicId", topicId);
            topicOpenCmd.Parameters.AddWithValue("@UserId", request.UserId);
            if (Convert.ToInt32(await topicOpenCmd.ExecuteScalarAsync()) > 0)
              return BadRequest("You already have a pending moderator request for this topic.");
          }
          string insertSql = "INSERT INTO maxhanna.moderator_request (user_id, chat_id, topic_id, request_text, created_at) VALUES (@UserId, 0, @TopicId, @RequestText, UTC_TIMESTAMP());";
          using var insertCmd = new MySqlCommand(insertSql, conn);
          insertCmd.Parameters.AddWithValue("@UserId", request.UserId);
          insertCmd.Parameters.AddWithValue("@TopicId", topicId);
          insertCmd.Parameters.AddWithValue("@RequestText", (request.RequestText ?? "").Trim());
          await insertCmd.ExecuteNonQueryAsync();
          _ = _log.Db($"User {request.UserId} requested topic moderator status for topic #{topicId}", request.UserId, "MODERATOR", true);
          await NotifyModeratorsOfNewRequestAsync(conn, request.UserId, topicId, 0);
          return Ok(new { message = "Moderator request submitted to the topic's moderators." });
        }
        string chatSql = "SELECT COUNT(*) FROM maxhanna.chat_rooms WHERE chat_id = @ChatId;";
        using (var chatCmd = new MySqlCommand(chatSql, conn))
        {
          chatCmd.Parameters.AddWithValue("@ChatId", chatId);
          if (Convert.ToInt32(await chatCmd.ExecuteScalarAsync()) == 0)
            return NotFound("Chat not found.");
        }
        if (await IsChatUserBannedAsync(conn, chatId, request.UserId))
          return BadRequest("You are banned from this chat and cannot request moderator status.");
        if (request.UserId == 1 || await IsGlobalModeratorAsync(request.UserId)
          || await IsChatModeratorAsync(_config, request.UserId, chatId))
          return BadRequest("You are already a moderator of this chat.");
        string openSql = "SELECT COUNT(*) FROM maxhanna.moderator_request WHERE chat_id = @ChatId AND user_id = @UserId AND resolved_at IS NULL;";
        using (var openCmd = new MySqlCommand(openSql, conn))
        {
          openCmd.Parameters.AddWithValue("@ChatId", chatId);
          openCmd.Parameters.AddWithValue("@UserId", request.UserId);
          if (Convert.ToInt32(await openCmd.ExecuteScalarAsync()) > 0)
            return BadRequest("You already have a pending moderator request for this chat.");
        }
        string sql = "INSERT INTO maxhanna.moderator_request (user_id, chat_id, request_text, created_at) VALUES (@UserId, @ChatId, @RequestText, UTC_TIMESTAMP());";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", request.UserId);
        cmd.Parameters.AddWithValue("@ChatId", chatId);
        cmd.Parameters.AddWithValue("@RequestText", (request.RequestText ?? "").Trim());
        await cmd.ExecuteNonQueryAsync();
        _ = _log.Db($"User {request.UserId} requested moderator status in chat #{chatId}", request.UserId, "MODERATOR", true);
        await NotifyModeratorsOfNewRequestAsync(conn, request.UserId, 0, chatId);
        return Ok(new { message = "Moderator request submitted to the chat's moderators." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in RequestModerator: " + ex.Message, request.UserId, "MODERATOR", true);
        return StatusCode(500, "Failed to submit moderator request.");
      }
    }
    [HttpPost("/Moderator/GetMyModeratorRequest", Name = "GetMyModeratorRequest")]
    public async Task<IActionResult> GetMyModeratorRequest(
      [FromBody] ModeratorRequestRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.UserId <= 0) return BadRequest("Invalid request.");
      int topicId = request.TopicId ?? 0;
      int chatId = topicId > 0 ? 0 : request.ChatId;
      if (chatId <= 0 && topicId <= 0) return BadRequest("Invalid request — a chat or topic is required.");
      if (!await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql;
        if (topicId > 0)
          sql = @"SELECT id, request_text, created_at FROM maxhanna.moderator_request
            WHERE chat_id = 0 AND topic_id = @TopicId AND user_id = @UserId AND resolved_at IS NULL
            ORDER BY created_at DESC LIMIT 1;";
        else
          sql = @"SELECT id, request_text, created_at FROM maxhanna.moderator_request
            WHERE chat_id = @ChatId AND user_id = @UserId AND resolved_at IS NULL
            ORDER BY created_at DESC LIMIT 1;";
        using var cmd = new MySqlCommand(sql, conn);
        if (topicId > 0) cmd.Parameters.AddWithValue("@TopicId", topicId);
        else cmd.Parameters.AddWithValue("@ChatId", chatId);
        cmd.Parameters.AddWithValue("@UserId", request.UserId);
        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
          return Ok(new
          {
            id = reader.GetInt32("id"),
            chatId = topicId > 0 ? 0 : chatId,
            topicId = topicId > 0 ? topicId : (int?)null,
            requestText = reader.IsDBNull(reader.GetOrdinal("request_text")) ? null : reader.GetString("request_text"),
            createdAt = reader.GetDateTime("created_at")
          });
        }
        return Ok(new { id = 0 });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetMyModeratorRequest: " + ex.Message, request.UserId, "MODERATOR", true);
        return StatusCode(500, "Failed to check moderator request.");
      }
    }
    [HttpPost("/Moderator/GetMyModeratorRequests", Name = "GetMyModeratorRequests")]
    public async Task<IActionResult> GetMyModeratorRequests(
      [FromBody] int userId,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (userId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(userId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = @"
          SELECT mr.id, mr.chat_id, mr.topic_id, mr.request_text, mr.created_at, mr.resolved_at, mr.resolution,
                 cr.name AS chat_name, t.topic AS topic_name
          FROM maxhanna.moderator_request mr
          LEFT JOIN maxhanna.chat_rooms cr ON cr.chat_id = mr.chat_id
          LEFT JOIN maxhanna.topics t ON t.id = mr.topic_id
          WHERE mr.user_id = @UserId
          ORDER BY mr.created_at DESC;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        var list = new List<object>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
          list.Add(new
          {
            id = reader.GetInt32("id"),
            chatId = reader.IsDBNull(reader.GetOrdinal("chat_id")) ? 0 : reader.GetInt32("chat_id"),
            topicId = reader.IsDBNull(reader.GetOrdinal("topic_id")) ? (int?)null : reader.GetInt32("topic_id"),
            chatName = reader.IsDBNull(reader.GetOrdinal("chat_name")) ? null : reader.GetString("chat_name"),
            topicName = reader.IsDBNull(reader.GetOrdinal("topic_name")) ? null : reader.GetString("topic_name"),
            requestText = reader.IsDBNull(reader.GetOrdinal("request_text")) ? null : reader.GetString("request_text"),
            createdAt = reader.GetDateTime("created_at"),
            resolvedAt = reader.IsDBNull(reader.GetOrdinal("resolved_at")) ? (DateTime?)null : reader.GetDateTime("resolved_at"),
            resolution = reader.IsDBNull(reader.GetOrdinal("resolution")) ? null : reader.GetString("resolution")
          });
        }
        return Ok(list);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetMyModeratorRequests: " + ex.Message, userId, "MODERATOR", true);
        return StatusCode(500, "Failed to get your moderator requests.");
      }
    }
    [HttpPost("/Moderator/GetModeratorRequests", Name = "GetModeratorRequests")]
    public async Task<IActionResult> GetModeratorRequests(
      [FromBody] GetModeratorRequestsRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      bool isAdmin = request.CallerUserId == 1 || await IsAdminAsync(request.CallerUserId);
      bool isGlobalMod = await IsGlobalModeratorAsync(request.CallerUserId);
      if (!isAdmin && !isGlobalMod && !request.IsChatModeratorView)
        return Unauthorized("Only moderators can view moderator requests.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql;
        MySqlCommand cmd;
        if (isAdmin || isGlobalMod)
        {
          sql = @"SELECT mr.id, mr.chat_id, mr.topic_id, mr.user_id, mr.request_text, mr.created_at,
                 u.username, cr.name AS chat_name, t.topic AS topic_name
               FROM maxhanna.moderator_request mr
               LEFT JOIN maxhanna.users u ON u.id = mr.user_id
               LEFT JOIN maxhanna.chat_rooms cr ON cr.chat_id = mr.chat_id
               LEFT JOIN maxhanna.topics t ON t.id = mr.topic_id
               WHERE mr.resolved_at IS NULL
               ORDER BY mr.created_at DESC;";
          cmd = new MySqlCommand(sql, conn);
        }
        else
        {
          sql = @"SELECT mr.id, mr.chat_id, mr.topic_id, mr.user_id, mr.request_text, mr.created_at,
                 u.username, cr.name AS chat_name, t.topic AS topic_name
               FROM maxhanna.moderator_request mr
               LEFT JOIN maxhanna.users u ON u.id = mr.user_id
               LEFT JOIN maxhanna.chat_rooms cr ON cr.chat_id = mr.chat_id
               LEFT JOIN maxhanna.topics t ON t.id = mr.topic_id
               JOIN maxhanna.moderator_roles mine ON mine.target_type = 'chat' AND mine.target_id = mr.chat_id
                 AND mine.user_id = @CallerUserId AND mine.role = 'chat_moderator'
               WHERE mr.resolved_at IS NULL AND mr.chat_id > 0
               ORDER BY mr.created_at DESC;";
          cmd = new MySqlCommand(sql, conn);
          cmd.Parameters.AddWithValue("@CallerUserId", request.CallerUserId);
        }
        var list = new List<object>();
        using (var reader = await cmd.ExecuteReaderAsync())
          while (await reader.ReadAsync())
          {
            list.Add(new
            {
              id = reader.GetInt32("id"),
              chatId = reader.GetInt32("chat_id"),
              topicId = reader.IsDBNull(reader.GetOrdinal("topic_id")) ? (int?)null : reader.GetInt32("topic_id"),
              userId = reader.GetInt32("user_id"),
              username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username"),
              chatName = reader.IsDBNull(reader.GetOrdinal("chat_name")) ? null : reader.GetString("chat_name"),
              topicName = reader.IsDBNull(reader.GetOrdinal("topic_name")) ? null : reader.GetString("topic_name"),
              requestText = reader.IsDBNull(reader.GetOrdinal("request_text")) ? null : reader.GetString("request_text"),
              createdAt = reader.GetDateTime("created_at")
            });
          }
        return Ok(list);
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in GetModeratorRequests: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to get moderator requests.");
      }
    }
    [HttpPost("/Moderator/ResolveModeratorRequest", Name = "ResolveModeratorRequest")]
    public async Task<IActionResult> ResolveModeratorRequest(
      [FromBody] ResolveModeratorRequestRequest request,
      [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
    {
      if (request == null || request.RequestId <= 0 || request.CallerUserId <= 0) return BadRequest("Invalid request.");
      if (!await _log.ValidateUserLoggedIn(request.CallerUserId, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
      string resolution = (request.Resolution ?? "").ToLowerInvariant();
      if (resolution != "approved" && resolution != "denied") return BadRequest("Invalid resolution.");
      string connStr = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
      try
      {
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string getSql = @"SELECT mr.chat_id, mr.topic_id, mr.user_id,
               cr.name AS chat_name, t.topic AS topic_name
             FROM maxhanna.moderator_request mr
             LEFT JOIN maxhanna.chat_rooms cr ON cr.chat_id = mr.chat_id
             LEFT JOIN maxhanna.topics t ON t.id = mr.topic_id
             WHERE mr.id = @RequestId AND mr.resolved_at IS NULL;";
        int chatId = 0;
        int topicId = 0;
        int requesterId = 0;
        string chatName = "";
        string topicName = "";
        using (var getCmd = new MySqlCommand(getSql, conn))
        {
          getCmd.Parameters.AddWithValue("@RequestId", request.RequestId);
          using var reader = await getCmd.ExecuteReaderAsync();
          if (await reader.ReadAsync())
          {
            chatId = reader.GetInt32("chat_id");
            topicId = reader.IsDBNull(reader.GetOrdinal("topic_id")) ? 0 : reader.GetInt32("topic_id");
            requesterId = reader.GetInt32("user_id");
            chatName = reader.IsDBNull(reader.GetOrdinal("chat_name")) ? "" : reader.GetString("chat_name");
            topicName = reader.IsDBNull(reader.GetOrdinal("topic_name")) ? "" : reader.GetString("topic_name");
          }
        }
        if (chatId <= 0 && topicId <= 0) return NotFound("Request not found.");
        bool isAdmin = request.CallerUserId == 1 || await IsAdminAsync(request.CallerUserId);
        bool isGlobalMod = await IsGlobalModeratorAsync(request.CallerUserId);
        if (topicId > 0)
        {
          if (!isAdmin && !isGlobalMod && !await IsTopicModeratorForTopicAsync(_config, request.CallerUserId, topicId))
            return Unauthorized("Only that topic's moderators can resolve requests.");
        }
        else if (!isAdmin && !isGlobalMod && !await IsChatModeratorAsync(_config, request.CallerUserId, chatId))
        {
          return Unauthorized("Only that chat room's moderators can resolve requests.");
        }
        if (resolution == "approved")
        {
          if (topicId > 0)
          {
            string upsertSql = @"INSERT INTO maxhanna.moderator_roles (user_id, role, target_type, target_id, assigned_by, assigned_at)
              VALUES (@UserId, 'topic_moderator', 'topic', @TopicId, @AssignedBy, UTC_TIMESTAMP())
              ON DUPLICATE KEY UPDATE assigned_by = @AssignedBy, assigned_at = UTC_TIMESTAMP();";
            using var upsCmd = new MySqlCommand(upsertSql, conn);
            upsCmd.Parameters.AddWithValue("@UserId", requesterId);
            upsCmd.Parameters.AddWithValue("@TopicId", topicId);
            upsCmd.Parameters.AddWithValue("@AssignedBy", request.CallerUserId);
            await upsCmd.ExecuteNonQueryAsync();
          }
          else
          {
            string upsertSql = @"INSERT INTO maxhanna.moderator_roles (user_id, role, target_type, target_id, assigned_by, assigned_at)
              VALUES (@UserId, 'chat_moderator', 'chat', @ChatId, @AssignedBy, UTC_TIMESTAMP())
              ON DUPLICATE KEY UPDATE assigned_by = @AssignedBy, assigned_at = UTC_TIMESTAMP();";
            using var upsCmd = new MySqlCommand(upsertSql, conn);
            upsCmd.Parameters.AddWithValue("@UserId", requesterId);
            upsCmd.Parameters.AddWithValue("@ChatId", chatId);
            upsCmd.Parameters.AddWithValue("@AssignedBy", request.CallerUserId);
            await upsCmd.ExecuteNonQueryAsync();
          }
        }
        string resolveSql = "UPDATE maxhanna.moderator_request SET resolved_at = UTC_TIMESTAMP(), resolved_by = @By, resolution = @Resolution WHERE id = @RequestId AND resolved_at IS NULL;";
        using var resolveCmd = new MySqlCommand(resolveSql, conn);
        resolveCmd.Parameters.AddWithValue("@By", request.CallerUserId);
        resolveCmd.Parameters.AddWithValue("@Resolution", resolution);
        resolveCmd.Parameters.AddWithValue("@RequestId", request.RequestId);
        int resolvedRows = await resolveCmd.ExecuteNonQueryAsync();
        if (resolvedRows > 0 && requesterId > 0)
        {
          string scopeName = topicId > 0 ? topicName : chatName;
          if (string.IsNullOrWhiteSpace(scopeName))
            scopeName = topicId > 0 ? $"topic #{topicId}" : $"chat #{chatId}";
          string notifText = resolution == "approved"
            ? $"✅ Your moderator request for {scopeName} was approved — you're now a moderator!"
            : $"Your moderator request for {scopeName} was denied.";
          string notifSql = "INSERT INTO maxhanna.notifications (user_id, from_user_id, text, date, is_read, route) VALUES (@UserId, @FromUserId, @Text, UTC_TIMESTAMP(), 0, @Route);";
          using var notifCmd = new MySqlCommand(notifSql, conn);
          notifCmd.Parameters.AddWithValue("@UserId", requesterId);
          notifCmd.Parameters.AddWithValue("@FromUserId", request.CallerUserId);
          notifCmd.Parameters.AddWithValue("@Text", notifText);
          notifCmd.Parameters.AddWithValue("@Route", "myappeals");
          await notifCmd.ExecuteNonQueryAsync();
          // Mirror the story-post push pattern so the applicant gets a push even when the app is closed.
          await SendModeratorRequestPushAsync(requesterId, request.CallerUserId, scopeName, resolution, topicId, chatId);
        }
        _ = _log.Db($"Moderator {request.CallerUserId} resolved moderator request {request.RequestId} as '{resolution}' for chat #{chatId}", request.CallerUserId, "MODERATOR", true);
        return Ok(new { message = resolution == "approved" ? "Request approved — user is now a chat moderator." : "Request denied." });
      }
      catch (Exception ex)
      {
        _ = _log.Db("Error in ResolveModeratorRequest: " + ex.Message, request.CallerUserId, "MODERATOR", true);
        return StatusCode(500, "Failed to resolve moderator request.");
      }
    }
    /// <summary>
    /// Notifies the relevant moderators (global admins/moderators plus the scope's own
    /// topic/chat moderators, excluding the requester) that a new moderator request
    /// was submitted, so appeals get acted on faster.
    /// </summary>
    private async Task NotifyModeratorsOfNewRequestAsync(MySqlConnection conn, int requesterId, int topicId, int chatId)
    {
      try
      {
        string scopeName = "";
        if (topicId > 0)
        {
          string nameSql = "SELECT topic FROM maxhanna.topics WHERE id = @TopicId LIMIT 1;";
          using var nameCmd = new MySqlCommand(nameSql, conn);
          nameCmd.Parameters.AddWithValue("@TopicId", topicId);
          var name = await nameCmd.ExecuteScalarAsync();
          scopeName = name == null || name == DBNull.Value ? $"topic #{topicId}" : name.ToString()!;
        }
        else
        {
          string nameSql = "SELECT name FROM maxhanna.chat_rooms WHERE chat_id = @ChatId LIMIT 1;";
          using var nameCmd = new MySqlCommand(nameSql, conn);
          nameCmd.Parameters.AddWithValue("@ChatId", chatId);
          var name = await nameCmd.ExecuteScalarAsync();
          scopeName = name == null || name == DBNull.Value ? $"chat #{chatId}" : name.ToString()!;
        }
        string sql = @"SELECT DISTINCT user_id FROM (
            SELECT user_id FROM maxhanna.moderator_roles WHERE role = 'admin' AND target_type = 'global'
            UNION ALL
            SELECT user_id FROM maxhanna.user_roles WHERE role = 'moderator'
            UNION ALL
            SELECT user_id FROM maxhanna.moderator_roles WHERE role = 'moderator' AND target_type = 'global'";
        if (topicId > 0)
          sql += @"
            UNION ALL
            SELECT user_id FROM maxhanna.moderator_roles WHERE role = 'topic_moderator' AND target_type = 'topic' AND target_id = @ScopeId";
        else
          sql += @"
            UNION ALL
            SELECT user_id FROM maxhanna.moderator_roles WHERE role = 'chat_moderator' AND target_type = 'chat' AND target_id = @ScopeId";
        sql += ") t WHERE user_id <> @RequesterId;";
        using var listCmd = new MySqlCommand(sql, conn);
        listCmd.Parameters.AddWithValue("@ScopeId", topicId > 0 ? topicId : chatId);
        listCmd.Parameters.AddWithValue("@RequesterId", requesterId);
        string notifText = $"📨 New moderator request for {scopeName} — review it in the moderator panel.";
        using var reader = await listCmd.ExecuteReaderAsync();
        var targets = new List<int>();
        while (await reader.ReadAsync())
          targets.Add(reader.GetInt32("user_id"));
        reader.Close();
        string insertSql = "INSERT INTO maxhanna.notifications (user_id, from_user_id, text, date, is_read, route) VALUES (@UserId, @FromUserId, @Text, UTC_TIMESTAMP(), 0, @Route);";
        foreach (int targetId in targets)
        {
          using var notifCmd = new MySqlCommand(insertSql, conn);
          notifCmd.Parameters.AddWithValue("@UserId", targetId);
          notifCmd.Parameters.AddWithValue("@FromUserId", requesterId);
          notifCmd.Parameters.AddWithValue("@Text", notifText);
          notifCmd.Parameters.AddWithValue("@Route", "myappeals");
          await notifCmd.ExecuteNonQueryAsync();
          await SendModeratorRequestPushAsync(targetId, requesterId, scopeName, "new", topicId, chatId);
        }
      }
      catch { /* notification is best-effort — the request itself already succeeded */ }
    }

    /// <summary>
    /// Sends a Firebase push to <paramref name="userId"/>'s notification{userId} topic using the
    /// same pattern as story posts (type in the Data payload), so moderator-request outcomes
    /// reach the user even when the app is closed. Best-effort: never fails the caller.
    /// </summary>
    private async Task SendModeratorRequestPushAsync(int userId, int fromUserId, string scopeName, string resolution, int topicId, int chatId)
    {
      try
      {
        string body = resolution == "new"
          ? $"📨 New moderator request for {scopeName} — review it in the moderator panel."
          : resolution == "approved"
            ? $"✅ Your moderator request for {scopeName} was approved — you're now a moderator!"
            : $"Your moderator request for {scopeName} was denied.";
        var message = new Message()
        {
          Notification = new FirebaseAdmin.Messaging.Notification()
          {
            Title = resolution == "new" ? "New moderator request" : "Moderator request update",
            Body = body,
            ImageUrl = "https://www.bughosted.com/assets/logo.jpg"
          },
          Data = new Dictionary<string, string>
          {
            { "url", "https://bughosted.com" },
            { "type", "moderator_request" },
            { "fromUserId", fromUserId.ToString() },
            { "topicId", topicId.ToString() },
            { "chatId", chatId.ToString() },
            { "resolution", resolution }
          },
          Topic = $"notification{userId}"
        };
        await FirebaseMessaging.DefaultInstance.SendAsync(message);
      }
      catch (Exception ex)
      {
        _ = _log.Db("An error occurred while sending Firebase push for moderator request. " + ex.Message, userId, "MODERATOR", true);
      }
    }
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
    public static async Task<bool> IsTopicModeratorForTopicAsync(IConfiguration config, int userId, int topicId)
    {
      if (userId == 1) return true;
      try
      {
        string connStr = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        using var conn = new MySqlConnection(connStr);
        await conn.OpenAsync();
        string sql = "SELECT COUNT(*) FROM maxhanna.moderator_roles WHERE user_id = @UserId AND role = 'topic_moderator' AND target_type = 'topic' AND target_id = @TopicId;";
        using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@UserId", userId);
        cmd.Parameters.AddWithValue("@TopicId", topicId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
      }
      catch { return false; }
    }
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
  public class GetWeaverFeedbackRequest
  {
    public int CallerUserId { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
  }
  public class DeleteWeaverFeedbackRequest
  {
    public int Id { get; set; }
    public int CallerUserId { get; set; }
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
  public class ModeratorRequestRequest
  {
    public int UserId { get; set; }
    public int ChatId { get; set; }
    public int? TopicId { get; set; }
    public string? RequestText { get; set; }
  }
  public class GetModeratorsForRequest
  {
    public int CallerUserId { get; set; }
    public int TopicId { get; set; }
  }
  public class GetModeratorRequestsRequest
  {
    public int CallerUserId { get; set; }
    public bool IsChatModeratorView { get; set; }
  }
  public class ResolveModeratorRequestRequest
  {
    public int RequestId { get; set; }
    public int CallerUserId { get; set; }
    public string? Resolution { get; set; }
  }
}
