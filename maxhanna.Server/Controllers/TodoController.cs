using maxhanna.Server.Controllers.DataContracts.Todos;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class TodoController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public TodoController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		public async Task<IActionResult> Get([FromBody] int userId, [FromQuery] string type, [FromQuery] string? search)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = $@"
				SELECT DISTINCT 
					t.id, 
					t.todo, 
					t.type, 
					t.url, 
					t.file_id, 
					t.date, 
					t.ownership,
					u.username as owner_name
				FROM 
					todo t
				JOIN users u ON t.ownership = u.id
				WHERE  
					t.type = @Type
					AND (
						t.ownership = @UserId
						OR (
							-- Owner has an explicit shared_with that includes the user (robust CSV match)
							EXISTS (
								SELECT 1 FROM todo_columns tcx
								WHERE tcx.user_id = t.ownership
								  AND tcx.column_name = @Type
								  AND CONCAT(',', REPLACE(COALESCE(tcx.shared_with, ''), ' ', ''), ',') LIKE CONCAT('%,', @UserId, ',%')
							)
						)
						OR (
							-- Or the owner-column has an activation row for the requesting user
							EXISTS (
								SELECT 1 FROM todo_columns tc2
								JOIN todo_column_activations a ON a.todo_column_id = tc2.id
								WHERE tc2.user_id = t.ownership AND tc2.column_name = @Type AND a.user_id = @UserId
							)
						)
					)
					{(string.IsNullOrEmpty(search) ? "" : " AND t.todo LIKE CONCAT('%', @Search, '%')")} 
					ORDER BY t.date DESC";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Type", type);
						cmd.Parameters.AddWithValue("@UserId", userId);
						if (!string.IsNullOrEmpty(search))
						{
							cmd.Parameters.AddWithValue("@Search", search);
						}

						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var entries = new List<Todo>();

							while (await rdr.ReadAsync())
							{
								entries.Add(new Todo(
									id: rdr.GetInt32(rdr.GetOrdinal("id")),
									todo: rdr.GetString(rdr.GetOrdinal("todo")),
									type: rdr.GetString(rdr.GetOrdinal("type")),
									url: rdr.IsDBNull(rdr.GetOrdinal("url")) ? null : rdr.GetString(rdr.GetOrdinal("url")),
									fileId: rdr.IsDBNull(rdr.GetOrdinal("file_id")) ? (int?)null : rdr.GetInt32(rdr.GetOrdinal("file_id")),
									date: rdr.GetDateTime(rdr.GetOrdinal("date")),
									ownership: rdr.GetInt32(rdr.GetOrdinal("ownership")),
									owner_name: rdr.IsDBNull(rdr.GetOrdinal("owner_name")) ? null : rdr.GetString(rdr.GetOrdinal("owner_name"))
								));
							}

							return Ok(entries);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching todos: " + ex.Message, userId, "TODO", true);
				return StatusCode(500, "An error occurred while fetching todos.");
			}
		}

		[HttpPost("/Todo/Create", Name = "CreateTodo")]
		public async Task<IActionResult> Post([FromBody] CreateTodo model)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = @"
                    INSERT INTO 
                        maxhanna.todo (todo, type, url, file_id, ownership, date) 
                    VALUES 
                        (@Todo, @Type, @Url, @FileId, @Owner, UTC_TIMESTAMP());
                    SELECT LAST_INSERT_ID();";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Todo", model.todo.todo);
				cmd.Parameters.AddWithValue("@Type", model.todo.type);
				cmd.Parameters.AddWithValue("@Url", model.todo.url);
				cmd.Parameters.AddWithValue("@FileId", model.todo.fileId);
				cmd.Parameters.AddWithValue("@Owner", model.userId);
				var result = await cmd.ExecuteScalarAsync();
				if (result != null)
				{
					return Ok(result);
				}
				else
				{
					_ = _log.Db("Post Returned 500", model.userId, "TODO", true);
					return StatusCode(500, "Failed to insert data");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request." + ex.Message, model.userId, "TODO", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}

		[HttpPost("/Todo/Edit", Name = "EditTodo")]
		public async Task<IActionResult> Edit([FromBody] EditTodo req)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = @"
					UPDATE 
						maxhanna.todo
					SET 
						todo = @Todo,
						url = CASE 
							WHEN @Url IS NULL THEN NULL
							WHEN @Url = '' THEN NULL
							ELSE @Url
						END,
						file_id = CASE 
							WHEN @FileId IS NULL THEN NULL
							WHEN @FileId = '' THEN NULL
							ELSE @FileId
						END
					WHERE id = @Id
					LIMIT 1;";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Todo", req.content);
				cmd.Parameters.AddWithValue("@Id", req.id);

				// Handle URL parameter - convert empty string or undefined to NULL
				object urlValue = string.IsNullOrEmpty(req.url) ? DBNull.Value : (object)req.url;
				cmd.Parameters.AddWithValue("@Url", urlValue);

				object fileIdValue = req.fileId == null ? DBNull.Value : req.fileId;
				cmd.Parameters.AddWithValue("@FileId", fileIdValue);

				var result = await cmd.ExecuteScalarAsync();
				return Ok($"{req.id} Edit successful.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the Edit request." + ex.Message, null, "TODO", true);
				return StatusCode(500, "An error occurred while processing the edit request.");
			}
		}

		[HttpPost("/Todo/GetSharedColumns", Name = "GetSharedColumns")]
		public async Task<IActionResult> GetSharedColumns([FromBody] int userId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// Query to find:
				// 1. Columns shared WITH the current user (not yet added)
				// 2. Columns the current user has shared WITH OTHERS
				string sql = @"
					-- Columns shared WITH current user
					SELECT 
						tc.id AS owner_column_id,
						tc.user_id AS owner_id, 
						tc.column_name, 
						tc.shared_with, 
						u.username AS owner_name,
						'shared_with_me' AS share_direction
					FROM todo_columns tc
					JOIN users u ON tc.user_id = u.id
					WHERE CONCAT(',', REPLACE(tc.shared_with, ' ', ''), ',') LIKE CONCAT('%,', @UserId, ',%')
					 
					UNION ALL

					-- Columns current user has shared WITH OTHERS
					SELECT 
						tc.id AS owner_column_id,
						@UserId AS owner_id,
						tc.column_name,
						tc.shared_with,
						u.username AS owner_name,
						'shared_by_me' AS share_direction
					FROM todo_columns tc
					JOIN users u ON tc.user_id = u.id
					WHERE tc.user_id = @UserId
					AND tc.shared_with IS NOT NULL
					AND tc.shared_with != ''
					";


				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", userId);

				var results = new List<SharedColumnDto>();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						results.Add(new SharedColumnDto
						{
							OwnerColumnId = reader.GetInt32("owner_column_id"),
							OwnerId = reader.GetInt32("owner_id"),
							ColumnName = reader.GetString("column_name"),
							SharedWith = reader.IsDBNull(reader.GetOrdinal("shared_with")) ? null : reader.GetString("shared_with"),
							OwnerName = reader.IsDBNull(reader.GetOrdinal("owner_name")) ? null : reader.GetString("owner_name"),
							ShareDirection = reader.GetString("share_direction")
						});
					}
				}

				return Ok(results);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error fetching shared columns: {ex.Message}", userId, "TODO", true);
				return StatusCode(500, "An error occurred while fetching shared columns");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/Todo/ShareListWith", Name = "ShareListWith")]
		public async Task<IActionResult> ShareListWith([FromBody] ShareTodoColumnRequest req)
		{
			if (string.IsNullOrEmpty(req.Column) || req.UserId <= 0 || req.ToUserId <= 0)
			{
				return BadRequest("Invalid column name or user IDs.");
			}

			string selectSql = @"
        SELECT shared_with 
        FROM todo_columns 
        WHERE user_id = @UserId AND column_name = @Column FOR UPDATE;";

			string insertSql = @"
			INSERT INTO todo_columns (user_id, column_name, shared_with)
			VALUES (@UserId, @Column, @SharedWith)
			ON DUPLICATE KEY UPDATE shared_with = @SharedWith;";

			string updateSql = @"
        UPDATE todo_columns 
        SET shared_with = @SharedWith 
        WHERE user_id = @UserId AND column_name = @Column;";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var transaction = await conn.BeginTransactionAsync())
					{
						// Check if the column exists and retrieve shared_with value with FOR UPDATE
						string? currentSharedWith = null;
						bool rowExists = false;
						using (var selectCmd = new MySqlCommand(selectSql, conn, transaction))
						{
							selectCmd.Parameters.AddWithValue("@UserId", req.UserId);
							selectCmd.Parameters.AddWithValue("@Column", req.Column);
							var result = await selectCmd.ExecuteScalarAsync();
							if (result != null && result != DBNull.Value)
							{
								currentSharedWith = result.ToString();
							}
							rowExists = result != null; // Row exists if result is not null (even if shared_with is null)
						}

						// Prepare the new shared_with value
						string newSharedWith;
						if (!string.IsNullOrEmpty(currentSharedWith))
						{
							var userIds = currentSharedWith.Split(',', StringSplitOptions.RemoveEmptyEntries)
								.Select(x => x.Trim())
								.ToList();

							if (userIds.Contains(req.ToUserId.ToString()))
							{
								await transaction.RollbackAsync();
								return BadRequest("User is already in the shared list.");
							}

							newSharedWith = $"{currentSharedWith}, {req.ToUserId}";
						}
						else
						{
							newSharedWith = req.ToUserId.ToString();
						}

						// Perform insert or update based on existence
						int rowsAffected;
						if (!rowExists)
						{
							// Row doesn't exist, perform insert with ON DUPLICATE KEY UPDATE
							using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
							{
								insertCmd.Parameters.AddWithValue("@UserId", req.UserId);
								insertCmd.Parameters.AddWithValue("@Column", req.Column);
								insertCmd.Parameters.AddWithValue("@SharedWith", newSharedWith);
								rowsAffected = await insertCmd.ExecuteNonQueryAsync();
							}
						}
						else
						{
							// Row exists, perform update
							using (var updateCmd = new MySqlCommand(updateSql, conn, transaction))
							{
								updateCmd.Parameters.AddWithValue("@SharedWith", newSharedWith);
								updateCmd.Parameters.AddWithValue("@UserId", req.UserId);
								updateCmd.Parameters.AddWithValue("@Column", req.Column);
								rowsAffected = await updateCmd.ExecuteNonQueryAsync();
							}
						}

						if (rowsAffected > 0)
						{
							await transaction.CommitAsync();
							return Ok("Column shared successfully.");
						}
						else
						{
							await transaction.RollbackAsync();
							_ = _log.Db($"Failed to share column '{req.Column}' for user {req.UserId}.", req.UserId, "TODO", true);
							return StatusCode(500, "Failed to share column.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error sharing column '{req.Column}' for user {req.UserId}: {ex.Message}", req.UserId, "TODO", true);
				return StatusCode(500, "Error sharing column.");
			}
		}

		[HttpPost("/Todo/UnshareWith", Name = "UnshareWith")]
		public async Task<IActionResult> UnshareWith([FromBody] ShareTodoColumnRequest req)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// First, get the current shared_with value
				string getSql = @"SELECT shared_with FROM todo_columns 
                      WHERE user_id = @UserId AND column_name = @Column";

				MySqlCommand getCmd = new MySqlCommand(getSql, conn);
				getCmd.Parameters.AddWithValue("@UserId", req.UserId);
				getCmd.Parameters.AddWithValue("@Column", req.Column);

				var currentSharedWith = await getCmd.ExecuteScalarAsync() as string;

				if (string.IsNullOrEmpty(currentSharedWith))
				{
					return BadRequest("This list is not currently shared with anyone");
				}

				// Remove the target user from the shared_with list
				var userIds = currentSharedWith.Split(',')
					.Select(x => x.Trim())
					.Where(x => x != req.ToUserId.ToString())
					.ToList();

				string newSharedWith = string.Join(", ", userIds);


				// Update the shared_with column
				string updateSql = @"UPDATE todo_columns 
				        SET shared_with = @SharedWith 
				        WHERE user_id = @UserId AND column_name = @Column";

				MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
				updateCmd.Parameters.AddWithValue("@SharedWith", newSharedWith.Length <= 0 ? DBNull.Value : newSharedWith);
				updateCmd.Parameters.AddWithValue("@UserId", req.UserId);
				updateCmd.Parameters.AddWithValue("@Column", req.Column);

				int rowsAffected = await updateCmd.ExecuteNonQueryAsync();

				// Also delete any activation for the unshared user for this column
				try
				{
					string deleteActivationSql = @"DELETE a FROM todo_column_activations a
					JOIN todo_columns tc ON tc.id = a.todo_column_id
					WHERE tc.user_id = @UserId AND tc.column_name = @Column AND a.user_id = @ToUserId;";
					MySqlCommand delAct = new MySqlCommand(deleteActivationSql, conn);
					delAct.Parameters.AddWithValue("@UserId", req.UserId);
					delAct.Parameters.AddWithValue("@Column", req.Column);
					delAct.Parameters.AddWithValue("@ToUserId", req.ToUserId);
					await delAct.ExecuteNonQueryAsync();
				}
				catch { /* non-fatal */ }

				if (rowsAffected > 0)
				{
					return Ok("User removed from shared list successfully");
				}
				else
				{
					_ = _log.Db("Failed to unshare list", req.UserId, "TODO", true);
					return StatusCode(500, "Failed to unshare list");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while unsharing the list: " + ex.Message, req.UserId, "TODO", true);
				return StatusCode(500, "An error occurred while unsharing the list.");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpPost("/Todo/GetColumnActivations", Name = "GetColumnActivations")]
		public async Task<IActionResult> GetColumnActivations([FromBody] int ownerColumnId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				// Get the shared_with csv for the column
				string getCsvSql = "SELECT shared_with FROM todo_columns WHERE id = @OwnerColumnId LIMIT 1;";
				string? sharedWith = null;
				using (var getCmd = new MySqlCommand(getCsvSql, conn))
				{
					getCmd.Parameters.AddWithValue("@OwnerColumnId", ownerColumnId);
					var val = await getCmd.ExecuteScalarAsync();
					if (val != null && val != DBNull.Value)
					{
						sharedWith = val.ToString();
					}
				}

				if (string.IsNullOrWhiteSpace(sharedWith)) return Ok(new List<object>());

				// parse ids
				var idStrings = sharedWith.Split(',', StringSplitOptions.RemoveEmptyEntries)
					.Select(s => s.Trim())
					.Where(s => int.TryParse(s, out _))
					.Select(s => int.Parse(s))
					.Distinct()
					.ToArray();

				if (!idStrings.Any()) return Ok(new List<object>());

				// fetch usernames for these ids
				string usersSql = $"SELECT id, username FROM users WHERE id IN ({string.Join(',', idStrings)})";
				var userMap = new Dictionary<int, string?>();
				using (var ucmd = new MySqlCommand(usersSql, conn))
				using (var rdr = await ucmd.ExecuteReaderAsync())
				{
					while (await rdr.ReadAsync())
					{
						int id = rdr.GetInt32(0);
						string? name = rdr.IsDBNull(1) ? null : rdr.GetString(1);
						userMap[id] = name;
					}
				}

				// fetch activations for this column
				string actSql = $"SELECT user_id FROM todo_column_activations WHERE todo_column_id = @ColId AND user_id IN ({string.Join(',', idStrings)})";
				var activatedSet = new HashSet<int>();
				using (var acmd = new MySqlCommand(actSql, conn))
				{
					acmd.Parameters.AddWithValue("@ColId", ownerColumnId);
					using (var rdr = await acmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							activatedSet.Add(rdr.GetInt32(0));
						}
					}
				}

				var list = new List<object>();
				foreach (var uid in idStrings)
				{
					userMap.TryGetValue(uid, out var uname);
					list.Add(new { userId = uid, username = uname, activated = activatedSet.Contains(uid) });
				}

				return Ok(list);
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error fetching column activations: {ex.Message}", null, "TODO", true);
				return StatusCode(500, "Error fetching column activations");
			}
			finally { conn.Close(); }
		}

		[HttpPost("/Todo/LeaveSharedColumn", Name = "LeaveSharedColumn")]
		public async Task<IActionResult> LeaveSharedColumn([FromBody] LeaveSharedColumnRequest req)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// First, get the column to verify it exists and is shared with the current user
				string getSql = @"SELECT shared_with FROM todo_columns 
                      WHERE user_id = @OwnerId AND column_name = @Column";

				MySqlCommand getCmd = new MySqlCommand(getSql, conn);
				getCmd.Parameters.AddWithValue("@OwnerId", req.OwnerId);
				getCmd.Parameters.AddWithValue("@Column", req.ColumnName);

				var currentSharedWith = await getCmd.ExecuteScalarAsync() as string;

				if (string.IsNullOrEmpty(currentSharedWith))
				{
					return BadRequest("This list is not currently shared with you");
				}

				// Check if current user is actually in the shared_with list
				var userIds = currentSharedWith.Split(',')
					.Select(x => x.Trim())
					.ToList();

				if (!userIds.Contains(req.UserId.ToString()))
				{
					return BadRequest("You are not in the shared list for this column");
				}

				// Remove the current user from the shared_with list
				var newUserIds = userIds
					.Where(x => x != req.UserId.ToString())
					.ToList();

				string? newSharedWith = newUserIds.Any() ? string.Join(", ", newUserIds) : null;

				// Update the shared_with column
				string updateSql = @"UPDATE todo_columns 
                        SET shared_with = @SharedWith 
                        WHERE user_id = @OwnerId AND column_name = @Column";

				MySqlCommand updateCmd = new MySqlCommand(updateSql, conn);
				updateCmd.Parameters.AddWithValue("@SharedWith", newSharedWith);
				updateCmd.Parameters.AddWithValue("@OwnerId", req.OwnerId);
				updateCmd.Parameters.AddWithValue("@Column", req.ColumnName);

				int rowsAffected = await updateCmd.ExecuteNonQueryAsync();

				if (rowsAffected > 0)
				{
					return Ok("Successfully left the shared column");
				}
				else
				{
					_ = _log.Db("Failed to leave shared column", req.UserId, "TODO", true);
					return StatusCode(500, "Failed to leave shared column");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error leaving shared column: " + ex.Message, req.UserId, "TODO", true);
				return StatusCode(500, "An error occurred while leaving the shared column");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpDelete("/Todo/{id}", Name = "DeleteTodo")]
		public async Task<IActionResult> Delete([FromBody] int userId, int id)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				// We try to delete if:
				// - The user owns the todo (ownership = userId)
				// - OR The user is in the shared_with list for that owner's column
				string sql = @"
					DELETE FROM maxhanna.todo
					WHERE id = @Id AND (
						ownership = @UserId
						OR EXISTS (
							SELECT 1 FROM todo_columns
							WHERE column_name = todo.type
							AND user_id = todo.ownership
							AND FIND_IN_SET(@UserIdStr, REPLACE(shared_with, ' ', '')) > 0
						)
					);";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Id", id);
				cmd.Parameters.AddWithValue("@UserId", userId);
				cmd.Parameters.AddWithValue("@UserIdStr", userId.ToString());

				int rowsAffected = await cmd.ExecuteNonQueryAsync();

				if (rowsAffected > 0)
				{
					return Ok();
				}
				else
				{
					return NotFound();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the DELETE request. " + ex.Message, userId, "TODO", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}


		[HttpPost("/Todo/GetCount", Name = "GetTodoCount")]
		public async Task<IActionResult> GetCount([FromBody] int userId, [FromQuery] string type, [FromQuery] string? search)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

				    string sql = $@"
				    SELECT COUNT(DISTINCT t.id) AS cnt
				    FROM todo t
				    JOIN users u ON t.ownership = u.id
				    WHERE t.type = @Type
					AND (
						    t.ownership = @UserId
						    OR (
							    EXISTS (
								SELECT 1 FROM todo_columns tcx
								WHERE tcx.user_id = t.ownership
								  AND tcx.column_name = @Type
								  AND CONCAT(',', REPLACE(COALESCE(tcx.shared_with, ''), ' ', ''), ',') LIKE CONCAT('%,', @UserId, ',%')
							    )
						    )
						    OR (
							    EXISTS (
								    SELECT 1 FROM todo_columns tc2
								    JOIN todo_column_activations a ON a.todo_column_id = tc2.id
								    WHERE tc2.user_id = t.ownership AND tc2.column_name = @Type AND a.user_id = @UserId
							    )
						    )
						)
					{(string.IsNullOrEmpty(search) ? "" : " AND t.todo LIKE CONCAT('%', @Search, '%')")};";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Type", type);
						cmd.Parameters.AddWithValue("@UserId", userId);
						if (!string.IsNullOrEmpty(search))
						{
							cmd.Parameters.AddWithValue("@Search", search);
						}

						var result = await cmd.ExecuteScalarAsync();
						int count = 0;
						if (result != null && result != DBNull.Value)
						{
							count = Convert.ToInt32(result);
						}
						return Ok(new { count = count });
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching todo count: " + ex.Message, userId, "TODO", true);
				return StatusCode(500, "An error occurred while fetching todo count.");
			}
		}

		[HttpPost("/Todo/TodayMusic", Name = "GetTodayMusic")]
		public async Task<IActionResult> GetTodayMusic()
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = @"
                SELECT
                    t.id,
                    t.todo,
                    t.type,
                    t.url,
                    t.file_id,
                    t.date,
                    t.ownership
                FROM
                    todo t
                WHERE
                    t.type = 'music'
                    AND DATE(t.date) = DATE(UTC_TIMESTAMP())
                ORDER BY t.date DESC";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var entries = new List<Todo>();

							while (await rdr.ReadAsync())
							{
								entries.Add(new Todo(
									id: rdr.GetInt32(rdr.GetOrdinal("id")),
									todo: rdr.GetString(rdr.GetOrdinal("todo")),
									type: rdr.GetString(rdr.GetOrdinal("type")),
									url: rdr.IsDBNull(rdr.GetOrdinal("url")) ? null : rdr.GetString(rdr.GetOrdinal("url")),
									fileId: rdr.IsDBNull(rdr.GetOrdinal("file_id")) ? null : rdr.GetInt32(rdr.GetOrdinal("file_id")),
									date: rdr.GetDateTime(rdr.GetOrdinal("date")),
									ownership: rdr.GetInt32(rdr.GetOrdinal("ownership"))
							));
							}

							return Ok(entries);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching today's music: " + ex.Message, null, "TODO", true);
				return StatusCode(500, "An error occurred while fetching today's music.");
			}
		}

		[HttpPost("/Todo/Columns/Add")]
		public async Task<IActionResult> AddColumn([FromBody] AddTodoColumnRequest req)
		{
			if (string.IsNullOrEmpty(req.Column))
			{
				return BadRequest("Invalid column name.");
			}

			// New behavior: ensure a todo_columns row exists and add an activation row for the user
			string insertSql = @"
			INSERT INTO todo_columns (user_id, column_name, shared_with)
			VALUES (@Owner, @Column, NULL)
			ON DUPLICATE KEY UPDATE shared_with = COALESCE(shared_with, NULL);";

			string insertActivationSql = @"
			INSERT IGNORE INTO todo_column_activations (todo_column_id, user_id)
			SELECT id, @Owner FROM todo_columns WHERE user_id = @Owner AND column_name = @Column;";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var transaction = await conn.BeginTransactionAsync())
					{

						// Ensure todo_columns row exists for this user/column
						using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
						{
							insertCmd.Parameters.AddWithValue("@Owner", req.UserId);
							insertCmd.Parameters.AddWithValue("@Column", req.Column);
							await insertCmd.ExecuteNonQueryAsync();
						}

						// Create an activation for this user
						using (var actCmd = new MySqlCommand(insertActivationSql, conn, transaction))
						{
							actCmd.Parameters.AddWithValue("@Owner", req.UserId);
							actCmd.Parameters.AddWithValue("@Column", req.Column);
							await actCmd.ExecuteNonQueryAsync();
						}

						await transaction.CommitAsync();
						return Ok("Column added and shared_with updated.");
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error adding column '{req.Column}' for user {req.UserId}: {ex.Message}", req.UserId, "TODO", true);
				return StatusCode(500, "Error adding column.");
			}
		}

		[HttpPost("/Todo/Columns/Activate", Name = "ActivateColumn")]
		public async Task<IActionResult> ActivateColumn([FromBody] ActivateColumnRequest req)
		{
			if (req == null || req.OwnerColumnId <= 0 || req.UserId <= 0)
			{
				return BadRequest("Invalid activation request");
			}

			string sql = @"
				INSERT IGNORE INTO todo_column_activations (todo_column_id, user_id)
				VALUES (@ColId, @UserId);";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@ColId", req.OwnerColumnId);
						cmd.Parameters.AddWithValue("@UserId", req.UserId);
						var rows = await cmd.ExecuteNonQueryAsync();
						if (rows >= 0)
						{
							return Ok("Activated");
						}
						else
						{
							return StatusCode(500, "Failed to activate column");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error activating column: {ex.Message}", req.UserId, "TODO", true);
				return StatusCode(500, "Error activating column");
			}
		}


		[HttpPost("/Todo/Columns/Remove")]
		public async Task<IActionResult> RemoveColumn([FromBody] AddTodoColumnRequest req)
		{
			if (string.IsNullOrEmpty(req.Column))
			{
				return BadRequest("Invalid column name.");
			} 
			// New behavior: remove activation for this user
			string deleteActivationSql = @"
			DELETE a FROM todo_column_activations a
			JOIN todo_columns tc ON tc.id = a.todo_column_id
			WHERE tc.user_id = @Owner AND tc.column_name = @Column AND a.user_id = @Owner;";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand(deleteActivationSql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", req.UserId);
						cmd.Parameters.AddWithValue("@Column", req.Column);
						await cmd.ExecuteNonQueryAsync();
					}
				}
				return Ok("Column removed.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error removing column." + ex.Message, req.UserId, "TODO", true);
				return StatusCode(500, "Error removing column.");
			}
		}

		[HttpPost("/Todo/Columns/GetColumnsForUser")]
		public async Task<IActionResult> GetColumnsForUser([FromBody] int userId)
		{
			string sqlColumns = @"
				SELECT tc.id AS column_id, tc.column_name, 
				       EXISTS(SELECT 1 FROM todo_column_activations a WHERE a.todo_column_id = tc.id AND a.user_id = @Owner) AS is_added
				FROM todo_columns tc
				WHERE tc.user_id = @Owner;";

			string[] defaultTodoTypes = new[] { "Todo", "Work", "Shopping", "Study", "Movie", "Bucket", "Recipe" };

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
				//	_ = _log.Db($"Connecting to database for user {userId}", userId, "TODO", outputToConsole: true);
					await conn.OpenAsync();

					// Debug: Log default columns
				//	_ = _log.Db($"Default columns: {string.Join(", ", defaultTodoTypes)}", userId, "TODO", outputToConsole: true);

					using (var cmdColumns = new MySqlCommand(sqlColumns, conn))
					{
						cmdColumns.Parameters.AddWithValue("@Owner", userId);

						using (var rdrColumns = await cmdColumns.ExecuteReaderAsync())
						{
							var dbColumns = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
							int dbColumnCount = 0;

							while (await rdrColumns.ReadAsync())
							{
								int columnId = rdrColumns.GetInt32(0);
								string columnName = rdrColumns.GetString(1);
								bool isAdded = rdrColumns.GetBoolean(2);
								dbColumns[columnName] = isAdded;
								dbColumnCount++;

								// We could also collect the columnId if needed in the response
							}

							// Debug: Log summary of DB columns
						//	_ = _log.Db($"Total columns read from DB: {dbColumnCount}", userId, "TODO", outputToConsole: true);

							var resultColumns = new List<object>();

							// Process default columns
							foreach (var defaultCol in defaultTodoTypes)
							{
								bool existsInDb = dbColumns.TryGetValue(defaultCol, out bool isAdded);
								bool shouldInclude = !existsInDb || isAdded;

								// Debug: Log decision for each default column
								// _ = _log.Db($"Processing default column '{defaultCol}': " +
								// 		   $"ExistsInDb={existsInDb}, " +
								// 		   $"IsAdded={(existsInDb ? isAdded.ToString() : "N/A")}, " +
								// 		   $"ShouldInclude={shouldInclude}",
								// 		   userId, "TODO", outputToConsole: true);

								if (shouldInclude)
								{
									resultColumns.Add(new
									{
										column_name = defaultCol,
										is_added = existsInDb ? isAdded : true
									});
								}
							}

							// Process additional DB columns not in defaults
							foreach (var dbCol in dbColumns)
							{
								if (!defaultTodoTypes.Contains(dbCol.Key, StringComparer.OrdinalIgnoreCase))
								{
									// Debug: Log each additional column being added
								//	_ = _log.Db($"Adding non-default column from DB: {dbCol.Key}, IsAdded: {dbCol.Value}", userId, "TODO", outputToConsole: true);

									resultColumns.Add(new
									{
										column_name = dbCol.Key,
										is_added = dbCol.Value
									});
								}
							}

							// Debug: Log final result before returning
							// _ = _log.Db($"Final columns count: {resultColumns.Count}", userId, "TODO", outputToConsole: true);
							// _ = _log.Db($"Final columns: {string.Join(", ", resultColumns.Select(c => ((dynamic)c).column_name))}",
							// 		   userId, "TODO", outputToConsole: true);

							return Ok(resultColumns);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"ERROR fetching columns: {ex.Message}", userId, "TODO", true);
				return StatusCode(500, "An error occurred while fetching columns.");
			}
		}

	}
}
public class SharedColumnDto
{
    // ID of the row in todo_columns table
    public int OwnerColumnId { get; set; }
	public int OwnerId { get; set; }
	public string? ColumnName { get; set; }
	public string? OwnerName { get; set; }
	public string? SharedWith { get; set; }
	public string? ShareDirection { get; set; } // "shared_with_me" or "shared_by_me"
}

public class ActivateColumnRequest
{
	public int OwnerColumnId { get; set; }
	public int UserId { get; set; }
}