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
			string sqlColumns = @"
				SELECT column_name 
				FROM todo_columns 
				WHERE user_id = @Owner AND is_added = TRUE";

			List<string> selectedColumns = new List<string>();

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					// Fetch selected columns
					using (var cmdColumns = new MySqlCommand(sqlColumns, conn))
					{
						cmdColumns.Parameters.AddWithValue("@Owner", userId);

						using (var rdrColumns = await cmdColumns.ExecuteReaderAsync())
						{
							while (await rdrColumns.ReadAsync())
							{
								selectedColumns.Add(rdrColumns.GetString(0));
							}
						}
					}
					 
					string columnFilter = "AND type IN (" + type + ")"; 

					string sql = $@"
            SELECT 
                id, 
                todo, 
                type, 
                url, 
                date, 
                ownership 
            FROM 
                maxhanna.todo 
            WHERE 
                ownership = @Owner 
                AND type = @Type 
                {(string.IsNullOrEmpty(search) ? "" : " AND todo LIKE CONCAT('%', @Search, '%') ")} 
            ORDER BY id DESC";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						cmd.Parameters.AddWithValue("@Type", type);
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
												id: rdr.GetInt32(0),
												todo: rdr.GetString(1),
												type: rdr.GetString(2),
												url: rdr.IsDBNull(3) ? null : rdr.GetString(3),
												date: rdr.GetDateTime(4),
												ownership: rdr.GetInt32(5)
								));
							}

							return Ok(entries);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching todos." + ex.Message, userId, "TODO", true);
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
                        maxhanna.todo (todo, type, url, ownership, date) 
                    VALUES 
                        (@Todo, @Type, @Url, @Owner, UTC_TIMESTAMP());
                    SELECT LAST_INSERT_ID();";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Todo", model.todo.todo);
				cmd.Parameters.AddWithValue("@Type", model.todo.type);
				cmd.Parameters.AddWithValue("@Url", model.todo.url);
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

		[HttpDelete("/Todo/{id}", Name = "DeleteTodo")]
		public async Task<IActionResult> Delete([FromBody] int userId, int id)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = "DELETE FROM maxhanna.todo WHERE ID = @Id AND ownership = @Owner";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Id", id);
				cmd.Parameters.AddWithValue("@Owner", userId);
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
				_ = _log.Db("An error occurred while processing the DELETE request." + ex.Message, userId, "TODO", true);
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
			string sql = @"
				INSERT INTO todo_columns (user_id, column_name, is_added)
        VALUES (@Owner, @Column, TRUE)
        ON DUPLICATE KEY UPDATE is_added = TRUE;";

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
				return Ok("Column added.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error adding column." + ex.Message, req.UserId, "TODO", true);
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
		public async Task<IActionResult> GetColumnsForUser(int userId)
		{  
			string sqlColumns = @"
        SELECT column_name, 
               IFNULL(is_added, TRUE) as is_added 
        FROM todo_columns 
        WHERE user_id = @Owner
        UNION 
        SELECT column_name, 
               TRUE as is_added
        FROM (SELECT 'Todo' AS column_name UNION ALL 
              SELECT 'Work' UNION ALL 
              SELECT 'Shopping' UNION ALL 
              SELECT 'Study' UNION ALL 
              SELECT 'Movie' UNION ALL 
              SELECT 'Bucket' UNION ALL 
              SELECT 'Recipe' UNION ALL 
              SELECT 'Wife') default_columns
        WHERE NOT EXISTS (SELECT 1 
                          FROM todo_columns 
                          WHERE user_id = @Owner 
                          AND column_name = default_columns.column_name)
    ";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					// Fetch all columns for the user
					using (var cmdColumns = new MySqlCommand(sqlColumns, conn))
					{
						cmdColumns.Parameters.AddWithValue("@Owner", userId);

						using (var rdrColumns = await cmdColumns.ExecuteReaderAsync())
						{
							var columns = new List<object>();

							while (await rdrColumns.ReadAsync())
							{
								columns.Add(new
								{
									column_name = rdrColumns.GetString(0),
									is_added = rdrColumns.GetBoolean(1)
								});
							}

							return Ok(columns);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching columns." + ex.Message, userId, "TODO", true);
				return StatusCode(500, "An error occurred while fetching columns.");
			}
		} 
	}
}
