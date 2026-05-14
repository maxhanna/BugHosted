using maxhanna.Server.Controllers.DataContracts.UserEvents;
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

        [HttpGet(Name = "GetUserEvents")]
        public async Task<IActionResult> GetUserEvents([FromQuery] int limit = 50)
        {
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    string sql = @"
                        SELECT id, user_id, username, event_type, event_text, reference_id, reference_type, created_at
                        FROM maxhanna.user_events
                        WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)
                        ORDER BY created_at DESC
                        LIMIT @Limit;";

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Limit", limit);
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            var events = new List<UserEvent>();
                            while (await reader.ReadAsync())
                            {
                                events.Add(new UserEvent
                                {
                                    Id = reader.GetInt32("id"),
                                    UserId = reader.GetInt32("user_id"),
                                    Username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username"),
                                    EventType = reader.GetString("event_type"),
                                    EventText = reader.GetString("event_text"),
                                    ReferenceId = reader.IsDBNull(reader.GetOrdinal("reference_id")) ? null : reader.GetInt32("reference_id"),
                                    ReferenceType = reader.IsDBNull(reader.GetOrdinal("reference_type")) ? null : reader.GetString("reference_type"),
                                    CreatedAt = reader.GetDateTime("created_at")
                                });
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
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    string sql = @"
                        INSERT INTO maxhanna.user_events (user_id, username, event_type, event_text, reference_id, reference_type, created_at)
                        SELECT @UserId, @Username, @EventType, @EventText, @ReferenceId, @ReferenceType, UTC_TIMESTAMP()
                        FROM DUAL
                        WHERE NOT EXISTS (
                            SELECT 1 FROM maxhanna.user_events
                            WHERE user_id = @UserId
                              AND event_type = @EventType
                              AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND)
                        );";

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", request.UserId);
                        cmd.Parameters.AddWithValue("@Username", request.Username ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@EventType", request.EventType);
                        cmd.Parameters.AddWithValue("@EventText", request.EventText);
                        cmd.Parameters.AddWithValue("@ReferenceId", request.ReferenceId ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@ReferenceType", request.ReferenceType ?? (object)DBNull.Value);
                        var affected = await cmd.ExecuteNonQueryAsync();
                        return Ok(affected > 0);
                    }
                }
 
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error inserting user event: " + ex.Message, request.UserId, "USEREVENT", true);
                return StatusCode(500, "An error occurred while inserting user event.");
            }
        }

        public static async Task InsertUserEventStatic(int userId, string? username, string eventType, string eventText, int? referenceId, string? referenceType, IConfiguration config, Log log)
        {
            try
            {
                using (var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    string sql = @"
                        INSERT INTO maxhanna.user_events (user_id, username, event_type, event_text, reference_id, reference_type, created_at)
                        SELECT @UserId, @Username, @EventType, @EventText, @ReferenceId, @ReferenceType, UTC_TIMESTAMP()
                        FROM DUAL
                        WHERE NOT EXISTS (
                            SELECT 1 FROM maxhanna.user_events
                            WHERE user_id = @UserId
                              AND event_type = @EventType
                              AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND)
                        );";

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@UserId", userId);
                        cmd.Parameters.AddWithValue("@Username", username ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@EventType", eventType);
                        cmd.Parameters.AddWithValue("@EventText", eventText);
                        cmd.Parameters.AddWithValue("@ReferenceId", referenceId ?? (object)DBNull.Value);
                        cmd.Parameters.AddWithValue("@ReferenceType", referenceType ?? (object)DBNull.Value);
                        await cmd.ExecuteNonQueryAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                _ = log.Db("Error inserting user event (static): " + ex.Message, userId, "USEREVENT", true);
            }
        }

        public static async Task InsertUserEventWithConnection(int userId, string? username, string eventType, string eventText, int? referenceId, string? referenceType, MySqlConnection conn, MySqlTransaction? transaction = null)
        {
            try
            {
                string sql = @"
                    INSERT INTO maxhanna.user_events (user_id, username, event_type, event_text, reference_id, reference_type, created_at)
                    SELECT @UserId, @Username, @EventType, @EventText, @ReferenceId, @ReferenceType, UTC_TIMESTAMP()
                    FROM DUAL
                    WHERE NOT EXISTS (
                        SELECT 1 FROM maxhanna.user_events
                        WHERE user_id = @UserId
                            AND event_type = @EventType
                            AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND)
                    );";

                using (var cmd = new MySqlCommand(sql, conn))
                {
                    if (transaction != null) { cmd.Transaction = transaction; }
                        
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    cmd.Parameters.AddWithValue("@Username", username ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@EventType", eventType);
                    cmd.Parameters.AddWithValue("@EventText", eventText);
                    cmd.Parameters.AddWithValue("@ReferenceId", referenceId ?? (object)DBNull.Value);
                    cmd.Parameters.AddWithValue("@ReferenceType", referenceType ?? (object)DBNull.Value);
                    await cmd.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error inserting user event (with connection): " + ex.Message);
            }
        }
    }
}
