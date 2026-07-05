using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.UserEvents;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class UserEventController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly Log _log;

        public UserEventController(IConfiguration config, Log log)
        {
            _config = config;
            _log = log;
        }

        private async Task<MySqlConnection> GetDbConnectionAsync()
        {
            var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            return conn;
        }

        [HttpGet(Name = "GetUserEvents")]
        public async Task<IActionResult> GetUserEvents([FromQuery] int limit = 50, [FromQuery] int offset = 0, [FromQuery] string? eventTypes = null)
        {
            try
            {
                string eventTypeFilter = "";
                if (!string.IsNullOrWhiteSpace(eventTypes))
                {
                    var types = eventTypes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    if (types.Length > 0)
                    {
                        var quoted = types.Select(t => $"'{t.Replace("'", "''")}'");
                        eventTypeFilter = " AND ue.event_type IN (" + string.Join(",", quoted) + ")";
                    }
                }

                using (var selectConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await selectConn.OpenAsync();
                    string sql = $@"
                        SELECT 
                            ue.id, ue.user_id, ue.event_type, ue.event_text, ue.reference_id, ue.reference_type, ue.created_at
                        FROM maxhanna.user_events ue
                        WHERE ue.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)
                        {eventTypeFilter}
                        ORDER BY ue.created_at DESC
                        LIMIT @Limit OFFSET @Offset;";

                    using (var cmd = new MySqlCommand(sql, selectConn))
                    {
                        cmd.Parameters.AddWithValue("@Limit", limit);
                        cmd.Parameters.AddWithValue("@Offset", offset);
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            var events = new List<UserEvent>();
                            while (await reader.ReadAsync())
                            {
                                var userEvent = new UserEvent
                                {
                                    Id = reader.GetInt32("id"),
                                    UserId = reader.GetInt32("user_id"),
                                    EventType = reader.GetString("event_type"),
                                    EventText = reader.GetString("event_text"),
                                    ReferenceId = reader.IsDBNull(reader.GetOrdinal("reference_id")) ? null : reader.GetInt32("reference_id"),
                                    ReferenceType = reader.IsDBNull(reader.GetOrdinal("reference_type")) ? null : reader.GetString("reference_type"),
                                    CreatedAt = reader.GetDateTime("created_at")
                                };

                                events.Add(userEvent);
                            }
                            
                            using (var countConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                            {
                                await countConn.OpenAsync();
                                string countSql = $@"SELECT COUNT(*) FROM maxhanna.user_events ue WHERE ue.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) {eventTypeFilter};";
                                using (var countCmd = new MySqlCommand(countSql, countConn))
                                {
                                    int totalCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                                    Response.Headers.Append("X-Total-Count", totalCount.ToString());
                                }
                            }
                            
                            return Ok(events);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error fetching user events: " + ex.Message, null, "USEREVENT", true);
                return StatusCode(500, "An error occurred while fetching user events.");
            }
        }

        [HttpPost("/UserEvent/Insert", Name = "InsertUserEvent")]
        public async Task<IActionResult> InsertUserEvent([FromBody] UserEventsRequest request)
        {
            if (request.UserId == 0 || string.IsNullOrEmpty(request.EventType) || string.IsNullOrEmpty(request.EventText))
                return BadRequest("UserId, EventType, and EventText are required.");

            try
            {
                using var conn = await GetDbConnectionAsync();

                // Check for recent duplicate events
                string duplicateCheckSql = "SELECT COUNT(*) FROM maxhanna.user_events WHERE user_id = @UserId AND event_type = @EventType AND event_text = @EventText AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND);";
                using var duplicateCmd = new MySqlCommand(duplicateCheckSql, conn);
                duplicateCmd.Parameters.AddWithValue("@UserId", request.UserId);
                duplicateCmd.Parameters.AddWithValue("@EventType", request.EventType);
                duplicateCmd.Parameters.AddWithValue("@EventText", request.EventText);
                
                int duplicateCount = Convert.ToInt32(await duplicateCmd.ExecuteScalarAsync());
                if (duplicateCount > 0)
                {
                    return Ok(false); // Duplicate event found, don't insert
                }

                string sql = @"
            INSERT INTO maxhanna.user_events 
                (user_id, event_type, event_text, reference_id, reference_type, created_at)
            VALUES
                (@UserId, @EventType, @EventText, @ReferenceId, @ReferenceType, UTC_TIMESTAMP());
        ";

                using var cmd = new MySqlCommand(sql, conn);

                cmd.Parameters.AddWithValue("@UserId", request.UserId);
                cmd.Parameters.AddWithValue("@EventType", request.EventType);
                cmd.Parameters.AddWithValue("@EventText", request.EventText);
                cmd.Parameters.AddWithValue("@ReferenceId", request.ReferenceId ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@ReferenceType", request.ReferenceType ?? (object)DBNull.Value);

                int affected = await cmd.ExecuteNonQueryAsync();

                return Ok(affected > 0);
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error inserting user event: " + ex.Message, request.UserId, "USEREVENT", true);
                return StatusCode(500, "An error occurred while inserting user event.");
            }
        }

        public static async Task InsertUserEventStatic(
            int userId,
            string eventType,
            string eventText,
            int? referenceId,
            string? referenceType,
            IConfiguration config,
            Log log)
        {
            try
            {
                using var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Check for recent duplicate events
                string duplicateCheckSql = "SELECT COUNT(*) FROM maxhanna.user_events WHERE user_id = @UserId AND event_type = @EventType AND event_text = @EventText AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND);";
                using var duplicateCmd = new MySqlCommand(duplicateCheckSql, conn);
                duplicateCmd.Parameters.AddWithValue("@UserId", userId);
                duplicateCmd.Parameters.AddWithValue("@EventType", eventType);
                duplicateCmd.Parameters.AddWithValue("@EventText", eventText); 
                
                int duplicateCount = Convert.ToInt32(await duplicateCmd.ExecuteScalarAsync());
                if (duplicateCount > 0)
                {
                    return; // Duplicate event found, don't insert
                }

                string sql = @"
            INSERT INTO maxhanna.user_events 
                (user_id, event_type, event_text, reference_id, reference_type, created_at)
            VALUES
                (@UserId, @EventType, @EventText, @ReferenceId, @ReferenceType, UTC_TIMESTAMP());
        ";

                using var cmd = new MySqlCommand(sql, conn);

                cmd.Parameters.AddWithValue("@UserId", userId);
                cmd.Parameters.AddWithValue("@EventType", eventType);
                cmd.Parameters.AddWithValue("@EventText", eventText);
                cmd.Parameters.AddWithValue("@ReferenceId", referenceId ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@ReferenceType", referenceType ?? (object)DBNull.Value);

                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _ = log.Db("Error inserting user event (static): " + ex.Message, userId, "USEREVENT", true);
            }
        }


        public static async Task InsertUserEventWithConnection(
       int userId,
       string eventType,
       string eventText,
       int? referenceId,
       string? referenceType,
       MySqlConnection conn,
       MySqlTransaction? transaction = null)
        {
            try
            {

                // Check for recent duplicate events
                string duplicateCheckSql = "SELECT COUNT(*) FROM maxhanna.user_events WHERE user_id = @UserId AND event_type = @EventType AND event_text = @EventText AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND);";
                using var duplicateCmd = new MySqlCommand(duplicateCheckSql, conn);
                duplicateCmd.Parameters.AddWithValue("@UserId", userId);
                duplicateCmd.Parameters.AddWithValue("@EventType", eventType);
                duplicateCmd.Parameters.AddWithValue("@EventText", eventText); 

                int duplicateCount = Convert.ToInt32(await duplicateCmd.ExecuteScalarAsync());
                if (duplicateCount > 0)
                {
                    return; // Duplicate event found, don't insert
                }

                string sql = @"
            INSERT INTO maxhanna.user_events 
                (user_id, event_type, event_text, reference_id, reference_type, created_at)
            VALUES
                (@UserId, @EventType, @EventText, @ReferenceId, @ReferenceType, UTC_TIMESTAMP());
        ";

                using var cmd = new MySqlCommand(sql, conn);
                if (transaction != null)
                    cmd.Transaction = transaction;

                cmd.Parameters.AddWithValue("@UserId", userId);
                cmd.Parameters.AddWithValue("@EventType", eventType);
                cmd.Parameters.AddWithValue("@EventText", eventText);
                cmd.Parameters.AddWithValue("@ReferenceId", referenceId ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@ReferenceType", referenceType ?? (object)DBNull.Value);

                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Error inserting user event (with connection): " + ex.Message);
            }
        }


        [HttpGet("eventtypes", Name = "GetUserEventTypes")]
        public async Task<IActionResult> GetUserEventTypes()
        {
            try
            {
                using (var conn = await GetDbConnectionAsync())
                {
                    string sql = @"
                        SELECT DISTINCT event_type 
                        FROM maxhanna.user_events 
                        WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
                        ORDER BY event_type";

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            var eventTypes = new List<string>();
                            while (await reader.ReadAsync())
                            {
                                eventTypes.Add(reader.GetString("event_type"));
                            }
                            return Ok(eventTypes);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error fetching user event types: " + ex.Message, null, "USEREVENT", true);
                return StatusCode(500, "An error occurred while fetching user event types.");
            }
        }

        [HttpGet("preferences/{userId}", Name = "GetUserEventPreferences")]
        public async Task<IActionResult> GetUserEventPreferences(int userId)
        {
            try
            {
                using (var conn = await GetDbConnectionAsync())
                {
                    string sql = @"
                        SELECT id, user_id, event_type, is_enabled 
                        FROM maxhanna.user_event_preferences 
                        WHERE user_id = @UserId";

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", userId);
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            var preferences = new List<UserEventPreference>();
                            while (await reader.ReadAsync())
                            {
                                preferences.Add(new UserEventPreference
                                {
                                    Id = reader.GetInt32("id"),
                                    UserId = reader.GetInt32("user_id"),
                                    EventType = reader.GetString("event_type"),
                                    IsEnabled = reader.GetBoolean("is_enabled")
                                });
                            }
                            return Ok(preferences);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error fetching user event preferences: " + ex.Message, null, "USEREVENT", true);
                return StatusCode(500, "An error occurred while fetching user event preferences.");
            }
        }

        [HttpPost("preferences", Name = "SaveUserEventPreferences")]
        public async Task<IActionResult> SaveUserEventPreferences([FromBody] List<UserEventPreference> preferences)
        {
            if (preferences == null || preferences.Count == 0)
                return BadRequest("Preferences are required.");

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    using (var transaction = conn.BeginTransaction())
                    {
                        try
                        {
                            // First, delete all existing preferences for these users
                            string deleteSql = "DELETE FROM maxhanna.user_event_preferences WHERE user_id = @UserId";
                            using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
                            {
                                deleteCmd.Parameters.AddWithValue("@UserId", preferences[0].UserId);
                                await deleteCmd.ExecuteNonQueryAsync();
                            }

                            // Then insert all new preferences
                            string insertSql = @"
                                INSERT INTO maxhanna.user_event_preferences (user_id, event_type, is_enabled)
                                VALUES (@UserId, @EventType, @IsEnabled)";

                            using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
                            {
                                insertCmd.Parameters.Add("@UserId", MySqlDbType.Int32);
                                insertCmd.Parameters.Add("@EventType", MySqlDbType.VarChar);
                                insertCmd.Parameters.Add("@IsEnabled", MySqlDbType.Bool);

                                foreach (var pref in preferences)
                                {
                                    insertCmd.Parameters["@UserId"].Value = pref.UserId;
                                    insertCmd.Parameters["@EventType"].Value = pref.EventType;
                                    insertCmd.Parameters["@IsEnabled"].Value = pref.IsEnabled;
                                    await insertCmd.ExecuteNonQueryAsync();
                                }
                            }

                            await transaction.CommitAsync();
                            return Ok("Preferences saved successfully.");
                        }
                        catch (Exception ex)
                        {
                            await transaction.RollbackAsync();
                            _ = _log.Db("Error saving user event preferences: " + ex.Message, null, "USEREVENT", true);
                            return StatusCode(500, "An error occurred while saving user event preferences.");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error saving user event preferences: " + ex.Message, null, "USEREVENT", true);
                return StatusCode(500, "An error occurred while saving user event preferences.");
            }
        }
    }
}
