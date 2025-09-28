using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Comments;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;
using System.Text;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CommentController : ControllerBase
	{ 
		private readonly IConfiguration _config;
		private readonly Log _log;
		public CommentController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost(Name = "PostComment")]
		public async Task<IActionResult> PostComment([FromBody] CommentRequest request)
		{ 
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			if ((request.FileId != null && request.StoryId != null))
			{
				string message = "Both file_id and story_id cannot be provided at the same time.";
				_ = _log.Db(message, request.UserId, "COMMENT", true);
				return BadRequest(message);
			}
			else if (request.FileId == 0 && request.StoryId == 0)
			{
				string message = "Both FileId and StoryId cannot be zero."; 
				_ = _log.Db(message, request.UserId, "COMMENT", true);
				return BadRequest(message);
			}

			try
			{
				using (var conn = new MySqlConnection(connectionString))
				{
					await conn.OpenAsync();

					int insertedId = 0;
					string column;
					int? idValue;

					if (request.FileId != null)
					{
						column = "file_id";
						idValue = request.FileId;
					}
					else if (request.StoryId != null)
					{
						column = "story_id";
						idValue = request.StoryId;
					}
					else if (request.CommentId != null)
					{
						column = "comment_id";
						idValue = request.CommentId;
					}
					else
					{
						return BadRequest("Either file_id, story_id, or comment_id must be provided.");
					}
					string sql = $@"
						INSERT INTO maxhanna.comments 
						(user_id, {column}, comment, user_profile_id, date, city, country, ip) 
						VALUES 
						(@user_id, @id, @comment, @userProfileId, UTC_TIMESTAMP(), @city, @country, @ip); 
						SELECT LAST_INSERT_ID();";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@user_id", request.UserId);
						cmd.Parameters.AddWithValue("@comment", request.Comment);
						cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@city", request.City);
						cmd.Parameters.AddWithValue("@country", request.Country);
						cmd.Parameters.AddWithValue("@ip", request.Ip);
						cmd.Parameters.AddWithValue($"@id", idValue);


						using (var reader = await cmd.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								insertedId = reader.GetInt32(0); 
							}
						}
						if (insertedId != 0 && request.SelectedFiles != null && request.SelectedFiles.Count > 0)
						{
							foreach (var file in request.SelectedFiles)
							{
								using (var fileConn = new MySqlConnection(connectionString))
								{
									await fileConn.OpenAsync();
									string fileSql = @"INSERT INTO comment_files (comment_id, file_id) VALUES (@commentId, @fileId);";
									using (var fileCmd = new MySqlCommand(fileSql, fileConn))
									{
										fileCmd.Parameters.AddWithValue("@commentId", insertedId);
										fileCmd.Parameters.AddWithValue("@fileId", file.Id);
										await fileCmd.ExecuteNonQueryAsync();
									}
								}
							}
						}
					}

					return Ok($"{insertedId} Comment Successfully Added");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the PostComment request. " + ex.Message, request.UserId, "COMMENT", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
		} 

		[HttpPost("/Comment/DeleteComment", Name = "DeleteComment")]
		public async Task<IActionResult> DeleteComment([FromBody] DeleteCommentRequest request)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				string sql = "DELETE FROM maxhanna.comments WHERE id = @comment_id AND user_id = @user_id";

				using (MySqlCommand cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
					cmd.Parameters.AddWithValue("@user_id", request.UserId);

					await cmd.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the DeleteComment request. " + ex.Message, request.UserId, "COMMENT", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
			return Ok("Comment successfully deleted");
		}

		[HttpPost("/Comment/EditComment", Name = "EditComment")]
		public async Task<IActionResult> EditComment([FromBody] EditCommentRequest request)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				string sql = "UPDATE maxhanna.comments SET comment = @Text WHERE id = @comment_id AND user_id = @user_id";

				using (MySqlCommand cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
					cmd.Parameters.AddWithValue("@user_id", request.UserId);
					cmd.Parameters.AddWithValue("@Text", request.Text);

					await cmd.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the EditComment request. " + ex.Message, request.UserId, "COMMENT", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
			finally
			{
				conn.Close();
			}
			return Ok("Comment successfully edited");
		} 
	}
}
