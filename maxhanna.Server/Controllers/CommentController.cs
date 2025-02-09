using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using maxhanna.Server.Controllers.DataContracts.Comments;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CommentController : ControllerBase
	{
		private readonly ILogger<CommentController> _logger;
		private readonly IConfiguration _config;

		public CommentController(ILogger<CommentController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
		}

		[HttpPost(Name = "PostComment")]
		public async Task<IActionResult> PostComment([FromBody] CommentRequest request)
		{
			_logger.LogInformation($"POST /Comment (for user {request.User?.Id})");
			string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

			if ((request.FileId != null && request.StoryId != null))
			{
				string message = "Both file_id and story_id cannot be provided at the same time.";
				_logger.LogInformation(message);
				return BadRequest(message);
			}  
			else if (request.FileId == 0 && request.StoryId == 0)
			{
				string message = "Both FileId and StoryId cannot be zero.";
				_logger.LogInformation(message);
				return BadRequest(message);
			} 

			try
			{
				using (var conn = new MySqlConnection(connectionString))
				{
					await conn.OpenAsync();

					string sql;
					string notificationSql;
					int insertedId = 0;
					if (request.FileId != null)
					{
						sql = "INSERT INTO maxhanna.comments (user_id, file_id, comment) VALUES (@user_id, @file_id, @comment); SELECT LAST_INSERT_ID();";
						notificationSql =
								@"INSERT INTO maxhanna.notifications
                                (user_id, from_user_id, file_id, text)
                            VALUES
                                ((SELECT user_id FROM maxhanna.file_uploads WHERE id = @file_id), @user_id, @file_id, @comment);

                            INSERT INTO maxhanna.notifications
                                (user_id, from_user_id, file_id, text)
                            SELECT DISTINCT user_id, @user_id, @file_id, @comment
                            FROM maxhanna.comments
                            WHERE file_id = @file_id
                            AND user_id <> @user_id;";
					}
					else if (request.StoryId != null)
					{
						sql = "INSERT INTO maxhanna.comments (user_id, story_id, comment) VALUES (@user_id, @story_id, @comment); SELECT LAST_INSERT_ID();";
						notificationSql =
								@"INSERT INTO maxhanna.notifications
                                (user_id, from_user_id, story_id, text)
                            VALUES
                                ((SELECT user_id FROM maxhanna.stories WHERE id = @story_id), @user_id, @story_id, @comment);";
					}
					else
					{
						return BadRequest("Either file_id or story_id must be provided.");
					}

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@user_id", request.User?.Id ?? 0);
						cmd.Parameters.AddWithValue("@comment", request.Comment);

						if (request.FileId != null)
						{
							cmd.Parameters.AddWithValue("@file_id", request.FileId);
						}
						else
						{
							cmd.Parameters.AddWithValue("@story_id", request.StoryId);
						}

						using (var reader = await cmd.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								insertedId = reader.GetInt32(0);
								_logger.LogInformation("inserted comment : " + insertedId);
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


					using (var cmd = new MySqlCommand(notificationSql, conn))
					{
						cmd.Parameters.AddWithValue("@user_id", request.User?.Id ?? 0);
						cmd.Parameters.AddWithValue("@comment", request.Comment);

						if (request.FileId != null)
						{
							cmd.Parameters.AddWithValue("@file_id", request.FileId);
						}
						else
						{
							cmd.Parameters.AddWithValue("@story_id", request.StoryId);
						}

						await cmd.ExecuteNonQueryAsync();

					}

					return Ok($"{insertedId} Comment Successfully Added");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing the POST request.");
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}


		[HttpPost("/Comment/DeleteComment", Name = "DeleteComment")]
		public async Task<IActionResult> DeleteComment([FromBody] DeleteCommentRequest request)
		{
			_logger.LogInformation($"POST /Comment (for user {request.User?.Id})");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				string sql = "DELETE FROM maxhanna.comments WHERE id = @comment_id AND user_id = @user_id";

				using (MySqlCommand cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
					cmd.Parameters.AddWithValue("@user_id", request.User?.Id ?? 0);

					await cmd.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing the GET request.");
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
			_logger.LogInformation($"POST /Comment/EditComment (for user {request.User?.Id})");

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				string sql = "UPDATE maxhanna.comments SET comment = @Text WHERE id = @comment_id AND user_id = @user_id";

				using (MySqlCommand cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@comment_id", request.CommentId);
					cmd.Parameters.AddWithValue("@user_id", request.User?.Id ?? 0);
					cmd.Parameters.AddWithValue("@Text", request.Text);

					await cmd.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing the GET request.");
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
