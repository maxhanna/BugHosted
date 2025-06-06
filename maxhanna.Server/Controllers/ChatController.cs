using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Chat;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class ChatController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public ChatController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Chat/Notifications", Name = "GetChatNotifications")]
		public async Task<IActionResult> GetChatNotifications([FromBody] int userId)
		{
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
				cmd.Parameters.AddWithValue("@userId", userId);

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
				_ = _log.Db("An error occurred while processing the POST request for message history. " + ex.Message, userId, "CHAT");
			}
			finally
			{
				conn.Close();
			}
			return StatusCode(500, "An error occurred while processing the request.");
		}

		[HttpPost("/Chat/NotificationsByUser", Name = "GetChatNotificationsByUser")]
		public async Task<IActionResult> GetChatNotificationsByUser([FromBody] int userId)
		{
			List<Notification> notifications = new List<Notification>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql = @"
					SELECT 
						count(*) AS count, 
						chat_id
					FROM 
						maxhanna.notifications n 
					WHERE 
						n.user_id = @userId  
						AND chat_id IS NOT NULL 
						AND (n.is_read = 0 OR n.is_read IS NULL)
					GROUP BY chat_id;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@userId", userId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						int chatId = Convert.ToInt32(reader["chat_id"]);
						int count = Convert.ToInt32(reader["count"]);

						if (count > 0)
						{
							notifications.Add(new Notification { ChatId = chatId, Count = count });
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
				_ = _log.Db("An error occurred while processing the POST request for message notifications. " + ex.Message, userId, "CHAT");
			}
			finally
			{
				await conn.CloseAsync();
			}
			return StatusCode(500, "An error occurred while processing the request.");
		}

		[HttpPost("/Chat/GetGroupChats", Name = "GetGroupChats")]
		public async Task<List<ChatMessage>> GetGroupChats([FromBody] int userId)
		{
			List<ChatMessage> messages = new List<ChatMessage>();

			// Query to get chat IDs and receiver IDs from messages
			string query = @"
				SELECT 
						m.chat_id,
						m.receiver,
						MAX(m.timestamp) AS latest_timestamp
				FROM 
						messages m  
				WHERE 
						FIND_IN_SET(@ReceiverId, m.receiver) > 0
						AND NOT EXISTS (SELECT 1 FROM maxhanna.user_left_chat WHERE chat_id = m.chat_id AND user_id = @ReceiverId)
				GROUP BY 
						m.chat_id, 
						m.receiver
				ORDER BY 
						latest_timestamp DESC;";

			Dictionary<int, List<int>> chatReceivers = new Dictionary<int, List<int>>();

			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				// Fetch chat IDs and receiver lists
				MySqlCommand cmd = new MySqlCommand(query, conn);
				cmd.Parameters.AddWithValue("@ReceiverId", userId);

				using (MySqlDataReader reader = await cmd.ExecuteReaderAsync())
				{
					// Dictionary to store chat IDs and corresponding receiver IDs

					while (reader.Read())
					{
						int chatId = reader.GetInt32("chat_id");
						string[] receiverIds = reader.GetString("receiver").Split(',');

						if (!chatReceivers.ContainsKey(chatId))
						{
							chatReceivers[chatId] = new List<int>();
						}

						foreach (string id in receiverIds)
						{
							if (int.TryParse(id, out int receiverId))
							{
								chatReceivers[chatId].Add(receiverId);
							}
						}
					}
				}
			}


			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				// Query to fetch user details for a list of IDs
				foreach (var chat in chatReceivers)
				{
					string idList = string.Join(",", chat.Value);

					string userQuery = @" 
						SELECT 
							u.id, 
							u.username,
							u.last_seen,
							udp.file_id as display_file_id
						FROM maxhanna.users u 
						LEFT JOIN maxhanna.user_display_pictures udp on udp.user_id = u.id
						WHERE id IN (" + idList + @");";
					MySqlCommand userCmd = new MySqlCommand(userQuery, conn);

					using (MySqlDataReader userReader = await userCmd.ExecuteReaderAsync())
					{
						Dictionary<int, User> users = new Dictionary<int, User>();

						while (userReader.Read())
						{
							int id = userReader.GetInt32("id");
							string username = userReader.GetString("username");
							FileEntry? dp =
								userReader.IsDBNull(userReader.GetOrdinal("display_file_id"))
									? null
									: new FileEntry(Convert.ToInt32(userReader["display_file_id"]));
							users[id] = new User(id, username, dp);
							users[id].LastSeen = userReader.IsDBNull(userReader.GetOrdinal("last_seen"))
									? null
									: (DateTime?)userReader.GetDateTime("last_seen");
						}

						List<User> receivers = chat.Value
								.Select(id => users.ContainsKey(id) ? users[id] : new User(id, "Unknown"))
								.ToList();

						messages.Add(new ChatMessage
						{
							// Set other properties as needed
							Receiver = receivers.ToArray(),
							ChatId = chat.Key,
						});
					}
				}
			}
			return messages;
		}

		[HttpPost("/Chat/GetChatUsersByChatId", Name = "GetChatUsersByChatId")]
		public async Task<IActionResult> GetChatUsersByChatId([FromBody] GetChatUsersByChatIdRequest request)
		{
			List<User> users = new List<User>();

			string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			using (MySqlConnection conn = new MySqlConnection(connectionString))
			{
				try
				{
					await conn.OpenAsync();

					string sql = @"
						SELECT DISTINCT 
								u.id,
								u.username
						FROM 
								maxhanna.messages m
						JOIN 
								maxhanna.users u
						ON 
								FIND_IN_SET(u.id, m.receiver) > 0
						WHERE 
								m.chat_id = @ChatId;";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@ChatId", request.ChatId);

						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								users.Add(new User
								{
									Id = reader.GetInt32("id"),
									Username = reader.GetString("username"),
								});
							}
						}
					}

					if (users.Count > 0)
					{
						return Ok(users);
					}
					else
					{
						return NoContent();
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while processing the request for GetChatUsersByChatId. " + ex.Message, null, "CHAT");
					return StatusCode(500, "An error occurred while processing the request.");
				}

			}
		}

		[HttpPost("/Chat/GetMessageHistory", Name = "GetMessageHistory")]
		public async Task<IActionResult> GetMessageHistory([FromBody] MessageHistoryRequest request)
		{
			int pageSize = request.PageSize.HasValue && request.PageSize > 0 ? request.PageSize.Value : 20;
			int pageNumber = request.PageNumber.HasValue && request.PageNumber > 0 ? request.PageNumber.Value : 1; // Default to the first page
			int totalRecords = 0;
			int totalPages = 0;

			string receiverList = request.ReceiverIds != null && request.ReceiverIds.Any()
					? string.Join(",", request.ReceiverIds)
					: string.Empty;

			List<ChatMessage> messages = new List<ChatMessage>();
			int? chatId = null;
			if (request.ChatId == null)
			{
				using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					if (string.IsNullOrEmpty(receiverList))
					{
						return BadRequest("Receiver list is empty.");
					}

					// Query to find the chatId that matches the sorted receiver list
					string findChatIdQuery = @"
                        SELECT chat_id, receiver
                        FROM messages
                        GROUP BY chat_id, receiver";

					MySqlCommand findChatIdCmd = new MySqlCommand(findChatIdQuery, conn);

					using (var reader = await findChatIdCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							string dbReceiver = reader["receiver"].ToString() ?? "";
							List<int> dbReceiverList = dbReceiver
								.Split(',')
								.Select(s => int.TryParse(s, out var val) ? val : -1) // convert to int, fallback -1 if parse fails
								.Where(i => i != -1) // remove failed parses
								.OrderBy(i => i)
								.ToList();

							if (request.ReceiverIds != null && request.ReceiverIds.Length > 0)
							{
								var requestSet = new HashSet<int>(request.ReceiverIds);
								var dbSet = new HashSet<int>(dbReceiverList);

								if (dbSet.SetEquals(requestSet))
								{
									chatId = Convert.ToInt32(reader["chat_id"]);
									break;
								}
							}
						}
					}

					if (chatId == null)
					{
						_ = _log.Db("No matching chatId found for receivers: " + receiverList, request.UserId, "CHAT", true);
						return Ok(messages);
					}
				}
			}
			else
			{
				chatId = request.ChatId;
			}

			if (chatId == null)
			{
				return Ok(messages);
			}
			else if (chatId != null)
			{
				using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					try
					{
						await conn.OpenAsync();

						// Get the total number of messages
						string countSql = @"
                            SELECT COUNT(*)
                            FROM maxhanna.messages m
                            WHERE chat_id = @ChatId";

						MySqlCommand countCmd = new MySqlCommand(countSql, conn);
						countCmd.Parameters.AddWithValue("@ChatId", chatId);
						totalRecords = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

						// Calculate total number of pages
						if (totalRecords > 0)
						{
							totalPages = (int)Math.Ceiling((double)totalRecords / pageSize);

							int offset = (pageNumber - 1) * pageSize;
							//Console.WriteLine($"totalPages: {totalPages} offset: {offset} totalRecords: {totalRecords}, pageNumber: {pageNumber}");

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
                        WHERE m.chat_id = @ChatId
                        ORDER BY 
                            m.timestamp DESC
                        LIMIT @PageSize OFFSET @PageOffset";

							MySqlCommand cmd = new MySqlCommand(sql, conn);
							cmd.Parameters.AddWithValue("@ChatId", chatId);
							cmd.Parameters.AddWithValue("@PageSize", pageSize);
							cmd.Parameters.AddWithValue("@PageOffset", offset);

							using (var reader = await cmd.ExecuteReaderAsync())
							{
								Dictionary<int, ChatMessage> messageMap = new Dictionary<int, ChatMessage>();

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
												senderDisplayPicture.Id == 0 ? null : senderDisplayPicture
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
												receiverDisplayPicture.Id == 0 ? null : receiverDisplayPicture
										);

										var message = new ChatMessage
										{
											Id = messageId,
											ChatId = (int)chatId,
											Sender = sender,
											Receiver = [receiver],
											Seen = reader.IsDBNull(reader.GetOrdinal("seen")) ? null : reader.GetString("seen"),
											Content = reader["content"].ToString(),
											Timestamp = Convert.ToDateTime(reader["timestamp"]),
											Reactions = new List<Reaction>(),
											EditDate = reader.IsDBNull(reader.GetOrdinal("edit_date")) ? null : (DateTime?)Convert.ToDateTime(reader["edit_date"]),
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

					}
					catch (Exception ex)
					{
						_ = _log.Db("An error occurred while processing the POST request for message history. " + ex.Message, request.UserId, "CHAT");
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
                        UPDATE maxhanna.messages 
												SET seen = CASE 
														WHEN (SELECT ghost_read FROM user_settings WHERE user_id = @SenderId) = 1 THEN seen
														WHEN seen IS NULL THEN @SenderId
														WHEN seen NOT LIKE CONCAT('%', @SenderId, '%') THEN CONCAT(seen, ',', @SenderId)
														ELSE seen
												END
												WHERE chat_id = @ChatId 
												AND sender != @SenderId;

												UPDATE maxhanna.notifications 
												SET is_read = 1 
												WHERE user_id = @SenderId 
												AND chat_id = @ChatId;";

						MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
						updateCmd.Parameters.AddWithValue("@ChatId", (int)chatId);
						updateCmd.Parameters.AddWithValue("@SenderId", request.UserId);

						await updateCmd.ExecuteNonQueryAsync();
					}
					catch (Exception ex)
					{
						_ = _log.Db("An error occurred while updating message seen status." + ex.Message, request.UserId, "CHAT");
					}
					finally
					{
						await conn.CloseAsync();
					}
				}
			}
			if (messages.Count > 0)
			{
				try
				{
					var safeMessages = messages ?? new List<ChatMessage>();
					int safePageNumber = pageNumber > 0 ? pageNumber : 1;
					int safePageSize = pageSize > 0 ? pageSize : 10;
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

					_ = _log.Db("Chat: Error getting chat history: " + ex.Message, request.UserId, "CHAT", true);
					return StatusCode(500, "An error occurred while processing your chat request.");
				}
			}
			else
			{
				return Ok(messages);
			}
		}


		[HttpPost("/Chat/SendMessage", Name = "SendMessage")]
		public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
		{
			//_ = _log.Db($"POST /Chat/SendMessage from user: {request.Sender?.Id} to chatId: {request.ChatId} with {request.Files?.Count ?? 0} # of files", request.Sender?.Id, "CHAT");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				bool isContained = false;

				// Convert receiver list to a comma-separated string
				string receiverList = request.ReceiverIds != null && request.ReceiverIds.Any()
						? string.Join(",", request.ReceiverIds)
						: string.Empty;
				long targetChatId = 0;
				// Check if the sender's ID is already in the receiver list
				if (!string.IsNullOrEmpty(receiverList) && receiverList.Split(',').Contains(request.SenderId.ToString()))
				{
					isContained = true;
				}

				if (!isContained)
				{
					receiverList = request.SenderId + (string.IsNullOrEmpty(receiverList) ? "" : "," + receiverList);
				}

				if (request.ChatId == null || request.ChatId == 0)
				{
					// Get the maximum chat_id from the messages table and increment it
					string maxChatIdSql = @"
                        SELECT chat_id 
                        FROM maxhanna.messages
                        WHERE receiver = @ReceiverId 
                        UNION ALL 
                        SELECT COALESCE(MAX(chat_id), 0) + 1 
                        FROM maxhanna.messages 
                        WHERE NOT EXISTS (SELECT 1 FROM maxhanna.messages WHERE receiver = @ReceiverId) 
                        LIMIT 1;";
					using (var idcmd = new MySqlCommand(maxChatIdSql, conn))
					{
						idcmd.Parameters.AddWithValue("@ReceiverId", receiverList);
						targetChatId = Convert.ToInt32(await idcmd.ExecuteScalarAsync());
					}
				}
				else
				{
					targetChatId = request.ChatId.Value;
				}
				string receiverSql = @"
                        SELECT receiver 
                        FROM maxhanna.messages
                        WHERE chat_id = @ChatId  
                        LIMIT 1;";
				using (var idcmd = new MySqlCommand(receiverSql, conn))
				{
					idcmd.Parameters.AddWithValue("@ChatId", targetChatId);
					string? tmpList = Convert.ToString(await idcmd.ExecuteScalarAsync());
					if (!string.IsNullOrEmpty(tmpList))
					{
						receiverList = tmpList;
					}
				}

				string sql = "INSERT INTO maxhanna.messages (sender, receiver, chat_id, content, timestamp) VALUES (@Sender, @Receiver, @ChatId, @Content, UTC_TIMESTAMP())";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Sender", request.SenderId);
				cmd.Parameters.AddWithValue("@Receiver", receiverList);
				cmd.Parameters.AddWithValue("@ChatId", targetChatId);
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

				//delete any user_left_chat
				string ulcSql = "DELETE FROM maxhanna.user_left_chat WHERE chat_id = @ChatId;";
				MySqlCommand ulcCmd = new MySqlCommand(ulcSql, conn);
				ulcCmd.Parameters.AddWithValue("@ChatId", targetChatId);
				await ulcCmd.ExecuteNonQueryAsync();
				return Ok(targetChatId);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request for sending a message. " + ex.Message, request.SenderId, "CHAT");
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}


		[HttpPost("/Chat/Edit", Name = "EditChatMessage")]
		public async Task<IActionResult> EditChatMessage([FromBody] EditChatRequest request)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open(); 
				string sql = "UPDATE maxhanna.messages SET content = @Content, edit_date = UTC_TIMESTAMP() WHERE id = @MessageId AND sender = @UserId LIMIT 1;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", request.UserId ?? 0);
				cmd.Parameters.AddWithValue("@Content", request.Content);
				cmd.Parameters.AddWithValue("@MessageId", request.MessageId);

				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				return Ok(rowsAffected);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while EditChatMessage. " + ex.Message, request.UserId, "CHAT", true);
				return StatusCode(500, "An error occurred while EditChatMessage.");
			}
			finally
			{
				conn.Close();
			} 
		}

		[HttpPost("/Chat/LeaveChat", Name = "LeaveChat")]
		public async Task<IActionResult> LeaveChat([FromBody] LeaveChatRequest request)
		{
			//_ = _log.Db($"POST /Chat/SendMessage from user: {request.Sender?.Id} to chatId: {request.ChatId} with {request.Files?.Count ?? 0} # of files", request.Sender?.Id, "CHAT");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();


				string sql = "INSERT INTO maxhanna.user_left_chat (user_id, chat_id, timestamp) VALUES (@UserId, @ChatId, UTC_TIMESTAMP())";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", request.UserId);
				cmd.Parameters.AddWithValue("@ChatId", request.ChatId);

				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				return Ok(rowsAffected);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request for LeaveChat. " + ex.Message, request.UserId, "CHAT");
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}

		public class SendMessageRequest
		{
			public int SenderId { get; set; }
			public int[]? ReceiverIds { get; set; }
			public int? ChatId { get; set; }
			public string? Content { get; set; }
			public List<FileEntry>? Files { get; set; }
		}
		public class Notification
		{
			public int ChatId { get; set; }
			public int Count { get; set; }
		}
		public class LeaveChatRequest
		{
			public int ChatId { get; set; }
			public int UserId { get; set; }
		}
		public class EditChatRequest
		{
			public int? UserId { get; set; }
			public int MessageId { get; set; }
			public string? Content { get; set; }
		}
	}
}
