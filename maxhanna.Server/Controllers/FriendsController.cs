using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Friends;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;

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
                    SELECT 
                        u.id, 
                        u.username, 
                        dp.file_id AS display_picture_file_id
                    FROM 
                        users u
                    INNER JOIN 
                        friends f 
                    ON 
                        u.id = f.friend_id
                    LEFT JOIN 
                        user_display_pictures dp 
                    ON 
                        u.id = dp.user_id
                    WHERE 
                        f.user_id = @userId

                    UNION

                    SELECT 
                        u.id, 
                        u.username, 
                        dp.file_id AS display_picture_file_id
                    FROM 
                        users u
                    INNER JOIN 
                        friends f 
                    ON 
                        u.id = f.user_id
                    LEFT JOIN 
                        user_display_pictures dp 
                    ON 
                        u.id = dp.user_id
                    WHERE 
                        f.friend_id = @userId;";

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
								Username = reader.GetString("username"),
								DisplayPictureFile = new DataContracts.Files.FileEntry(reader.GetInt32("display_picture_file_id"))
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
            SELECT 
                fr.id, 
                fr.status, 
                fr.created_at,
                fr.updated_at,
                sender.id AS sender_id, 
                sender.username AS sender_username,
                sudp.file_id AS sender_display_picture,
                receiver.id AS receiver_id, 
                receiver.username AS receiver_username,
                rudp.file_id AS receiver_display_picture
            FROM friend_requests fr
            INNER JOIN users sender ON fr.sender_id = sender.id
            LEFT JOIN user_display_pictures sudp ON sudp.user_id = sender.id 
            INNER JOIN users receiver ON fr.receiver_id = receiver.id
            LEFT JOIN user_display_pictures rudp ON rudp.user_id = receiver.id 
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
									Username = reader.GetString("sender_username"),
									DisplayPictureFile = reader.IsDBNull("sender_display_picture")
													? null
													: new FileEntry(reader.GetInt32("sender_display_picture")),
								},
								Receiver = new User
								{
									Id = reader.GetInt32("receiver_id"),
									Username = reader.GetString("receiver_username"),
									DisplayPictureFile = reader.IsDBNull("receiver_display_picture")
													? null
													: new FileEntry(reader.GetInt32("receiver_display_picture")),
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
						await AddFriend(request.Sender, request.Receiver, connection);
						return Ok("Friend request was already received by this user. Added user as a friend.");
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

					string notificationSql =
					@"INSERT INTO maxhanna.notifications
                        (user_id, from_user_id, user_profile_id, text)
                    VALUES
                        (@receiverId, @senderId, @senderId, 'Friend request');";

					using (var cmd = new MySqlCommand(notificationSql, connection))
					{
						cmd.Parameters.AddWithValue("@senderId", request.Sender.Id);
						cmd.Parameters.AddWithValue("@receiverId", request.Receiver.Id);

						await cmd.ExecuteNonQueryAsync();
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
					await AddFriend(request.Sender, request.Receiver, connection);
				}
				return Ok("Friend request accepted successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while accepting the friend request.");
				return StatusCode(500, "An error occurred while accepting the friend request.");
			}
		}

		[HttpPost("/Friend/Request/Delete", Name = "DeleteFriendRequest")]
		public async Task<IActionResult> DeleteFriendRequest([FromBody] FriendshipRequest request)
		{
			if (request == null || request.Sender == null || request.Receiver == null)
			{
				return BadRequest("Invalid friendship request.");
			}

			try
			{
				_logger.LogInformation($"POST /Friend/Request/DeleteFriendRequest (sender: {request.Sender.Id}, receiver: {request.Receiver.Id})");

				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					await DeleteFriendRequestFromDB(request, connection);
				}
				return Ok("Friend request deleted successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while accepting the friend request.");
				return StatusCode(500, "An error occurred while accepting the friend request.");
			}
		}

		private async Task AddFriend(User sender, User receiver, MySqlConnection connection)
		{

			// Check if the friendship request exists and is pending
			string checkRequestQuery = "SELECT id FROM friend_requests WHERE (sender_id = @senderId AND receiver_id = @receiverId OR receiver_id = @senderId AND sender_id = @receiverId) AND (status = 'Pending' OR status = 'Deleted')";
			using (var checkRequestCommand = new MySqlCommand(checkRequestQuery, connection))
			{
				checkRequestCommand.Parameters.AddWithValue("@senderId", sender.Id);
				checkRequestCommand.Parameters.AddWithValue("@receiverId", receiver.Id);
				object? result = await checkRequestCommand.ExecuteScalarAsync();

				int requestId = Convert.ToInt32(result);
				// Update the status of the friendship request to accepted
				string updateRequestQuery = "UPDATE friend_requests SET status = 'Accepted', updated_at = NOW() WHERE id = @requestId";
				using (var updateRequestCommand = new MySqlCommand(updateRequestQuery, connection))
				{
					updateRequestCommand.Parameters.AddWithValue("@requestId", requestId);
					await updateRequestCommand.ExecuteNonQueryAsync();
				}

				int friendCount = 0;
				// Check if the friendship already exists in either direction
				string checkFriendQuery = @"
                            SELECT COUNT(*) FROM friends 
                            WHERE (user_id = @userId AND friend_id = @friendId) 
                               OR (user_id = @friendId AND friend_id = @userId)";
				using (var checkFriendCommand = new MySqlCommand(checkFriendQuery, connection))
				{
					checkFriendCommand.Parameters.AddWithValue("@userId", sender.Id);
					checkFriendCommand.Parameters.AddWithValue("@friendId", receiver.Id);
					friendCount = Convert.ToInt32(await checkFriendCommand.ExecuteScalarAsync());

				}

				if (friendCount == 0)
				{
					// Add a new entry in the friends table for the accepted friendship
					string insertFriendQuery = "INSERT INTO friends (user_id, friend_id) VALUES (@userId, @friendId), (@friendId, @userId)";
					using (var insertFriendCommand = new MySqlCommand(insertFriendQuery, connection))
					{
						insertFriendCommand.Parameters.AddWithValue("@userId", sender.Id);
						insertFriendCommand.Parameters.AddWithValue("@friendId", receiver.Id);
						await insertFriendCommand.ExecuteNonQueryAsync();
					}

					string notificationSql =
					@"INSERT INTO maxhanna.notifications
                        (user_id, from_user_id, user_profile_id, text)
                    VALUES
                        (@friendId, @userId, @userId, 'Friend request accepted.');";

					using (var cmd = new MySqlCommand(notificationSql, connection))
					{
						cmd.Parameters.AddWithValue("@userId", sender.Id);
						cmd.Parameters.AddWithValue("@friendId", receiver.Id);
						await cmd.ExecuteNonQueryAsync();
					}
				}
			}
		}
		private async Task DeleteFriendRequestFromDB(FriendshipRequest request, MySqlConnection connection)
		{
			if (request.Sender == null || request.Receiver == null) return;

			string query = @"
          DELETE FROM 
            maxhanna.friend_requests 
          WHERE 
            (sender_id = @senderId AND receiver_id = @receiverId)
            OR 
            (receiver_id = @senderId AND sender_id = @receiverId)
          LIMIT 2;";
			using (var checkRequestCommand = new MySqlCommand(query, connection))
			{
				checkRequestCommand.Parameters.AddWithValue("@senderId", request.Sender.Id);
				checkRequestCommand.Parameters.AddWithValue("@receiverId", request.Receiver.Id);
				await checkRequestCommand.ExecuteScalarAsync();
			}
		}

		[HttpPost("/Friend/Remove", Name = "RemoveFriend")]
		public async Task<IActionResult> RemoveFriend([FromBody] RemoveFriendRequest request)
		{
			if (request.User == null || request.Friend == null)
			{
				return BadRequest("You must designate a sender and receiver");
			}
			_logger.LogInformation($"POST /Friend/Remove (sender: {request.User.Id}, receiver: {request.Friend.Id})");

			try
			{
				_logger.LogInformation($"POST /Friend/Remove (sender: {request.User.Id}, receiver: {request.Friend.Id})");

				// Delete the friendship from the database
				string deleteQuery = @"
					DELETE FROM maxhanna.friends 
					WHERE 
						(user_id = @userId AND friend_id = @friendId) 
						OR (user_id = @friendId AND friend_id = @userId);

					UPDATE maxhanna.friend_requests 
					SET status = 'deleted', updated_at = NOW()
					WHERE sender_id = @friendId AND receiver_id = @userId OR receiver_id = @friendId AND sender_id = @userId
					LIMIT 2;";
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					connection.Open();
					var deleteCommand = new MySqlCommand(deleteQuery, connection);
					deleteCommand.Parameters.AddWithValue("@userId", request.User.Id);
					deleteCommand.Parameters.AddWithValue("@friendId", request.Friend.Id);
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
