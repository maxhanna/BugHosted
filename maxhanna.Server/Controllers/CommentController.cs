using maxhanna.Server.Controllers.DataContracts.Comments;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

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

			if (request.FileId != null && request.StoryId != null)
			{
				string message = "Both file_id and story_id cannot be provided at the same time.";
				_ = _log.Db(message, request.UserId, "COMMENT", true);
				return BadRequest(message);
			}
			if ((request.FileId ?? 0) == 0 && (request.StoryId ?? 0) == 0)
			{
				string message = "Either FileId or StoryId must be provided.";
				_ = _log.Db(message, request.UserId, "COMMENT", true);
				return BadRequest(message);
			}

			try
			{
				using (var conn = new MySqlConnection(connectionString))
				{
					await conn.OpenAsync();

					int insertedId = 0;

					// Build dynamic column list for optional parent ids (file_id, story_id, comment_id)
					var columns = new List<string>();
					var paramNames = new List<string>();
					if (request.FileId != null)
					{
						columns.Add("file_id");
						paramNames.Add("@fileId");
					}
					if (request.StoryId != null)
					{
						columns.Add("story_id");
						paramNames.Add("@storyId");
					}
					if (request.CommentId != null)
					{
						columns.Add("comment_id");
						paramNames.Add("@commentId");
					}

					if (columns.Count == 0)
					{
						return BadRequest("Either file_id, story_id, or comment_id must be provided.");
					}

					var columnsSql = ", " + string.Join(", ", columns);
					var paramsSql = ", " + string.Join(", ", paramNames);

					string sql = $@"
						INSERT INTO maxhanna.comments 
						(user_id{columnsSql}, comment, user_profile_id, date, city, country, ip) 
						VALUES 
						(@user_id{paramsSql}, @comment, @userProfileId, UTC_TIMESTAMP(), @city, @country, @ip); 
						SELECT LAST_INSERT_ID();";

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@user_id", request.UserId);
						// add optional parent id params only when present
						if (request.FileId != null) cmd.Parameters.AddWithValue("@fileId", request.FileId);
						if (request.StoryId != null) cmd.Parameters.AddWithValue("@storyId", request.StoryId);
						if (request.CommentId != null) cmd.Parameters.AddWithValue("@commentId", request.CommentId);
						cmd.Parameters.AddWithValue("@comment", request.Comment);
						cmd.Parameters.AddWithValue("@userProfileId", request.UserProfileId ?? (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@city", request.City);
						cmd.Parameters.AddWithValue("@country", request.Country);
						cmd.Parameters.AddWithValue("@ip", request.Ip);


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

					if (insertedId != 0 && request.UserId > 0)
					{
						string context = request.StoryId != null ? "a post" : request.FileId != null ? "a file" : "a comment";
						string eventText = $"commented on {context}";
						await UserEventController.InsertUserEventStatic(request.UserId, "comment", eventText, insertedId, "comment", _config, _log);
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

		[HttpPost("/Comment/EditCommentFiles", Name = "EditCommentFiles")]
		public async Task<IActionResult> EditCommentFiles([FromBody] DataContracts.Comments.EditCommentFilesRequest request)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();
				string delSql = "DELETE FROM maxhanna.comment_files WHERE comment_id = @CommentId";
				using (var delCmd = new MySqlCommand(delSql, conn))
				{
					delCmd.Parameters.AddWithValue("@CommentId", request.CommentId);
					await delCmd.ExecuteNonQueryAsync();
				}
				if (request.SelectedFiles != null && request.SelectedFiles.Count > 0)
				{
					foreach (var f in request.SelectedFiles)
					{
						string insSql = "INSERT INTO maxhanna.comment_files (comment_id, file_id) VALUES (@CommentId, @FileId)";
						using (var insCmd = new MySqlCommand(insSql, conn))
						{
							insCmd.Parameters.AddWithValue("@CommentId", request.CommentId);
							insCmd.Parameters.AddWithValue("@FileId", f.Id);
							await insCmd.ExecuteNonQueryAsync();
						}
					}
				}
				return Ok("Comment files updated");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the EditCommentFiles request. " + ex.Message, request.UserId, "COMMENT", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}

		[HttpPost("/Comment/GetCommentById", Name = "GetCommentById")]
		public async Task<IActionResult> GetCommentById([FromBody] GetCommentByIdRequest request)
		{
			try
			{
				string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
				using (var conn = new MySqlConnection(connectionString))
				{
					await conn.OpenAsync();

					// Build recursive CTE query to get the comment and all its descendants (child comments)
					string sql = @"
						WITH RECURSIVE comment_tree (id, depth) AS (
						  SELECT id, 0 as depth FROM maxhanna.comments WHERE id = @commentId
						  UNION ALL
						  SELECT c.id, ct.depth + 1 FROM maxhanna.comments c
						  JOIN comment_tree ct ON c.comment_id = ct.id
						  WHERE ct.depth < 5  -- Limit recursion depth to 5 levels to prevent stack overflow
						)
						SELECT 
							-- comment + user (who wrote the comment)
							c.id AS commentId,
							c.file_id AS commentFileId,
							c.story_id AS commentStoryId,
							c.comment_id AS comment_parent_id,
							c.user_id AS commentUserId,
							c.date AS commentDate,
							c.city AS commentCity,
							c.country AS commentCountry,
							c.ip AS commentIp,
							uc.username AS commentUsername,
							c.comment AS commentText,
							COALESCE(us.display_profile_location, 1) AS commentDisplayProfileLocation,

							-- comment author's display picture (ucudpfu)
							ucudpfu.id AS commentUserDisplayPicId,
							ucudpfu.file_name AS commentUserDisplayPicFileName,
							ucudpfu.given_file_name AS commentUserDisplayPicGivenFileName,
							ucudpfu.folder_path AS commentUserDisplayPicFolderPath,
							ucudpfu.is_public AS commentUserDisplayPicIsPublic,
							ucudpfu.file_type AS commentUserDisplayPicType,
							ucudpfu.file_size AS commentUserDisplayPicSize,
							ucudpfu.width AS commentUserDisplayPicWidth,
							ucudpfu.height AS commentUserDisplayPicHeight,
							ucudpfu.upload_date AS commentUserDisplayPicUploadDate,
							ucudpfu.last_updated AS commentUserDisplayPicLastUpdated,

							-- attached file on the comment (comment_files -> file_uploads)
							cf.file_id AS commentFileEntryId,
							cf2.file_name AS commentFileEntryName,
							cf2.given_file_name AS commentFileEntryGivenFileName,
							cf2.description AS commentFileEntryDescription,
							cf2.folder_path AS commentFileEntryFolderPath,
							cf2.is_public AS commentFileEntryIsPublic,
							cf2.is_folder AS commentFileEntryIsFolder,
							cf2.user_id AS commentFileEntryUserId,
							cfu2.username AS commentFileEntryUserName,
							cf2.file_type AS commentFileEntryType,
							cf2.file_size AS commentFileEntrySize,
							cf2.upload_date AS commentFileEntryDate,
							cf2.last_updated AS commentFileEntryLastUpdated,
							cf2.last_updated_by_user_id AS commentFileEntryLastUpdatedByUserId,
							cf2.width AS commentFileEntryWidth,
							cf2.height AS commentFileEntryHeight,
							cf2.duration AS commentFileEntryDuration,
							cf2.last_access AS commentFileEntryLastAccess,
							cf2.access_count AS commentFileEntryAccessCount,

							-- favourites: count is real; is_favourited is 0 here (no @userId in this method)
							(SELECT COUNT(*) FROM file_favourites ff WHERE ff.file_id = cf2.id) AS commentFileEntryFavouriteCount,
							CAST(0 AS SIGNED) AS commentFileEntryIsFavourited,

							-- reaction information (reactions -> users)
							r.id AS reactionId,
							r.type AS reactionType,
							r.user_id AS reactionUserId,
							ru.username AS reactionUsername,
							r.timestamp AS reactionDate,
							rudp.file_id AS reactionUserDisplayPicId,
							rudpfu.file_name AS reactionUserDisplayPicFileName,
							rudpfu.given_file_name AS reactionUserDisplayPicGivenFileName,
							rudpfu.folder_path AS reactionUserDisplayPicFolderPath,
							rudpfu.is_public AS reactionUserDisplayPicIsPublic,
							rudpfu.file_type AS reactionUserDisplayPicType,
							rudpfu.file_size AS reactionUserDisplayPicSize,
							rudpfu.width AS reactionUserDisplayPicWidth,
							rudpfu.height AS reactionUserDisplayPicHeight,
							rudpfu.upload_date AS reactionUserDisplayPicUploadDate,
							rudpfu.last_updated AS reactionUserDisplayPicLastUpdated

						FROM maxhanna.comments c
						LEFT JOIN maxhanna.users uc ON c.user_id = uc.id
						LEFT JOIN maxhanna.user_display_pictures ucudp ON ucudp.user_id = uc.id
						LEFT JOIN maxhanna.file_uploads ucudpfu ON ucudp.file_id = ucudpfu.id
						LEFT JOIN maxhanna.user_settings us ON us.user_id = c.user_id
						LEFT JOIN maxhanna.comment_files cf ON c.id = cf.comment_id
						LEFT JOIN maxhanna.file_uploads cf2 ON cf.file_id = cf2.id
						LEFT JOIN maxhanna.users cfu2 ON cfu2.id = cf2.user_id
						LEFT JOIN maxhanna.reactions r ON c.id = r.comment_id
						LEFT JOIN maxhanna.users ru ON r.user_id = ru.id
						LEFT JOIN maxhanna.user_display_pictures rudp ON rudp.user_id = ru.id
						LEFT JOIN maxhanna.file_uploads rudpfu ON rudp.file_id = rudpfu.id
						WHERE c.id IN (SELECT id FROM comment_tree)
						ORDER BY c.date ASC;";

					var comments = new Dictionary<int, FileComment>();
					FileComment? rootComment = null;

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@commentId", request.CommentId);
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
                                				// Get comment data
                                    	var commentId = reader.IsDBNull(reader.GetOrdinal("commentId")) ? 0 : reader.GetInt32("commentId");
                                    	var commentFileId = reader.IsDBNull(reader.GetOrdinal("commentFileId")) ? (int?)null : reader.GetInt32("commentFileId");
                                    	var commentStoryId = reader.IsDBNull(reader.GetOrdinal("commentStoryId")) ? (int?)null : reader.GetInt32("commentStoryId");
                                    	var commentParentId = reader.IsDBNull(reader.GetOrdinal("comment_parent_id")) ? (int?)null : reader.GetInt32("comment_parent_id");
                                    	var commentDate = reader.IsDBNull(reader.GetOrdinal("commentDate")) ? DateTime.MinValue : reader.GetDateTime("commentDate");
                                    	var commentCity = reader.IsDBNull(reader.GetOrdinal("commentCity")) ? null : reader.GetString("commentCity");
                                    	var commentCountry = reader.IsDBNull(reader.GetOrdinal("commentCountry")) ? null : reader.GetString("commentCountry");
                                    	var commentIp = reader.IsDBNull(reader.GetOrdinal("commentIp")) ? null : reader.GetString("commentIp");
                                    	var commentUsername = reader.IsDBNull(reader.GetOrdinal("commentUsername")) ? null : reader.GetString("commentUsername");
                                    	var commentText = reader.IsDBNull(reader.GetOrdinal("commentText")) ? null : reader.GetString("commentText");
                                    	var commentDisplayProfileLocation = reader.IsDBNull(reader.GetOrdinal("commentDisplayProfileLocation")) ? false : reader.GetBoolean("commentDisplayProfileLocation");

                                // Check if we've already created this comment
                                if (!comments.TryGetValue(commentId, out FileComment? comment))
                                {
                                    // Create a new comment instance
                                    comment = new FileComment
                                    {
                                        Id = commentId,
                                        FileId = commentFileId,
                                        StoryId = commentStoryId, 
                                        CommentId = commentParentId,
										User = new User
										{
											Id = reader.IsDBNull(reader.GetOrdinal("commentUserId")) ? 0 : reader.GetInt32("commentUserId"),
											Username = commentUsername
										},
                                        CommentText = commentText,
                                        Date = commentDate,
                                        City = commentCity,
                                        Country = commentCountry,
                                        Ip = commentIp,
                                        CommentFiles = new List<FileEntry>(),
                                        Comments = new List<FileComment>(),
                                        Reactions = new List<Reaction>()
                                    };

                                    comments[commentId] = comment;

                                    // If this is our root comment (no parent), set it as the root
                                    if (!commentParentId.HasValue)
                                    {
                                        rootComment = comment;
                                    }
                                }

                                // Add display picture and background picture to user
                                if (comment.User != null)
                                {
                                    // Display picture
									var dpId = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicId")) ? (int?)null : reader.GetInt32("commentUserDisplayPicId");
                                    if (dpId.HasValue)
                                    {
                                        comment.User.DisplayPictureFile = new FileEntry
                                        {
                                            Id = dpId.Value,
											FileName = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFileName")) ? null : reader.GetString("commentUserDisplayPicFileName"),
											GivenFileName = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicGivenFileName")) ? null : reader.GetString("commentUserDisplayPicGivenFileName"),
											Directory = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFolderPath")) ? null : reader.GetString("commentUserDisplayPicFolderPath"),
											Visibility = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicIsPublic")) ? null : (reader.GetBoolean("commentUserDisplayPicIsPublic") ? "Public" : "Private"),
											FileType = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicType")) ? null : reader.GetString("commentUserDisplayPicType"),
											FileSize = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicSize")) ? 0 : reader.GetInt32("commentUserDisplayPicSize"),
											Width = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicWidth")) ? (int?)null : reader.GetInt32("commentUserDisplayPicWidth"),
											Height = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicHeight")) ? (int?)null : reader.GetInt32("commentUserDisplayPicHeight"),
											Date = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicUploadDate")) ? new DateTime() : reader.GetDateTime("commentUserDisplayPicUploadDate"),
											LastUpdated = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicLastUpdated")) ? (DateTime?)null : reader.GetDateTime("commentUserDisplayPicLastUpdated")
                                        };
                                    }
                                    
                                    // Background picture
									var bgId = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundPicId")) ? (int?)null : reader.GetInt32("commentUserProfileBackgroundPicId");
                                    if (bgId.HasValue)
                                    {
                                        comment.User.ProfileBackgroundPictureFile = new FileEntry
                                        {
                                            Id = bgId.Value,
											FileName = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundFileName")) ? null : reader.GetString("commentUserProfileBackgroundFileName"),
											GivenFileName = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundGivenFileName")) ? null : reader.GetString("commentUserProfileBackgroundGivenFileName"),
											Directory = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundFolderPath")) ? null : reader.GetString("commentUserProfileBackgroundFolderPath"),
											Visibility = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundIsPublic")) ? null : (reader.GetBoolean("commentUserProfileBackgroundIsPublic") ? "Public" : "Private"),
											FileType = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundFileType")) ? null : reader.GetString("commentUserProfileBackgroundFileType"),
											FileSize = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundFileSize")) ? 0 : reader.GetInt32("commentUserProfileBackgroundFileSize"),
											Width = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundWidth")) ? (int?)null : reader.GetInt32("commentUserProfileBackgroundWidth"),
											Height = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundHeight")) ? (int?)null : reader.GetInt32("commentUserProfileBackgroundHeight"),
											Date = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundUploadDate")) ? new DateTime() : reader.GetDateTime("commentUserProfileBackgroundUploadDate"),
											LastUpdated = reader.IsDBNull(reader.GetOrdinal("commentUserProfileBackgroundLastUpdated")) ? (DateTime?)null : reader.GetDateTime("commentUserProfileBackgroundLastUpdated")
                                        };
                                    }
                                }

                                // Add attached files to comment
								var fileEntryId = reader.IsDBNull(reader.GetOrdinal("commentFileEntryId")) ? (int?)null : reader.GetInt32("commentFileEntryId");
                                if (fileEntryId.HasValue)
                                {
                                    var fileEntry = new FileEntry
                                    {
                                        Id = fileEntryId.Value,
										FileName = reader.IsDBNull(reader.GetOrdinal("commentFileEntryName")) ? null : reader.GetString("commentFileEntryName"),
										GivenFileName = reader.IsDBNull(reader.GetOrdinal("commentFileEntryGivenFileName")) ? (reader.IsDBNull(reader.GetOrdinal("commentFileEntryName")) ? null : reader.GetString("commentFileEntryName")) : reader.GetString("commentFileEntryGivenFileName"),
										Description = reader.IsDBNull(reader.GetOrdinal("commentFileEntryDescription")) ? null : reader.GetString("commentFileEntryDescription"),
										Directory = reader.IsDBNull(reader.GetOrdinal("commentFileEntryFolderPath")) ? null : reader.GetString("commentFileEntryFolderPath"),
										Visibility = reader.IsDBNull(reader.GetOrdinal("commentFileEntryIsPublic")) ? null : (reader.GetBoolean("commentFileEntryIsPublic") ? "Public" : "Private"),
										IsFolder = reader.IsDBNull(reader.GetOrdinal("commentFileEntryIsFolder")) ? false : reader.GetBoolean("commentFileEntryIsFolder"),
										User = new User
										{
											Id = reader.IsDBNull(reader.GetOrdinal("commentFileEntryUserId")) ? 0 : reader.GetInt32("commentFileEntryUserId"),
											Username = reader.IsDBNull(reader.GetOrdinal("commentFileEntryUserName")) ? "" : reader.GetString("commentFileEntryUserName")
										},
										Date = reader.IsDBNull(reader.GetOrdinal("commentFileEntryDate")) ? DateTime.Now : reader.GetDateTime("commentFileEntryDate"),
										LastUpdated = reader.IsDBNull(reader.GetOrdinal("commentFileEntryLastUpdated")) ? (DateTime?)null : reader.GetDateTime("commentFileEntryLastUpdated"),
										LastUpdatedUserId = reader.IsDBNull(reader.GetOrdinal("commentFileEntryLastUpdatedByUserId")) ? 0 : reader.GetInt32("commentFileEntryLastUpdatedByUserId"),
										FileType = reader.IsDBNull(reader.GetOrdinal("commentFileEntryType")) ? null : reader.GetString("commentFileEntryType"),
										FileSize = reader.IsDBNull(reader.GetOrdinal("commentFileEntrySize")) ? 0 : reader.GetInt32("commentFileEntrySize"),
										Width = reader.IsDBNull(reader.GetOrdinal("commentFileEntryWidth")) ? (int?)null : reader.GetInt32("commentFileEntryWidth"),
										Height = reader.IsDBNull(reader.GetOrdinal("commentFileEntryHeight")) ? (int?)null : reader.GetInt32("commentFileEntryHeight"),
										Duration = reader.IsDBNull(reader.GetOrdinal("commentFileEntryDuration")) ? (int?)null : reader.GetInt32("commentFileEntryDuration"),
										LastAccess = reader.IsDBNull(reader.GetOrdinal("commentFileEntryLastAccess")) ? (DateTime?)null : reader.GetDateTime("commentFileEntryLastAccess"),
										AccessCount = reader.IsDBNull(reader.GetOrdinal("commentFileEntryAccessCount")) ? 0 : reader.GetInt32("commentFileEntryAccessCount"),
										FavouriteCount = reader.IsDBNull(reader.GetOrdinal("commentFileEntryFavouriteCount")) ? 0 : reader.GetInt32("commentFileEntryFavouriteCount"),
										IsFavourited = reader.IsDBNull(reader.GetOrdinal("commentFileEntryIsFavourited")) ? false : reader.GetBoolean("commentFileEntryIsFavourited"),
                                    };

                                    if (comment.CommentFiles != null && !comment.CommentFiles.Any(f => f.Id == fileEntry.Id))
                                    {
                                        comment.CommentFiles.Add(fileEntry);
                                    }
                                }

                                // Add reaction to comment
								var reactionId = reader.IsDBNull(reader.GetOrdinal("reactionId")) ? (int?)null : reader.GetInt32("reactionId");
                                if (reactionId.HasValue)
                                {
                                    var reaction = new Reaction
                                    {
                                        Id = reactionId.Value,
                                        FileId = null,
                                        CommentId = commentId,
										Type = reader.IsDBNull(reader.GetOrdinal("reactionType")) ? null : reader.GetString("reactionType"),
										Timestamp = reader.IsDBNull(reader.GetOrdinal("reactionDate")) ? DateTime.MinValue : reader.GetDateTime("reactionDate"),
										User = new User
										{
											Id = reader.IsDBNull(reader.GetOrdinal("reactionUserId")) ? 0 : reader.GetInt32("reactionUserId"),
											Username = reader.IsDBNull(reader.GetOrdinal("reactionUsername")) ? null : reader.GetString("reactionUsername")
										}
                                    };

                                    // Add user display picture to reaction user
									var rxDpId = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicId")) ? (int?)null : reader.GetInt32("reactionUserDisplayPicId");
                                    if (rxDpId.HasValue)
                                    {
                                        reaction.User.DisplayPictureFile = new FileEntry
                                        {
                                            Id = rxDpId.Value,
											FileName = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicFileName")) ? null : reader.GetString("reactionUserDisplayPicFileName"),
											GivenFileName = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicGivenFileName")) ? null : reader.GetString("reactionUserDisplayPicGivenFileName"),
											Directory = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicFolderPath")) ? null : reader.GetString("reactionUserDisplayPicFolderPath"),
											Visibility = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicIsPublic")) ? null : (reader.GetBoolean("reactionUserDisplayPicIsPublic") ? "Public" : "Private"),
											FileType = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicType")) ? null : reader.GetString("reactionUserDisplayPicType"),
											FileSize = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicSize")) ? 0 : reader.GetInt32("reactionUserDisplayPicSize"),
											Width = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicWidth")) ? (int?)null : reader.GetInt32("reactionUserDisplayPicWidth"),
											Height = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicHeight")) ? (int?)null : reader.GetInt32("reactionUserDisplayPicHeight"),
											Date = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicUploadDate")) ? new DateTime() : reader.GetDateTime("reactionUserDisplayPicUploadDate"),
											LastUpdated = reader.IsDBNull(reader.GetOrdinal("reactionUserDisplayPicLastUpdated")) ? (DateTime?)null : reader.GetDateTime("reactionUserDisplayPicLastUpdated")
                                        };
                                    }

                                    if (comment.Reactions != null && !comment.Reactions.Any(r => r.Id == reaction.Id))
                                    {
                                        comment.Reactions.Add(reaction);
                                    }
                                }
                            }
                        }
                    }

                    // Return the comment if found
                    if (rootComment != null)
                    {
                        return Ok(rootComment);
                    }
                    else
                    {
                        return NotFound("Comment not found.");
                    }
                }
            }
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while retrieving comment by id. " + ex.Message, null, "COMMENT", true);
				return StatusCode(500, "An error occurred while retrieving the comment.");
			}
		}
	}
}
