using maxhanna.Server.Controllers.DataContracts.Comments;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class CommentController : ControllerBase
	{
		private readonly IConfiguration _config;
		private readonly Log _log;
		private static readonly ConcurrentDictionary<int, (User User, DateTime CachedAt)> _userCache = new();
		private static readonly TimeSpan _userCacheTtl = TimeSpan.FromMinutes(5);
		private static DateTime _lastUserCacheCleanup = DateTime.UtcNow;
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
						cachedUsers[uid] = await GetCachedUserAsync(uid, conn) ?? new User(uid);
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

		private async Task<User?> GetCachedUserAsync(int userId, MySqlConnection connection)
		{
			if (userId <= 0) return null;

			if (_userCache.TryGetValue(userId, out var cached) && cached.CachedAt + _userCacheTtl > DateTime.UtcNow)
				return cached.User;

			var cmd = new MySqlCommand(@"
				SELECT u.id, u.username,
					   udpfl.id AS dpId, udpfl.file_name AS dpFileName, udpfl.given_file_name AS dpGivenFileName,
					   udpfl.folder_path AS dpFolderPath, udpfl.is_public AS dpIsPublic,
					   udpfl.file_type AS dpFileType, udpfl.file_size AS dpFileSize,
					   udpfl.width AS dpWidth, udpfl.height AS dpHeight,
					   udpfl.upload_date AS dpUploadDate, udpfl.last_updated AS dpLastUpdated,
					   udpbg.id AS bgId, udpbg.file_name AS bgFileName, udpbg.given_file_name AS bgGivenFileName,
					   udpbg.folder_path AS bgFolderPath, udpbg.is_public AS bgIsPublic,
					   udpbg.file_type AS bgFileType, udpbg.file_size AS bgFileSize,
					   udpbg.width AS bgWidth, udpbg.height AS bgHeight,
					   udpbg.upload_date AS bgUploadDate, udpbg.last_updated AS bgLastUpdated,
					   COALESCE(us.display_profile_location, 1) AS displayProfileLocation
				FROM users u
				LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN file_uploads udpfl ON udp.file_id = udpfl.id
				LEFT JOIN file_uploads udpbg ON udp.tag_background_file_id = udpbg.id
				LEFT JOIN user_settings us ON us.user_id = u.id
				WHERE u.id = @userId", connection);
			cmd.Parameters.AddWithValue("@userId", userId);

			using var reader = await cmd.ExecuteReaderAsync();
			User? user = null;
			if (await reader.ReadAsync())
			{
				var dp = reader.IsDBNull(reader.GetOrdinal("dpId")) ? null : new FileEntry
				{
					Id = reader.GetInt32(reader.GetOrdinal("dpId")),
					FileName = reader.IsDBNull(reader.GetOrdinal("dpFileName")) ? null : reader.GetString(reader.GetOrdinal("dpFileName")),
					GivenFileName = reader.IsDBNull(reader.GetOrdinal("dpGivenFileName")) ? null : reader.GetString(reader.GetOrdinal("dpGivenFileName")),
					Directory = reader.IsDBNull(reader.GetOrdinal("dpFolderPath")) ? null : reader.GetString(reader.GetOrdinal("dpFolderPath")),
					Visibility = reader.IsDBNull(reader.GetOrdinal("dpIsPublic")) ? null : (reader.GetBoolean(reader.GetOrdinal("dpIsPublic")) ? "Public" : "Private"),
					FileType = reader.IsDBNull(reader.GetOrdinal("dpFileType")) ? null : reader.GetString(reader.GetOrdinal("dpFileType")),
					FileSize = reader.IsDBNull(reader.GetOrdinal("dpFileSize")) ? 0 : reader.GetInt32(reader.GetOrdinal("dpFileSize")),
					Width = reader.IsDBNull(reader.GetOrdinal("dpWidth")) ? null : reader.GetInt32(reader.GetOrdinal("dpWidth")),
					Height = reader.IsDBNull(reader.GetOrdinal("dpHeight")) ? null : reader.GetInt32(reader.GetOrdinal("dpHeight")),
					Date = reader.IsDBNull(reader.GetOrdinal("dpUploadDate")) ? DateTime.Now : reader.GetDateTime(reader.GetOrdinal("dpUploadDate")),
					LastUpdated = reader.IsDBNull(reader.GetOrdinal("dpLastUpdated")) ? null : reader.GetDateTime(reader.GetOrdinal("dpLastUpdated"))
				};
				var bg = reader.IsDBNull(reader.GetOrdinal("bgId")) ? null : new FileEntry
				{
					Id = reader.GetInt32(reader.GetOrdinal("bgId")),
					FileName = reader.IsDBNull(reader.GetOrdinal("bgFileName")) ? null : reader.GetString(reader.GetOrdinal("bgFileName")),
					GivenFileName = reader.IsDBNull(reader.GetOrdinal("bgGivenFileName")) ? null : reader.GetString(reader.GetOrdinal("bgGivenFileName")),
					Directory = reader.IsDBNull(reader.GetOrdinal("bgFolderPath")) ? null : reader.GetString(reader.GetOrdinal("bgFolderPath")),
					Visibility = reader.IsDBNull(reader.GetOrdinal("bgIsPublic")) ? null : (reader.GetBoolean(reader.GetOrdinal("bgIsPublic")) ? "Public" : "Private"),
					FileType = reader.IsDBNull(reader.GetOrdinal("bgFileType")) ? null : reader.GetString(reader.GetOrdinal("bgFileType")),
					FileSize = reader.IsDBNull(reader.GetOrdinal("bgFileSize")) ? 0 : reader.GetInt32(reader.GetOrdinal("bgFileSize")),
					Width = reader.IsDBNull(reader.GetOrdinal("bgWidth")) ? null : reader.GetInt32(reader.GetOrdinal("bgWidth")),
					Height = reader.IsDBNull(reader.GetOrdinal("bgHeight")) ? null : reader.GetInt32(reader.GetOrdinal("bgHeight")),
					Date = reader.IsDBNull(reader.GetOrdinal("bgUploadDate")) ? DateTime.Now : reader.GetDateTime(reader.GetOrdinal("bgUploadDate")),
					LastUpdated = reader.IsDBNull(reader.GetOrdinal("bgLastUpdated")) ? null : reader.GetDateTime(reader.GetOrdinal("bgLastUpdated"))
				};
				user = new User(userId, reader.GetString(reader.GetOrdinal("username")), dp, bg);
			}
			reader.Close();

			if (user != null)
			{
				_userCache[userId] = (user, DateTime.UtcNow);
			}

			var now = DateTime.UtcNow;
			if (now - _lastUserCacheCleanup > _userCacheTtl)
			{
				var cutoff = now - _userCacheTtl;
				foreach (var kvp in _userCache)
				{
					if (kvp.Value.CachedAt < cutoff)
						_userCache.TryRemove(kvp.Key, out _);
				}
				_lastUserCacheCleanup = now;
			}

			return user;
		}
	}
}
