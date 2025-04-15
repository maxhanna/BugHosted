using maxhanna.Server.Controllers.DataContracts.Notepad;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class NotepadController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public NotepadController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost(Name = "GetNotes")]
		public async Task<IActionResult> GetNotes([FromBody] GetNotepadRequest req)
		{ 
			string sql = @"SELECT 
                             id, LEFT(note, 25) AS note, date, ownership  
                        FROM 
                            maxhanna.notepad 
                        WHERE 
                        (
                            ownership = @Owner 
                            OR 
                                ownership LIKE CONCAT('%,', @Owner, ',%') 
                            OR 
                                ownership LIKE CONCAT(@Owner, ',%') 
                            OR 
                                ownership LIKE CONCAT('%,', @Owner)
                        )";
			if (!string.IsNullOrEmpty(req.Search))
			{
				sql += " AND note LIKE CONCAT('%', @Search, '%')";
			}
			sql += ";";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", req.UserId);
						if (!string.IsNullOrEmpty(req.Search))
						{
							cmd.Parameters.AddWithValue("@Search", req.Search);
						}
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var entries = new List<NotepadEntry>();

							while (await rdr.ReadAsync())
							{
								entries.Add(new NotepadEntry(
										id: rdr.GetInt32(0),
										note: rdr.GetString(1),
										date: rdr.GetDateTime(2),
										ownership: rdr.IsDBNull(3) ? null : rdr.GetString(3)
								));
							}
							return Ok(entries);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching Notepad." + ex.Message, req.UserId, "NOTE", true);
				return StatusCode(500, "An error occurred while fetching Notepad.");
			}
		}

		[HttpPost("/Notepad/Share/{noteId}", Name = "ShareNote")]
		public async Task<IActionResult> Get([FromBody] ShareNotepadRequest request, int noteId)
		{
			if (request.User1Id == null || request.User2Id == null)
			{
				return BadRequest("Both users must be present in the request");
			}
			string sql = "UPDATE maxhanna.notepad SET Ownership = CONCAT(Ownership, ',', @User2Idid) WHERE id = @noteId";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@User2Idid", request.User2Id);
						cmd.Parameters.AddWithValue("@noteId", noteId);

						if (await cmd.ExecuteNonQueryAsync() > 0)
						{
						}
						else
						{
							_ = _log.Db("Returned 500", request.User1Id, "NOTE", true);
							return StatusCode(500, "Failed to insert data");
						}
					}
				} 
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching Notepad." + ex.Message, request.User1Id, "NOTE", true);
				return StatusCode(500, "An error occurred while fetching Notepad.");
			}

			string sql2 = "INSERT INTO maxhanna.notifications (user_id, from_user_id, text, date) VALUES(@userId, @fromUserId, @text, UTC_TIMESTAMP())";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql2, conn))
					{
						cmd.Parameters.AddWithValue("@fromUserId", request.User1Id);
						cmd.Parameters.AddWithValue("@userId", request.User2Id);
						cmd.Parameters.AddWithValue("@text", "A note was shared with you! Open notepad to view it."); 

						if (await cmd.ExecuteNonQueryAsync() > 0)
						{
						}
						else
						{
							_ = _log.Db("Returned 500", request.User1Id, "NOTE", true);
							return StatusCode(500, "Failed to insert data");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching Notepad." + ex.Message, request.User1Id, "NOTE", true);
				return StatusCode(500, "An error occurred while fetching Notepad.");
			} 
			return Ok(); 
		}
		[HttpPost("/Notepad/{id}", Name = "GetNoteById")]
		public async Task<IActionResult> Get([FromBody] int userId, int id)
		{  
			string sql = "SELECT " +
											"id, note, date, ownership " +
									"FROM " +
											"maxhanna.notepad " +
									"WHERE " +
											"id = @ID " +
											"AND " +
											"(" +
													"ownership = @Owner " +
													"OR " +
													"ownership LIKE CONCAT('%,', @Owner, ',%') " +
													"OR " +
													"ownership LIKE CONCAT(@Owner, ',%') " +
													"OR " +
													"ownership LIKE CONCAT('%,', @Owner)" +
											")";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@ID", id);
						cmd.Parameters.AddWithValue("@Owner", userId);

						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							while (await rdr.ReadAsync())
							{
								return Ok(new NotepadEntry(
										id: rdr.GetInt32(0),
										note: rdr.GetString(1),
										date: rdr.GetDateTime(2),
										ownership: rdr.IsDBNull(3) ? null : rdr.GetString(3)
								));
							}
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching Notepad." + ex.Message, userId, "NOTE", true);
				return StatusCode(500, "An error occurred while fetching Notepad.");
			}
			return StatusCode(404, "Note/Server problem?.");
		}

		[HttpPost("/Notepad/Create", Name = "CreateNote")]
		public async Task<IActionResult> Post([FromBody] CreateNote note)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				// Assuming CalendarEntryModel has properties for Type, Note, and Date
				string sql = "INSERT INTO maxhanna.notepad (note, ownership) VALUES (@Note, @Owner)";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Note", note.note);
				cmd.Parameters.AddWithValue("@Owner", note.userId);
				if (await cmd.ExecuteNonQueryAsync() > 0)
				{
					return Ok();
				}
				else
				{
					_ = _log.Db("Returned 500", note.userId, "NOTE", true);
					return StatusCode(500, "Failed to insert data");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request." + ex.Message, note.userId, "NOTE", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}
		[HttpPost("/Notepad/Update/{id}", Name = "UpdateNote")]
		public async Task<IActionResult> Post(string id, [FromBody] CreateNote note)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql =
						"UPDATE " +
								"maxhanna.notepad " +
						"SET " +
								"note = @Note " +
						"WHERE " +
								"id = @ID " +
								"AND " +
								"(" +
										"ownership LIKE @Owner " +
										"OR " +
										"ownership LIKE CONCAT('%,', @Owner, ',%') " +
										"OR " +
										"ownership LIKE CONCAT(@Owner, ',%') " +
										"OR " +
										"ownership LIKE CONCAT('%,', @Owner)" +
								")";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Note", note.note);
				cmd.Parameters.AddWithValue("@ID", id);
				cmd.Parameters.AddWithValue("@Owner", note.userId);
				if (await cmd.ExecuteNonQueryAsync() > 0)
				{ 
					return Ok();
				}
				else
				{
					_ = _log.Db("Post Returned 500", note.userId, "NOTE", true);
					return StatusCode(500, "Failed to insert data");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request." +ex.Message, note.userId, "NOTE", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}

		[HttpDelete("/Notepad/{id}", Name = "DeleteNote")]
		public async Task<IActionResult> Delete([FromBody] int userId, int id)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql =
						"DELETE FROM " +
								"maxhanna.notepad " +
						"WHERE " +
								"ID = @Id " +
						"AND " +
						"(" +
								"ownership = @Owner " +
								"OR " +
								"ownership LIKE CONCAT('%,', @Owner, ',%') " +
								"OR " +
								"ownership LIKE CONCAT(@Owner, ',%') " +
								"OR " +
								"ownership LIKE CONCAT('%,', @Owner)" +
						")";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@Id", id);
				cmd.Parameters.AddWithValue("@Owner", userId.ToString());
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
				_ = _log.Db("An error occurred while processing the DELETE request. " + ex.Message, userId, "NOTE", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
		}
	}
	public class ShareNotepadRequest
	{
		public int? User1Id { get; set; }
		public int? User2Id { get; set; }
	}
	public class GetNotepadRequest
	{
		public int? UserId { get; set; }
		public string? Search { get; set; }
	}
}
