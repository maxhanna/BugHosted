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
		private readonly Log _log;
		private readonly IConfiguration _config;

		public FriendController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Friend", Name = "GetFriends")]
		public async Task<IActionResult> GetFriends([FromBody] int userId)
		{
			try
			{  
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
				 
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					connection.Open();

					var command = new MySqlCommand(query, connection);
					command.Parameters.AddWithValue("@userId", userId);

					using (var reader = await command.ExecuteReaderAsync())
					{ 
						var friends = new List<User>();
						while (reader.Read())
						{
							var friend = new User
							{
								Id = reader.GetInt32("id"),
								Username = reader.GetString("username"),
								DisplayPictureFile = reader.IsDBNull("display_picture_file_id") ? null : new FileEntry(reader.GetInt32("display_picture_file_id"))
							};
							friends.Add(friend);
						}

						return Ok(friends);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching friends. " + ex.Message, userId, "FRIEND", true);
				return StatusCode(500, "An error occurred while fetching friends.");
			}
		}

		[HttpPost("/Friend/Requests", Name = "GetFriendRequests")]
		public async Task<IActionResult> GetFriendRequests([FromBody] int userId)
		{
			try
			{ 
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
					command.Parameters.AddWithValue("@userId", userId);

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
				_ = _log.Db("An error occurred while fetching friend requests. " + ex.Message, userId, "FRIEND", true);
				return StatusCode(500, "An error occurred while fetching friend requests.");
			}
		}

		[HttpPost("/Friend/Request", Name = "SendFriendRequest")]
		public async Task<IActionResult> SendFriendRequest([FromBody] FriendshipRequest request)
		{
			if (request.SenderId == 0 || request.ReceiverId == 0)
			{
				return BadRequest("Invalid follow request. You cannot follow Anonymous.");
			}
			try
			{  
				if (request.SenderId == request.ReceiverId)
				{
					return BadRequest("You cannot send a follow request to yourself.");
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
					checkCommand.Parameters.AddWithValue("@senderId", request.SenderId);
					checkCommand.Parameters.AddWithValue("@receiverId", request.ReceiverId);
					object? result = await checkCommand.ExecuteScalarAsync();

					if (result != null)
					{
						// Update the existing friend request
						int requestId = Convert.ToInt32(result);
						await AddFriend(request.SenderId, request.ReceiverId, connection);
						return Ok("You are both following each other. Adding a friend instead of follower.");
					}
					else
					{
						// Insert a new friend request
						string insertQuery = "INSERT INTO friend_requests (sender_id, receiver_id, status, created_at, updated_at) VALUES (@senderId, @receiverId, @status, NOW(), NOW())";
						var insertCommand = new MySqlCommand(insertQuery, connection);
						insertCommand.Parameters.AddWithValue("@senderId", request.SenderId);
						insertCommand.Parameters.AddWithValue("@receiverId", request.ReceiverId);
						insertCommand.Parameters.AddWithValue("@status", "Pending");
						await insertCommand.ExecuteNonQueryAsync();
					}

					string notificationSql =
					@"INSERT INTO maxhanna.notifications
                        (user_id, from_user_id, user_profile_id, text)
                    VALUES
                        (@receiverId, @senderId, @senderId, 'Started following you');";

					using (var cmd = new MySqlCommand(notificationSql, connection))
					{
						cmd.Parameters.AddWithValue("@senderId", request.SenderId);
						cmd.Parameters.AddWithValue("@receiverId", request.ReceiverId);

						await cmd.ExecuteNonQueryAsync();
					}
				}

				return Ok("Follow request sent successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while sending follow request. " + ex.Message, request.SenderId, "FRIEND", true);
				return StatusCode(500, "An error occurred while sending follow request.");
			}
		}


		[HttpPost("/Friend/Request/Accept", Name = "AcceptFriendRequest")]
		public async Task<IActionResult> AcceptFriendRequest([FromBody] Dictionary<string, string> body)
		{
			if (!body.TryGetValue("ReceiverId", out var receiverIdStr) ||
					!int.TryParse(receiverIdStr, out var receiverId) ||
					receiverId <= 0)
			{
				return BadRequest("Invalid or missing Receiver ID.");
			}

			if (!body.TryGetValue("SenderId", out var senderIdStr) ||
					!int.TryParse(senderIdStr, out var senderId) ||
				senderId <= 0)
			{
				return BadRequest("Invalid or missing Sender ID.");
			}

			if (senderId == 0 || receiverId == 0)
			{
				return BadRequest("Invalid friendship request. Cannot be friends with Anonymous");
			}

			try
			{ 
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					await AddFriend(senderId, receiverId, connection);
				}
				return Ok("Friend request accepted successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while accepting the friend request. " + ex.Message, senderId, "FRIEND", true);
				return StatusCode(500, "An error occurred while accepting the friend request.");
			}
		}

		[HttpPost("/Friend/Request/Delete", Name = "DeleteFriendRequest")]
		public async Task<IActionResult> DeleteFriendRequest([FromBody] int requestId)
		{
			if (requestId == 0)
			{
				return BadRequest("Invalid friendship request.");
			}

			try
			{ 
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					await DeleteFriendRequestFromDB(requestId, connection);
				}
				return Ok("Follow request deleted successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while deleting the follow request. " + ex.Message, null, "FRIEND", true);
				return StatusCode(500, "An error occurred while deleting the follow request.");
			}
		}

		private async Task AddFriend(int senderId, int receiverId, MySqlConnection connection)
		{

			// Check if the friendship request exists and is pending
			string checkRequestQuery = "SELECT id FROM friend_requests WHERE (sender_id = @senderId AND receiver_id = @receiverId OR receiver_id = @senderId AND sender_id = @receiverId) AND (status = 'Pending' OR status = 'Deleted')";
			using (var checkRequestCommand = new MySqlCommand(checkRequestQuery, connection))
			{
				checkRequestCommand.Parameters.AddWithValue("@senderId", senderId);
				checkRequestCommand.Parameters.AddWithValue("@receiverId", receiverId);
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
					checkFriendCommand.Parameters.AddWithValue("@userId", senderId);
					checkFriendCommand.Parameters.AddWithValue("@friendId", receiverId);
					friendCount = Convert.ToInt32(await checkFriendCommand.ExecuteScalarAsync());

				}

				if (friendCount == 0)
				{
					// Add a new entry in the friends table for the accepted friendship
					string insertFriendQuery = "INSERT INTO friends (user_id, friend_id) VALUES (@userId, @friendId), (@friendId, @userId)";
					using (var insertFriendCommand = new MySqlCommand(insertFriendQuery, connection))
					{
						insertFriendCommand.Parameters.AddWithValue("@userId", senderId);
						insertFriendCommand.Parameters.AddWithValue("@friendId", receiverId);
						await insertFriendCommand.ExecuteNonQueryAsync();
					}

					string notificationSql =
					@"INSERT INTO maxhanna.notifications
                        (user_id, from_user_id, user_profile_id, text)
                    VALUES
                        (@friendId, @userId, @userId, 'Friend request accepted.');";

					using (var cmd = new MySqlCommand(notificationSql, connection))
					{
						cmd.Parameters.AddWithValue("@userId", senderId);
						cmd.Parameters.AddWithValue("@friendId", receiverId);
						await cmd.ExecuteNonQueryAsync();
					}
				}
			}
		}
		private async Task DeleteFriendRequestFromDB(int requestId, MySqlConnection connection)
		{
			if (requestId == 0) return;

			string fetchQuery = @"
				SELECT sender_id, receiver_id 
				FROM maxhanna.friend_requests 
				WHERE id = @requestId
				LIMIT 1;";

			using var fetchCmd = new MySqlCommand(fetchQuery, connection);
			fetchCmd.Parameters.AddWithValue("@requestId", requestId);

			using var reader = await fetchCmd.ExecuteReaderAsync();

			if (!await reader.ReadAsync()) return;

			int senderId = reader.GetInt32("sender_id");
			int receiverId = reader.GetInt32("receiver_id");

			await reader.DisposeAsync();

			string deleteQuery = @"
				DELETE FROM maxhanna.friend_requests 
				WHERE (sender_id = @senderId AND receiver_id = @receiverId)
					 OR (sender_id = @receiverId AND receiver_id = @senderId)
				LIMIT 2;";

			using var deleteCmd = new MySqlCommand(deleteQuery, connection);
			deleteCmd.Parameters.AddWithValue("@senderId", senderId);
			deleteCmd.Parameters.AddWithValue("@receiverId", receiverId);

			await deleteCmd.ExecuteNonQueryAsync();
		}


		[HttpPost("/Friend/Remove", Name = "RemoveFriend")]
		public async Task<IActionResult> RemoveFriend([FromBody] RemoveFriendRequest request)
		{
			if (request.UserId == 0 || request.FriendId == 0)
			{
				return BadRequest("You must designate a sender and receiver");
			} 
			try
			{ 
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
					deleteCommand.Parameters.AddWithValue("@userId", request.UserId);
					deleteCommand.Parameters.AddWithValue("@friendId", request.FriendId);
					await deleteCommand.ExecuteNonQueryAsync();
				}

				return Ok("Friend removed successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while removing friend. " + ex.Message, request.UserId, "FRIEND", true);
				return StatusCode(500, "An error occurred while removing friend.");
			}
		}

		[HttpPost("/Friend/Request/Reject", Name = "RejectFriendRequest")]
		public async Task<IActionResult> RejectFriendRequest([FromBody] Dictionary<string, string> body)
		{
			if (!body.TryGetValue("RequestId", out var requestIdStr) ||
				!int.TryParse(requestIdStr, out var requestId) ||
				requestId <= 0)
			{
				return BadRequest("Invalid or missing request ID.");
			}

			if (!body.TryGetValue("UserId", out var userIdStr) ||
				!int.TryParse(userIdStr, out var userId) ||
				userId <= 0)
			{
				return BadRequest("Invalid or missing user ID.");
			}

			try
			{
				using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await connection.OpenAsync();

				// Get request details
				string fetchQuery = @"
					SELECT sender_id, receiver_id, status 
					FROM friend_requests 
					WHERE id = @requestId";
				using var fetchCommand = new MySqlCommand(fetchQuery, connection);
				fetchCommand.Parameters.AddWithValue("@requestId", requestId);

				int senderId = 0;
				int receiverId = 0;
				string? status = null;

				using (var reader = await fetchCommand.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						senderId = Convert.ToInt32(reader["sender_id"]);
						receiverId = Convert.ToInt32(reader["receiver_id"]);
						status = reader["status"].ToString();
					}
					else
					{
						return NotFound("Friend request not found.");
					}
				}

				if (string.IsNullOrEmpty(status) || status != "pending")
				{
					return BadRequest("Cannot reject or delete a request that is not pending.");
				}

				if (userId == senderId)
				{
					// Sender deletes their own pending request
					string deleteQuery = "DELETE FROM friend_requests WHERE id = @requestId";
					using var deleteCommand = new MySqlCommand(deleteQuery, connection);
					deleteCommand.Parameters.AddWithValue("@requestId", requestId);
					await deleteCommand.ExecuteNonQueryAsync();

					return Ok("Your pending friend request has been deleted successfully.");
				}
				else if (userId == receiverId)
				{
					// Receiver rejects the pending request
					string rejectQuery = @"
						UPDATE friend_requests 
						SET status = 'rejected', updated_at = NOW() 
						WHERE id = @requestId";
					using var rejectCommand = new MySqlCommand(rejectQuery, connection);
					rejectCommand.Parameters.AddWithValue("@requestId", requestId);
					await rejectCommand.ExecuteNonQueryAsync();

					return Ok("Friendship request rejected successfully.");
				}
				else
				{
					return Unauthorized("You are not authorized to modify this friend request.");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error processing friend request rejection. " + ex.Message, userId, "FRIEND", true);
				return StatusCode(500, "An error occurred while rejecting the friend request.");
			}
		} 
	}
}
