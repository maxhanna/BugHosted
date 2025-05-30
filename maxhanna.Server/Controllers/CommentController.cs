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

		[HttpPost("/Comment/GetCommentData", Name = "GetCommentData")]
		public async Task<IActionResult> GetCommentData([FromBody] int commentId)
		{ 
			List<FileComment> tmpComments = new List<FileComment>();
			StringBuilder sqlBuilder = new StringBuilder();

			sqlBuilder.AppendLine(@"
        SELECT 
            c.id AS comment_id,
            c.story_id AS story_id,
            c.user_id AS comment_user_id,
            u.username AS comment_username,
            udpfu.id AS profileFileId,
            udpfu.file_name AS profileFileName,
            udpfu.folder_path AS profileFileFolder,
            c.comment,
            c.user_profile_id,
            c.date,
            c.city,
            c.country,
            c.ip,
            cf.file_id AS comment_file_id,
            f.file_name AS comment_file_name,
            f.folder_path AS comment_file_folder_path,
            f.is_public AS comment_file_visibility,
            f.shared_with AS comment_file_shared_with,
            f.is_folder AS comment_file_is_folder,
            f.upload_date AS comment_file_date,
            fu.id AS file_user_id,
            fu.username AS file_username,
            f.given_file_name AS comment_file_given_file_name,
            f.description AS comment_file_description,
            f.last_updated AS comment_file_last_updated,
            r.id AS reaction_id,
            r.type AS reaction_type,
            r.user_id AS reaction_user_id,
            ru.username AS reaction_username,
            r.timestamp AS reaction_time
        FROM 
            comments AS c
        LEFT JOIN users AS u ON c.user_id = u.id
        LEFT JOIN user_display_pictures AS udp ON udp.user_id = u.id
        LEFT JOIN file_uploads AS udpfu ON udp.file_id = udpfu.id
        LEFT JOIN comment_files AS cf ON cf.comment_id = c.id
        LEFT JOIN file_uploads AS f ON cf.file_id = f.id 
        LEFT JOIN users AS fu ON f.user_id = fu.id
        LEFT JOIN reactions AS r ON c.id = r.comment_id AND r.comment_id IS NULL
        LEFT JOIN users AS ru ON r.user_id = ru.id   
        WHERE c.comment_id = @commentId
        ORDER BY c.id, r.id, cf.file_id;");

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				//Console.WriteLine(sqlBuilder.ToString());
				using (var cmd = new MySqlCommand(sqlBuilder.ToString(), conn))
				{
					cmd.Parameters.AddWithValue("@commentId", commentId);
					using (var rdr = await cmd.ExecuteReaderAsync())
					{

						while (await rdr.ReadAsync())
						{
							int userId = rdr.GetInt32("comment_user_id");
							string userName = rdr.GetString("comment_username");
							string commentText = rdr.GetString("comment");
							int? userProfileId = rdr.IsDBNull("user_profile_id") ? null : rdr.GetInt32("user_profile_id");
							DateTime date = rdr.GetDateTime("date");
							string? city = rdr.IsDBNull("city") ? null : rdr.GetString("city");
							string? country = rdr.IsDBNull("country") ? null : rdr.GetString("country");
							string? ip = rdr.IsDBNull("ip") ? null : rdr.GetString("ip");

							int? displayPicId = rdr.IsDBNull("profileFileId") ? null : rdr.GetInt32("profileFileId");
							string? displayPicFolderPath = rdr.IsDBNull("profileFileFolder") ? null : rdr.GetString("profileFileFolder");
							string? displayPicFileName = rdr.IsDBNull("profileFileName") ? null : rdr.GetString("profileFileName");

							FileEntry? dpFileEntry = displayPicId.HasValue
									? new FileEntry { Id = displayPicId.Value, Directory = displayPicFolderPath, FileName = displayPicFileName }
									: null;

							// Check if comment already exists
							var tmpComment = new FileComment
							{
								Id = rdr.GetInt32("comment_id"),
								CommentText = commentText,
								UserProfileId = userProfileId,
								User = new User(userId, userName, null, dpFileEntry, null, null, null),
								Date = date,
								City = city,
								Country = country,
								Ip = ip,
								CommentFiles = new List<FileEntry>(),
								Reactions = new List<Reaction>()
							};


							// Process reactions
							if (!rdr.IsDBNull("reaction_id"))
							{
								var reactionId = rdr.GetInt32("reaction_id");
								if (!tmpComment.Reactions.Any(r => r.Id == reactionId))
								{
									tmpComment.Reactions.Add(new Reaction
									{
										Id = reactionId,
										Type = rdr.GetString("reaction_type"),
										Timestamp = rdr.GetDateTime("reaction_time"),
										User = new User(rdr.GetInt32("reaction_user_id"), rdr.GetString("reaction_username"))
									});
								}
							}

							// Process comment files
							if (!rdr.IsDBNull("comment_file_id"))
							{
								var fileId = rdr.GetInt32("comment_file_id");
								if (!tmpComment.CommentFiles.Any(f => f.Id == fileId))
								{
									tmpComment.CommentFiles.Add(new FileEntry
									{
										Id = fileId,
										FileName = rdr.IsDBNull("comment_file_name") ? null : rdr.GetString("comment_file_name"),
										Directory = rdr.IsDBNull("comment_file_folder_path") ? "" : rdr.GetString("comment_file_folder_path"),
										Visibility = rdr.IsDBNull("comment_file_visibility") ? null : rdr.GetBoolean("comment_file_visibility") ? "Public" : "Private",
										SharedWith = rdr.IsDBNull("comment_file_shared_with") ? null : rdr.GetString("comment_file_shared_with"),
										User = new User(
													rdr.IsDBNull("file_user_id") ? 0 : rdr.GetInt32("file_user_id"),
													rdr.IsDBNull("file_username") ? "Anonymous" : rdr.GetString("file_username")
											),
										IsFolder = rdr.GetBoolean("comment_file_is_folder"),
										Date = rdr.GetDateTime("comment_file_date"),
										FileData = new FileData
										{
											FileId = fileId,
											GivenFileName = rdr.IsDBNull("comment_file_given_file_name") ? null : rdr.GetString("comment_file_given_file_name"),
											Description = rdr.IsDBNull("comment_file_description") ? null : rdr.GetString("comment_file_description"),
											LastUpdated = rdr.IsDBNull("comment_file_last_updated") ? null : rdr.GetDateTime("comment_file_last_updated")
										}
									});
								}
							}

							tmpComments.Add(tmpComment);
						}
					}
				}
			}
			Console.WriteLine(tmpComments.Count);
			return Ok(tmpComments);
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
