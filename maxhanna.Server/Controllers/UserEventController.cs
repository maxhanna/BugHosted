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

        [HttpGet(Name = "GetUserEvents")]
        public async Task<IActionResult> GetUserEvents([FromQuery] int limit = 50)
        {
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    string sql = @"
                        SELECT 
                            ue.id, ue.user_id, ue.username, ue.event_type, ue.event_text, ue.reference_id, ue.reference_type, ue.created_at,
                            u.id as user_id_from_users, u.username as user_username, u.created, u.last_seen,
                            ua.description as about_description, ua.birthday as about_birthday, ua.phone as about_phone, ua.email as about_email, ua.website as about_website, ua.currency as about_currency, ua.is_email_public as about_is_email_public,
                            udp.file_id as display_picture_file_id, udp.tag_background_file_id as profile_background_picture_file_id,
                            dpf.file_name as display_picture_file_name, dpf.given_file_name as display_picture_given_file_name,
                            dpf.description as display_picture_description, dpf.folder_path as display_picture_directory, dpf.visibility as display_picture_visibility,
                            dpf.shared_with as display_picture_shared_with, dpf.last_updated_user_id as display_picture_last_updated_user_id,
                            dpf.date as display_picture_date, dpf.last_updated as display_picture_last_updated, dpf.file_type as display_picture_file_type,
                            dpf.file_size as display_picture_file_size, dpf.height as display_picture_height, dpf.width as display_picture_width,
                            dpf.duration as display_picture_duration, dpf.last_access as display_picture_last_access, dpf.access_count as display_picture_access_count,
                            dpf.favourite_count as display_picture_favourite_count, dpf.is_favourited as display_picture_is_favourited,
                            dpf.average_rating as display_picture_average_rating, dpf.rating_count as display_picture_rating_count,
                            dpf.is_duplicate as display_picture_is_duplicate, dpf.notes_count as display_picture_notes_count,
                            pbpf.file_name as profile_background_picture_file_name, pbpf.given_file_name as profile_background_picture_given_file_name, pbpf.description as profile_background_picture_description,
                            pbpf.folder_path as profile_background_picture_directory, pbpf.visibility as profile_background_picture_visibility,
                            pbpf.shared_with as profile_background_picture_shared_with, pbpf.last_updated_user_id as profile_background_picture_last_updated_user_id,
                            pbpf.date as profile_background_picture_date, pbpf.last_updated as profile_background_picture_last_updated,
                            pbpf.file_type as profile_background_picture_file_type, pbpf.file_size as profile_background_picture_file_size,
                            pbpf.height as profile_background_picture_height, pbpf.width as profile_background_picture_width,
                            pbpf.duration as profile_background_picture_duration, pbpf.last_access as profile_background_picture_last_access,
                            pbpf.access_count as profile_background_picture_access_count, pbpf.favourite_count as profile_background_picture_favourite_count,
                            pbpf.is_favourited as profile_background_picture_is_favourited, pbpf.average_rating as profile_background_picture_average_rating,
                            pbpf.rating_count as profile_background_picture_rating_count, pbpf.is_duplicate as profile_background_picture_is_duplicate,
                            pbpf.notes_count as profile_background_picture_notes_count
                        FROM maxhanna.user_events ue
                        LEFT JOIN maxhanna.users u ON ue.user_id = u.id
                        LEFT JOIN maxhanna.user_about ua ON u.id = ua.user_id
                        LEFT JOIN maxhanna.user_display_pictures udp ON u.id = udp.user_id
                        LEFT JOIN maxhanna.file_uploads dpf ON udp.file_id = dpf.id
                        LEFT JOIN maxhanna.file_uploads pbpf ON udp.tag_background_file_id = pbpf.id
                        WHERE ue.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)
                        ORDER BY ue.created_at DESC
                        LIMIT @Limit;";

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Limit", limit);
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            var events = new List<UserEvent>();
                            while (await reader.ReadAsync())
                            {
                                var userEvent = new UserEvent
                                {
                                    Id = reader.GetInt32("id"),
                                    UserId = reader.GetInt32("user_id"),
                                    Username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username"),
                                    EventType = reader.GetString("event_type"),
                                    EventText = reader.GetString("event_text"),
                                    ReferenceId = reader.IsDBNull(reader.GetOrdinal("reference_id")) ? null : reader.GetInt32("reference_id"),
                                    ReferenceType = reader.IsDBNull(reader.GetOrdinal("reference_type")) ? null : reader.GetString("reference_type"),
                                    CreatedAt = reader.GetDateTime("created_at")
                                };

                                // Populate User object if user data exists
                                if (!reader.IsDBNull(reader.GetOrdinal("user_id_from_users")))
                                {
                                    userEvent.User = new User
                                    {
                                        Id = reader.GetInt32("user_id_from_users"),
                                        Username = reader.IsDBNull(reader.GetOrdinal("user_username")) ? null : reader.GetString("user_username"),
                                        Created = reader.IsDBNull(reader.GetOrdinal("created")) ? null : reader.GetDateTime("created"),
                                        LastSeen = reader.IsDBNull(reader.GetOrdinal("last_seen")) ? null : reader.GetDateTime("last_seen"),
                                        DisplayPictureFile = reader.IsDBNull(reader.GetOrdinal("display_picture_file_id")) ? null : new FileEntry
                                        {
                                            Id = reader.GetInt32("display_picture_file_id"),
                                            FileName = reader.IsDBNull(reader.GetOrdinal("display_picture_file_name")) ? null : reader.GetString("display_picture_file_name"),
                                            GivenFileName = reader.IsDBNull(reader.GetOrdinal("display_picture_given_file_name")) ? null : reader.GetString("display_picture_given_file_name"),
                                            Description = reader.IsDBNull(reader.GetOrdinal("display_picture_description")) ? null : reader.GetString("display_picture_description"),
                                            Directory = reader.IsDBNull(reader.GetOrdinal("display_picture_directory")) ? null : reader.GetString("display_picture_directory"),
                                            Visibility = reader.IsDBNull(reader.GetOrdinal("display_picture_visibility")) ? null : reader.GetString("display_picture_visibility"),
                                            SharedWith = reader.IsDBNull(reader.GetOrdinal("display_picture_shared_with")) ? null : reader.GetString("display_picture_shared_with"),
                                            LastUpdatedUserId = reader.IsDBNull(reader.GetOrdinal("display_picture_last_updated_user_id")) ? 0 : reader.GetInt32("display_picture_last_updated_user_id"),
                                            Date = reader.IsDBNull(reader.GetOrdinal("display_picture_date")) ? DateTime.MinValue : reader.GetDateTime("display_picture_date"),
                                            LastUpdated = reader.IsDBNull(reader.GetOrdinal("display_picture_last_updated")) ? null : reader.GetDateTime("display_picture_last_updated"),
                                            FileType = reader.IsDBNull(reader.GetOrdinal("display_picture_file_type")) ? null : reader.GetString("display_picture_file_type"),
                                            FileSize = reader.IsDBNull(reader.GetOrdinal("display_picture_file_size")) ? 0 : reader.GetInt32("display_picture_file_size"),
                                            Height = reader.IsDBNull(reader.GetOrdinal("display_picture_height")) ? null : reader.GetInt32("display_picture_height"),
                                            Width = reader.IsDBNull(reader.GetOrdinal("display_picture_width")) ? null : reader.GetInt32("display_picture_width"),
                                            Duration = reader.IsDBNull(reader.GetOrdinal("display_picture_duration")) ? null : reader.GetInt32("display_picture_duration"),
                                            LastAccess = reader.IsDBNull(reader.GetOrdinal("display_picture_last_access")) ? null : reader.GetDateTime("display_picture_last_access"),
                                            AccessCount = reader.IsDBNull(reader.GetOrdinal("display_picture_access_count")) ? 0 : reader.GetInt32("display_picture_access_count"),
                                            FavouriteCount = reader.IsDBNull(reader.GetOrdinal("display_picture_favourite_count")) ? 0 : reader.GetInt32("display_picture_favourite_count"),
                                            IsFavourited = reader.IsDBNull(reader.GetOrdinal("display_picture_is_favourited")) ? false : reader.GetBoolean("display_picture_is_favourited"),
                                            AverageRating = reader.IsDBNull(reader.GetOrdinal("display_picture_average_rating")) ? 0.0 : reader.GetDouble("display_picture_average_rating"),
                                            RatingCount = reader.IsDBNull(reader.GetOrdinal("display_picture_rating_count")) ? 0 : reader.GetInt32("display_picture_rating_count"),
                                            IsDuplicate = reader.IsDBNull(reader.GetOrdinal("display_picture_is_duplicate")) ? false : reader.GetBoolean("display_picture_is_duplicate"),
                                            NotesCount = reader.IsDBNull(reader.GetOrdinal("display_picture_notes_count")) ? 0 : reader.GetInt32("display_picture_notes_count")
                                        },
                                        ProfileBackgroundPictureFile = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_file_id")) ? null : new FileEntry
                                        {
                                            Id = reader.GetInt32("profile_background_picture_file_id"),
                                            FileName = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_file_name")) ? null : reader.GetString("profile_background_picture_file_name"),
                                            GivenFileName = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_given_file_name")) ? null : reader.GetString("profile_background_picture_given_file_name"),
                                            Description = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_description")) ? null : reader.GetString("profile_background_picture_description"),
                                            Directory = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_directory")) ? null : reader.GetString("profile_background_picture_directory"),
                                            Visibility = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_visibility")) ? null : reader.GetString("profile_background_picture_visibility"),
                                            SharedWith = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_shared_with")) ? null : reader.GetString("profile_background_picture_shared_with"),
                                            LastUpdatedUserId = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_last_updated_user_id")) ? 0 : reader.GetInt32("profile_background_picture_last_updated_user_id"),
                                            Date = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_date")) ? DateTime.MinValue : reader.GetDateTime("profile_background_picture_date"),
                                            LastUpdated = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_last_updated")) ? null : reader.GetDateTime("profile_background_picture_last_updated"),
                                            FileType = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_file_type")) ? null : reader.GetString("profile_background_picture_file_type"),
                                            FileSize = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_file_size")) ? 0 : reader.GetInt32("profile_background_picture_file_size"),
                                            Height = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_height")) ? null : reader.GetInt32("profile_background_picture_height"),
                                            Width = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_width")) ? null : reader.GetInt32("profile_background_picture_width"),
                                            Duration = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_duration")) ? null : reader.GetInt32("profile_background_picture_duration"),
                                            LastAccess = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_last_access")) ? null : reader.GetDateTime("profile_background_picture_last_access"),
                                            AccessCount = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_access_count")) ? 0 : reader.GetInt32("profile_background_picture_access_count"),
                                            FavouriteCount = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_favourite_count")) ? 0 : reader.GetInt32("profile_background_picture_favourite_count"),
                                            IsFavourited = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_is_favourited")) ? false : reader.GetBoolean("profile_background_picture_is_favourited"),
                                            AverageRating = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_average_rating")) ? 0.0 : reader.GetDouble("profile_background_picture_average_rating"),
                                            RatingCount = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_rating_count")) ? 0 : reader.GetInt32("profile_background_picture_rating_count"),
                                            IsDuplicate = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_is_duplicate")) ? false : reader.GetBoolean("profile_background_picture_is_duplicate"),
                                            NotesCount = reader.IsDBNull(reader.GetOrdinal("profile_background_picture_notes_count")) ? 0 : reader.GetInt32("profile_background_picture_notes_count")
                                        },
                                        About = reader.IsDBNull(reader.GetOrdinal("about_description")) ? null : new UserAbout
                                        {
                                            UserId = reader.GetInt32("user_id_from_users"),
                                            Description = reader.IsDBNull(reader.GetOrdinal("about_description")) ? null : reader.GetString("about_description"),
                                            Birthday = reader.IsDBNull(reader.GetOrdinal("about_birthday")) ? null : reader.GetDateTime("about_birthday"),
                                            Phone = reader.IsDBNull(reader.GetOrdinal("about_phone")) ? null : reader.GetString("about_phone"),
                                            Email = reader.IsDBNull(reader.GetOrdinal("about_email")) ? null : reader.GetString("about_email"),
                                            Website = reader.IsDBNull(reader.GetOrdinal("about_website")) ? null : reader.GetString("about_website"),
                                            Currency = reader.IsDBNull(reader.GetOrdinal("about_currency")) ? null : reader.GetString("about_currency"),
                                            IsEmailPublic = reader.IsDBNull(reader.GetOrdinal("about_is_email_public")) ? false : reader.GetBoolean("about_is_email_public")
                                        }
                                    };
                                }

                                events.Add(userEvent);
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
                        Console.WriteLine($"Attempted to insert user event for user {request.UserId} with event type '{request.EventType}'. Rows affected: {affected}");
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
                        Console.WriteLine($"Inserted user event for user {userId} with event type '{eventType}'"); 
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
                    Console.WriteLine($"Inserted user event for user {userId} with event type '{eventType}'");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Error inserting user event (with connection): " + ex.Message);
            }
        }
    }
}
