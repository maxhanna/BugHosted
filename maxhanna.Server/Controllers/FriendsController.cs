using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class FriendController : ControllerBase
    {
        private readonly ILogger<FriendController> _logger;
        private readonly IConfiguration _config;

        public FriendController(ILogger<FriendController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Friend", Name = "GetFriends")]
        public async Task<IActionResult> GetFriends([FromBody] User user)
        {
            try
            {
                _logger.LogInformation($"POST /Friends (user: {user.Id})");

                // Define the SQL query to retrieve friends of the given user
                string query = @"
                    SELECT u.id, u.username
                    FROM users u
                    INNER JOIN friends f ON u.id = f.friend_id
                    WHERE f.user_id = @userId
                    UNION
                    SELECT u.id, u.username
                    FROM users u
                    INNER JOIN friends f ON u.id = f.user_id
                    WHERE f.friend_id = @userId
                ";

                // Execute the SQL query using a database connection
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();

                    var command = new MySqlCommand(query, connection);
                    command.Parameters.AddWithValue("@userId", user.Id);

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        // Process the results and build a list of friends
                        var friends = new List<User>();
                        while (reader.Read())
                        {
                            var friend = new User
                            {
                                Id = reader.GetInt32("id"),
                                Username = reader.GetString("username")
                            };
                            friends.Add(friend);
                        }

                        return Ok(friends);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching friends.");
                return StatusCode(500, "An error occurred while fetching friends.");
            }
        }

        [HttpPost("/Friend/Requests", Name = "GetFriendRequests")]
        public async Task<IActionResult> GetFriendRequests([FromBody] User user)
        {
            try
            {
                _logger.LogInformation($"POST /Friend/Requests (user: {user.Id})");

                // Define the SQL query to retrieve friendship requests for the given user
                string query = @"
                    SELECT fr.id, fr.status, fr.created_at, fr.updated_at,
                           sender.id AS sender_id, sender.username AS sender_username,
                           receiver.id AS receiver_id, receiver.username AS receiver_username
                    FROM friend_requests fr
                    INNER JOIN users sender ON fr.sender_id = sender.id
                    INNER JOIN users receiver ON fr.receiver_id = receiver.id
                    WHERE fr.receiver_id = @userId OR fr.sender_id = @userId;
                ";

                // Execute the SQL query using a database connection
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();

                    var command = new MySqlCommand(query, connection);
                    command.Parameters.AddWithValue("@userId", user.Id);

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        // Process the results and build a list of friend requests
                        var friendRequests = new List<FriendRequest>();
                        while (reader.Read())
                        {
                            var friendRequest = new FriendRequest
                            {
                                Id = reader.GetInt32("id"),
                                Status = Enum.Parse<FriendRequestStatus>(reader.GetString("status"), true),
                                CreatedAt = reader.GetDateTime("created_at"),
                                UpdatedAt = reader.GetDateTime("updated_at"),
                                Sender = new User
                                {
                                    Id = reader.GetInt32("sender_id"),
                                    Username = reader.GetString("sender_username")
                                },
                                Receiver = new User
                                {
                                    Id = reader.GetInt32("receiver_id"),
                                    Username = reader.GetString("receiver_username")
                                }
                            };
                            friendRequests.Add(friendRequest);
                        }

                        return Ok(friendRequests);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching friend requests.");
                return StatusCode(500, "An error occurred while fetching friend requests.");
            }
        }

        [HttpPost("/Friend/Request", Name = "SendFriendRequest")]
        public async Task<IActionResult> SendFriendRequest([FromBody] FriendshipRequest request)
        {
            if (request.Sender == null || request.Receiver == null)
            {
                return BadRequest("Invalid friendship request.");
            }
            try
            {
                _logger.LogInformation($"POST /Friend/Request (sender: {request.Sender.Id}, receiver: {request.Receiver.Id})");

                // Validate the request
                if (request.Sender.Id == request.Receiver.Id)
                {
                    return BadRequest("You cannot send a friend request to yourself.");
                }

                string checkQuery = @"
                    SELECT id 
                    FROM friend_requests 
                    WHERE (sender_id = @senderId AND receiver_id = @receiverId) 
                       OR (sender_id = @receiverId AND receiver_id = @senderId)";

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var checkCommand = new MySqlCommand(checkQuery, connection);
                    checkCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
                    checkCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
                    object? result = await checkCommand.ExecuteScalarAsync();

                    if (result != null)
                    {
                        // Update the existing friend request
                        int requestId = Convert.ToInt32(result);
                        string updateQuery = "UPDATE friend_requests SET status = @status, updated_at = NOW() WHERE id = @requestId";
                        var updateCommand = new MySqlCommand(updateQuery, connection);
                        updateCommand.Parameters.AddWithValue("@status", "Pending");
                        updateCommand.Parameters.AddWithValue("@requestId", requestId);
                        await updateCommand.ExecuteNonQueryAsync();
                    }
                    else
                    {
                        // Insert a new friend request
                        string insertQuery = "INSERT INTO friend_requests (sender_id, receiver_id, status, created_at, updated_at) VALUES (@senderId, @receiverId, @status, NOW(), NOW())";
                        var insertCommand = new MySqlCommand(insertQuery, connection);
                        insertCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
                        insertCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
                        insertCommand.Parameters.AddWithValue("@status", "Pending");
                        await insertCommand.ExecuteNonQueryAsync();
                    }
                }

                return Ok("Friend request sent successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while sending friend request.");
                return StatusCode(500, "An error occurred while sending friend request.");
            }
        }


        [HttpPost("/Friend/Request/Accept", Name = "AcceptFriendRequest")]
        public async Task<IActionResult> AcceptFriendRequest([FromBody] FriendshipRequest request)
        {
            if (request.Sender == null || request.Receiver == null)
            {
                return BadRequest("Invalid friendship request.");
            }

            try
            {
                _logger.LogInformation($"POST /Friend/Request/Accept (sender: {request.Sender.Id}, receiver: {request.Receiver.Id})");

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    // Check if the friendship request exists and is pending
                    string checkRequestQuery = "SELECT id FROM friend_requests WHERE sender_id = @senderId AND receiver_id = @receiverId AND status = 'Pending'";
                    using (var checkRequestCommand = new MySqlCommand(checkRequestQuery, connection))
                    {
                        checkRequestCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
                        checkRequestCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
                        object? result = await checkRequestCommand.ExecuteScalarAsync();
                        if (result == null)
                        {
                            return BadRequest("No pending friend request found from this user.");
                        }

                        int requestId = Convert.ToInt32(result);

                        // Check if the friendship already exists in either direction
                        string checkFriendQuery = @"
                            SELECT COUNT(*) FROM friends 
                            WHERE (user_id = @userId AND friend_id = @friendId) 
                               OR (user_id = @friendId AND friend_id = @userId)";
                        using (var checkFriendCommand = new MySqlCommand(checkFriendQuery, connection))
                        {
                            checkFriendCommand.Parameters.AddWithValue("@userId", request.Sender.Id);
                            checkFriendCommand.Parameters.AddWithValue("@friendId", request.Receiver.Id);
                            int friendCount = Convert.ToInt32(await checkFriendCommand.ExecuteScalarAsync());
                            if (friendCount > 0)
                            {
                                return BadRequest("You are already friends with this user.");
                            }
                        }

                        // Update the status of the friendship request to accepted
                        string updateRequestQuery = "UPDATE friend_requests SET status = 'Accepted', updated_at = NOW() WHERE id = @requestId";
                        using (var updateRequestCommand = new MySqlCommand(updateRequestQuery, connection))
                        {
                            updateRequestCommand.Parameters.AddWithValue("@requestId", requestId);
                            await updateRequestCommand.ExecuteNonQueryAsync();
                        }

                        // Add a new entry in the friends table for the accepted friendship
                        string insertFriendQuery = "INSERT INTO friends (user_id, friend_id) VALUES (@userId, @friendId), (@friendId, @userId)";
                        using (var insertFriendCommand = new MySqlCommand(insertFriendQuery, connection))
                        {
                            insertFriendCommand.Parameters.AddWithValue("@userId", request.Sender.Id);
                            insertFriendCommand.Parameters.AddWithValue("@friendId", request.Receiver.Id);
                            await insertFriendCommand.ExecuteNonQueryAsync();
                        }
                    }
                }

                return Ok("Friend request accepted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while accepting the friend request.");
                return StatusCode(500, "An error occurred while accepting the friend request.");
            }
        }

        [HttpPost("/Friend/Remove", Name = "RemoveFriend")]
        public async Task<IActionResult> RemoveFriend([FromBody] FriendshipRequest request)
        {
            if (request.Sender == null || request.Receiver == null)
            {
                return BadRequest("You must designate a sender and receiver");
            }
            _logger.LogInformation($"POST /Friend/Remove (sender: {request.Sender.Id}, receiver: {request.Receiver.Id})");

            try
            {
                _logger.LogInformation($"POST /Friend/Remove (sender: {request.Sender.Id}, receiver: {request.Receiver.Id})");

                // Delete the friendship from the database
                string deleteQuery = "DELETE FROM friends WHERE (user_id = @userId AND friend_id = @friendId) OR (user_id = @friendId AND friend_id = @userId)";
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();
                    var deleteCommand = new MySqlCommand(deleteQuery, connection);
                    deleteCommand.Parameters.AddWithValue("@userId", request.Sender.Id);
                    deleteCommand.Parameters.AddWithValue("@friendId", request.Receiver.Id);
                    await deleteCommand.ExecuteNonQueryAsync();
                }

                return Ok("Friend removed successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while removing friend.");
                return StatusCode(500, "An error occurred while removing friend.");
            }
        }

        [HttpPost("/Friend/Request/Reject", Name = "RejectFriendRequest")]
        public async Task<IActionResult> RejectFriendRequest([FromBody] FriendshipRequest request)
        {
            if (request.Sender == null || request.Receiver == null)
            {
                return BadRequest("You must designate a sender and receiver");
            }
            try
            {
                _logger.LogInformation($"POST /Friend/Request/Reject (sender: {request.Sender.Id}, receiver: {request.Receiver.Id})");

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    // Check if the user is rejecting their own pending friend request
                    string checkOwnRequestQuery = @"
                        SELECT COUNT(*) 
                        FROM friend_requests 
                        WHERE sender_id = @senderId AND receiver_id = @receiverId AND status = 'pending'";
                    var checkCommand = new MySqlCommand(checkOwnRequestQuery, connection);
                    checkCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
                    checkCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
                    int count = Convert.ToInt32(await checkCommand.ExecuteScalarAsync());

                    if (count > 0)
                    {
                        // If the sender is rejecting their own pending friend request, delete it
                        string deleteQuery = @"
                            DELETE FROM friend_requests 
                            WHERE sender_id = @senderId AND receiver_id = @receiverId AND status = 'pending'";
                        var deleteCommand = new MySqlCommand(deleteQuery, connection);
                        deleteCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
                        deleteCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
                        await deleteCommand.ExecuteNonQueryAsync();
                        return Ok("Your pending friend request has been deleted successfully.");
                    }
                    else
                    {
                        // Update the status of the friendship request to "rejected" if it is currently "pending"
                        string updateQuery = @"
                            UPDATE friend_requests 
                            SET status = 'rejected', updated_at = NOW() 
                            WHERE sender_id = @receiverId AND receiver_id = @senderId AND status = 'pending'";
                        var updateCommand = new MySqlCommand(updateQuery, connection);
                        updateCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
                        updateCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
                        int rowsAffected = await updateCommand.ExecuteNonQueryAsync();
                        if (rowsAffected == 0)
                        {
                            return BadRequest("No pending friend request found to reject.");
                        }
                        return Ok("Friendship request rejected successfully.");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while rejecting friend request.");
                return StatusCode(500, "An error occurred while rejecting friend request.");
            }
        }


    }
}
