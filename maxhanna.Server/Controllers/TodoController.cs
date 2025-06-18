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
                LEFT JOIN todo_columns tc ON t.ownership = tc.user_id AND tc.column_name = @Type
                WHERE  
                    t.type = @Type
                    AND (
                        t.ownership = @UserId
                        OR (
                            tc.user_id IS NOT NULL
                            AND FIND_IN_SET(@UserId, tc.shared_with)
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
									fileId: rdr.IsDBNull(rdr.GetOrdinal("file_id")) ? null : rdr.GetInt32(rdr.GetOrdinal("file_id")),
									date: rdr.GetDateTime(rdr.GetOrdinal("date")),
									ownership: rdr.GetInt32(rdr.GetOrdinal("ownership"))
								//ownerName: rdr.IsDBNull(rdr.GetOrdinal("owner_name")) ? null : rdr.GetString(rdr.GetOrdinal("owner_name"))
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
                    SET todo = @Todo 
					WHERE id = @Id
					LIMIT 1;";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Todo", req.content);
				cmd.Parameters.AddWithValue("@Id", req.id); 
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
							OwnerId = reader.GetInt32("owner_id"),
							ColumnName = reader.GetString("column_name"),
							SharedWith = reader.GetString("shared_with"),
							OwnerName = reader.GetString("owner_name"),
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
        INSERT INTO todo_columns (user_id, column_name, is_added, shared_with)
        VALUES (@UserId, @Column, TRUE, @SharedWith)
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


		[HttpPost("/Todo/Columns/Add")]
		public async Task<IActionResult> AddColumn([FromBody] AddTodoColumnRequest req)
		{
			if (string.IsNullOrEmpty(req.Column))
			{
				return BadRequest("Invalid column name.");
			}

			string selectOwnSql = @"
        SELECT shared_with 
        FROM todo_columns 
        WHERE user_id = @Owner AND column_name = @Column FOR UPDATE;";

			string insertSql = @"
        INSERT INTO todo_columns (user_id, column_name, is_added, shared_with)
        VALUES (@Owner, @Column, TRUE, NULL)
        ON DUPLICATE KEY UPDATE is_added = TRUE, shared_with = NULL;";

			string updateSharedWithSql = @"
        UPDATE todo_columns tc
        JOIN (
            SELECT column_name, 
                   GROUP_CONCAT(DISTINCT user_id ORDER BY user_id SEPARATOR ',') AS shared_with_list
            FROM todo_columns
            WHERE column_name = @Column
            GROUP BY column_name
            HAVING LENGTH(GROUP_CONCAT(DISTINCT user_id ORDER BY user_id SEPARATOR ',')) <= 45
        ) AS sub
        ON tc.column_name = sub.column_name
        SET tc.shared_with = sub.shared_with_list
        WHERE tc.column_name = @Column;";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var transaction = await conn.BeginTransactionAsync())
					{
						// Check if the column exists for the current user
						bool rowExists = false;
						using (var selectCmd = new MySqlCommand(selectOwnSql, conn, transaction))
						{
							selectCmd.Parameters.AddWithValue("@Owner", req.UserId);
							selectCmd.Parameters.AddWithValue("@Column", req.Column);
							var result = await selectCmd.ExecuteScalarAsync();
							rowExists = result != null; // Row exists for this user
						}

						// Perform the insert or update (set shared_with to NULL initially)
						using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
						{
							insertCmd.Parameters.AddWithValue("@Owner", req.UserId);
							insertCmd.Parameters.AddWithValue("@Column", req.Column);
							await insertCmd.ExecuteNonQueryAsync();
						}

						// Update shared_with for all rows with the same column_name
						using (var updateCmd = new MySqlCommand(updateSharedWithSql, conn, transaction))
						{
							updateCmd.Parameters.AddWithValue("@Column", req.Column);
							await updateCmd.ExecuteNonQueryAsync();
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


		[HttpPost("/Todo/Columns/Remove")]
		public async Task<IActionResult> RemoveColumn([FromBody] AddTodoColumnRequest req)
		{
			if (string.IsNullOrEmpty(req.Column))
			{
				return BadRequest("Invalid column name.");
			} 
			string sql = @"
				INSERT INTO todo_columns (user_id, column_name, is_added)
				VALUES (@Owner, @Column, FALSE)
				ON DUPLICATE KEY UPDATE is_added = FALSE;";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand(sql, conn))
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
				SELECT column_name, is_added 
				FROM todo_columns 
				WHERE user_id = @Owner;";

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
								string columnName = rdrColumns.GetString(0);
								bool isAdded = rdrColumns.GetBoolean(1);
								dbColumns[columnName] = isAdded;
								dbColumnCount++;

								// Debug: Log each column as it's read from DB
							//	_ = _log.Db($"Read from DB - Column: {columnName}, IsAdded: {isAdded}", userId, "TODO", outputToConsole: true);
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
	public int OwnerId { get; set; }
	public string? ColumnName { get; set; }
	public string? OwnerName { get; set; }
	public string? SharedWith { get; set; }
	public string? ShareDirection { get; set; } // "shared_with_me" or "shared_by_me"
}