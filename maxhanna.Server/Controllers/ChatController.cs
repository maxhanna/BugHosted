using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using maxhanna.Server.Controllers.DataContracts;
using static maxhanna.Server.Controllers.ChatController;

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
            _logger.LogInformation($"POST /Chat/GetMessageHistory for users: {request.user1.Id} and {request.user2.Id}");
            List<Message> messages = new List<Message>();

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = @"
                    SELECT 
                        m.*, 
                        su.id AS sender_id, su.username AS sender_username,
                        ru.id AS receiver_id, ru.username AS receiver_username
                    FROM 
                        maxhanna.messages m
                    JOIN 
                        maxhanna.users su ON m.sender = su.id
                    JOIN 
                        maxhanna.users ru ON m.receiver = ru.id
                    WHERE 
                        (m.sender = @User1Id AND m.receiver = @User2Id) OR 
                        (m.sender = @User2Id AND m.receiver = @User1Id)
                    ORDER BY 
                        m.timestamp ASC";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@User1Id", request.user1.Id);
                cmd.Parameters.AddWithValue("@User2Id", request.user2.Id);


                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (reader.Read())
                    {
                        var sender = new User
                        (
                            Convert.ToInt32(reader["sender_id"]),
                            reader["sender_username"].ToString()!
                        );

                        var receiver = new User
                        (
                            Convert.ToInt32(reader["receiver_id"]),
                            reader["receiver_username"].ToString()!
                        );

                        messages.Add(new Message
                        {
                            Id = Convert.ToInt32(reader["id"]),
                            Sender = sender,
                            Receiver = receiver,
                            Content = reader["content"].ToString()!,
                            Timestamp = Convert.ToDateTime(reader["timestamp"])
                        });
                    }
                } 
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request for message history.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                conn.Close();
            }



            try
            {
                conn.Open();

                string sql = @"
                    UPDATE
                        maxhanna.messages
                    SET 
                        seen = 1 
                    WHERE 
                        (receiver = @userId AND sender = @user2Id)";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@userId", request.user1.Id);
                cmd.Parameters.AddWithValue("@user2Id", request.user2.Id);

                await cmd.ExecuteReaderAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the POST request for message history.");
            }
            finally
            {
                conn.Close();
            }

            if (messages.Count > 0)
            {
                return Ok(messages);
            }
            else
            {
                return NotFound();
            }
        }

        [HttpPost("/Chat/SendMessage", Name = "SendMessage")]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
        {
            _logger.LogInformation($"POST /Chat/SendMessage from user: {request.Sender!.Id} to user: {request.Receiver!.Id}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                conn.Open();

                string sql = "INSERT INTO maxhanna.messages (sender, receiver, content) VALUES (@Sender, @Receiver, @Content)";

                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@Sender", request.Sender!.Id);
                cmd.Parameters.AddWithValue("@Receiver", request.Receiver.Id);
                cmd.Parameters.AddWithValue("@Content", request.Content);

                int rowsAffected = await cmd.ExecuteNonQueryAsync();

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
            public User? Receiver { get; set; }
            public string? Content { get; set; }
        }
        public class Notification
        {
            public int SenderId { get; set; }
            public int Count { get; set; }
        }
    }
}
