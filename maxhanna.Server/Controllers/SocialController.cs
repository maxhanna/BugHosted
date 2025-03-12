using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Metadata;
using maxhanna.Server.Controllers.DataContracts.Social;
using maxhanna.Server.Controllers.DataContracts.Topics;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Data;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class SocialController : ControllerBase
	{
		private readonly ILogger<SocialController> _logger;
		private readonly IConfiguration _config;
		private readonly string _baseTarget;


		public SocialController(ILogger<SocialController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
			_baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? "";
		}

		[HttpPost(Name = "GetStories")]
		public async Task<IActionResult> GetStories(
			[FromBody] GetStoryRequest request,
			[FromQuery] string? search,
			[FromQuery] string? topics,
			[FromQuery] int page = 1,
			[FromQuery] int pageSize = 10,
			[FromQuery] bool showHiddenStories = false)
		{
			_logger.LogInformation($@"POST /Social for user: {request.User?.Id} 
                with search: {search} with topics: {topics} for profile: {request.ProfileUserId} for storyId: {request.StoryId}. 
                Pagination: Page {page}, PageSize {pageSize}, ShowHiddenStories: {showHiddenStories}.");

			try
			{
				var stories = await GetStoriesAsync(request, search, topics, page, pageSize, showHiddenStories);
				return Ok(stories);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching stories.");
				return StatusCode(500, "An error occurred while fetching stories.");
			}
		}

		private async Task<StoryResponse> GetStoriesAsync(GetStoryRequest request, string? search, string? topics, int page = 1, int pageSize = 10, bool showHiddenStories = false)
		{
			var whereClause = new StringBuilder(" WHERE 1=1 ");
			var parameters = new Dictionary<string, object>();

			// Fetch the NSFW setting for the user
			int? nsfwEnabled = null;
			if (request.User?.Id != null)
			{
				string nsfwSql = @"SELECT nsfw_enabled FROM user_settings WHERE user_id = @userId";
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand(nsfwSql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.User.Id);
						nsfwEnabled = (int?)await cmd.ExecuteScalarAsync();
					}
				}
			}

			if (nsfwEnabled == null || nsfwEnabled == 0)
			{
				whereClause.Append(@"
            AND NOT EXISTS (
                SELECT 1 FROM story_topics st 
                JOIN topics t ON st.topic_id = t.id 
                WHERE st.story_id = s.id AND t.topic = 'NSFW'
            )
        ");
			}


			if (!string.IsNullOrEmpty(search))
			{
				whereClause.Append(
						$@" AND (
                MATCH(s.story_text) AGAINST(@searchTerm IN NATURAL LANGUAGE MODE)  
								OR s.story_text LIKE CONCAT('%', @searchTerm, '%')
                OR s.city LIKE CONCAT('%', @searchTerm, '%')
                OR s.country LIKE CONCAT('%', @searchTerm, '%')
                OR username LIKE CONCAT('%', @searchTerm, '%')
            ) "
				);
				parameters.Add("@searchTerm", search);
			}
			if (request.StoryId != null)
			{
				whereClause.Append(" AND s.id = @storyId ");
				parameters.Add("@storyId", request.StoryId.Value);
			}
			if (!string.IsNullOrEmpty(topics))
			{
				var topicIds = topics.Split(',').Select((t, index) => new { Index = index, Id = t }).ToList();
				for (int i = 0; i < topicIds.Count; i++)
				{
					whereClause.Append($@" AND EXISTS (
                SELECT 1 FROM story_topics st2 
                LEFT JOIN topics t2 ON st2.topic_id = t2.id 
                WHERE st2.story_id = s.id AND t2.id = @topic_id_{i}
            ) ");
					parameters.Add($"@topic_id_{i}", topicIds[i].Id);
				}
			}
			if (request.ProfileUserId != null && request.ProfileUserId > 0)
			{
				whereClause.Append("AND s.profile_user_id = @profile ");
				parameters.Add("@profile", request.ProfileUserId.Value);
			}
			if (request.ProfileUserId == null || request.ProfileUserId == 0)
			{
				whereClause.Append("AND s.profile_user_id IS NULL ");
			}
			if (!showHiddenStories && request.User?.Id != null)
			{
				whereClause.Append(@" AND hs.story_id IS NULL ");
			}
			parameters.Add("@userId", request?.User?.Id ?? 0);


			int offset = (page - 1) * pageSize;
			string countSql = @$"SELECT COUNT(*) AS total_count 
												FROM stories AS s 
												JOIN users AS u ON s.user_id = u.id 
												LEFT JOIN hidden_stories hs ON hs.story_id = s.id AND hs.user_id = @userId  
												{whereClause};";
			string sql = @$"
    SELECT 
        s.id AS story_id, 
        u.id AS user_id, 
				u.username as username, 
        udp.file_id AS displayPictureFileId,
        udpfu.folder_path AS displayPictureFileFolderPath,
        udpfu.file_name AS displayPictureFileFileName,
        s.story_text, s.date, s.city, s.country, 
				CASE 
						WHEN hs.story_id IS NOT NULL THEN TRUE 
						ELSE FALSE 
				END AS hidden,
        COALESCE(c.comments_count, 0) AS comments_count,
        sm.title, sm.description, sm.image_url, sm.metadata_url
    FROM stories AS s 
    JOIN users AS u ON s.user_id = u.id  
    LEFT JOIN user_display_pictures AS udp ON udp.user_id = u.id 
    LEFT JOIN file_uploads AS udpfu ON udp.file_id = udpfu.id 
    LEFT JOIN (SELECT story_id, COUNT(id) AS comments_count FROM comments GROUP BY story_id) AS c 
        ON s.id = c.story_id
    LEFT JOIN story_metadata AS sm ON s.id = sm.story_id  
		LEFT JOIN hidden_stories hs ON hs.story_id = s.id AND hs.user_id = @userId  
     {whereClause}  
    ORDER BY s.id DESC 
    LIMIT @pageSize OFFSET @offset;";

			var storyResponse = new StoryResponse();
			var storyDictionary = new Dictionary<int, Story>();

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				using (var countCmd = new MySqlCommand(countSql, conn))
				{
					foreach (var param in parameters)
					{
						countCmd.Parameters.AddWithValue(param.Key, param.Value);
					}
					Console.WriteLine(countCmd.CommandText);
					storyResponse.TotalCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
				}
				using (var cmd = new MySqlCommand(sql, conn))
				{
					cmd.Parameters.AddWithValue("@pageSize", pageSize);
					cmd.Parameters.AddWithValue("@offset", offset);
					foreach (var param in parameters)
					{
						cmd.Parameters.AddWithValue(param.Key, param.Value);
					}
					//Console.WriteLine(cmd.CommandText);
					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							int storyId = rdr.GetInt32("story_id");
							if (!storyDictionary.TryGetValue(storyId, out var story))
							{
								int? displayPicId = rdr.IsDBNull(rdr.GetOrdinal("displayPictureFileId")) ? null : rdr.GetInt32("displayPictureFileId");
								string? displayPicFolderPath = rdr.IsDBNull(rdr.GetOrdinal("displayPictureFileFolderPath")) ? null : rdr.GetString("displayPictureFileFolderPath");
								string? displayPicFileFileName = rdr.IsDBNull(rdr.GetOrdinal("displayPictureFileFileName")) ? null : rdr.GetString("displayPictureFileFileName");
								FileEntry? dpFileEntry = displayPicId != null ? new FileEntry { Id = (int)displayPicId, Directory = displayPicFolderPath, FileName = displayPicFileFileName } : null;

								story = new Story
								{
									Id = storyId,
									User = new User(rdr.GetInt32("user_id"), rdr.GetString("username"), null, dpFileEntry, null, null, null),
									StoryText = rdr.GetString("story_text"),
									Date = rdr.GetDateTime("date"),
									City = rdr.IsDBNull(rdr.GetOrdinal("city")) ? null : rdr.GetString("city"),
									Country = rdr.IsDBNull(rdr.GetOrdinal("country")) ? null : rdr.GetString("country"),
									CommentsCount = rdr.GetInt32("comments_count"),
									Metadata = new List<Metadata>(),
									StoryFiles = new List<FileEntry>(),
									StoryComments = new List<FileComment>(),
									StoryTopics = new List<Topic>(),
									Reactions = new List<Reaction>(),
									Hidden = rdr.IsDBNull(rdr.GetOrdinal("hidden")) ? false : rdr.GetBoolean("hidden"),
								};
								storyDictionary[storyId] = story;
							}
							if (!rdr.IsDBNull(rdr.GetOrdinal("title")))
							{
								story.Metadata?.Add(new Metadata
								{
									Title = rdr.GetString("title"),
									Url = rdr.IsDBNull(rdr.GetOrdinal("metadata_url")) ? null : rdr.GetString("metadata_url"),
									Description = rdr.IsDBNull(rdr.GetOrdinal("description")) ? null : rdr.GetString("description"),
									ImageUrl = rdr.IsDBNull(rdr.GetOrdinal("image_url")) ? null : rdr.GetString("image_url")
								});
							}
						}
					}
				}
			}

			storyResponse.Stories = storyDictionary.Values.ToList();
			await AttachCommentsToStoriesAsync(storyResponse.Stories);
			await AttachFilesToStoriesAsync(storyResponse.Stories);
			await FetchAndAttachTopicsAsync(storyResponse.Stories);
			await FetchAndAttachReactionsAsync(storyResponse.Stories);

			storyResponse.CurrentPage = page;
			storyResponse.PageCount = (int)Math.Ceiling((double)storyResponse.TotalCount / pageSize);

			return storyResponse;
		}

		private async Task FetchAndAttachTopicsAsync(List<Story> stories)
		{
			if (stories.Count == 0)
			{
				return;
			}
			var topicSql = @"
        SELECT 
            s.id AS story_id,
            t.id AS topic_id,
            t.topic AS topic_text
        FROM 
            stories AS s
            LEFT JOIN story_topics AS st ON s.id = st.story_id
            LEFT JOIN topics AS t ON st.topic_id = t.id
        WHERE 
            s.id IN ({0})"; // Placeholder for story IDs

			var storyIds = string.Join(",", stories.Select(s => s.Id)); // Convert IDs to comma-separated string

			// Format the SQL query with dynamic placeholders for story IDs
			topicSql = string.Format(topicSql, storyIds);

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				using (var cmd = new MySqlCommand(topicSql, conn))
				{
					// No need to use cmd.Parameters.AddWithValue for @storyIds because it's dynamically inserted

					//_logger.LogInformation(cmd.CommandText);

					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							int storyId = rdr.IsDBNull("story_id") ? 0 : rdr.GetInt32("story_id");
							int topicId = rdr.IsDBNull("topic_id") ? 0 : rdr.GetInt32("topic_id");
							string topicText = rdr.IsDBNull("topic_text") ? string.Empty : rdr.GetString("topic_text");

							var topic = new Topic
							{
								Id = topicId,
								TopicText = topicText
							};

							var story = stories.FirstOrDefault(s => s.Id == storyId);
							if (story != null && topicId != 0)
							{
								if (story.StoryTopics == null)
								{
									story.StoryTopics = new List<Topic>();
								}
								story.StoryTopics.Add(topic);
							}
						}
					}
				}
			}
		}
		private async Task FetchAndAttachReactionsAsync(List<Story> stories)
		{
			if (stories.Count == 0)
			{
				return;
			}
			var reactionSql = @"
        SELECT 
            r.id AS reaction_id,
            r.story_id AS story_id,
            r.user_id AS user_id,
            reactionusers.username AS user_name,
						udp.file_id as user_display_picture_file_id,
            r.type AS reaction_type,
            r.timestamp AS reaction_timestamp
        FROM 
            reactions AS r
            LEFT JOIN users AS reactionusers ON r.user_id = reactionusers.id
            LEFT JOIN user_display_pictures AS udp ON udp.user_id = reactionusers.id 
        WHERE 
            r.story_id IN ({0})"; // Placeholder for story IDs

			var storyIds = string.Join(",", stories.Select(s => s.Id)); // Convert IDs to comma-separated string

			// Format the SQL query with dynamic placeholders for story IDs
			reactionSql = string.Format(reactionSql, storyIds);

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				using (var cmd = new MySqlCommand(reactionSql, conn))
				{
					// No need to use cmd.Parameters.AddWithValue for @storyIds because it's dynamically inserted

					//_logger.LogInformation(cmd.CommandText);

					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							int storyId = rdr.IsDBNull("story_id") ? 0 : rdr.GetInt32("story_id");
							var udpFileEntry = rdr.IsDBNull("user_display_picture_file_id") ? null : new FileEntry(rdr.GetInt32("user_display_picture_file_id"));
							var reaction = new Reaction
							{
								Id = rdr.IsDBNull("reaction_id") ? 0 : rdr.GetInt32("reaction_id"),
								User = new User
								{
									Id = rdr.IsDBNull("user_id") ? 0 : rdr.GetInt32("user_id"),
									Username = rdr.IsDBNull("user_name") ? string.Empty : rdr.GetString("user_name"),
									DisplayPictureFile = udpFileEntry
								},
								Type = rdr.IsDBNull("reaction_type") ? string.Empty : rdr.GetString("reaction_type"),
								Timestamp = rdr.IsDBNull("reaction_timestamp") ? DateTime.MinValue : rdr.GetDateTime("reaction_timestamp")
							};

							var story = stories.FirstOrDefault(s => s.Id == storyId);
							if (story != null && reaction.Id != 0)
							{
								if (story.Reactions == null)
								{
									story.Reactions = new List<Reaction>();
								}
								story.Reactions.Add(reaction);
							}
						}
					}
				}
			}
		}


		private async Task AttachFilesToStoriesAsync(List<Story> stories)
		{
			// Extract all unique story IDs from the list of stories
			var storyIds = stories.Select(s => s.Id).Distinct().ToList();

			// If there are no stories, return early
			if (storyIds.Count == 0)
			{
				return;
			}

			// Construct SQL query with parameterized IN clause for story IDs
			StringBuilder sqlBuilder = new StringBuilder();
			sqlBuilder.AppendLine(@"
        SELECT 
            s.id AS story_id,
            f.id AS file_id, 
            f.file_name, 
            f.folder_path, 
            f.is_public, 
            f.is_folder, 
            f.shared_with, 
            f.given_file_name,
            f.description as file_data_description,
            f.last_updated as file_data_updated,
            f.upload_date AS file_date, 
            fu.username AS file_username, 
            f.user_id AS file_user_id
        FROM 
            stories AS s
        LEFT JOIN 
            story_files AS sf ON s.id = sf.story_id
        LEFT JOIN 
            file_uploads AS f ON sf.file_id = f.id 
        LEFT JOIN 
            users AS fu ON f.user_id = fu.id
        WHERE 
            s.id IN (");

			// Add placeholders for story IDs
			for (int i = 0; i < storyIds.Count; i++)
			{
				sqlBuilder.Append("@storyId" + i);
				if (i < storyIds.Count - 1)
				{
					sqlBuilder.Append(", ");
				}
			}

			sqlBuilder.AppendLine(@")
        GROUP BY 
            s.id, f.id, f.file_name, f.folder_path, f.is_public, f.is_folder, f.shared_with,
            f.given_file_name, file_data_description, file_data_updated,
            f.upload_date, fu.username, f.user_id;");

			// Execute the SQL query
			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				using (var cmd = new MySqlCommand(sqlBuilder.ToString(), conn))
				{
					// Bind each story ID to its respective parameter
					for (int i = 0; i < storyIds.Count; i++)
					{
						cmd.Parameters.AddWithValue("@storyId" + i, storyIds[i]);
					}

					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						_logger.LogInformation("File SQL query executed, processing results.");

						while (await rdr.ReadAsync())
						{
							int storyId = rdr.IsDBNull("story_id") ? 0 : rdr.GetInt32("story_id");
							var story = stories.FirstOrDefault(s => s.Id == storyId);

							if (story != null && !rdr.IsDBNull("file_id"))
							{
								var fileEntry = new FileEntry
								{
									Id = rdr.GetInt32("file_id"),
									FileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? null : rdr.GetString("file_name"),
									Directory = rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? _baseTarget : rdr.GetString("folder_path"),
									Visibility = rdr.GetBoolean("is_public") ? "Public" : "Private",
									SharedWith = rdr.IsDBNull(rdr.GetOrdinal("shared_with")) ? null : rdr.GetString("shared_with"),
									User = new User(
												rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? 0 : rdr.GetInt32("file_user_id"),
												rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? "Anonymous" : rdr.GetString("file_username")
										),
									IsFolder = rdr.GetBoolean("is_folder"),
									Date = rdr.GetDateTime("file_date"),
									FileComments = new List<FileComment>(),
									FileData = new FileData()
									{
										FileId = rdr.IsDBNull(rdr.GetOrdinal("file_id")) ? 0 : rdr.GetInt32("file_id"),
										GivenFileName = rdr.IsDBNull(rdr.GetOrdinal("given_file_name")) ? null : rdr.GetString("given_file_name"),
										Description = rdr.IsDBNull(rdr.GetOrdinal("file_data_description")) ? null : rdr.GetString("file_data_description"),
										LastUpdated = rdr.IsDBNull(rdr.GetOrdinal("file_data_updated")) ? null : rdr.GetDateTime("file_data_updated"),
									}
								};

								story.StoryFiles!.Add(fileEntry);
							}
						}
					}
				}
			}
		}

		private async Task AttachCommentsToStoriesAsync(List<Story> stories)
		{
			// Extract all unique story IDs from the list of stories
			var storyIds = stories.Select(s => s.Id).Distinct().ToList();

			// If there are no stories, return early
			if (storyIds.Count == 0)
			{
				return;
			}

			// Construct SQL query with parameterized IN clause for story IDs
			StringBuilder sqlBuilder = new StringBuilder();
			sqlBuilder.AppendLine(@"
        SELECT 
            c.id AS comment_id,
            c.story_id AS story_id,
            c.user_id AS comment_user_id,
            u.username AS comment_username,
            udpfu.id as profileFileId,
            udpfu.file_name as profileFileName,
            udpfu.folder_path as profileFileFolder,
            c.comment,
            c.date,
            cf.file_id AS comment_file_id,
            f.file_name AS comment_file_name,
            f.folder_path AS comment_file_folder_path,
            f.is_public AS comment_file_visibility,
            f.shared_with AS comment_file_shared_with,
            f.is_folder AS comment_file_is_folder,
            f.upload_date AS comment_file_date,
            fu.id AS file_user_id,
            fu.username AS file_username,
            f.given_file_name as comment_file_given_file_name,
            f.description as comment_file_description,
            f.last_updated as comment_file_date,
            r.id AS reaction_id,
            r.type AS reaction_type,
            r.user_id AS reaction_user_id,
            ru.username AS reaction_username,
            r.timestamp AS reaction_time
        FROM 
            comments AS c
        LEFT JOIN 
            users AS u ON c.user_id = u.id
        LEFT JOIN 
            user_display_pictures AS udp ON udp.user_id = u.id
        LEFT JOIN 
            file_uploads AS udpfu ON udp.file_id = udpfu.id
        LEFT JOIN 
            comment_files AS cf ON cf.comment_id = c.id
        LEFT JOIN 
            file_uploads AS f ON cf.file_id = f.id 
        LEFT JOIN 
            users AS fu ON f.user_id = fu.id
        LEFT JOIN 
            reactions AS r ON c.id = r.comment_id
        LEFT JOIN 
            users AS ru ON r.user_id = ru.id   
        WHERE 
            c.story_id IN (");

			// Add placeholders for story IDs
			for (int i = 0; i < storyIds.Count; i++)
			{
				sqlBuilder.Append("@storyId" + i);
				if (i < storyIds.Count - 1)
				{
					sqlBuilder.Append(", ");
				}
			}

			sqlBuilder.AppendLine(@")
        GROUP BY c.id, r.id, r.type, ru.id, r.type, ru.username, r.timestamp, 
        udpfu.file_name, udpfu.folder_path, cf.file_id, 
        f.file_name, f.folder_path, f.is_public, f.shared_with, f.is_folder,
        f.upload_date, fu.id, fu.username, f.given_file_name, f.description, f.last_updated ");

			// Execute the SQL query
			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				using (var cmd = new MySqlCommand(sqlBuilder.ToString(), conn))
				{
					// Bind each story ID to its respective parameter
					for (int i = 0; i < storyIds.Count; i++)
					{
						cmd.Parameters.AddWithValue("@storyId" + i, storyIds[i]);
					}

					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						_logger.LogInformation("Comment SQL query executed, processing results.");

						while (await rdr.ReadAsync())
						{
							if (rdr.IsDBNull("comment_id") || rdr.IsDBNull("story_id")) { continue; }
							int storyId = rdr.GetInt32("story_id");
							var commentId = rdr.GetInt32("comment_id");
							var userId = rdr.GetInt32("comment_user_id");
							var userName = rdr.GetString("comment_username");
							var commentText = rdr.GetString("comment");
							var date = rdr.GetDateTime("date");

							var story = stories.FirstOrDefault(s => s.Id == storyId);

							if (story != null)
							{
								// Check if the comment already exists for the story
								var comment = story.StoryComments!.FirstOrDefault(c => c.Id == commentId);
								if (comment == null)
								{
									int? displayPicId = rdr.IsDBNull(rdr.GetOrdinal("profileFileId")) ? null : rdr.GetInt32("profileFileId");
									string? displayPicFolderPath = rdr.IsDBNull(rdr.GetOrdinal("profileFileFolder")) ? null : rdr.GetString("profileFileFolder");
									string? displayPicFileFileName = rdr.IsDBNull(rdr.GetOrdinal("profileFileName")) ? null : rdr.GetString("profileFileName");
									FileEntry? dpFileEntry = displayPicId != null ? new FileEntry() { Id = (Int32)(displayPicId), Directory = displayPicFolderPath, FileName = displayPicFileFileName } : null;

									comment = new FileComment
									{
										Id = commentId,
										CommentText = commentText,
										StoryId = storyId,
										User = new User(userId, userName, null, dpFileEntry, null, null, null),
										Date = date,
										CommentFiles = new List<FileEntry>(),
										Reactions = new List<Reaction>() // Initialize reactions list
									};

									story.StoryComments!.Add(comment);
								}

								// Handle comment reactions
								if (!rdr.IsDBNull("reaction_id"))
								{
									var reactionId = rdr.GetInt32("reaction_id");
									var reactionType = rdr.GetString("reaction_type");
									var reactionUserId = rdr.GetInt32("reaction_user_id");
									var reactionUserName = rdr.GetString("reaction_username");
									var reactionTime = rdr.GetDateTime("reaction_time");

									// Check if the reaction already exists for the comment
									var existingReaction = comment.Reactions!.FirstOrDefault(r => r.Id == reactionId);
									if (existingReaction == null)
									{
										User reactionUser = new User(reactionUserId, reactionUserName);
										if (comment.Reactions == null)
										{
											comment.Reactions = new List<Reaction>();
										}
										comment.Reactions.Add(new Reaction
										{
											Id = reactionId,
											Type = reactionType,
											Timestamp = reactionTime,
											User = reactionUser
										});
									}
								}

								// Check if there is a file associated with the comment
								if (!rdr.IsDBNull("comment_file_id"))
								{
									var fileEntry = new FileEntry
									{
										Id = rdr.GetInt32("comment_file_id"),
										FileName = rdr.IsDBNull("comment_file_name") ? null : rdr.GetString("comment_file_name"),
										Directory = rdr.IsDBNull("comment_file_folder_path") ? _baseTarget : rdr.GetString("comment_file_folder_path"),
										Visibility = rdr.IsDBNull("comment_file_visibility") ? null : rdr.GetBoolean("comment_file_visibility") ? "Public" : "Private",
										SharedWith = rdr.IsDBNull("comment_file_shared_with") ? null : rdr.GetString("comment_file_shared_with"),
										User = new User(
													rdr.IsDBNull("file_user_id") ? 0 : rdr.GetInt32("file_user_id"),
													rdr.IsDBNull("file_username") ? "Anonymous" : rdr.GetString("file_username")
											),
										IsFolder = rdr.GetBoolean("comment_file_is_folder"),
										Date = rdr.GetDateTime("comment_file_date"),
										FileData = new FileData()
										{
											FileId = rdr.IsDBNull("comment_file_id") ? 0 : rdr.GetInt32("comment_file_id"),
											GivenFileName = rdr.IsDBNull("comment_file_given_file_name") ? null : rdr.GetString("comment_file_given_file_name"),
											Description = rdr.IsDBNull("comment_file_description") ? null : rdr.GetString("comment_file_description"),
											LastUpdated = rdr.IsDBNull("comment_file_date") ? null : rdr.GetDateTime("comment_file_date"),
										}
									};

									comment.CommentFiles!.Add(fileEntry);
								}
							}
						}
					}
				}
			}
		}


		[HttpPost("/Social/Post-Story/", Name = "PostStory")]
		public async Task<IActionResult> PostStory([FromBody] StoryRequest request)
		{
			_logger.LogInformation($"POST /Social/Post-Story/ for user: {request.user?.Id} with #of attached files : {request.story.StoryFiles?.Count}");

			try
			{
				string sql = @"INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date) VALUES (@userId, @storyText, @profileUserId, @city, @country, UTC_TIMESTAMP());";
				string topicSql = @"INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, @topicId);";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.user?.Id ?? 0);
						cmd.Parameters.AddWithValue("@storyText", request.story.StoryText);
						cmd.Parameters.AddWithValue("@profileUserId", request.story.ProfileUserId.HasValue && request.story.ProfileUserId != 0 ? request.story.ProfileUserId.Value : (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@city", request.story.City ?? (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@country", request.story.Country ?? (object)DBNull.Value);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{
							// Fetch the last inserted ID
							int storyId = (int)cmd.LastInsertedId;

							// Insert attached files into story_files table
							if (request.story.StoryFiles != null && request.story.StoryFiles.Count > 0)
							{
								foreach (var file in request.story.StoryFiles)
								{
									string fileSql = @"INSERT INTO story_files (story_id, file_id) VALUES (@storyId, @fileId);";
									using (var fileCmd = new MySqlCommand(fileSql, conn))
									{
										fileCmd.Parameters.AddWithValue("@storyId", storyId);
										fileCmd.Parameters.AddWithValue("@fileId", file.Id);
										await fileCmd.ExecuteNonQueryAsync();
									}
								}
							}

							// Insert story topics into story_topics table
							if (request.story.StoryTopics != null && request.story.StoryTopics.Count > 0)
							{
								foreach (var topic in request.story.StoryTopics)
								{
									using (var topicCmd = new MySqlCommand(topicSql, conn))
									{
										topicCmd.Parameters.AddWithValue("@storyId", storyId);
										topicCmd.Parameters.AddWithValue("@topicId", topic.Id);
										await topicCmd.ExecuteNonQueryAsync();
									}
								}
							}

							// Extract URL from story text
							var urls = ExtractUrls(request.story.StoryText);
							if (urls != null)
							{
								// Fetch metadata
								var metadataRequest = new MetadataRequest { User = request.user, Url = urls };
								var metadataResponse = SetMetadata(metadataRequest, storyId);
							}

							await AppendToSitemapAsync(storyId);

							return Ok("Story posted successfully.");
						}
						else
						{
							return StatusCode(500, "Failed to post story.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while posting story.");
				return StatusCode(500, "An error occurred while posting story.");
			}
		}



		[HttpPost("/Social/Delete-Story", Name = "DeleteStory")]
		public async Task<IActionResult> DeleteStory([FromBody] StoryRequest request)
		{
			_logger.LogInformation($"POST /Social/Delete-Story for user: {request.user?.Id} with storyId: {request.story.Id}");

			try
			{
				string sql = @"DELETE FROM stories WHERE (user_id = @userId OR profile_user_id = @userId) AND id = @storyId;";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.user?.Id ?? 0);
						cmd.Parameters.AddWithValue("@storyId", request.story.Id);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{
							await RemoveFromSitemapAsync(request.story.Id);
							return Ok("Story deleted successfully.");
						}
						else
						{
							return StatusCode(500, "Failed to delete story.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while deleting story.");
				return StatusCode(500, "An error occurred while deleting story.");
			}
		}


		[HttpPost("/Social/Edit-Story", Name = "EditStory")]
		public async Task<IActionResult> EditStory([FromBody] StoryRequest request)
		{
			_logger.LogInformation($"POST /Social/Edit-Story for user: {request.user?.Id} with storyId: {request.story.Id}");

			try
			{
				string sql = @"UPDATE stories SET story_text = @Text WHERE user_id = @UserId AND id = @StoryId;";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", request.user?.Id ?? 0);
						cmd.Parameters.AddWithValue("@StoryId", request.story.Id);
						cmd.Parameters.AddWithValue("@Text", request.story.StoryText);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{
							await AppendToSitemapAsync(request.story.Id);
							var url = ExtractUrls(request.story.StoryText);
							if (url != null)
							{
								// Fetch metadata
								var metadataRequest = new MetadataRequest { User = request.user, Url = url };
								var metadataResponse = SetMetadata(metadataRequest, request.story.Id);
							}

							return Ok("Story edited successfully.");
						}
						else
						{
							return StatusCode(500, "Failed to edited story.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while deleting story.");
				return StatusCode(500, "An error occurred while deleting story.");
			}
		}

		[HttpPost("/Social/Edit-Topics", Name = "EditTopics")]
		public async Task<IActionResult> EditTopics([FromBody] DataContracts.Social.EditTopicRequest request)
		{
			_logger.LogInformation($"POST /Social/Edit-Topics for user: {request.User?.Id} with storyId: {request.Story.Id}");

			try
			{
				string deleteSql = "DELETE FROM maxhanna.story_topics WHERE story_id = @StoryId;";
				string insertSql = "INSERT INTO maxhanna.story_topics (story_id, topic_id) VALUES (@StoryId, @TopicId);";

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
								deleteCmd.Parameters.AddWithValue("@StoryId", request.Story.Id);
								await deleteCmd.ExecuteNonQueryAsync();
							}

							// Insert new topics
							if (request.Topics != null && request.Topics.Any())
							{
								foreach (var topic in request.Topics)
								{
									using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
									{
										insertCmd.Parameters.AddWithValue("@StoryId", request.Story.Id);
										insertCmd.Parameters.AddWithValue("@TopicId", topic.Id);
										await insertCmd.ExecuteNonQueryAsync();
									}
								}
							}

							// Commit the transaction
							await transaction.CommitAsync();
							return Ok("Story topics updated successfully.");
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
				_logger.LogError(ex, "An error occurred while editing story topics.");
				return StatusCode(500, "An error occurred while editing story topics.");
			}
		}


		[HttpPost("/Social/Hide/", Name = "HideStory")]
		public async Task<IActionResult> HideStory([FromBody] HideStoryRequest request)
		{
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					_logger.LogInformation($"Opened connection to database for hiding story with id {request.StoryId} for user {request.UserId}");

					using (var transaction = await connection.BeginTransactionAsync())
					{
						// Insert into hidden_files table (no permission check)
						var hideCommand = new MySqlCommand(
								"INSERT INTO maxhanna.hidden_stories (user_id, story_id) VALUES (@userId, @storyId) ON DUPLICATE KEY UPDATE updated = CURRENT_TIMESTAMP",
								connection, transaction);
						hideCommand.Parameters.AddWithValue("@userId", request.UserId);
						hideCommand.Parameters.AddWithValue("@storyId", request.StoryId);

						await hideCommand.ExecuteNonQueryAsync();
						_logger.LogInformation($"Post {request.StoryId} hidden for user {request.UserId}");

						// Commit transaction
						await transaction.CommitAsync();
					}
				}

				_logger.LogInformation($"Post {request.StoryId} hidden successfully for user {request.UserId}");
				return Ok("Post hidden successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while hiding the post.");
				return StatusCode(500, "An error occurred while hiding the post.");
			}
		}


		[HttpPost("/Social/Unhide/", Name = "UnhideStory")]
		public async Task<IActionResult> UnhideStory([FromBody] HideStoryRequest request)
		{
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					_logger.LogInformation($"Opened connection to database for unhiding story with id {request.StoryId} for user {request.UserId}");

					using (var transaction = await connection.BeginTransactionAsync())
					{
						// Insert into hidden_files table (no permission check)
						var hideCommand = new MySqlCommand(
								"DELETE FROM maxhanna.hidden_stories WHERE user_id = @userId AND story_id = @storyId LIMIT 1;",
								connection, transaction);
						hideCommand.Parameters.AddWithValue("@userId", request.UserId);
						hideCommand.Parameters.AddWithValue("@storyId", request.StoryId);

						await hideCommand.ExecuteNonQueryAsync();
						_logger.LogInformation($"Post {request.StoryId} unhidden for user {request.UserId}");

						// Commit transaction
						await transaction.CommitAsync();
					}
				}

				_logger.LogInformation($"Post {request.StoryId} unhidden successfully for user {request.UserId}");
				return Ok("Post unhidden successfully.");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while unhidden the post.");
				return StatusCode(500, "An error occurred while unhidden the post.");
			}
		}

		[HttpPost("/Social/SetMetadata")]
		public async Task<IActionResult> SetMetadata([FromBody] MetadataRequest request, int? storyId)
		{
			try
			{
				_logger.LogInformation($"Setting metadata for user : {request.User?.Id} for url: {request.Url} for storyId: {storyId}");
				if (request.Url != null)
				{
					if (storyId != null && storyId != 0)
					{
						_logger.LogInformation($"Inserting metadata for story {storyId}");
						await DeleteMetadata(storyId);
						for (int i = 0; i < request.Url.Length; i++)
						{
							var metadata = await FetchMetadataAsync(request.Url[i]);
							await InsertMetadata((int)storyId, metadata);
						}
						return Ok($"Inserted metadata for storyId {storyId}");
					}
				}
			}
			catch (Exception ex)
			{
				return StatusCode(500, $"An error occurred while fetching metadata: {ex.Message}");
			}
			return Ok();
		}
		private async Task<string> InsertMetadata(int storyId, Metadata metadata)
		{
			string sql = @"INSERT INTO story_metadata (story_id, title, description, image_url, metadata_url) VALUES (@storyId, @title, @description, @imageUrl, @metadataUrl);";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@storyId", storyId);
						cmd.Parameters.AddWithValue("@title", HttpUtility.HtmlDecode(metadata.Title));
						cmd.Parameters.AddWithValue("@description", HttpUtility.HtmlDecode(metadata.Description));
						cmd.Parameters.AddWithValue("@imageUrl", metadata.ImageUrl);
						cmd.Parameters.AddWithValue("@metadataUrl", metadata.Url);

						await cmd.ExecuteNonQueryAsync();
					}
				}
				_logger.LogInformation($"Inserted metadata {metadata} for storyId {storyId}");
			}
			catch
			{
				return "Could not insert metadata";
			}
			return "Inserted metadata";
		}
		private async Task<string> DeleteMetadata(int? storyId)
		{
			if (storyId == null) return "Deleted no metadata";
			string sql = @"DELETE FROM story_metadata WHERE story_id = @StoryId;";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@StoryId", storyId);
						await cmd.ExecuteNonQueryAsync();
					}
				}
				_logger.LogInformation($"Deleted metadata for storyId {storyId}");
			}
			catch
			{
				return "Could not delete metadata";
			}
			return "Deleted metadata";
		}
		private static string[] ExtractUrls(string? text)
		{
			if (string.IsNullOrEmpty(text))
			{
				return Array.Empty<string>(); // Return an empty array if the text is null or empty
			}

			// Regular expression to match URLs both inside href="" and standalone links
			string urlPattern = @"(?:href=[""'](https?:\/\/[^\s""']+)[""']|(?<!href=[""'])(https?:\/\/[^\s<]+))";

			// Match URLs in the text
			var matches = System.Text.RegularExpressions.Regex.Matches(text, urlPattern);

			// Convert the MatchCollection to a string array, filtering out empty matches
			return matches.Cast<Match>()
										.Select(m => m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value)
										.Where(url => !string.IsNullOrEmpty(url))
										.ToArray();
		}

		private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
		private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");
		private async Task AppendToSitemapAsync(int targetId)
		{
			string storyUrl = $"https://bughosted.com/Social/{targetId}";
			string lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

			await _sitemapLock.WaitAsync();
			try
			{
				XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
				XDocument sitemap;

				if (System.IO.File.Exists(_sitemapPath))
				{
					sitemap = XDocument.Load(_sitemapPath);
					var existingUrl = sitemap.Descendants(ns + "loc")
																	 .FirstOrDefault(x => x.Value == storyUrl);
					if (existingUrl != null)
					{
						// Update lastmod if the entry exists
						existingUrl.Parent.Element(ns + "lastmod")?.SetValue(lastMod);
						sitemap.Save(_sitemapPath);
						return;
					}
				}
				else
				{
					sitemap = new XDocument(
							new XElement(ns + "urlset")
					);
				}

				// Add new entry with proper namespace
				XElement newUrlElement = new XElement(ns + "url",
						new XElement(ns + "loc", storyUrl),
						new XElement(ns + "lastmod", lastMod),
						new XElement(ns + "changefreq", "daily"),
						new XElement(ns + "priority", "0.8")
				);

				sitemap.Root.Add(newUrlElement);

				sitemap.Save(_sitemapPath);
			}
			finally
			{
				_sitemapLock.Release();
			}
		}
		private async Task RemoveFromSitemapAsync(int targetId)
		{
			string targetUrl = $"https://bughosted.com/Social/{targetId}";
			_logger.LogInformation($"Removing {targetUrl} from sitemap...");

			await _sitemapLock.WaitAsync();
			try
			{
				if (System.IO.File.Exists(_sitemapPath))
				{
					XDocument sitemap = XDocument.Load(_sitemapPath);

					// Define the namespace for the sitemap
					XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

					// Use LINQ to find the <url> element that contains the target URL in <loc>
					var targetElement = sitemap.Descendants(ns + "url")
							.FirstOrDefault(x => x.Element(ns + "loc")?.Value == targetUrl);

					if (targetElement != null)
					{
						// Remove the element if found
						targetElement.Remove();
						sitemap.Save(_sitemapPath);
						_logger.LogInformation($"Removed {targetUrl} from sitemap!");
					}
					else
					{
						_logger.LogWarning($"URL {targetUrl} not found in sitemap.");
					}
				}
			}
			finally
			{
				_sitemapLock.Release();
			}
		}
		private async Task<Metadata> FetchMetadataAsync(string url)
		{
			var httpClient = new HttpClient();
			var response = await httpClient.GetAsync(url);
			var html = await response.Content.ReadAsStringAsync();

			var htmlDocument = new HtmlDocument();
			htmlDocument.LoadHtml(html);
			var metadata = new Metadata();
			_logger.LogInformation($"Got HTML for {url}.");

			// Extract metadata from HTML document
			var titleNode = htmlDocument.DocumentNode.SelectSingleNode("//title");
			if (titleNode != null)
			{
				metadata.Title = titleNode.InnerText.Trim();
			}

			var metaDescriptionNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@name='description']");
			if (metaDescriptionNode != null)
			{
				metadata.Description = metaDescriptionNode.GetAttributeValue("content", "").Trim();
			}

			var metaImageNode = htmlDocument.DocumentNode.SelectSingleNode("//meta[@property='og:image']");
			if (metaImageNode != null)
			{
				metadata.ImageUrl = metaImageNode.GetAttributeValue("content", "").Trim();
			}

			metadata.Url = url;

			return metadata;
		}

	}
}
