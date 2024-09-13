using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Chat;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Files;
using System.Reflection;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly ILogger<ChatController> _logger;
        private readonly IConfiguration _config;

        public ChatController(ILogger<ChatController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Chat/Notifications", Name = "GetChatNotifications")]
        public async Task<IActionResult> GetChatNotifications([FromBody] User user)
        {
            _logger.LogInformation($"POST /Chat/Notifications for user: {user.Id}");
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        COUNT(*) as count
                    FROM 
                        maxhanna.messages m
                    WHERE 
                        (m.receiver = @userId) 
                        AND 
                        (m.seen = 0)";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@userId", user.Id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (reader.Read())
                    {
                        return Ok(Convert.ToInt32(reader["count"]));
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request for message history.");
            }
            finally
            {
                conn.Close();
            }
            return StatusCode(500, "An error occurred while processing the request.");
        }

        [HttpPost("/Chat/NotificationsByUser", Name = "GetChatNotificationsByUser")]
        public async Task<IActionResult> GetChatNotificationsByUser([FromBody] User user)
        {
            _logger.LogInformation($"POST /Chat/NotificationsByUser for user: {user.Id}");
            List<Notification> notifications = new List<Notification>();

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        m.sender,
                        COUNT(*) as count
                    FROM 
                        maxhanna.messages m
                    WHERE 
                        m.receiver = @userId
                        AND 
                        m.seen = 0
                    GROUP BY 
                        m.sender";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@userId", user.Id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        int senderId = Convert.ToInt32(reader["sender"]);
                        int count = Convert.ToInt32(reader["count"]);

                        if (count > 0)
                        {
                            notifications.Add(new Notification { SenderId = senderId, Count = count });
                        }
                    }
                    if (notifications.Count > 0)
                    {
                        return Ok(notifications);
                    }
                    else
                    {
                        return NoContent();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request for message notifications.");
            }
            finally
            {
                await conn.CloseAsync();
            }
            return StatusCode(500, "An error occurred while processing the request.");
        }

        [HttpPost("/Chat/GetMessageHistory", Name = "GetMessageHistory")]
        public async Task<IActionResult> GetMessageHistory([FromBody] MessageHistoryRequest request)
        {
            string user2Ids = (request.user2?.Length > 1)
                ? string.Join(",", request.user2.Select(u => u.Id))   
                : request.user2?.FirstOrDefault()?.Id.ToString() ?? "0";   

            int pageSize = request.PageSize.HasValue && request.PageSize > 0 ? request.PageSize.Value : 20;
            int pageNumber = request.PageNumber.HasValue && request.PageNumber > 0 ? request.PageNumber.Value : 1; // Default to the first page
            int totalRecords = 0;

            _logger.LogInformation($"POST /Chat/GetMessageHistory for users: {request.user1?.Id} and {user2Ids} pageNumber: {pageNumber} pageSize: {pageSize}");
            List<Message> messages = new List<Message>();

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    // Get the total number of messages
                    string countSql = @"
                    SELECT COUNT(*)
                    FROM maxhanna.messages m
                    WHERE (m.sender = @User1Id AND m.receiver = @User2Id) OR 
                            (m.sender = @User2Id AND m.receiver = @User1Id)";

                    MySqlCommand countCmd = new MySqlCommand(countSql, conn);
                    countCmd.Parameters.AddWithValue("@User1Id", request.user1?.Id ?? 0);
                    countCmd.Parameters.AddWithValue("@User2Id", user2Ids);
                    totalRecords = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

                    // Calculate total number of pages
                    int totalPages = (int)Math.Ceiling((double)totalRecords / pageSize);
                    if (pageNumber > totalPages) pageNumber = totalPages;

                    int offset = (pageNumber - 1) * pageSize;
                    _logger.LogInformation($"totalPages: {totalPages} offset: {offset} totalRecords: {totalRecords}");

                    string sql = @"
                        SELECT 
                            m.*, 
                            su.id AS sender_id, 
                            su.username AS sender_username,
                            sudpfu.id as senderPicId, 
                            sudpfu.folder_path as senderPicFolderPath,
                            sudpfu.file_name as senderPicFileName,
                            ru.id AS receiver_id, 
                            ru.username AS receiver_username, 
                            rudpfu.id as receiverPicId, 
                            rudpfu.folder_path as receiverPicFolderPath,
                            rudpfu.file_name as receiverPicFileName,
                            r.id AS reaction_id,
                            r.user_id AS reaction_user_id,
                            reactionuser.username AS reaction_username,
                            r.timestamp AS reaction_timestamp,
                            r.type, 
                            f.id as file_id,
                            f.file_name as file_name,
                            f.folder_path as folder_path
                        FROM 
                            maxhanna.messages m
                        JOIN 
                            maxhanna.users su ON m.sender = su.id
                        LEFT JOIN 
                            maxhanna.user_display_pictures sudp ON sudp.user_id = su.id
                        LEFT JOIN 
                            maxhanna.file_uploads sudpfu ON sudp.file_id = sudpfu.id
                        JOIN 
                            maxhanna.users AS ru ON m.receiver = ru.id
                        LEFT JOIN 
                            maxhanna.user_display_pictures AS rudp ON rudp.user_id = ru.id
                        LEFT JOIN 
                            maxhanna.file_uploads AS rudpfu ON rudp.file_id = rudpfu.id
                        LEFT JOIN 
                            maxhanna.reactions AS r ON m.id = r.message_id
                        LEFT JOIN 
                            maxhanna.users AS reactionuser ON reactionuser.id = r.user_id
                        LEFT JOIN
                            maxhanna.message_files mf ON m.id = mf.message_id
                        LEFT JOIN
                            maxhanna.file_uploads f ON mf.file_id = f.id
                        WHERE 
                            (m.sender = @User1Id AND m.receiver = @User2Id) OR 
                            (m.sender = @User2Id AND m.receiver = @User1Id)
                        ORDER BY 
                            m.timestamp DESC
                        LIMIT @PageSize OFFSET @PageOffset";

                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@User1Id", request.user1?.Id ?? 0);
                    cmd.Parameters.AddWithValue("@User2Id", request.user2?.First().Id ?? 0);
                    cmd.Parameters.AddWithValue("@PageSize", pageSize);
                    cmd.Parameters.AddWithValue("@PageOffset", offset);

                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        Dictionary<int, Message> messageMap = new Dictionary<int, Message>();

                        while (reader.Read())
                        {
                            int messageId = Convert.ToInt32(reader["id"]);

                            if (!messageMap.ContainsKey(messageId))
                            {
                                var senderDisplayPicture = new FileEntry
                                {
                                    Id = reader.IsDBNull(reader.GetOrdinal("senderPicId")) ? 0 : reader.GetInt32("senderPicId"),
                                    FileName = reader.IsDBNull(reader.GetOrdinal("senderPicFileName")) ? null : reader.GetString("senderPicFileName"),
                                    Directory = reader.IsDBNull(reader.GetOrdinal("senderPicFolderPath")) ? null : reader.GetString("senderPicFolderPath")
                                };

                                var sender = new User
                                (
                                    Convert.ToInt32(reader["sender_id"]),
                                    reader["sender_username"].ToString() ?? "Anonymous",
                                    null,
                                    senderDisplayPicture.Id == 0 ? null : senderDisplayPicture,
                                    null, null, null
                                );

                                var receiverDisplayPicture = new FileEntry
                                {
                                    Id = reader.IsDBNull(reader.GetOrdinal("receiverPicId")) ? 0 : reader.GetInt32("receiverPicId"),
                                    FileName = reader.IsDBNull(reader.GetOrdinal("receiverPicFileName")) ? null : reader.GetString("receiverPicFileName"),
                                    Directory = reader.IsDBNull(reader.GetOrdinal("receiverPicFolderPath")) ? null : reader.GetString("receiverPicFolderPath")
                                };

                                var receiver = new User
                                (
                                    Convert.ToInt32(reader["receiver_id"]),
                                    reader["receiver_username"].ToString() ?? "Anonymous",
                                    null,
                                    receiverDisplayPicture.Id == 0 ? null : receiverDisplayPicture,
                                    null, null, null
                                );

                                var message = new Message
                                {
                                    Id = messageId,
                                    Sender = sender,
                                    Receiver = [receiver],
                                    Content = reader["content"].ToString(),
                                    Timestamp = Convert.ToDateTime(reader["timestamp"]),
                                    Reactions = new List<Reaction>()
                                };

                                messageMap.Add(messageId, message);
                            }

                            // Check if reaction data is present and add to reactions list
                            if (!reader.IsDBNull(reader.GetOrdinal("reaction_id")))
                            {
                                var reaction = new Reaction
                                {
                                    Id = Convert.ToInt32(reader["reaction_id"]),
                                    User = new User(
                                        reader.IsDBNull(reader.GetOrdinal("reaction_user_id")) ? 0 : Convert.ToInt32(reader["reaction_user_id"]),
                                        reader.IsDBNull(reader.GetOrdinal("reaction_username")) ? "Anonymous" : reader.GetString("reaction_username")
                                    ),
                                    MessageId = messageId,
                                    Timestamp = Convert.ToDateTime(reader["reaction_timestamp"]),
                                    Type = reader["type"].ToString()
                                };
                                if (messageMap[messageId].Reactions == null)
                                {
                                    messageMap[messageId].Reactions = new List<Reaction>();
                                }
                                messageMap[messageId].Reactions!.Add(reaction);
                            }
                            // Check if file data is present and add to files list 
                            if (!reader.IsDBNull(reader.GetOrdinal("file_id")))
                            {
                                var file = new FileEntry
                                {
                                    Id = Convert.ToInt32(reader["file_id"]),
                                    FileName = reader["file_name"].ToString(),
                                    Directory = reader["folder_path"].ToString()
                                };

                                messageMap[messageId].Files.Add(file);
                            }
                        }

                        messages = messageMap.Values.ToList();
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while processing the POST request for message history.");
                    return StatusCode(500, "An error occurred while processing the request.");
                }
                finally
                {
                    await conn.CloseAsync();
                }

                try
                {
                    await conn.OpenAsync();

                    string updateSql = @"
                    UPDATE
                        maxhanna.messages
                    SET 
                        seen = 1 
                    WHERE 
                        (receiver = @User1Id AND sender = @User2Id)";

                    MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
                    updateCmd.Parameters.AddWithValue("@User1Id", request.user1?.Id ?? 0);
                    updateCmd.Parameters.AddWithValue("@User2Id", request.user2?.First().Id ?? 0);

                    await updateCmd.ExecuteNonQueryAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while updating message seen status.");
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }

            if (messages.Count > 0)
            {
                try
                {
                    var safeMessages = messages ?? new List<Message>();
                    int safePageNumber = pageNumber > 0 ? pageNumber : 1;
                    int safePageSize = pageSize > 0 ? pageSize : 10;
                    totalRecords = totalRecords > 0 ? totalRecords : 0;
                    int totalPages = (int)Math.Ceiling((double)totalRecords / safePageSize);
                    safePageNumber = safePageNumber > totalPages ? totalPages : safePageNumber;

                    var response = new
                    {
                        Messages = safeMessages,
                        CurrentPage = safePageNumber,
                        PageSize = safePageSize,
                        TotalPages = totalPages,
                        TotalRecords = totalRecords
                    };

                    return Ok(response);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(ex.ToString());
                    return StatusCode(500, "An error occurred while processing your chat request.");
                }
            }
            else
            {
                return NotFound();
            }
        }


        [HttpPost("/Chat/SendMessage", Name = "SendMessage")]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
        { 
            string receiverIds = (request.Receiver?.Length > 1)
                ? string.Join(",", request.Receiver.Select(u => u.Id))
                : request.Receiver?.FirstOrDefault()?.Id.ToString() ?? "0";

            _logger.LogInformation($"POST /Chat/SendMessage from user: {request.Sender?.Id} to user: {receiverIds} with {request.Files?.Count ?? 0} # of files");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "INSERT INTO maxhanna.messages (sender, receiver, content) VALUES (@Sender, @Receiver, @Content)";
                string checkSql = @"
                    SELECT COUNT(*) 
                    FROM maxhanna.notifications
                    WHERE user_id = @Receiver
                      AND from_user_id = @Sender
                      AND chat_user_id = @Receiver
                      AND date >= NOW() - INTERVAL 2 MINUTE;
                ";
                string updateNotificationSql = @"
                    UPDATE maxhanna.notifications
                    SET text = CONCAT(text, @Content)
                    WHERE user_id = @Receiver
                      AND from_user_id = @Sender
                      AND chat_user_id = @Receiver
                      AND date >= NOW() - INTERVAL 2 MINUTE;
                ";

                string insertNotificationSql = @"
                    INSERT INTO maxhanna.notifications
                        (user_id, from_user_id, chat_user_id, text)
                    VALUES
                        (@Receiver, @Sender, @Receiver, @Content);
                ";

                using (var checkCommand = new MySqlCommand(checkSql, conn))
                {
                    checkCommand.Parameters.AddWithValue("@Sender", request.Sender?.Id ?? 0);
                    checkCommand.Parameters.AddWithValue("@Receiver", receiverIds);
                    checkCommand.Parameters.AddWithValue("@Content", request.Content);

                    var count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync());

                    if (count > 0)
                    {
                        using (var updateCommand = new MySqlCommand(updateNotificationSql, conn))
                        {
                            updateCommand.Parameters.AddWithValue("@Sender", request.Sender?.Id ?? 0);
                            updateCommand.Parameters.AddWithValue("@Receiver", receiverIds);
                            updateCommand.Parameters.AddWithValue("@Content", request.Content);

                            await updateCommand.ExecuteNonQueryAsync();
                        }
                    }
                    else
                    {

                        using (var insertCommand = new MySqlCommand(insertNotificationSql, conn))
                        {
                            insertCommand.Parameters.AddWithValue("@Sender", request.Sender?.Id ?? 0);
                            insertCommand.Parameters.AddWithValue("@Receiver", receiverIds);
                            insertCommand.Parameters.AddWithValue("@Content", request.Content);

                            await insertCommand.ExecuteNonQueryAsync();
                        }
                    }
                }


                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Sender", request.Sender?.Id ?? 0);
                cmd.Parameters.AddWithValue("@Receiver", receiverIds);
                cmd.Parameters.AddWithValue("@Content", request.Content);

                int rowsAffected = await cmd.ExecuteNonQueryAsync();

                if (rowsAffected > 0)
                {
                    // Retrieve the last inserted ID
                    long insertedId = cmd.LastInsertedId;
                    if (insertedId != 0 && request.Files != null && request.Files.Count > 0)
                    {
                        for (var x = 0; x < request.Files.Count; x++)
                        {
                            sql = "INSERT INTO maxhanna.message_files (message_id, file_id) VALUES (@messageId, @fileId)";

                            MySqlCommand filecmd = new MySqlCommand(sql, conn);
                            filecmd.Parameters.AddWithValue("@messageId", insertedId);
                            filecmd.Parameters.AddWithValue("@fileId", request.Files[x].Id);
                            await filecmd.ExecuteNonQueryAsync();
                        }
                    }
                }


                if (rowsAffected > 0)
                {
                    return Ok(new { Message = "Message sent successfully." });
                }
                else
                {
                    return StatusCode(500, "An error occurred while sending the message.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request for sending a message.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }
        }

        public class SendMessageRequest
        {
            public User? Sender { get; set; }
            public User[]? Receiver { get; set; }
            public string? Content { get; set; }
            public List<FileEntry>? Files { get; set; }
        }
        public class Notification
        {
            public int SenderId { get; set; }
            public int Count { get; set; }
        }
    }
}
