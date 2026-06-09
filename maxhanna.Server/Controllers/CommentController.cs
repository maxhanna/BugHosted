using maxhanna.Server.Controllers.DataContracts.Comments;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Social;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;

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

					string sql = @"
						WITH RECURSIVE comment_tree (id, depth) AS (
						  SELECT id, 0 as depth FROM maxhanna.comments WHERE id = @commentId
						  UNION ALL
						  SELECT c.id, ct.depth + 1 FROM maxhanna.comments c
						  JOIN comment_tree ct ON c.comment_id = ct.id
						  WHERE ct.depth < 5
						)
						SELECT 
							c.id AS commentId,
							c.file_id AS commentFileId,
							c.story_id AS commentStoryId,
							c.comment_id AS comment_parent_id,
							c.user_id AS commentUserId,
							c.date AS commentDate,
							c.city AS commentCity,
							c.country AS commentCountry,
							c.ip AS commentIp,
							c.comment AS commentText,

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

							(SELECT COUNT(*) FROM file_favourites ff WHERE ff.file_id = cf2.id) AS commentFileEntryFavouriteCount,
							CAST(0 AS SIGNED) AS commentFileEntryIsFavourited,

							r.id AS reactionId,
							r.type AS reactionType,
							r.user_id AS reactionUserId,
							r.timestamp AS reactionDate

						FROM maxhanna.comments c
						LEFT JOIN maxhanna.comment_files cf ON c.id = cf.comment_id
						LEFT JOIN maxhanna.file_uploads cf2 ON cf.file_id = cf2.id
						LEFT JOIN maxhanna.users cfu2 ON cfu2.id = cf2.user_id
						LEFT JOIN maxhanna.reactions r ON c.id = r.comment_id
						WHERE c.id IN (SELECT id FROM comment_tree)
						ORDER BY c.date ASC;";

					var rawRows = new List<Dictionary<string, object?>>();
					var userIdsNeeded = new HashSet<int>();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@commentId", request.CommentId);
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								var row = new Dictionary<string, object?>();
								for (int i = 0; i < reader.FieldCount; i++)
								{
									row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
								}
								rawRows.Add(row);

								var uid = reader.IsDBNull(reader.GetOrdinal("commentUserId")) ? 0 : reader.GetInt32("commentUserId");
								if (uid > 0) userIdsNeeded.Add(uid);

								var ruid = reader.IsDBNull(reader.GetOrdinal("reactionUserId")) ? 0 : reader.GetInt32("reactionUserId");
								if (ruid > 0) userIdsNeeded.Add(ruid);
							}
						}
					}

					var cachedUsers = new Dictionary<int, User>();
					foreach (var uid in userIdsNeeded)
					{
						cachedUsers[uid] = new User(uid);
					}

					var comments = new Dictionary<int, FileComment>();
					FileComment? rootComment = null;

					foreach (var row in rawRows)
					{
						var commentId = row["commentId"] as int? ?? 0;
						if (commentId == 0) continue;
						var commentFileId = row["commentFileId"] as int?;
						var commentStoryId = row["commentStoryId"] as int?;
						var commentParentId = row["comment_parent_id"] as int?;
						var commentDate = row["commentDate"] as DateTime? ?? DateTime.MinValue;
						var commentCity = row["commentCity"] as string;
						var commentCountry = row["commentCountry"] as string;
						var commentIp = row["commentIp"] as string;
						var commentText = row["commentText"] as string;

						if (!comments.TryGetValue(commentId, out FileComment? comment))
						{
							var uid = row["commentUserId"] as int? ?? 0;
							comment = new FileComment
							{
								Id = commentId,
								FileId = commentFileId,
								StoryId = commentStoryId,
								CommentId = commentParentId,
								User = cachedUsers.TryGetValue(uid, out var cu) ? cu : new User(uid),
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

							if (commentId == request.CommentId)
							{
								rootComment = comment;
							}
						}

						var fileEntryId = row["commentFileEntryId"] as int?;
						if (fileEntryId.HasValue && comment != null)
						{
							var fileEntry = new FileEntry
							{
								Id = fileEntryId.Value,
								FileName = row["commentFileEntryName"] as string,
								GivenFileName = row["commentFileEntryGivenFileName"] as string ?? row["commentFileEntryName"] as string,
								Description = row["commentFileEntryDescription"] as string,
								Directory = row["commentFileEntryFolderPath"] as string,
								Visibility = row["commentFileEntryIsPublic"] as bool? == true ? "Public" : "Private",
								IsFolder = row["commentFileEntryIsFolder"] as bool? ?? false,
								User = new User
								{
									Id = row["commentFileEntryUserId"] as int? ?? 0,
									Username = row["commentFileEntryUserName"] as string ?? ""
								},
								Date = row["commentFileEntryDate"] as DateTime? ?? DateTime.Now,
								LastUpdated = row["commentFileEntryLastUpdated"] as DateTime?,
								LastUpdatedUserId = row["commentFileEntryLastUpdatedByUserId"] as int? ?? 0,
								FileType = row["commentFileEntryType"] as string,
								FileSize = row["commentFileEntrySize"] as int? ?? 0,
								Width = row["commentFileEntryWidth"] as int?,
								Height = row["commentFileEntryHeight"] as int?,
								Duration = row["commentFileEntryDuration"] as int?,
								LastAccess = row["commentFileEntryLastAccess"] as DateTime?,
								AccessCount = row["commentFileEntryAccessCount"] as int? ?? 0,
								FavouriteCount = row["commentFileEntryFavouriteCount"] as int? ?? 0,
								IsFavourited = row["commentFileEntryIsFavourited"] as bool? ?? false,
							};

							if (comment.CommentFiles != null && !comment.CommentFiles.Any(f => f.Id == fileEntry.Id))
							{
								comment.CommentFiles.Add(fileEntry);
							}
						}

						var reactionId = row["reactionId"] as int?;
						if (reactionId.HasValue && comment != null)
						{
							var ruid = row["reactionUserId"] as int? ?? 0;
							var reaction = new Reaction
							{
								Id = reactionId.Value,
								FileId = null,
								CommentId = commentId,
								Type = row["reactionType"] as string,
								Timestamp = row["reactionDate"] as DateTime? ?? DateTime.MinValue,
								User = cachedUsers.TryGetValue(ruid, out var ru) ? ru : new User(ruid)
							};

							if (comment.Reactions != null && !comment.Reactions.Any(r => r.Id == reaction.Id))
							{
								comment.Reactions.Add(reaction);
							}
						}
					}

                    // Link child comments to their parents
                    foreach (var kvp in comments)
                    {
                        var c = kvp.Value;
                        if (c.CommentId.HasValue && comments.TryGetValue(c.CommentId.Value, out var parent))
                        {
                            parent.Comments ??= new List<FileComment>();
                            if (!parent.Comments.Any(x => x.Id == c.Id))
                                parent.Comments.Add(c);
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

		[HttpPost("/Comment/GetComments", Name = "GetComments")]
		public async Task<IActionResult> GetComments([FromBody] GetCommentsRequest request)
		{
			if ((request.FileId ?? 0) == 0 && (request.StoryId ?? 0) == 0 && (request.UserProfileId ?? 0) == 0)
			{
				return BadRequest("Either fileId, storyId, or userProfileId must be provided.");
			}

			try
			{
				string? connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
				using (var conn = new MySqlConnection(connectionString))
				{
					await conn.OpenAsync();

					string whereClause;
					string paramName;
					int paramValue;

					if (request.StoryId != null)
					{
						whereClause = "c.story_id = @id";
						paramName = "@id";
						paramValue = request.StoryId.Value;
					}
					else if (request.FileId != null)
					{
						whereClause = "c.file_id = @id";
						paramName = "@id";
						paramValue = request.FileId.Value;
					}
					else
					{
						whereClause = "c.user_profile_id = @id";
						paramName = "@id";
						paramValue = request.UserProfileId!.Value;
					}

					string sql = $@"
						WITH RECURSIVE comment_tree (id) AS (
							SELECT id
							FROM maxhanna.comments c
							WHERE {whereClause} AND c.comment_id IS NULL
							UNION ALL
							SELECT c.id
							FROM maxhanna.comments c
							JOIN comment_tree ct ON c.comment_id = ct.id
						)
						SELECT 
							c.id AS commentId,
							c.file_id AS commentFileId,
							c.story_id AS commentStoryId,
							c.comment_id AS comment_parent_id,
							c.user_id AS commentUserId,
							c.date AS commentDate,
							c.city AS commentCity,
							c.country AS commentCountry,
							c.ip AS commentIp,
							c.comment AS commentText,

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

							(SELECT COUNT(*) FROM file_favourites ff WHERE ff.file_id = cf2.id) AS commentFileEntryFavouriteCount,
							CAST(0 AS SIGNED) AS commentFileEntryIsFavourited,

							r.id AS reactionId,
							r.type AS reactionType,
							r.user_id AS reactionUserId,
							r.timestamp AS reactionDate

						FROM maxhanna.comments c
						LEFT JOIN maxhanna.comment_files cf ON c.id = cf.comment_id
						LEFT JOIN maxhanna.file_uploads cf2 ON cf.file_id = cf2.id
						LEFT JOIN maxhanna.users cfu2 ON cfu2.id = cf2.user_id
						LEFT JOIN maxhanna.reactions r ON c.id = r.comment_id
						WHERE c.id IN (SELECT id FROM comment_tree)
						ORDER BY c.date ASC;";

					var rawRows = new List<Dictionary<string, object?>>();
					var userIdsNeeded = new HashSet<int>();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue(paramName, paramValue);
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								var row = new Dictionary<string, object?>();
								for (int i = 0; i < reader.FieldCount; i++)
								{
									row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
								}
								rawRows.Add(row);

								var uid = reader.IsDBNull(reader.GetOrdinal("commentUserId")) ? 0 : reader.GetInt32("commentUserId");
								if (uid > 0) userIdsNeeded.Add(uid);

								var ruid = reader.IsDBNull(reader.GetOrdinal("reactionUserId")) ? 0 : reader.GetInt32("reactionUserId");
								if (ruid > 0) userIdsNeeded.Add(ruid);
							}
						}
					}

					var cachedUsers = new Dictionary<int, User>();
					foreach (var uid in userIdsNeeded)
					{
						cachedUsers[uid] = new User(uid);
					}

					var comments = new Dictionary<int, FileComment>();
					var topLevelIds = new List<int>();

					foreach (var row in rawRows)
					{
						var commentId = row["commentId"] as int? ?? 0;
						if (commentId == 0) continue;
						var commentFileId = row["commentFileId"] as int?;
						var commentStoryId = row["commentStoryId"] as int?;
						var commentParentId = row["comment_parent_id"] as int?;
						var commentDate = row["commentDate"] as DateTime? ?? DateTime.MinValue;
						var commentCity = row["commentCity"] as string;
						var commentCountry = row["commentCountry"] as string;
						var commentIp = row["commentIp"] as string;
						var commentText = row["commentText"] as string;

						if (!comments.TryGetValue(commentId, out FileComment? comment))
						{
							var uid = row["commentUserId"] as int? ?? 0;
							comment = new FileComment
							{
								Id = commentId,
								FileId = commentFileId,
								StoryId = commentStoryId,
								CommentId = commentParentId,
								User = cachedUsers.TryGetValue(uid, out var cu) ? cu : new User(uid),
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
							if (commentParentId == null)
							{
								topLevelIds.Add(commentId);
							}
						}

						var fileEntryId = row["commentFileEntryId"] as int?;
						if (fileEntryId.HasValue && comment != null)
						{
							var fileEntry = new FileEntry
							{
								Id = fileEntryId.Value,
								FileName = row["commentFileEntryName"] as string,
								GivenFileName = row["commentFileEntryGivenFileName"] as string ?? row["commentFileEntryName"] as string,
								Description = row["commentFileEntryDescription"] as string,
								Directory = row["commentFileEntryFolderPath"] as string,
								Visibility = row["commentFileEntryIsPublic"] as bool? == true ? "Public" : "Private",
								IsFolder = row["commentFileEntryIsFolder"] as bool? ?? false,
								User = new User
								{
									Id = row["commentFileEntryUserId"] as int? ?? 0,
									Username = row["commentFileEntryUserName"] as string ?? ""
								},
								Date = row["commentFileEntryDate"] as DateTime? ?? DateTime.Now,
								LastUpdated = row["commentFileEntryLastUpdated"] as DateTime?,
								LastUpdatedUserId = row["commentFileEntryLastUpdatedByUserId"] as int? ?? 0,
								FileType = row["commentFileEntryType"] as string,
								FileSize = row["commentFileEntrySize"] as int? ?? 0,
								Width = row["commentFileEntryWidth"] as int?,
								Height = row["commentFileEntryHeight"] as int?,
								Duration = row["commentFileEntryDuration"] as int?,
								LastAccess = row["commentFileEntryLastAccess"] as DateTime?,
								AccessCount = row["commentFileEntryAccessCount"] as int? ?? 0,
								FavouriteCount = row["commentFileEntryFavouriteCount"] as int? ?? 0,
								IsFavourited = row["commentFileEntryIsFavourited"] as bool? ?? false,
							};

							if (comment.CommentFiles != null && !comment.CommentFiles.Any(f => f.Id == fileEntry.Id))
							{
								comment.CommentFiles.Add(fileEntry);
							}
						}

						var reactionId = row["reactionId"] as int?;
						if (reactionId.HasValue && comment != null)
						{
							var ruid = row["reactionUserId"] as int? ?? 0;
							var reaction = new Reaction
							{
								Id = reactionId.Value,
								FileId = null,
								CommentId = commentId,
								Type = row["reactionType"] as string,
								Timestamp = row["reactionDate"] as DateTime? ?? DateTime.MinValue,
								User = cachedUsers.TryGetValue(ruid, out var ru) ? ru : new User(ruid)
							};

							if (comment.Reactions != null && !comment.Reactions.Any(r => r.Id == reaction.Id))
							{
								comment.Reactions.Add(reaction);
							}
						}
					}

					foreach (var kvp in comments)
					{
						var c = kvp.Value;
						if (c.CommentId.HasValue && comments.TryGetValue(c.CommentId.Value, out var parent))
						{
							parent.Comments ??= new List<FileComment>();
							if (!parent.Comments.Any(x => x.Id == c.Id))
								parent.Comments.Add(c);
						}
					}

					var result = topLevelIds.Select(id => comments[id]).ToList();

					await AttachPollVotesToComments(result);

					return Ok(result);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while retrieving comments. " + ex.Message, null, "COMMENT", true);
				return StatusCode(500, "An error occurred while retrieving comments.");
			}
		}

		private static IEnumerable<FileComment> FlattenComments(IEnumerable<FileComment> roots)
		{
			foreach (var c in roots)
			{
				yield return c;
				if (c.Comments != null && c.Comments.Count > 0)
				{
					foreach (var sub in FlattenComments(c.Comments))
					{
						yield return sub;
					}
				}
			}
		}

		private async Task AttachPollVotesToComments(List<FileComment> comments)
		{
			var allComments = FlattenComments(comments).ToList();
			if (allComments.Count == 0) return;

			var componentIds = allComments.Select(c => $"commentText{c.Id}").Distinct().ToList();
			if (componentIds.Count == 0) return;

			var parameterPlaceholders = componentIds.Select((_, i) => $"@compId{i}");
			string pollSql = $@"SELECT 
					pv.id, pv.user_id, pv.component_id, pv.value, pv.timestamp,
					u.username,
					udpfu.folder_path AS display_picture_folder,
					udpfu.file_name AS display_picture_filename
				FROM poll_votes pv
				JOIN users u ON pv.user_id = u.id
				LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN file_uploads udpfu ON udp.file_id = udpfu.id
				WHERE pv.component_id IN ({string.Join(",", parameterPlaceholders)})
				ORDER BY pv.timestamp DESC;";

			var pollData = new Dictionary<string, List<PollVote>>(StringComparer.OrdinalIgnoreCase);

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				using (var cmd = new MySqlCommand(pollSql, conn))
				{
					for (int i = 0; i < componentIds.Count; i++)
					{
						cmd.Parameters.AddWithValue($"@compId{i}", componentIds[i]);
					}
					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							string componentId = rdr.IsDBNull(rdr.GetOrdinal("component_id")) ? string.Empty : rdr.GetString("component_id");
							if (string.IsNullOrEmpty(componentId)) continue;
							if (!pollData.ContainsKey(componentId)) pollData[componentId] = new List<PollVote>();
							var vote = new PollVote
							{
								Id = rdr.IsDBNull(rdr.GetOrdinal("id")) ? 0 : rdr.GetInt32("id"),
								UserId = rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? 0 : rdr.GetInt32("user_id"),
								ComponentId = componentId,
								Value = rdr.IsDBNull(rdr.GetOrdinal("value")) ? string.Empty : rdr.GetString("value"),
								Timestamp = rdr.IsDBNull(rdr.GetOrdinal("timestamp")) ? DateTime.MinValue : rdr.GetDateTime("timestamp"),
								Username = rdr.IsDBNull(rdr.GetOrdinal("username")) ? string.Empty : rdr.GetString("username"),
								DisplayPicture = (rdr.IsDBNull(rdr.GetOrdinal("display_picture_folder")) || rdr.IsDBNull(rdr.GetOrdinal("display_picture_filename")))
									? null
									: $"/assets/Uploads/{rdr.GetString("display_picture_folder")}{rdr.GetString("display_picture_filename")}"
							};
							pollData[componentId].Add(vote);
						}
					}
				}
			}

			foreach (var comment in allComments)
			{
				try
				{
					string decrypted = _log.DecryptContent(comment.CommentText ?? string.Empty, ((comment.User?.Id ?? 0) + ""));
					string question = ExtractPollQuestion(decrypted);
					var options = ExtractPollOptions(decrypted);
					string componentId = $"commentText{comment.Id}";

					if (string.IsNullOrEmpty(question) && options.Any())
					{
						var derived = DeriveQuestionFallback(decrypted);
						if (!string.IsNullOrWhiteSpace(derived)) question = derived;
					}

					if (options.Any())
					{
						if (string.IsNullOrWhiteSpace(question)) question = "Poll";
						pollData.TryGetValue(componentId, out var votesForComponent);
						votesForComponent ??= new List<PollVote>();
						var poll = new Poll
						{
							ComponentId = componentId,
							Question = question,
							Options = options,
							UserVotes = votesForComponent,
							TotalVotes = votesForComponent.Count,
							CreatedAt = comment.Date
						};
						var voteCounts = poll.UserVotes
							.GroupBy(v => NormalizePollToken(v.Value))
							.ToDictionary(g => g.Key, g => g.Count());
						foreach (var opt in poll.Options)
						{
							var key = NormalizePollToken(opt.Text);
							int vc = voteCounts.TryGetValue(key, out var c) ? c : 0;
							opt.Text = key;
							opt.VoteCount = vc;
							opt.Percentage = poll.TotalVotes > 0 ? (int)Math.Round((double)vc / poll.TotalVotes * 100) : 0;
						}
						comment.Polls ??= new List<Poll>();
						comment.Polls.Add(poll);
					}
					else if (!options.Any() && pollData.TryGetValue(componentId, out var recordedVotes) && recordedVotes.Count > 0)
					{
						var optionGroups = recordedVotes
							.GroupBy(v => NormalizePollToken(v.Value))
							.Select(g => new PollOption { Id = g.Key, Text = g.Key, VoteCount = g.Count() })
							.ToList();
						int total = recordedVotes.Count;
						foreach (var o in optionGroups)
							o.Percentage = total > 0 ? (int)Math.Round((double)o.VoteCount / total * 100) : 0;
						var synthesized = new Poll
						{
							ComponentId = componentId,
							Question = string.IsNullOrEmpty(question) ? "Poll" : question,
							Options = optionGroups,
							UserVotes = recordedVotes,
							TotalVotes = total,
							CreatedAt = comment.Date
						};
						comment.Polls ??= new List<Poll>();
						comment.Polls.Add(synthesized);
					}
				}
				catch { }
			}
		}

		private string ExtractPollQuestion(string text)
		{
			if (string.IsNullOrEmpty(text) || !text.Contains("[Poll]") || !text.Contains("[/Poll]")) return string.Empty;
			try
			{
				int startIndex = text.IndexOf("[Poll]") + 6;
				int endIndex = text.IndexOf("[/Poll]");
				if (endIndex < startIndex) return string.Empty;
				string pollContent = text.Substring(startIndex, endIndex - startIndex).Trim();
				var lines = pollContent.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);
				foreach (var line in lines)
				{
					if (line.Trim().StartsWith("Question:", StringComparison.OrdinalIgnoreCase))
					{
						return line.Substring("Question:".Length).Trim();
					}
				}
				return string.Empty;
			}
			catch { return string.Empty; }
		}

		private List<PollOption> ExtractPollOptions(string text)
		{
			var options = new List<PollOption>();
			if (string.IsNullOrEmpty(text) || !text.Contains("[Poll]") || !text.Contains("[/Poll]")) return options;
			try
			{
				int startIndex = text.IndexOf("[Poll]") + 6;
				int endIndex = text.IndexOf("[/Poll]");
				if (endIndex < startIndex) return options;
				string pollContent = text.Substring(startIndex, endIndex - startIndex).Trim();
				pollContent = pollContent.Replace("\r\n", "\n").Replace("\r", "\n");
				var rawLines = pollContent.Split('\n');
				bool hasExplicitQuestion = rawLines.Any(l => l.Trim().StartsWith("Question:", StringComparison.OrdinalIgnoreCase));
				string? derivedQuestionLine = null;
				if (!hasExplicitQuestion)
				{
					foreach (var rl in rawLines)
					{
						var t = rl.Trim();
						if (string.IsNullOrEmpty(t)) continue;
						if (t.StartsWith("Option:", StringComparison.OrdinalIgnoreCase)) continue;
						derivedQuestionLine = t;
						break;
					}
				}
				var dedupe = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
				foreach (var rl in rawLines)
				{
					var line = rl.Trim();
					if (string.IsNullOrEmpty(line)) continue;
					if (line.Equals(derivedQuestionLine, StringComparison.OrdinalIgnoreCase)) continue;
					if (line.StartsWith("Question:", StringComparison.OrdinalIgnoreCase)) continue;
					string optionText;
					if (line.StartsWith("Option:", StringComparison.OrdinalIgnoreCase))
					{
						optionText = line.Substring("Option:".Length).Trim();
						if (string.IsNullOrEmpty(optionText)) continue;
					}
					else
					{
						optionText = line;
					}
					if (!dedupe.Add(optionText)) continue;
					options.Add(new PollOption { Id = optionText, Text = optionText });
				}
				return options;
			}
			catch { return options; }
		}

		private string DeriveQuestionFallback(string text)
		{
			if (string.IsNullOrEmpty(text) || !text.Contains("[Poll]") || !text.Contains("[/Poll]")) return string.Empty;
			try
			{
				int startIndex = text.IndexOf("[Poll]") + 6;
				int endIndex = text.IndexOf("[/Poll]");
				if (endIndex < startIndex) return string.Empty;
				string pollContent = text.Substring(startIndex, endIndex - startIndex).Trim();
				var lines = pollContent.Split('\n');
				foreach (var raw in lines)
				{
					var line = raw.Trim();
					if (string.IsNullOrEmpty(line)) continue;
					if (line.StartsWith("Option:", StringComparison.OrdinalIgnoreCase)) continue;
					if (line.StartsWith("Question:", StringComparison.OrdinalIgnoreCase)) continue;
					return line.Length > 140 ? line.Substring(0, 140).Trim() : line;
				}
			}
			catch { }
			return string.Empty;
		}

		private static string NormalizePollToken(string raw)
		{
			if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
			var cleaned = raw.Trim();
			cleaned = Regex.Replace(cleaned, @"^Option\s+\d+\s*:\s*", string.Empty, RegexOptions.IgnoreCase);
			cleaned = Regex.Replace(cleaned, @"^Option\s*:\s*", string.Empty, RegexOptions.IgnoreCase);
			cleaned = Regex.Replace(cleaned, @"^\d+\s*([).:-])\s*", string.Empty);
			return cleaned.Trim();
		} 
	}
}
