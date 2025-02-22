using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Diagnostics;
using System.Net;
using MySqlConnector;
using Xabe.FFmpeg;
using SixLabors.ImageSharp;
using System.Data;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Topics;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class FileController : ControllerBase
	{
		private readonly ILogger<FileController> _logger;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
		private readonly string _baseTarget;
		private readonly string _logo = "https://www.bughosted.com/assets/logo.jpg";
		private readonly HashSet<string> romExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
				"sgx", "vb", "ws", "wsc", "gba", "gbc", "gb",
				"gen", "md", "smd", "32x", "sms", "gg",
				"nes", "fds", "sfc", "smc", "snes", "nds"
		};

		public FileController(ILogger<FileController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? ""; 
			_baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? ""; 
			FFmpeg.SetExecutablesPath("E:\\ffmpeg-latest-win64-static\\bin");
		}

		[HttpPost("/File/GetDirectory/", Name = "GetDirectory")]
		public IActionResult GetDirectory(
			[FromBody] User? user,
			[FromQuery] string? directory,
			[FromQuery] string? visibility,
			[FromQuery] string? ownership,
			[FromQuery] string? search,
			[FromQuery] int page = 1,
			[FromQuery] int pageSize = 10,
			[FromQuery] int? fileId = null,
			[FromQuery] List<string>? fileType = null,
			[FromQuery] bool showHidden = false)
		{
			if (string.IsNullOrEmpty(directory))
			{
				directory = _baseTarget;
			}
			else
			{
				directory = Path.Combine(_baseTarget, WebUtility.UrlDecode(directory));
				if (!directory.EndsWith("/"))
				{
					directory += "/";
				}
			}
			_logger.LogInformation(
					 @$"POST /File/GetDirectory?directory={directory}&visibility={visibility}
                 &ownership={ownership}&search={search}&page={page}
                 &pageSize={pageSize}&fileId={fileId}&showHidden={showHidden}&fileType={(fileType != null ? string.Join(", ", fileType) : "")}");

			if (!ValidatePath(directory!)) { return StatusCode(500, $"Must be within {_baseTarget}"); }

			try
			{
				List<FileEntry> fileEntries = new List<FileEntry>();
				string replaced = "'" + string.Join(", ", fileType!).Replace(",", "','") + "'";
				string fileTypeCondition = fileType != null && fileType.Any() && !string.IsNullOrEmpty(string.Join(',', fileType))
								? " AND LOWER(f.file_type) IN (" + string.Join(", ", replaced) + ") "
								: "";
				bool isRomSearch = DetermineIfRomSearch(fileType ?? new List<string>());
				string visibilityCondition = string.IsNullOrEmpty(visibility) || visibility.ToLower() == "all" ? "" : visibility.ToLower() == "public" ? " AND f.is_public = 1 " : " AND f.is_public = 0 ";
				string ownershipCondition = string.IsNullOrEmpty(ownership) || ownership.ToLower() == "all" ? "" : ownership.ToLower() == "others" ? " AND f.user_id != @userId " : " AND f.user_id = @userId ";
				string hiddenCondition = showHidden
						? "" // If showHidden is true, don't filter out hidden files
						: $" AND f.id NOT IN (SELECT file_id FROM maxhanna.hidden_files WHERE user_id = @userId) ";
				using (var connection = new MySqlConnection(_connectionString))
				{
					connection.Open();
					int offset = (page - 1) * pageSize;
					int filePosition = 0;
					if (fileId.HasValue && page == 1)
					{
						_logger.LogInformation($"fetching specific fileId's: {fileId} folder path");
						var directoryCommand = new MySqlCommand(
							 "SELECT folder_path FROM maxhanna.file_uploads WHERE id = @fileId",
							 connection);
						directoryCommand.Parameters.AddWithValue("@fileId", fileId.Value);
						var directoryReader = directoryCommand.ExecuteReader();

						if (directoryReader.Read())
						{
							directory = directoryReader.GetString("folder_path");
						}

						directoryReader.Close();

						var countCommand = new MySqlCommand(
								@$"
									SELECT COUNT(*) FROM maxhanna.file_uploads f 
									WHERE 
                    {(!string.IsNullOrEmpty(search) ? "" : "f.folder_path = @folderPath AND ")} 
                    f.id <= @fileId 
										{fileTypeCondition} {visibilityCondition} {ownershipCondition};",
								 connection);
						countCommand.Parameters.AddWithValue("@folderPath", directory);
						countCommand.Parameters.AddWithValue("@fileId", fileId.Value);
						countCommand.Parameters.AddWithValue("@userId", user?.Id ?? 0);

						filePosition = Convert.ToInt32(countCommand.ExecuteScalar());
						page = (filePosition / pageSize) + 1;
						offset = Math.Max(0, ((page - 1) * pageSize) - 1);
					}
					Console.WriteLine($"setting page:{page}&offset={offset}; file position is : {filePosition}, page size is : {pageSize}, folder path: {directory}");

					string orderBy = isRomSearch ? " ORDER BY f.last_access desc " : fileId == null ? " ORDER BY f.id desc " : string.Empty;
					(string searchCondition, List<MySqlParameter> extraParameters) = GetWhereCondition(search);

					var command = new MySqlCommand($@"
                        SELECT 
                            f.id AS fileId,
                            f.file_name,
                            f.folder_path,
                            f.is_public,
                            f.is_folder,
                            f.user_id AS fileUserId,
                            u.username AS fileUsername,
                            udpfl.id AS fileUserDisplayPictureFileId,
                            udpfl.file_name AS fileUserDisplayPictureFileName,
                            udpfl.folder_path AS fileUserDisplayPictureFolderPath,
                            f.shared_with,
                            f.upload_date AS date,
                            f.given_file_name,
                            f.description,
                            f.last_updated AS file_data_updated,
                            f.last_updated_by_user_id AS last_updated_by_user_id,
                            uu.username AS last_updated_by_user_name,
                            luudp.file_id AS last_updated_by_user_name_display_picture_file_id,
                            f.file_type AS file_type,
                            f.file_size AS file_size,
                            f.width AS width,
                            f.height AS height,
                            f.last_access AS last_access
                        FROM
                            maxhanna.file_uploads f 
                        LEFT JOIN
                            maxhanna.users u ON f.user_id = u.id
                        LEFT JOIN
                            maxhanna.users uu ON f.last_updated_by_user_id = uu.id
                        LEFT JOIN
                            maxhanna.user_display_pictures udp ON udp.user_id = u.id
                        LEFT JOIN
                            maxhanna.user_display_pictures luudp ON luudp.user_id = uu.id
                        LEFT JOIN
                            maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
                        WHERE
                            {(!string.IsNullOrEmpty(search) ? "" : "f.folder_path = @folderPath AND ")}
                            (
                                f.is_public = 1
                                OR f.user_id = @userId
                                OR FIND_IN_SET(@userId, f.shared_with) > 0
                            )
                            {searchCondition} 
														{fileTypeCondition} 
														{visibilityCondition} 
														{ownershipCondition} 
														{hiddenCondition} 
														{orderBy}
                        LIMIT
                            @pageSize OFFSET @offset;"
					, connection);
					foreach (var param in extraParameters)
					{
						command.Parameters.Add(param);
					}
					command.Parameters.AddWithValue("@folderPath", directory);
					command.Parameters.AddWithValue("@userId", user?.Id ?? 0);
					command.Parameters.AddWithValue("@pageSize", pageSize);
					command.Parameters.AddWithValue("@offset", offset);
					command.Parameters.AddWithValue("@fileId", fileId);
					if (!string.IsNullOrEmpty(search))
					{
						command.Parameters.AddWithValue("@search", "%" + search + "%"); // Add search parameter
					}
					// Console.WriteLine(command.CommandText);

					using (var reader = command.ExecuteReader())
					{
						while (reader.Read())
						{
							var fileIdValue = reader.IsDBNull("fileId") ? 0 : reader.GetInt32("fileId");

							var fileEntry = new FileEntry
							{
								Id = fileIdValue,
								FileName = reader.IsDBNull("file_name") ? "" : reader.GetString("file_name"),
								Directory = reader.IsDBNull("folder_path") ? "" : reader.GetString("folder_path"),
								Visibility = (reader.IsDBNull("is_public") ? true : reader.GetBoolean("is_public")) ? "Public" : "Private",
								IsFolder = reader.IsDBNull("is_folder") ? false : reader.GetBoolean("is_folder"),
								User = new User(
											reader.IsDBNull("fileUserId") ? 0 : reader.GetInt32("fileUserId"),
											reader.IsDBNull("fileUsername") ? "" : reader.GetString("fileUsername"),
											new FileEntry
											{
												Id = reader.IsDBNull("fileUserDisplayPictureFileId") ? 0 : reader.GetInt32("fileUserDisplayPictureFileId"),
												FileName = reader.IsDBNull("fileUserDisplayPictureFileName") ? null : reader.GetString("fileUserDisplayPictureFileName"),
												Directory = reader.IsDBNull("fileUserDisplayPictureFolderPath") ? null : reader.GetString("fileUserDisplayPictureFolderPath")
											}
									),
								SharedWith = reader.IsDBNull("shared_with") ? "" : reader.GetString("shared_with"),
								Date = reader.IsDBNull("date") ? DateTime.Now : reader.GetDateTime("date"),
								GivenFileName = reader.IsDBNull("given_file_name") ? null : reader.GetString("given_file_name"),
								LastUpdated = reader.IsDBNull("file_data_updated") ? (DateTime?)null : reader.GetDateTime("file_data_updated"),
								LastUpdatedUserId = reader.IsDBNull("last_updated_by_user_id") ? 0 : reader.GetInt32("last_updated_by_user_id"),
								Description = reader.IsDBNull("description") ? null : reader.GetString("description"),
								LastUpdatedBy = new User(
									reader.IsDBNull("last_updated_by_user_id") ? 0 : reader.GetInt32("last_updated_by_user_id"),
									reader.IsDBNull("last_updated_by_user_name") ? "Anonymous" : reader.GetString("last_updated_by_user_name"),
									new FileEntry
									{
										Id = reader.IsDBNull("last_updated_by_user_name_display_picture_file_id") ? 0 : reader.GetInt32("last_updated_by_user_name_display_picture_file_id")
									}),
								FileType = reader.IsDBNull("file_type") ? "" : reader.GetString("file_type"),
								FileSize = reader.IsDBNull("file_size") ? 0 : reader.GetInt32("file_size"),
								Width = reader.IsDBNull("width") ? null : reader.GetInt32("width"),
								Height = reader.IsDBNull("height") ? null : reader.GetInt32("height"),
								LastAccess = reader.IsDBNull("last_access") ? null : reader.GetDateTime("last_access"),
							};

							fileEntries.Add(fileEntry);
						}
					}

					var fileIds = fileEntries.Select(f => f.Id).ToList();
					var commentIds = new List<int>();
					//_logger.LogInformation("Getting comments for fileIds: " + string.Join(",", fileIds));

					var fileIdsParameters = new List<string>();
					for (int i = 0; i < fileIds.Count; i++)
					{
						fileIdsParameters.Add($"@fileId{i}");
					}

					// Fetch comments separately
					var commentsCommand = new MySqlCommand($@"
                    SELECT 
                        fc.id AS commentId,
                        fc.file_id AS commentFileId,
                        fc.user_id AS commentUserId,
                        fc.date AS commentDate,
                        uc.username AS commentUsername,
                        ucudpfu.id AS commentUserDisplayPicId,
                        ucudpfu.file_name AS commentUserDisplayPicFileName,
                        ucudpfu.folder_path AS commentUserDisplayPicFolderPath,
                        fc.comment AS commentText,
                        cf.file_id AS commentFileEntryId,
                        cf2.file_name AS commentFileEntryName,
                        cf2.folder_path AS commentFileEntryFolderPath,
                        cf2.is_public AS commentFileEntryIsPublic,
                        cf2.is_folder AS commentFileEntryIsFolder,
                        cf2.user_id AS commentFileEntryUserId,
                        cfu2.username AS commentFileEntryUserName,
                        cf2.file_type AS commentFileEntryType,
                        cf2.file_size AS commentFileEntrySize,
                        cf2.upload_date AS commentFileEntryDate
                    FROM
                        maxhanna.comments fc
                    LEFT JOIN
                        maxhanna.users uc ON fc.user_id = uc.id
                    LEFT JOIN
                        maxhanna.user_display_pictures ucudp ON ucudp.user_id = uc.id
                    LEFT JOIN
                        maxhanna.file_uploads ucudpfu ON ucudp.file_id = ucudpfu.id
                    LEFT JOIN
                        maxhanna.comment_files cf ON fc.id = cf.comment_id
                    LEFT JOIN
                        maxhanna.file_uploads cf2 ON cf.file_id = cf2.id
                    LEFT JOIN 
                        maxhanna.users cfu2 on cfu2.id = cf2.user_id 
                    WHERE 1=1
                       {(fileIds.Count > 0 ? " AND fc.file_id IN (" + string.Join(", ", fileIdsParameters) + ")" : string.Empty)};"
					, connection);
					for (int i = 0; i < fileIds.Count; i++)
					{
						commentsCommand.Parameters.AddWithValue($"@fileId{i}", fileIds[i]);
					}
					//_logger.LogInformation(commentsCommand.CommandText);
					using (var reader = commentsCommand.ExecuteReader())
					{
						//_logger.LogInformation("comment command executed");
						while (reader.Read())
						{
							//_logger.LogInformation("comment command read");
							var commentId = reader.IsDBNull(reader.GetOrdinal("commentId")) ? 0 : reader.GetInt32("commentId");
							var fileIdValue = reader.IsDBNull(reader.GetOrdinal("commentFileId")) ? 0 : reader.GetInt32("commentFileId");
							//_logger.LogInformation("Found commentId " + commentId);

							var commentUserDisplayPicId = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicId")) ? (int?)null : reader.GetInt32("commentUserDisplayPicId");
							var commentUserDisplayPicFileName = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFileName")) ? null : reader.GetString("commentUserDisplayPicFileName");
							var commentUserDisplayPicFolderPath = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFolderPath")) ? null : reader.GetString("commentUserDisplayPicFolderPath");

							var comment = new FileComment
							{
								Id = commentId,
								FileId = fileIdValue,
								User = new User(
											reader.GetInt32("commentUserId"),
											reader.GetString("commentUsername"),
											null,
											new FileEntry
											{
												Id = commentUserDisplayPicId ?? 0,
												FileName = commentUserDisplayPicFileName,
												Directory = commentUserDisplayPicFolderPath
											},
											null, null, null
									),
								CommentText = reader.GetString("commentText"),
								Date = reader.GetDateTime("commentDate")
							};
							commentIds.Add(commentId);
							//_logger.LogInformation("Comment constructed with id : " + commentId);
							var fileEntryId = reader.IsDBNull(reader.GetOrdinal("commentFileEntryId")) ? (int?)null : reader.GetInt32("commentFileEntryId");

							if (fileEntryId.HasValue)
							{
								var fileEntryName = reader.IsDBNull(reader.GetOrdinal("commentFileEntryName")) ? null : reader.GetString("commentFileEntryName");
								var fileEntryFolderPath = reader.IsDBNull(reader.GetOrdinal("commentFileEntryFolderPath")) ? null : reader.GetString("commentFileEntryFolderPath");
								var fileEntryVisibility = reader.GetBoolean("commentFileEntryIsPublic") ? "Public" : "Private";
								var fileEntryUserId = reader.GetInt32("commentFileEntryUserId");
								var fileEntryUserName = reader.GetString("commentFileEntryUserName");
								var fileEntryDate = reader.GetDateTime("commentFileEntryDate");
								var fileEntryType = reader.GetString("commentFileEntryType");
								var fileEntrySize = reader.GetInt32("commentFileEntrySize");

								var fileEntryComment = new FileEntry
								{
									Id = fileEntryId.Value,
									FileName = fileEntryName,
									Directory = fileEntryFolderPath,
									Visibility = fileEntryVisibility,
									IsFolder = reader.GetBoolean("commentFileEntryIsFolder"),
									User = new User(fileEntryUserId, fileEntryUserName),
									Date = fileEntryDate,
									FileType = fileEntryType,
									FileSize = fileEntrySize
								};

								comment.CommentFiles!.Add(fileEntryComment);
							}
							//_logger.LogInformation($"trying to find file with id value : {fileIdValue}");
							var fileEntry = fileEntries.FirstOrDefault(f => f.Id == fileIdValue);

							//_logger.LogInformation($"found : {fileEntry}");

							if (fileEntry != null)
							{
								if (fileEntry.FileComments == null)
								{
									fileEntry.FileComments = new List<FileComment>();
								}
								fileEntry.FileComments!.Add(comment);
								//_logger.LogInformation($"Attached comment {comment.Id} to file {fileEntry.Id}");
							}
						}
					}

					var commentIdsParameters = new List<string>();
					for (int i = 0; i < commentIds.Count; i++)
					{
						commentIdsParameters.Add($"@commentId{i}");
					}

					//_logger.LogInformation("Getting reactions");
					// Fetch reactions separately
					var reactionsCommand = new MySqlCommand($@"
                        SELECT
                            r.id AS reaction_id,
                            r.file_id AS reactionFileId,
                            r.comment_id AS reactionCommentId,
                            r.type AS reaction_type,
                            r.user_id AS reaction_user_id,
                            ru.username AS reaction_username,
														udp.file_id as reaction_user_display_picture_id,
														r.timestamp as reaction_date
                        FROM
                            maxhanna.reactions r
                        LEFT JOIN
                            maxhanna.users ru ON r.user_id = ru.id
                        LEFT JOIN
                            maxhanna.user_display_pictures udp ON udp.user_id = ru.id
                        WHERE 1=1
                        {(fileIds.Count > 0 ? "AND r.file_id IN (" + string.Join(", ", fileIdsParameters) + ')' : string.Empty)} 
                        {(commentIds.Count > 0 ? " OR r.comment_id IN (" + string.Join(", ", commentIdsParameters) + ')' : string.Empty)};"
					, connection);

					for (int i = 0; i < commentIds.Count; i++)
					{
						reactionsCommand.Parameters.AddWithValue($"@commentId{i}", commentIds[i]);
					}
					for (int i = 0; i < fileIds.Count; i++)
					{
						reactionsCommand.Parameters.AddWithValue($"@fileId{i}", fileIds[i]);
					}
					//_logger.LogInformation(reactionsCommand.CommandText);
					using (var reader = reactionsCommand.ExecuteReader())
					{
						while (reader.Read())
						{
							var reactionId = reader.GetInt32("reaction_id");
							var fileIdValue = reader.IsDBNull(reader.GetOrdinal("reactionFileId")) ? 0 : reader.GetInt32("reactionFileId");
							var commentIdValue = reader.IsDBNull(reader.GetOrdinal("reactionCommentId")) ? 0 : reader.GetInt32("reactionCommentId");
							var udpFileEntry = reader.IsDBNull(reader.GetOrdinal("reaction_user_display_picture_id")) ? null : new FileEntry(reader.GetInt32("reaction_user_display_picture_id"));
							var reaction = new Reaction
							{
								Id = reactionId,
								FileId = fileIdValue != 0 ? fileIdValue : null,
								CommentId = commentIdValue != 0 ? commentIdValue : null,
								Type = reader.GetString("reaction_type"),
								Timestamp = reader.GetDateTime("reaction_date"),
								User = new User(reader.GetInt32("reaction_user_id"), reader.GetString("reaction_username"), udpFileEntry)
							};

							var fileEntry = fileEntries.FirstOrDefault(f => f.Id == fileIdValue);
							if (fileEntry != null)
							{
								if (fileEntry.Reactions == null)
								{
									fileEntry.Reactions = new List<Reaction>();
								}
								fileEntry.Reactions.Add(reaction);
							}

							var commentEntry = new FileComment();
							commentEntry.Id = 0;
							for (var x = 0; x < fileEntries.Count; x++)
							{
								if (fileEntries[x].FileComments != null)
								{
									if (fileEntries[x].FileComments!.Find(x => x.Id == commentIdValue) != null)
									{
										commentEntry = fileEntries[x].FileComments!.Find(x => x.Id == commentIdValue)!;
										break;
									}
								}
							}

							if (commentEntry.Id != 0)
							{
								if (commentEntry.Reactions == null)
								{
									commentEntry.Reactions = new List<Reaction>();
								}
								commentEntry.Reactions.Add(reaction);
							}
						}
					}

					// Fetch topics separately
					var topicsCommand = new MySqlCommand($@"
                        SELECT
                            ft.file_id,
                            ft.topic_id,
														t.topic 
                        FROM
                            maxhanna.file_topics ft
												LEFT JOIN topics t ON t.id = ft.topic_id 
                        WHERE 1=1
                        {(fileIds.Count > 0 ? "AND ft.file_id IN (" + string.Join(", ", fileIdsParameters) + ')' : string.Empty)};"
					, connection);

					for (int i = 0; i < fileIds.Count; i++)
					{
						topicsCommand.Parameters.AddWithValue($"@fileId{i}", fileIds[i]);
					}
					//_logger.LogInformation(topicsCommand.CommandText);
					using (var reader = topicsCommand.ExecuteReader())
					{
						while (reader.Read())
						{
							var fileIdV = reader.GetInt32("file_id");
							var topicIdV = reader.GetInt32("topic_id");
							var topicTextV = reader.GetString("topic");


							var fileEntry = fileEntries.FirstOrDefault(f => f.Id == fileIdV);
							if (fileEntry != null)
							{
								if (fileEntry.Topics == null)
								{
									fileEntry.Topics = new List<Topic>();
								}
								fileEntry.Topics.Add(new Topic(topicIdV, topicTextV));
							}
						}
					}
					// Get the total count of files for pagination
					var totalCountCommand = new MySqlCommand(
							$@"SELECT COUNT(*) 
                        FROM 
                            maxhanna.file_uploads f  
                        LEFT JOIN
                            maxhanna.users u ON f.user_id = u.id
                        WHERE 
                            {(!string.IsNullOrEmpty(search) ? "" : "f.folder_path = @folderPath AND ")}
                            ( 
                                f.is_public = 1 OR 
                                f.user_id = @userId OR 
                                FIND_IN_SET(@userId, f.shared_with) > 0
                            ) 
                        {searchCondition}
                        {fileTypeCondition}
                        {visibilityCondition}
                        {ownershipCondition}
                        {hiddenCondition};"
					 , connection);
					foreach (var param in extraParameters)
					{
						totalCountCommand.Parameters.Add(param);
					}
					totalCountCommand.Parameters.AddWithValue("@folderPath", directory);
					totalCountCommand.Parameters.AddWithValue("@userId", user?.Id ?? 0);
					if (!string.IsNullOrEmpty(search))
					{
						totalCountCommand.Parameters.AddWithValue("@search", "%" + search + "%"); // Add search parameter
					}
					//_logger.LogInformation("total count sql : " + totalCountCommand.CommandText);
					int totalCount = Convert.ToInt32(totalCountCommand.ExecuteScalar());
					var result = new
					{
						TotalCount = totalCount,
						CurrentDirectory = directory.Replace(_baseTarget, ""),
						Page = page,
						PageSize = pageSize,
						Data = fileEntries
					};

					return Ok(result);
				}
			}
			catch (Exception ex)
			{
				_logger.LogError($"error:{ex}");
				return StatusCode(500, ex.Message);
			}
		}
		private static (string, List<MySqlParameter>) GetWhereCondition(string? search)
		{
			List<string> keywords = search?.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();
			List<MySqlParameter> parameters = new List<MySqlParameter>();

			string searchCondition = "";
			if (keywords.Any())
			{
				List<string> conditions = new List<string>();

				for (int i = 0; i < keywords.Count; i++)
				{
					string keyword = keywords[i];
					string paramName = $"@search_{i}";

					conditions.Add(@$"
                LOWER(f.file_name) LIKE CONCAT('%', LOWER({paramName}), '%') 
                OR LOWER(f.given_file_name) LIKE CONCAT('%', LOWER({paramName}), '%')
                OR LOWER(f.description) LIKE CONCAT('%', LOWER({paramName}), '%')
                OR LOWER(u.username) LIKE CONCAT('%', LOWER({paramName}), '%')
                OR f.id IN (
                    SELECT ft.file_id 
                    FROM maxhanna.file_topics ft
                    JOIN maxhanna.topics t ON ft.topic_id = t.id
                    WHERE t.topic LIKE {paramName}
                )");

					parameters.Add(new MySqlParameter(paramName, $"%{keyword}%"));

					// Add special conditions based on keyword content
					if (keyword.Contains("sega", StringComparison.OrdinalIgnoreCase))
					{
						conditions.Add("f.file_name LIKE '%.md'");
					}
					else if (keyword.Contains("nintendo", StringComparison.OrdinalIgnoreCase))
					{
						conditions.Add("f.file_name LIKE '%.nes'");
					}
					else if (keyword.Contains("gameboy", StringComparison.OrdinalIgnoreCase))
					{
						conditions.Add("f.file_name LIKE '%.gbc' OR f.file_name LIKE '%.gba'");
					}
				}

				searchCondition = " AND (" + string.Join(" OR ", conditions) + " )";
			}

			return (searchCondition, parameters);
		}


		[HttpPost("/File/UpdateFileData", Name = "UpdateFileData")]
		public async Task<IActionResult> UpdateFileData([FromBody] FileDataRequest request)
		{
			_logger.LogInformation($"POST /File/UpdateFileData (Updating data for file: {request.FileData.FileId}  user: {request.User?.Id})");

			try
			{
				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();

					var command = new MySqlCommand($@"
                        UPDATE file_uploads
                        SET given_file_name = @given_file_name,
                            description = @description,
                            last_updated_by_user_id = @last_updated_by_user_id,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE id = @file_id"
					, connection);
					command.Parameters.AddWithValue("@given_file_name", string.IsNullOrWhiteSpace(request.FileData.GivenFileName) ? (object)DBNull.Value : request.FileData.GivenFileName);
					command.Parameters.AddWithValue("@last_updated_by_user_id", request.User?.Id ?? 0);
					command.Parameters.AddWithValue("@file_id", request.FileData.FileId);
					command.Parameters.AddWithValue("@description", string.IsNullOrWhiteSpace(request.FileData.Description) ? (object)DBNull.Value : request.FileData.Description);

					await command.ExecuteNonQueryAsync();
				}

				await UpdateSitemapEntry(request.FileData.FileId, request.FileData.GivenFileName, request.FileData.Description);
				return Ok("Filedata added successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while updating the Filedata.");
				return StatusCode(500, "An error occurred while updating the Filedata.");
			}
		}


		[HttpPost("/File/UpdateFileVisibility", Name = "UpdateFileVisibility")]
		public async Task<IActionResult> UpdateFileVisibility([FromBody] UpdateFileVisibilityRequest request)
		{
			_logger.LogInformation($"POST /File/UpdateFileVisibility (Updating visivility for file: {request.FileId}  user: {request.User?.Id})");

			try
			{
				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();

					var command = new MySqlCommand($@"
                        UPDATE file_uploads
                        SET is_public = @is_public,
                            last_updated_by_user_id = @last_updated_by_user_id,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE id = @file_id"
					, connection);
					command.Parameters.AddWithValue("@is_public", request.IsVisible);
					command.Parameters.AddWithValue("@last_updated_by_user_id", request.User?.Id ?? 0);
					command.Parameters.AddWithValue("@file_id", request.FileId);

					await command.ExecuteNonQueryAsync();
				}

				return Ok("File visibility updated successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while updating the Filedata.");
				return StatusCode(500, "An error occurred while updating the Filedata.");
			}
		}

		[HttpPost("/File/GetFile/{filePath}", Name = "GetFile")]
		public IActionResult GetFile([FromBody] User? user, string filePath)
		{
			filePath = Path.Combine(_baseTarget, WebUtility.UrlDecode(filePath) ?? "");

			//_logger.LogInformation($"GET /File/GetFile/{filePath}");
			if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {_baseTarget}"); }

			try
			{
				if (string.IsNullOrEmpty(filePath))
				{
					_logger.LogError($"File path is missing.");
					return BadRequest("File path is missing.");
				}

				if (!System.IO.File.Exists(filePath))
				{
					_logger.LogError($"File not found at {filePath}");
					return NotFound();
				}

				var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
				string contentType = GetContentType(Path.GetExtension(filePath));
				//_logger.LogInformation("returning file : " + filePath);
				return File(fileStream, contentType, Path.GetFileName(filePath));
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while streaming the file.");
				return StatusCode(500, "An error occurred while streaming the file.");
			}
		}


		[HttpPost("/File/GetFileById/{fileId}", Name = "GetFileById")]
		public async Task<IActionResult> GetFileById([FromBody] User? user, int fileId)
		{
			_logger.LogInformation($"GET /File/GetFileById/{fileId}");

			try
			{
				if (fileId == 0)
				{
					_logger.LogError($"File id is missing.");
					return BadRequest("File id is missing.");
				}

				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();
					string sql = @"
						UPDATE maxhanna.file_uploads
						SET last_access = NOW()
						WHERE id = @fileId LIMIT 1;

						SELECT user_id, file_name, folder_path, is_public
						FROM maxhanna.file_uploads
						WHERE id = @fileId LIMIT 1;";
					var command = new MySqlCommand(
							sql,
							connection);
					command.Parameters.AddWithValue("@fileId", fileId);

					using (var reader = await command.ExecuteReaderAsync())
					{
						if (!await reader.ReadAsync())
						{
							_logger.LogError($"File with id {fileId} not found in database.");
							return NotFound();
						}

						int userId = reader.GetInt32("user_id");
						string fileName = reader.GetString("file_name");
						string folderPath = reader.GetString("folder_path");
						bool isPublic = reader.GetBoolean("is_public");

						// Check if the user has permission to access the file
						if (!isPublic && (user == null || user.Id != userId))
						{
							_logger.LogError($"User does not have permission to access file with id {fileId}.");
							return Forbid();
						}

						// Construct the full file path
						string filePath = Path.Combine(folderPath, fileName);

						if (!System.IO.File.Exists(filePath))
						{
							_logger.LogError($"File not found at {filePath}");
							return NotFound();
						}

						var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
						string contentType = GetContentType(Path.GetExtension(filePath));

						return File(fileStream, contentType, fileName);
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while retrieving or streaming the file.");
				return StatusCode(500, "An error occurred while retrieving or streaming the file.");
			}
		}

		[HttpPost("/File/MakeDirectory", Name = "MakeDirectory")]
		public async Task<IActionResult> MakeDirectory([FromBody] CreateDirectory request)
		{
			if (request.directory == null)
			{
				_logger.LogError("POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
				return StatusCode(500, "POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
			}

			request.directory = Path.Combine(_baseTarget, WebUtility.UrlDecode(request.directory) ?? "");
			_logger.LogInformation($"POST /File/MakeDirectory/ (directoryPath: {request.directory})");
			if (!ValidatePath(request.directory))
			{
				return StatusCode(500, $"Must be within {_baseTarget}");
			}

			try
			{
				if (Directory.Exists(request.directory))
				{
					_logger.LogError($"Directory already exists at {request.directory}");
					return Conflict("Directory already exists.");
				}

				Directory.CreateDirectory(request.directory);

				DateTime uploadDate = DateTime.UtcNow;
				string fileName = Path.GetFileName(request.directory);
				string directoryName = (Path.GetDirectoryName(request.directory) ?? "").Replace("\\", "/");

				string connectionString = _connectionString ?? "";

				using (var connection = new MySqlConnection(connectionString))
				{
					await connection.OpenAsync();
					using (var transaction = await connection.BeginTransactionAsync())
					{
						if (!directoryName.EndsWith("/"))
						{
							directoryName += "/";
						}

						var insertCommand = new MySqlCommand(
							 "INSERT INTO maxhanna.file_uploads " +
							 "(user_id, upload_date, file_name, folder_path, is_public, is_folder) " +
							 "VALUES (@user_id, @uploadDate, @fileName, @folderPath, @isPublic, @isFolder);" +
							 "SELECT LAST_INSERT_ID();",
							 connection,
							 transaction);

						insertCommand.Parameters.AddWithValue("@user_id", request.user.Id);
						insertCommand.Parameters.AddWithValue("@uploadDate", uploadDate);
						insertCommand.Parameters.AddWithValue("@fileName", fileName);
						insertCommand.Parameters.AddWithValue("@folderPath", directoryName);
						insertCommand.Parameters.AddWithValue("@isPublic", request.isPublic);
						insertCommand.Parameters.AddWithValue("@isFolder", 1);

						int id = 0;
						object? result = await insertCommand.ExecuteScalarAsync();
						if (result != null)
						{
							id = Convert.ToInt32(result);
						}

						await transaction.CommitAsync();
						return Ok(id);
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while creating directory.");
				return StatusCode(500, "An error occurred while creating directory.");
			}
		}

		[HttpPost("/File/Upload", Name = "Upload")]
		public async Task<IActionResult> UploadFiles([FromQuery] string? folderPath, [FromQuery] Boolean? compress)
		{
			List<FileEntry> uploaded = new List<FileEntry>();
			try
			{
				if (Request.Form["user"].Count <= 0)
				{
					_logger.LogWarning($"Invalid user! Returning null.");
					return BadRequest("No user logged in.");
				}

				var user = JsonConvert.DeserializeObject<User>(Request.Form["user"]!);
				var isPublic = JsonConvert.DeserializeObject<bool>(Request.Form["isPublic"]!);
				var files = Request.Form.Files;

				_logger.LogInformation($"POST /File/Upload (user: {user?.Id} folderPath = {folderPath})");

				if (files == null || files.Count == 0)
					return BadRequest("No files uploaded.");

				foreach (var file in files)
				{
					if (file.Length == 0)
						continue; // Skip empty files

					var uploadDirectory = string.IsNullOrEmpty(folderPath) ? _baseTarget : Path.Combine(_baseTarget, WebUtility.UrlDecode(folderPath));
					if (!uploadDirectory.EndsWith("/"))
					{
						uploadDirectory += "/";
					}
					var filePath = Path.Combine(uploadDirectory, file.FileName); // Combine upload directory with file name

					var conflictingFile = await GetConflictingFile(user?.Id ?? 0, file, uploadDirectory, isPublic);
					if (conflictingFile != null)
					{
						_logger.LogError("Cannot upload duplicate files.");
						uploaded.Add(conflictingFile);
					}
					else
					{
						if (!Directory.Exists(uploadDirectory))
						{
							Directory.CreateDirectory(uploadDirectory);
							await InsertDirectoryMetadata(user!, filePath, isPublic);
						}

						// Check file type and convert if necessary
						var convertedFilePath = filePath;
						int? width = null;
						int? height = null;
						int? duration = null;
						if (compress != null && compress == false)
						{
							using (var stream = new FileStream(filePath, FileMode.Create))
							{
								await file.CopyToAsync(stream);
								(width, height, duration) = await GetMediaInfo(filePath);
							}
						} else
						{
							if (IsGifFile(file))
							{
								(convertedFilePath, width, height, duration) = await ConvertGifToWebp(file, uploadDirectory);
							}
							else if (IsImageFile(file) && !IsWebPFile(file))
							{
								(convertedFilePath, width, height) = await ConvertImageToWebp(file, uploadDirectory);
							}
							else if (IsVideoFile(file) && !IsWebMFile(file))
							{
								(convertedFilePath, width, height, duration) = await ConvertVideoToWebm(file, uploadDirectory);
							}
							else if (IsAudioFile(file) && !file.FileName.EndsWith(".opus"))
							{
								convertedFilePath = await ConvertAudioToOpusMP4(file, uploadDirectory);
							}
							else
							{
								using (var stream = new FileStream(filePath, FileMode.Create))
								{
									await file.CopyToAsync(stream);
								}
							}
						}
						

						var fileId = await InsertFileIntoDB(user!, file, uploadDirectory, isPublic, convertedFilePath, width, height, duration);
						var fileEntry = CreateFileEntry(file, user!, isPublic, fileId, convertedFilePath, uploadDirectory, width, height, duration);
						uploaded.Add(fileEntry);

						await AppendToSitemapAsync(fileEntry);

						_logger.LogInformation($"Uploaded file: {file.FileName}, Size: {file.Length} bytes, Path: {convertedFilePath}, Type: {fileEntry.FileType}");
					}
				}

				_logger.LogInformation($"Uploaded {uploaded.Count} files.");
				return Ok(uploaded);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while uploading files.");
				return StatusCode(500, "An error occurred while uploading files.");
			}
		}

		[HttpPost("/File/Edit-Topics", Name = "EditFileTopics")]
		public async Task<IActionResult> EditFileTopics([FromBody] EditTopicRequest request)
		{
			_logger.LogInformation($"POST /File/Edit-Topics for user: {request.User?.Id} with fileId: {request.File.Id}");

			try
			{
				string deleteSql = "DELETE FROM maxhanna.file_topics WHERE file_id = @FileId;";
				string insertSql = "INSERT INTO maxhanna.file_topics (file_id, topic_id) VALUES (@FileId, @TopicId);";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var transaction = await conn.BeginTransactionAsync())
					{
						try
						{
							// Delete existing topics for the story
							using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
							{
								deleteCmd.Parameters.AddWithValue("@FileId", request.File.Id);
								await deleteCmd.ExecuteNonQueryAsync();
							}

							// Insert new topics
							if (request.Topics != null && request.Topics.Any())
							{
								foreach (var topic in request.Topics)
								{
									using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
									{
										insertCmd.Parameters.AddWithValue("@FileId", request.File.Id);
										insertCmd.Parameters.AddWithValue("@TopicId", topic.Id);
										await insertCmd.ExecuteNonQueryAsync();
									}
								}
							}

							// Commit the transaction
							await transaction.CommitAsync();
							return Ok("File topics updated successfully.");
						}
						catch
						{
							// Rollback on error
							await transaction.RollbackAsync();
							throw;
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while editing file topics.");
				return StatusCode(500, "An error occurred while editing file topics.");
			}
		}

		private bool IsWebPFile(IFormFile file)
		{
			var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
			return fileExtension.ToLower() == ".webp";
		}
		private bool IsWebMFile(IFormFile file)
		{
			var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
			return fileExtension.ToLower() == ".webm";
		}
		private bool IsImageFile(IFormFile file)
		{
			var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".bmp", ".gif" };
			var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
			return allowedExtensions.Contains(fileExtension);
		}
		private bool IsGifFile(IFormFile file)
		{
			var allowedExtensions = new[] { ".gif" };
			var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
			return allowedExtensions.Contains(fileExtension);
		}
		private bool IsAudioFile(IFormFile file)
		{
			var allowedExtensions = new[] { ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma", ".opus" };
			var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
			return allowedExtensions.Contains(fileExtension);
		}
		private bool IsVideoFileFromExtensionString(string? fileExtension)
		{
			if (string.IsNullOrWhiteSpace(fileExtension)) return false;
			string[] videoExtensions = { "mp4", "webm", "avi", "mov", "mkv", "flv" };
			return videoExtensions.Contains(fileExtension.ToLower());
		}
		private bool IsVideoFile(IFormFile file)
		{
			var allowedExtensions = new[] { ".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv" };
			var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
			return allowedExtensions.Contains(fileExtension);
		}
		private async Task<string> ConvertAudioToOpusMP4(IFormFile file, string uploadDirectory)
		{
			var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
			var opusConvertedFileName = $"{fileNameWithoutExtension}.opus";
			var opusConvertedFilePath = Path.Combine(uploadDirectory, opusConvertedFileName);
			var mp4ConvertedFileName = $"{fileNameWithoutExtension}.mp4";
			var mp4ConvertedFilePath = Path.Combine(uploadDirectory, mp4ConvertedFileName);
			var inputFilePath = Path.Combine(uploadDirectory, file.FileName);

			try
			{
				// Save the input file temporarily
				using (var stream = new FileStream(inputFilePath, FileMode.Create))
				{
					await file.CopyToAsync(stream);
				}

				var beforeFileSize = new FileInfo(inputFilePath).Length;

				// Convert to Opus
				var opusConversion = FFmpeg.Conversions.New()
						.AddParameter($"-i \"{inputFilePath}\"")
						.AddParameter("-c:a libopus")
						.AddParameter("-b:a 128k")
						.SetOutput(opusConvertedFilePath);
				await opusConversion.Start();

				// Verify Opus conversion success
				if (!System.IO.File.Exists(opusConvertedFilePath))
				{
					throw new FileNotFoundException("Opus conversion failed or output file not found.");
				}

				// Convert Opus to MP4
				var mp4Conversion = FFmpeg.Conversions.New()
						.AddParameter($"-i \"{opusConvertedFilePath}\"")
						.SetOutput(mp4ConvertedFilePath);
				await mp4Conversion.Start();

				var afterFileSize = new FileInfo(mp4ConvertedFilePath).Length;
				_logger.LogInformation($"Audio conversion completed: before [fileName={file.FileName}, fileSize={beforeFileSize} bytes] after [fileName={mp4ConvertedFileName}, fileSize={afterFileSize} bytes]");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred during audio conversion.");
			}
			finally
			{
				var beforeFileSize = new FileInfo(inputFilePath).Length;
				var afterFileSize = new FileInfo(mp4ConvertedFilePath).Length;

				if (System.IO.File.Exists(opusConvertedFilePath))
				{
					System.IO.File.Delete(opusConvertedFilePath);
				}
				if (beforeFileSize > afterFileSize)
				{
					System.IO.File.Delete(inputFilePath);
				}
				else
				{
					System.IO.File.Delete(mp4ConvertedFilePath);
					mp4ConvertedFilePath = inputFilePath;
				}
			}
			return mp4ConvertedFilePath;

		}

		private async Task<(string FilePath, int Width, int Height, int Duration)> ConvertGifToWebp(IFormFile file, string uploadDirectory)
		{
			var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
			var convertedFileName = $"{fileNameWithoutExtension}.webp";
			var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
			var inputFilePath = Path.Combine(uploadDirectory, file.FileName);
			int width = 0;
			int height = 0;
			int duration = 0;

			try
			{
				using (var stream = new FileStream(inputFilePath, FileMode.Create))
				{
					await file.CopyToAsync(stream);
				}

				var beforeFileSize = new FileInfo(inputFilePath).Length;

				var ffmpegCommand = await FFmpeg.GetMediaInfo(inputFilePath);
				duration = (int)ffmpegCommand.Duration.TotalSeconds;

				var conversion = FFmpeg.Conversions.New()
						.AddParameter($"-i \"{inputFilePath}\"")
						.AddParameter("-c:v libwebp")
						.AddParameter("-lossless 0")
						.AddParameter("-q:v 75")
						.AddParameter("-loop 0")
						.SetOutput(convertedFilePath);

				await conversion.Start();

				var afterFileSize = new FileInfo(convertedFilePath).Length;
				_logger.LogInformation($"GIF to WebP conversion: before [fileName={file.FileName}, fileType={Path.GetExtension(file.FileName)}, fileSize={beforeFileSize} bytes] after [fileName={convertedFileName}, fileType={Path.GetExtension(convertedFileName)}, fileSize={afterFileSize} bytes]");

				(width, height) = await GetMediaDimensions(convertedFilePath);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred during GIF conversion.");
			}
			finally
			{
				var beforeFileSize = new FileInfo(inputFilePath).Length;
				var afterFileSize = new FileInfo(convertedFilePath).Length;

				if (beforeFileSize > afterFileSize)
				{
					System.IO.File.Delete(inputFilePath);
				}
				else
				{
					System.IO.File.Delete(convertedFilePath);
					convertedFilePath = inputFilePath;
				}

			}

			return (convertedFilePath, width, height, duration);
		}

		private async Task<(string FilePath, int Width, int Height)> ConvertImageToWebp(IFormFile file, string uploadDirectory)
		{
			var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
			var convertedFileName = $"{fileNameWithoutExtension}.webp";
			var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
			var width = 0;
			var height = 0;
			try
			{
				using (var image = await SixLabors.ImageSharp.Image.LoadAsync(file.OpenReadStream()))
				{
					var beforeFileSize = file.Length;

					await image.SaveAsWebpAsync(convertedFilePath);

					var afterFileSize = new FileInfo(convertedFilePath).Length;
					width = image.Width;
					height = image.Height;
					_logger.LogInformation($"Image to WebP conversion: before [fileName={file.FileName}, fileType={Path.GetExtension(file.FileName)}, fileSize={beforeFileSize} bytes] after [fileName={convertedFileName}, fileType={Path.GetExtension(convertedFileName)}, fileSize={afterFileSize} bytes]");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error occurred during image conversion.");
			}

			if (System.IO.File.Exists(convertedFilePath) && width == 0 || height == 0)
			{
				(width, height) = await GetMediaDimensions(convertedFilePath);
			}
			return (convertedFilePath, width, height);
		}

		private async Task<(string FilePath, int Width, int Height, int Duration)> ConvertVideoToWebm(IFormFile file, string uploadDirectory)
		{
			var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
			var convertedFileName = $"{fileNameWithoutExtension}.webm";
			var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
			var inputFilePath = Path.Combine(uploadDirectory, file.FileName);
			int width = 0;
			int height = 0;
			int duration = 0;
			try
			{
				using (var stream = new FileStream(inputFilePath, FileMode.Create))
				{
					await file.CopyToAsync(stream);
				}

				var beforeFileSize = new FileInfo(inputFilePath).Length;


				var ffmpegCommand = await FFmpeg.GetMediaInfo(inputFilePath);
				duration = (int)ffmpegCommand.Duration.TotalSeconds;

				var res = await FFmpeg.Conversions.FromSnippet.ToWebM(inputFilePath, convertedFilePath);
				await res.Start();

				var afterFileSize = new FileInfo(convertedFilePath).Length;
				var ffProbe = await FFmpeg.GetMediaInfo(inputFilePath);
				var videoStream = ffProbe.VideoStreams.FirstOrDefault();

				if (videoStream != null)
				{
					width = videoStream.Width;
					height = videoStream.Height;
				}
				_logger.LogInformation($"Video to WebM conversion: before [fileName={file.FileName}, fileType={Path.GetExtension(file.FileName)}, fileSize={beforeFileSize} bytes] after [fileName={convertedFileName}, fileType={Path.GetExtension(convertedFileName)}, fileSize={afterFileSize} bytes]");
				if (beforeFileSize > afterFileSize)
				{
					System.IO.File.Delete(inputFilePath);
				}
				else
				{
					System.IO.File.Delete(convertedFilePath);
					convertedFilePath = inputFilePath;
				}

			}
			catch (Exception ex)
			{
				if (ex.Message.Contains(" already exists. Exiting."))
				{
					_logger.LogError(ex, "Converted file already exists, Returning converted file");
				}
				else if (System.IO.File.Exists(inputFilePath))
				{
					convertedFilePath = inputFilePath;
					_logger.LogError(ex, "Error occurred during video conversion. Returning Unconverted file");
				}
				_logger.LogError(ex, "Error occurred during video conversion.");
			}

			if (System.IO.File.Exists(convertedFilePath) && width == 0 || height == 0)
			{
				(width, height) = await GetMediaDimensions(convertedFilePath);
			}
			return (convertedFilePath, width, height, duration);
		}
		private async Task<(int Width, int Height)> GetMediaDimensions(string filePath)
		{
			var probe = await FFmpeg.GetMediaInfo(filePath);
			var videoStream = probe.VideoStreams.FirstOrDefault();
			if (videoStream != null)
			{
				return (videoStream.Width, videoStream.Height);
			}
			return (0, 0);
		}

		private async Task InsertDirectoryMetadata(User user, string directoryPath, bool isPublic)
		{
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				var directoryName = (Path.GetFileName(Path.GetDirectoryName(directoryPath.TrimEnd('/'))) ?? "").Replace("\\", "/");
				var directoryPathTrimmed = (Path.GetDirectoryName(directoryPath.TrimEnd('/')) ?? "").Replace("\\", "/").TrimEnd('/') + '/';
				var command = new MySqlCommand(
						@$"INSERT INTO maxhanna.file_uploads 
                    (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size) 
                VALUES 
                    (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder, @file_size);"
				, connection);
				command.Parameters.AddWithValue("@user_id", user?.Id ?? 0);
				command.Parameters.AddWithValue("@fileName", directoryName);
				command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
				command.Parameters.AddWithValue("@folderPath", directoryPathTrimmed);
				command.Parameters.AddWithValue("@isPublic", isPublic);
				command.Parameters.AddWithValue("@isFolder", true);
				command.Parameters.AddWithValue("@file_size", 0);

				await command.ExecuteScalarAsync();
				_logger.LogInformation($"Uploaded folder: {directoryName}, Path: {directoryPath}");
			}
		}

		private async Task<int> InsertFileIntoDB(User user, IFormFile file, string uploadDirectory, bool isPublic, string convertedFilePath, int? width, int? height, int? duration)
		{
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();

				var command = new MySqlCommand(
				@$"INSERT INTO maxhanna.file_uploads (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size, width, height, last_updated, last_updated_by_user_id, duration)  
          VALUES (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder, @file_size, @width, @height, @uploadDate, @user_id, @duration); 
          SELECT LAST_INSERT_ID();", connection);
				command.Parameters.AddWithValue("@user_id", user?.Id ?? 0);
				command.Parameters.AddWithValue("@fileName", Path.GetFileName(convertedFilePath));
				command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
				command.Parameters.AddWithValue("@folderPath", uploadDirectory ?? "");
				command.Parameters.AddWithValue("@isPublic", isPublic);
				command.Parameters.AddWithValue("@width", width);
				command.Parameters.AddWithValue("@height", height);
				command.Parameters.AddWithValue("@isFolder", false);
				command.Parameters.AddWithValue("@file_size", new FileInfo(convertedFilePath).Length);
				command.Parameters.AddWithValue("@duration", duration);

				var fileId = await command.ExecuteScalarAsync();
				return Convert.ToInt32(fileId);
			}
		}

		private FileEntry CreateFileEntry(IFormFile file, User user, bool isPublic, int fileId, string filePath, string uploadDirectory, int? height, int? width, int? duration)
		{
			return new FileEntry
			{
				Id = fileId,
				FileName = Path.GetFileName(filePath),
				Directory = uploadDirectory,
				Visibility = isPublic ? "Public" : "Private",
				User = new User(user.Id ?? 0, user.Username ?? "Anonymous", null, user.DisplayPictureFile, user.About, null, null),
				IsFolder = false,
				FileComments = new List<FileComment>(),
				Date = DateTime.UtcNow,
				SharedWith = string.Empty,
				FileType = Path.GetExtension(filePath).TrimStart('.'),
				FileSize = (int)new FileInfo(filePath).Length,
				Height = height,
				Width = width,
				Duration = duration,
			};
		}
		private async Task<FileEntry?> GetConflictingFile(int userId, Microsoft.AspNetCore.Http.IFormFile file, string folderPath, bool isPublic)
		{
			var convertedFileName = "";
			if (IsImageFile(file))
			{
				var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
				convertedFileName = $"{fileNameWithoutExtension}.webp";
			}
			else if (IsVideoFile(file))
			{
				var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
				convertedFileName = $"{fileNameWithoutExtension}.webm";
			}

			//_logger.LogInformation("Checking for duplicated files : " + (!string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName));

			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();

				var command = new MySqlCommand(
						@"SELECT 
                        f.id AS fileId, 
                        f.file_name, 
                        f.is_public, 
                        f.is_folder, 
                        f.width, 
                        f.height, 
                        f.user_id, 
                        u.username AS username, 
                        f.shared_with,  
                        f.upload_date AS date, 
                        fc.id AS commentId, 
                        fc.user_id AS commentUserId, 
                        uc.username AS commentUsername,  
                        fc.comment AS commentText,  
                        f.given_file_name,
                        f.description,
                        f.last_updated as file_data_updated,
                        f.last_access as last_access
                    FROM 
                        maxhanna.file_uploads f    
                    LEFT JOIN 
                        maxhanna.comments fc ON fc.file_id = f.id 
                    LEFT JOIN 
                        maxhanna.users u ON u.id = f.user_id 
                    LEFT JOIN 
                        maxhanna.users uc ON fc.user_id = uc.id   
                    WHERE 
                        (f.file_name = @fileName OR f.file_name = @originalFileName)
                        AND f.folder_path = @folderPath 
                        AND (
                            f.is_public = @isPublic OR 
                            f.user_id = @userId OR 
                            FIND_IN_SET(@userId, f.shared_with) > 0
                        ) 
                    GROUP BY 
                        f.id, u.username, f.file_name, f.is_public, f.is_folder, f.user_id, fc.id, uc.username, fc.comment, f.given_file_name, f.description, f.last_updated 
                    LIMIT 1;",
						connection);

				command.Parameters.AddWithValue("@userId", userId);
				command.Parameters.AddWithValue("@fileName", !string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName);
				command.Parameters.AddWithValue("@originalFileName", file.FileName);
				command.Parameters.AddWithValue("@folderPath", folderPath);
				command.Parameters.AddWithValue("@isPublic", isPublic);

				using (var reader = await command.ExecuteReaderAsync())
				{
					if (await reader.ReadAsync())
					{
						var id = reader.GetInt32("fileId");
						var user_id = reader.GetInt32("user_id");
						var userName = reader.GetString("username");
						var shared_with = reader.IsDBNull(reader.GetOrdinal("shared_with")) ? string.Empty : reader.GetString("shared_with");
						int? width = reader.IsDBNull(reader.GetOrdinal("width")) ? null : reader.GetInt32("width");
						int? height = reader.IsDBNull(reader.GetOrdinal("height")) ? null : reader.GetInt32("height");
						var isFolder = reader.GetBoolean("is_folder");
						var lastAccess = reader.GetDateTime("last_access");

						var date = reader.GetDateTime("date");
						var fileData = new FileData();
						fileData.FileId = reader.IsDBNull(reader.GetOrdinal("fileId")) ? 0 : reader.GetInt32("fileId");
						fileData.GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString("given_file_name");
						fileData.Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description");
						fileData.LastUpdated = reader.IsDBNull(reader.GetOrdinal("file_data_updated")) ? null : reader.GetDateTime("file_data_updated");


						var fileEntry = new FileEntry();
						fileEntry.Id = id;
						fileEntry.FileName = !string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName;
						fileEntry.Visibility = isPublic ? "Public" : "Private";
						fileEntry.SharedWith = shared_with;
						fileEntry.User = new User(user_id, userName);
						fileEntry.IsFolder = isFolder;
						fileEntry.FileComments = new List<FileComment>();
						fileEntry.Date = date;
						fileEntry.FileData = fileData;
						fileEntry.Width = width;
						fileEntry.Height = height;
						fileEntry.LastAccess = lastAccess;


						if (!reader.IsDBNull(reader.GetOrdinal("commentId")))
						{
							do
							{
								var commentId = reader.GetInt32("commentId");
								var commentUserId = reader.GetInt32("commentUserId");
								var commentUsername = reader.GetString("commentUsername");
								var commentText = reader.GetString("commentText");


								int? displayPicId = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicId")) ? null : reader.GetInt32("commentUserDisplayPicId");
								string? displayPicFolderPath = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFolderPath")) ? null : reader.GetString("commentUserDisplayPicFolderPath");
								string? displayPicFileFileName = reader.IsDBNull(reader.GetOrdinal("commentUserDisplayPicFileName")) ? null : reader.GetString("commentUserDisplayPicFileName");
								FileEntry? dpFileEntry = displayPicId != null ? new FileEntry() { Id = (Int32)(displayPicId), Directory = displayPicFolderPath, FileName = displayPicFileFileName } : null;

								var fileComment = new FileComment
								{
									Id = commentId,
									FileId = id,
									User = new User(
												commentUserId,
												commentUsername ?? "Anonymous",
												null,
												displayPicId != null ? dpFileEntry : null,
												null, null, null),
									CommentText = commentText,
								};

								fileEntry.FileComments!.Add(fileComment);
							} while (await reader.ReadAsync());
						}

						return fileEntry;
					}
				}
			}
			return null;
		}

		[HttpPost("/File/Hide/", Name = "HideFile")]
		public async Task<IActionResult> HideFile([FromBody] HideFileRequest request)
		{
			try
			{
				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();
					_logger.LogInformation($"Opened connection to database for hiding file with id {request.FileId} for user {request.UserId}");

					using (var transaction = await connection.BeginTransactionAsync())
					{
						// Insert into hidden_files table (no permission check)
						var hideCommand = new MySqlCommand(
								"INSERT INTO maxhanna.hidden_files (user_id, file_id) VALUES (@userId, @fileId) ON DUPLICATE KEY UPDATE updated = CURRENT_TIMESTAMP",
								connection, transaction);
						hideCommand.Parameters.AddWithValue("@userId", request.UserId);
						hideCommand.Parameters.AddWithValue("@fileId", request.FileId);

						await hideCommand.ExecuteNonQueryAsync();
						_logger.LogInformation($"File {request.FileId} hidden for user {request.UserId}");

						// Commit transaction
						await transaction.CommitAsync();
					}
				}

				_logger.LogInformation($"File {request.FileId} hidden successfully for user {request.UserId}");
				return Ok("File hidden successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while hiding the file.");
				return StatusCode(500, "An error occurred while hiding the file.");
			}
		}

		[HttpPost("/File/Unhide/", Name = "UnhideFile")]
		public async Task<IActionResult> UnhideFile([FromBody] HideFileRequest request)
		{
			try
			{
				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();
					_logger.LogInformation($"Opened connection to database for unhiding file with id {request.FileId} for user {request.UserId}");

					using (var transaction = await connection.BeginTransactionAsync())
					{
						// Remove from hidden_files table (no permission check)
						var unhideCommand = new MySqlCommand(
								"DELETE FROM maxhanna.hidden_files WHERE user_id = @userId AND file_id = @fileId",
								connection, transaction);
						unhideCommand.Parameters.AddWithValue("@userId", request.UserId);
						unhideCommand.Parameters.AddWithValue("@fileId", request.FileId);

						await unhideCommand.ExecuteNonQueryAsync();
						_logger.LogInformation($"File {request.FileId} unhidden for user {request.UserId}");

						// Commit transaction
						await transaction.CommitAsync();
					}
				}

				_logger.LogInformation($"File {request.FileId} unhidden successfully for user {request.UserId}");
				return Ok("File unhidden successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while unhiding the file.");
				return StatusCode(500, "An error occurred while unhiding the file.");
			}
		}

		[HttpDelete("/File/Delete/", Name = "DeleteFileOrDirectory")]
		public async Task<IActionResult> DeleteFileOrDirectory([FromBody] DeleteFileOrDirectory request)
		{
			// Ensure baseTarget ends with a forward slash
			string filePath;

			try
			{
				using (var connection = new MySqlConnection(_connectionString))
				{
					connection.Open();
					_logger.LogInformation($"Opened connection to database for deleting file or directory with id {request.file.Id}");

					using (var transaction = connection.BeginTransaction())
					{
						// Check for ownership
						var ownershipCommand = new MySqlCommand(
								"SELECT user_id, file_name, folder_path, is_folder, shared_with FROM maxhanna.file_uploads WHERE id = @fileId",
								connection, transaction);
						ownershipCommand.Parameters.AddWithValue("@fileId", request.file.Id);

						var ownershipReader = ownershipCommand.ExecuteReader();
						if (!ownershipReader.Read())
						{
							_logger.LogError($"File or directory with id {request.file.Id} not found.");
							return NotFound("File or directory not found.");
						}

						var userId = ownershipReader.GetInt32("user_id");
						var sharedWith = ownershipReader.IsDBNull(ownershipReader.GetOrdinal("shared_with")) ? string.Empty : ownershipReader.GetString("shared_with");

						if (!sharedWith.Split(',').Contains(request.user.Id.ToString()) && userId != request.user.Id)
						{
							_logger.LogError($"User {request.user.Id} does not have ownership of {request.file.FileName}");
							return StatusCode(409, "You do not have permission to delete this file or directory.");
						}

						var fileName = ownershipReader.GetString("file_name");
						var folderPath = ownershipReader.GetString("folder_path").Replace("\\", "/").TrimEnd('/') + "/";
						var isFolder = ownershipReader.GetBoolean("is_folder");

						filePath = Path.Combine(_baseTarget, folderPath, fileName).Replace("\\", "/");
						ownershipReader.Close();

						if (!ValidatePath(filePath)) { return BadRequest($"Cannot delete: {filePath}"); }

						_logger.LogInformation($"User {request.user.Id} has ownership. Proceeding with deletion. File Path: {filePath}");

						// Proceed with deletion if ownership is confirmed
						if (isFolder)
						{
							if (Directory.Exists(filePath))
							{
								_logger.LogInformation($"Deleting directory at {filePath}");
								Directory.Delete(filePath, true);
								_logger.LogInformation($"Directory deleted at {filePath}");
							}
							else
							{
								_logger.LogError($"Directory not found at {filePath}");
							}

							if (filePath.TrimEnd('/') + "/" != _baseTarget.TrimEnd('/') + "/")
							{
								var innerDeleteCommand = new MySqlCommand(
										"DELETE FROM maxhanna.file_uploads WHERE folder_path LIKE CONCAT(@FolderPath, '%')",
										connection, transaction);
								innerDeleteCommand.Parameters.AddWithValue("@FolderPath", filePath.TrimEnd('/') + "/");
								//_logger.LogInformation(innerDeleteCommand.CommandText);
								innerDeleteCommand.ExecuteNonQuery();
							}
						}
						else
						{
							if (System.IO.File.Exists(filePath))
							{
								_logger.LogInformation($"Deleting file at {filePath}");
								System.IO.File.Delete(filePath);
								_logger.LogInformation($"File deleted at {filePath}");
							}
							else
							{
								_logger.LogError($"File not found at {filePath}");
							}
						}

						var deleteCommand = new MySqlCommand(
								"DELETE FROM maxhanna.file_uploads WHERE id = @fileId",
								connection, transaction);
						deleteCommand.Parameters.AddWithValue("@fileId", request.file.Id);
						deleteCommand.ExecuteNonQuery();

						_logger.LogInformation($"Record deleted from database for file or directory with id {request.file.Id}");

						// Commit transaction
						transaction.Commit();
					}
				}
				if (!request.file.IsFolder)
				{
					await RemoveFromSitemapAsync(request.file.Id);
				}
				_logger.LogInformation($"File or directory deleted successfully at {filePath}");
				return Ok("File or directory deleted successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while deleting file or directory.");
				return StatusCode(500, "An error occurred while deleting file or directory.");
			}
		}


		[HttpPost("/File/Move/", Name = "MoveFile")]
		public async Task<IActionResult> MoveFile([FromBody] User user, [FromQuery] string inputFile, [FromQuery] string? destinationFolder)
		{
			_logger.LogInformation($"POST /File/Move (inputFile = {inputFile}, destinationFolder = {destinationFolder})");

			try
			{
				// Remove any leading slashes
				inputFile = WebUtility.UrlDecode(inputFile ?? "").TrimStart('/');
				destinationFolder = WebUtility.UrlDecode(destinationFolder ?? "").TrimStart('/');

				// Combine with baseTarget
				inputFile = Path.Combine(_baseTarget, inputFile);
				destinationFolder = Path.Combine(_baseTarget, destinationFolder);

				if (!ValidatePath(inputFile) || !ValidatePath(destinationFolder))
				{
					_logger.LogError($"Invalid path: inputFile = {inputFile}, destinationFolder = {destinationFolder}");
					return NotFound("Invalid path.");
				}

				if (System.IO.File.Exists(inputFile))
				{
					string fileName = Path.GetFileName(inputFile).Replace("\\", "/");
					string newFilePath = Path.Combine(destinationFolder, fileName).Replace("\\", "/");
					System.IO.File.Move(inputFile, newFilePath);

					await UpdateFilePathInDatabase(inputFile, newFilePath);

					_logger.LogInformation($"File moved from {inputFile} to {newFilePath}");
					return Ok("File moved successfully.");
				}
				else if (Directory.Exists(inputFile))
				{
					MoveDirectory(inputFile, destinationFolder);

					await UpdateDirectoryPathInDatabase(inputFile, destinationFolder);

					_logger.LogInformation($"Directory moved from {inputFile} to {destinationFolder}");
					return Ok("Directory moved successfully.");
				}
				else
				{
					_logger.LogError($"Input file or directory not found at {inputFile}");
					return NotFound("Input file or directory not found.");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while moving the file or directory.");
				return StatusCode(500, "An error occurred while moving the file or directory.");
			}
		}

		[HttpPost("/File/Share/{fileId}", Name = "ShareFile")]
		public async Task<IActionResult> ShareFileRequest([FromBody] ShareFileRequest request, int fileId)
		{
			_logger.LogInformation($"GET /File/Share/{fileId} (for user: {request.User1.Id} to user: {request.User2.Id})");

			string updateSql = @"
                UPDATE maxhanna.file_uploads 
                SET shared_with = 
                    CASE 
                        WHEN shared_with IS NULL OR shared_with = '' THEN @user2id
                        ELSE CONCAT(shared_with, ',', @user2id) 
                    END 
                WHERE id = @fileId 
                AND (
                    shared_with IS NULL 
                    OR NOT FIND_IN_SET(@user2id, shared_with)
                )";

			string selectSql = "SELECT id, folder_path FROM maxhanna.file_uploads WHERE id = @fileId";

			try
			{
				using (var conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					// Find the file's path
					string? filePath = null;
					using (var selectCmd = new MySqlCommand(selectSql, conn))
					{
						selectCmd.Parameters.AddWithValue("@fileId", fileId);
						using (var reader = await selectCmd.ExecuteReaderAsync())
						{
							if (await reader.ReadAsync())
							{
								filePath = reader["folder_path"].ToString();
							}
						}
					}

					if (filePath == null)
					{
						_logger.LogInformation("Returned 500: File path not found");
						return StatusCode(500, "File path not found");
					}

					// List to keep track of all ids to be updated
					List<int> idsToUpdate = new List<int> { fileId };

					// Find all parent directories
					while (!string.IsNullOrEmpty(filePath))
					{
						_logger.LogInformation($"LOG::: folderPath: {filePath}");

						string parentPath = (Path.GetDirectoryName(filePath.TrimEnd('/').Replace("\\", "/")) ?? "").Replace("\\", "/");
						if (!parentPath.EndsWith("/"))
						{
							parentPath += "/";
						}
						string folderName = Path.GetFileName(filePath.TrimEnd('/'));

						_logger.LogInformation($"LOG::: parentPath: {parentPath}");
						_logger.LogInformation($"LOG::: folderName: {folderName}");

						if (string.IsNullOrEmpty(parentPath))
						{
							break;
						}

						using (var selectParentCmd = new MySqlCommand("SELECT id FROM maxhanna.file_uploads WHERE folder_path = @parentPath AND file_name = @folderName AND is_folder = 1", conn))
						{
							selectParentCmd.Parameters.AddWithValue("@parentPath", parentPath);
							selectParentCmd.Parameters.AddWithValue("@folderName", folderName);

							using (var reader = await selectParentCmd.ExecuteReaderAsync())
							{
								if (await reader.ReadAsync())
								{
									idsToUpdate.Add(reader.GetInt32("id"));
									filePath = parentPath;
								}
								else
								{
									break;
								}
							}
						}
					}

					// Update all relevant records
					foreach (var id in idsToUpdate)
					{
						using (var updateCmd = new MySqlCommand(updateSql, conn))
						{
							updateCmd.Parameters.AddWithValue("@user2id", request.User2.Id);
							updateCmd.Parameters.AddWithValue("@fileId", id);
							await updateCmd.ExecuteNonQueryAsync();
						}
					}

					_logger.LogInformation("Returned OK");
					return Ok();
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while sharing the file.");
				return StatusCode(500, "An error occurred while sharing the file.");
			}
		}


		private async Task UpdateFilePathInDatabase(string oldFilePath, string newFilePath)
		{

			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();

				// Ensure folder paths are standardized (replace backslashes with forward slashes)
				string oldFolderPath = (Path.GetDirectoryName(oldFilePath) ?? "").Replace("\\", "/");
				if (!oldFolderPath.EndsWith("/"))
				{
					oldFolderPath += "/";
				}
				string newFolderPath = (Path.GetDirectoryName(newFilePath) ?? "").Replace("\\", "/");
				if (!newFolderPath.EndsWith("/"))
				{
					newFolderPath += "/";
				}
				string fileName = Path.GetFileName(oldFilePath);

				_logger.LogInformation($"Update FilePath in database: oldFolderPath: {oldFolderPath}; newFolderPath: {newFolderPath}; fileName: {fileName}");


				var command = new MySqlCommand(
						"UPDATE maxhanna.file_uploads SET folder_path = @newFolderPath WHERE folder_path = @oldFolderPath AND file_name = @fileName", connection);
				command.Parameters.AddWithValue("@newFolderPath", newFolderPath);
				command.Parameters.AddWithValue("@oldFolderPath", oldFolderPath);
				command.Parameters.AddWithValue("@fileName", fileName);

				await command.ExecuteNonQueryAsync();
			}
		}

		private async Task UpdateDirectoryPathInDatabase(string oldDirectoryPath, string newDirectoryPath)
		{
			_logger.LogInformation($"UpdateDirectoryPathInDatabase: oldDirectoryPath: {oldDirectoryPath}; newDirectoryPath: {newDirectoryPath}");

			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();

				// Ensure folder paths are standardized (replace backslashes with forward slashes)
				string standardizedOldPath = Path.GetDirectoryName(oldDirectoryPath)!.Replace("\\", "/");
				if (!standardizedOldPath.EndsWith("/"))
				{
					standardizedOldPath += "/";
				}

				string standardizedNewPath = newDirectoryPath.Replace("\\", "/");
				if (!standardizedNewPath.EndsWith("/"))
				{
					standardizedNewPath += "/";
				}

				// Update paths for all files within the directory
				var command = new MySqlCommand(
						"UPDATE maxhanna.file_uploads SET folder_path = REPLACE(folder_path, @standardOldFolderPath, @newFolderPath) " +
						"WHERE folder_path LIKE CONCAT(@oldFolderPath, '%')", connection);
				command.Parameters.AddWithValue("@standardOldFolderPath", standardizedOldPath);
				command.Parameters.AddWithValue("@oldFolderPath", oldDirectoryPath);
				command.Parameters.AddWithValue("@newFolderPath", standardizedNewPath);

				await command.ExecuteNonQueryAsync();

				string fileName = Path.GetFileName(oldDirectoryPath)!;
				_logger.LogInformation($"UpdateDirectoryPathInDatabase: standardizedOldPath: {standardizedOldPath}; standardizedNewPath: {standardizedNewPath}; fileName: {fileName}");

				command = new MySqlCommand(
					 "UPDATE maxhanna.file_uploads SET folder_path = @newFolderPath " +
					 "WHERE folder_path  = @oldFolderPath AND file_name = @fileName;", connection);
				command.Parameters.AddWithValue("@oldFolderPath", standardizedOldPath);
				command.Parameters.AddWithValue("@newFolderPath", standardizedNewPath);
				command.Parameters.AddWithValue("@fileName", fileName);

				await command.ExecuteNonQueryAsync();
			}
		}


		[HttpPost("/File/Batch/", Name = "ExecuteBatch")]
		public IActionResult ExecuteBatch([FromBody] User user, [FromQuery] string? inputFile)
		{
			_logger.LogInformation($"POST /File/Batch (inputFile = {inputFile})");
			string result = "";
			try
			{
				Process p = new Process();
				p.StartInfo.UseShellExecute = false;
				p.StartInfo.RedirectStandardOutput = true;
				p.StartInfo.FileName = _baseTarget + "hello_world.bat";
				p.Start();
				result = p.StandardOutput.ReadToEnd();
				p.WaitForExit();
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while executing BAT file.");
				return StatusCode(500, "An error occurred while executing BAT file.");
			}
			return Ok(result);
		}
		public static async Task<(int? width, int? height, int? duration)> GetMediaInfo(string filePath)
		{
			var mediaInfo = await FFmpeg.GetMediaInfo(filePath);
			var videoStream = mediaInfo.VideoStreams?.FirstOrDefault();
			var audioStream = mediaInfo.AudioStreams?.FirstOrDefault();

			int? width = videoStream?.Width;
			int? height = videoStream?.Height;
			int? duration = (int?)mediaInfo.Duration.TotalSeconds;

			return (width, height, duration);
		}

		private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
		private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");

		private async Task AppendToSitemapAsync(FileEntry fileEntry)
		{
			_logger.LogInformation($"AppendToSitemapAsync (inputFile = {fileEntry.FileName}, isPublic = {fileEntry.Visibility}, fileType = {fileEntry.FileType}, fileId = {fileEntry.Id}, directory = {fileEntry.Directory})");

			string fileUrl = IsVideoFileFromExtensionString(fileEntry.FileType)
					? $"https://bughosted.com/Media/{fileEntry.Id}"  
					: $"https://bughosted.com/File/{fileEntry.Id}"; 

			string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

			await _sitemapLock.WaitAsync();
			try
			{
				XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
				XNamespace videoNs = "http://www.google.com/schemas/sitemap-video/1.1";
				XDocument sitemap;

				if (System.IO.File.Exists(_sitemapPath))
				{
					sitemap = XDocument.Load(_sitemapPath);
				}
				else
				{
					sitemap = new XDocument(new XElement(ns + "urlset"));
				}

				// Ensure video namespace is declared
				sitemap.Root.SetAttributeValue(XNamespace.Xmlns + "video", videoNs);

				// Remove existing entry (if any) to prevent duplicates
				var existingEntry = sitemap.Descendants(ns + "url")
																	 .FirstOrDefault(x => x.Element(ns + "loc")?.Value == fileUrl);
				existingEntry?.Remove();

				var urlElement = new XElement(ns + "url",
						new XElement(ns + "loc", fileUrl),
						new XElement(ns + "lastmod", lastMod),
						new XElement(ns + "changefreq", "daily"),
						new XElement(ns + "priority", "0.8")
				);

				// Check if the file is a video
				if (IsVideoFileFromExtensionString(fileEntry.FileType))
				{
					var videoElement = new XElement(videoNs + "video",
							new XElement(videoNs + "title", fileEntry.FileName),
							new XElement(videoNs + "description", "Video: " + fileEntry.FileName),
							new XElement(videoNs + "content_loc", GetVideoContentLoc(fileEntry.Directory, fileEntry.FileName)),
							new XElement(videoNs + "duration", fileEntry.Duration ?? 0),
							new XElement(videoNs + "publication_date", DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssK")),
							new XElement(videoNs + "family_friendly", "yes"),
							new XElement(videoNs + "thumbnail_loc", _logo)
					);

					urlElement.Add(videoElement);
				}

				sitemap.Root.Add(urlElement);
				sitemap.Save(_sitemapPath);
			}
			finally
			{
				_sitemapLock.Release();
			}
		}


		private async Task UpdateSitemapEntry(int? fileId, string? fileName, string? description)
		{
			if (string.IsNullOrEmpty(fileName) || fileId == null)
			{
				_logger.LogWarning("FileId and FileName must be provided.");
				return;
			}
			string fileUrl = $"https://bughosted.com/File/{fileId}";
			string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

			await _sitemapLock.WaitAsync();
			try
			{
				XDocument sitemap;

				if (System.IO.File.Exists(_sitemapPath))
				{
					sitemap = XDocument.Load(_sitemapPath);
				}
				else
				{
					_logger.LogWarning("Sitemap not found, unable to update.");
					return;
				}

				var urlElement = sitemap.Descendants(XName.Get("url", "http://www.sitemaps.org/schemas/sitemap/0.9"))
								.FirstOrDefault(x => x.Element(XName.Get("loc", "http://www.sitemaps.org/schemas/sitemap/0.9"))?.Value == fileUrl);

				if (urlElement == null)
				{
					_logger.LogWarning($"No sitemap entry found for file {fileId}.");
					return;
				}

				urlElement.Element(XName.Get("lastmod", "http://www.sitemaps.org/schemas/sitemap/0.9"))?.SetValue(lastMod);
				XNamespace videoNamespace = "http://www.google.com/schemas/sitemap-video/1.1";

				var videoElement = urlElement.Element(videoNamespace + "video");
				if (videoElement != null)
				{
					// Update the title and description for the video
					string desc = "";
					if (!string.IsNullOrEmpty(description)) { desc = description; }
					else if (!string.IsNullOrEmpty(fileName)) { desc = fileName; }
					else { desc = "Updated video file description."; }

					videoElement.Element(videoNamespace + "title")?.SetValue(fileName);
					videoElement.Element(videoNamespace + "description")?.SetValue(desc);
				}
				else
				{
					_logger.LogWarning("No <video:video> element found in sitemap for file.");
				}

				// Save the updated sitemap
				sitemap.Save(_sitemapPath);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while updating the sitemap entry.");
			}
			finally
			{
				_sitemapLock.Release();
			}
		}

		private async Task RemoveFromSitemapAsync(int targetId)
		{
			string targetUrl = $"https://bughosted.com/File/{targetId}";
			_logger.LogInformation($"Removing {targetUrl} from sitemap.");

			await _sitemapLock.WaitAsync();
			try
			{
				if (System.IO.File.Exists(_sitemapPath))
				{
					XDocument sitemap = XDocument.Load(_sitemapPath);
					XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9"; // Declare the default namespace

					// Use the namespace to search for <url> and <loc> elements
					var targetElement = sitemap.Descendants(ns + "url")
																			.FirstOrDefault(x => x.Element(ns + "loc")?.Value == targetUrl);

					if (targetElement != null)
					{
						targetElement.Remove();
						sitemap.Save(_sitemapPath);
						_logger.LogInformation($"Removed {targetUrl} from sitemap!");
					}
					else
					{
						_logger.LogInformation($"Could not remove sitemap entry, {targetUrl} not found in sitemap!");
					}
				}
			}
			finally
			{
				_sitemapLock.Release();
			}
		}

		private string GetVideoContentLoc(string? directory, string? fileName)
		{
			if (string.IsNullOrEmpty(directory) || string.IsNullOrEmpty(fileName))
			{
				return _logo;
			}
			string basePath = "E:/Dev/maxhanna/maxhanna.client/src/assets/";
			string relativePath = directory.Replace(basePath, "").TrimStart(Path.DirectorySeparatorChar);

			// Combine the relative path with the file name and return the full URL
			return $"https://bughosted.com/assets/{Path.Combine(relativePath, fileName).Replace(Path.DirectorySeparatorChar, '/')}";
		}

		private void MoveDirectory(string sourceDirectory, string destinationDirectory)
		{
			string directoryName = new DirectoryInfo(sourceDirectory).Name;
			string newDirectoryPath = Path.Combine(destinationDirectory, directoryName);
			Directory.Move(sourceDirectory, newDirectoryPath);
		}

		private bool ValidatePath(string directory)
		{
			if (!directory.Contains(_baseTarget))
			{
				_logger.LogError($"Must be within {_baseTarget}");
				return false;
			}
			else if (directory.Equals(_baseTarget + "Users") || directory.Equals(_baseTarget + "Roms")
					|| directory.Equals(_baseTarget + "Meme") || directory.Equals(_baseTarget + "Nexus")
					|| directory.Equals(_baseTarget + "Array") || directory.Equals(_baseTarget + "BugHosted")
					|| directory.Equals(_baseTarget + "Files") || directory.Equals(_baseTarget + "Pictures") 
					|| directory.Equals(_baseTarget + "Videos"))
			{
				_logger.LogError($"Cannot delete {directory}!");
				return false;
			}
			else
			{
				return true;
			}
		}  

		private bool DetermineIfRomSearch(List<string>? fileType)
		{
			if (fileType == null || fileType.Count == 0)
			{
				return false; 
			}
			 
			List<string> fileTypeList = (fileType.Count == 1 && fileType[0] != null && fileType[0].Contains(","))
					? fileType[0].Split(',').Select(s => s.Trim()).ToList()
					: fileType;
			 
			return fileTypeList.Any(ext => romExtensions.Contains(ext));
		}

		private string GetContentType(string fileExtension)
		{
			switch (fileExtension.ToLower())
			{
				case ".pdf":
					return "application/pdf";
				case ".txt":
					return "text/plain";
				case ".jpg":
				case ".jpeg":
					return "image/jpeg";
				case ".png":
					return "image/png";
				default:
					return "application/octet-stream";
			}
		}
	}
}
