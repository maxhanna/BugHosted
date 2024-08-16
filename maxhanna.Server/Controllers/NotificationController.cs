using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Wordler;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class NotificationController : ControllerBase
    {
        private readonly ILogger<NotificationController> _logger;
        private readonly IConfiguration _config;

        public NotificationController(ILogger<NotificationController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost(Name = "GetNotifications")]
        public async Task<IActionResult> GetNotifications(User user)
        {
            _logger.LogInformation($"POST /Notification for user {user.Id}"); 
            List<UserNotification> notifications = new List<UserNotification>();
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    // SQL query to get the word of the day
                    string sql = @"
                        SELECT n.*, u.username, udp.file_id as user_display_picture, su.username as from_user_name, sudp.file_id as sent_user_display_picture
                        FROM maxhanna.notifications n 
                        LEFT JOIN maxhanna.users u ON u.id = n.user_id
                        LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
                        LEFT JOIN maxhanna.users su on su.id = n.from_user_id
                        LEFT JOIN maxhanna.user_display_pictures sudp on sudp.user_id = n.from_user_id
                        WHERE n.user_id = @UserId
                    ";

                    using (var command = new MySqlCommand(sql, connection))
                    {

                        command.Parameters.AddWithValue("@UserId", user.Id);
                        
                        try
                        {
                            using (var reader = await command.ExecuteReaderAsync())
                            {
                                while (await reader.ReadAsync())
                                { 
                                    int? displayPicId = reader.IsDBNull(reader.GetOrdinal("user_display_picture")) ? null : reader.GetInt32("user_display_picture"); 
                                    FileEntry? dpFileEntry = displayPicId != null ? new FileEntry() { Id = (Int32)(displayPicId) } : null;
                                    User tUser = new User(reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id"), reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString("username"), null, dpFileEntry, null);

                                    int? sentDisplayPicId = reader.IsDBNull(reader.GetOrdinal("sent_user_display_picture")) ? null : reader.GetInt32("sent_user_display_picture"); 
                                    FileEntry? sentDpFileEntry = sentDisplayPicId != null ? new FileEntry() { Id = (Int32)(sentDisplayPicId) } : null;
                                    User sentUser = new User(reader.IsDBNull(reader.GetOrdinal("from_user_id")) ? 0 : reader.GetInt32("from_user_id"), reader.IsDBNull(reader.GetOrdinal("from_user_name")) ? "Anonymous" : reader.GetString("from_user_name"), null, sentDpFileEntry, null);

                                    var tmpNotification = new UserNotification
                                    {
                                        Id = reader.GetInt32("id"),
                                        Date = reader.GetDateTime("date"),
                                        User = tUser,
                                        FromUser = sentUser,
                                        FileId = reader.IsDBNull(reader.GetOrdinal("file_id")) ? null : reader.GetInt32("file_id"),
                                        StoryId = reader.IsDBNull(reader.GetOrdinal("story_id")) ? null : reader.GetInt32("story_id"),
                                        Text = reader.IsDBNull(reader.GetOrdinal("text")) ? null : reader.GetString("text"),
                                    };
                                    notifications.Add(tmpNotification);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Error retrieving notifications.");
                            return StatusCode(500, "An error occurred while retrieving the notifications.");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching the notifications.");
                return StatusCode(500, "An error occurred while fetching the notifications.");
            }
            return Ok(notifications);
        }
       
    }
}
