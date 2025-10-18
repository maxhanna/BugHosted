using FirebaseAdmin.Messaging;
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
using static maxhanna.Server.Controllers.AiController;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class SocialController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _baseTarget;
		private readonly WebCrawler _crawler;


		public SocialController(Log log, IConfiguration config, WebCrawler webCrawler)
		{
			_log = log;
			_config = config;
			_baseTarget = _config.GetValue<string>("ConnectionStrings:baseUploadPath") ?? "";
			_crawler = webCrawler;
		}

		[HttpGet("/Social/TotalPosts", Name = "Social_TotalPosts")]
		public async Task<IActionResult> TotalPosts()
		{
			try
			{
				await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				string sql = "SELECT COUNT(*) FROM stories";
				await using var cmd = new MySqlCommand(sql, conn);
				var result = await cmd.ExecuteScalarAsync();
				long count = result == null || result == DBNull.Value ? 0 : Convert.ToInt64(result);
				return Ok(new { count });
			}
			catch (Exception ex)
			{
				_ = _log.Db("Social TotalPosts error: " + ex.Message, null, "SOCIAL", true);
				return StatusCode(500, "Internal server error");
			}
		}

		[HttpPost(Name = "GetStories")]
		public async Task<IActionResult> GetStories(
			[FromBody] GetStoryRequest request,
			[FromQuery] string? search,
			[FromQuery] string? topics,
			[FromQuery] int page = 1,
			[FromQuery] int pageSize = 10,
			[FromQuery] bool showHiddenStories = false,
			[FromQuery] string? showPostsFromFilter = "all")
		{
			try
			{
				var stories = await GetStoriesAsync(request, search, topics, page, pageSize, showHiddenStories, showPostsFromFilter);
				return Ok(stories);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching stories." + ex.Message, request.UserId, "SOCIAL", true);
				return StatusCode(500, "An error occurred while fetching stories.");
			}
		}

		private async Task<StoryResponse> GetStoriesAsync(GetStoryRequest request, string? search, string? topics, int page = 1, int pageSize = 10, bool showHiddenStories = false, string? showPostsFromFilter = "all")
		{
			var whereClause = new StringBuilder(@" WHERE 1=1 ");
			var orderByClause = " ORDER BY s.id DESC ";
			var parameters = new Dictionary<string, object>();
			if (request.UserId != 0)
			{
				whereClause.Append(@"
					AND NOT EXISTS (
						SELECT 1 FROM user_blocks ub 
						WHERE (ub.user_id = @userId AND ub.blocked_user_id = s.user_id)
						OR (ub.user_id = s.user_id AND ub.blocked_user_id = @userId)
					) ");
				whereClause.Append(@"
					AND NOT EXISTS (
						SELECT 1 FROM topic_ignored ti 
						WHERE ti.user_id = @userId 
						AND ti.topic_id IN (SELECT topic_id FROM story_topics st WHERE st.story_id = s.id)
					) ");
			}

			// Apply visibility filtering: public (visible to all), following (visible to followers), self (only author)
			// If request.UserId == 0 (anonymous), only show public posts
			whereClause.Append(@" AND (
					(s.visibility = 'public')
					OR (s.visibility = 'following' AND @userId != 0 AND EXISTS (
						SELECT 1 FROM friend_requests fr 
						WHERE (
							(fr.sender_id = s.user_id 
							AND fr.receiver_id = @userId) 
						OR (
							fr.receiver_id = s.user_id 
							AND fr.sender_id = @userId)
							) AND fr.status = 'accepted'
					))
					OR (s.visibility = 'self' AND s.user_id = @userId)
				)");
			// Fetch the NSFW setting for the user
			int? nsfwEnabled = null;
			if (request.UserId != 0)
			{
				string nsfwSql = @"SELECT nsfw_enabled FROM user_settings WHERE user_id = @userId";
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					using (var cmd = new MySqlCommand(nsfwSql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.UserId);
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
			if (!showHiddenStories)
			{
				whereClause.Append(@" AND hs.story_id IS NULL ");
			}
			if (!string.IsNullOrEmpty(showPostsFromFilter) && showPostsFromFilter != "all")
			{
				if (showPostsFromFilter == "subscribed")
				{
					whereClause.Append(@" 
					AND (
						s.user_id IN (
							SELECT receiver_id FROM friend_requests 
							WHERE sender_id = @userId AND status = 'accepted'
							UNION
							SELECT sender_id FROM friend_requests 
							WHERE receiver_id = @userId AND status = 'accepted'
							UNION
							SELECT receiver_id FROM friend_requests 
							WHERE sender_id = @userId AND (status = 'pending' OR status = 'deleted')
						)
						OR EXISTS (
							SELECT 1
							FROM story_topics st
							JOIN topic_favourite tf ON st.topic_id = tf.topic_id
							WHERE st.story_id = s.id AND tf.user_id = @userId
						)
					)
					");
				}
				else if (showPostsFromFilter == "local")
				{
					whereClause.Append(@" AND (
						s.country = (SELECT country FROM users WHERE id = @userId)
						OR s.city = (SELECT city FROM users WHERE id = @userId) 
					) ");
				}
				else if (showPostsFromFilter == "popular")
				{
					// Order by popularity instead of filtering
					// Remove the existing ORDER BY s.id DESC from your main query
					orderByClause = @" ORDER BY 
						(SELECT COUNT(*) FROM reactions WHERE story_id = s.id) DESC,
						(SELECT COUNT(*) FROM comments WHERE story_id = s.id) DESC,
						s.date DESC";
				}
			}
			parameters.Add("@userId", request.UserId);


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
					s.story_text, s.date, s.city, s.country, s.visibility,
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
    			{orderByClause} 
				LIMIT @pageSize OFFSET @offset;";
			//Console.WriteLine("sql: " + sql);
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
								Metadata? metadata = attachStoryMetadataDbData(rdr);
								story = new Story
								{
									Id = storyId,
									User = new User(rdr.GetInt32("user_id"), rdr.GetString("username"), null, dpFileEntry, null, null, null),
									StoryText = rdr.GetString("story_text"),
									Date = rdr.GetDateTime("date"),
									City = rdr.IsDBNull(rdr.GetOrdinal("city")) ? null : rdr.GetString("city"),
									Country = rdr.IsDBNull(rdr.GetOrdinal("country")) ? null : rdr.GetString("country"),
									CommentsCount = rdr.GetInt32("comments_count"),
									Metadata = metadata != null ? new List<Metadata>() { metadata } : new List<Metadata>(),
									StoryFiles = new List<FileEntry>(),
									StoryComments = new List<FileComment>(),
									StoryTopics = new List<Topic>(),
									Reactions = new List<Reaction>(),
									Hidden = rdr.IsDBNull(rdr.GetOrdinal("hidden")) ? false : rdr.GetBoolean("hidden"),
									Visibility = rdr.IsDBNull(rdr.GetOrdinal("visibility")) ? null : rdr.GetString("visibility"),
								};
								storyDictionary[storyId] = story;
							}
						}
					}
				}
			}

			storyResponse.Stories = storyDictionary.Values.ToList();
			await AttachCommentsToStoriesAsync(request.UserId, storyResponse.Stories);
			await AttachFilesToStoriesAsync(request.UserId, storyResponse.Stories);
			await FetchAndAttachTopicsAsync(storyResponse.Stories);
			await FetchAndAttachReactionsAsync(storyResponse.Stories);
			await FetchAndAttachPollVotesAsync(storyResponse);
			storyResponse.CurrentPage = page;
			storyResponse.PageCount = (int)Math.Ceiling((double)storyResponse.TotalCount / pageSize);
			storyResponse.Stories.ForEach(s =>
			{
				s.StoryText = _log.EncryptContent(s.StoryText ?? "", s.User?.Id + "");
			});
			return storyResponse;
		}

		private async Task FetchAndAttachPollVotesAsync(StoryResponse storyResponse)
		{
			//Console.WriteLine("Fetch poll votes.");
			if (storyResponse.Stories == null || storyResponse.Stories.Count == 0)
			{
				//Console.WriteLine("No stories found to fetch poll votes for.");
				return;
			}

			string pollSql = @"
				SELECT 
					pv.id, pv.user_id, pv.component_id, pv.value, pv.timestamp,
					u.username,
					udpfu.folder_path AS display_picture_folder,
					udpfu.file_name AS display_picture_filename
				FROM poll_votes pv
				JOIN users u ON pv.user_id = u.id
				LEFT JOIN user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN file_uploads udpfu ON udp.file_id = udpfu.id
				WHERE pv.component_id IN ({0})
				ORDER BY pv.timestamp DESC;";

			// Helper to recursively flatten all nested comments
			static IEnumerable<FileComment> FlattenComments(IEnumerable<FileComment> roots)
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

			// Build a list of component IDs to query: storyText{storyId} and commentText{commentId} (including nested)
			var componentIds = new List<string>();
			foreach (var s in storyResponse.Stories)
			{
				componentIds.Add($"storyText{s.Id}");
				if (s.StoryComments != null && s.StoryComments.Count > 0)
				{
					foreach (var c in FlattenComments(s.StoryComments))
					{
						componentIds.Add($"commentText{c.Id}");
					}
				}
			}

			componentIds = componentIds.Distinct().ToList();
			if (componentIds.Count == 0)
			{
				return;
			}

			// Create parameter placeholders (e.g., @compId0, @compId1, ...)
			var parameterPlaceholders = string.Join(",", componentIds.Select((_, i) => $"@compId{i}"));
			pollSql = string.Format(pollSql, parameterPlaceholders);

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					//Console.WriteLine("Database connection opened.");
					using (var pollCmd = new MySqlCommand(pollSql, conn))
					{
						// Add each component ID as a separate parameter
						for (int i = 0; i < componentIds.Count; i++)
						{
							pollCmd.Parameters.AddWithValue($"@compId{i}", componentIds[i]);
						}

						//Console.WriteLine("Executing poll query.");
						using (var pollRdr = await pollCmd.ExecuteReaderAsync())
						{
							//Console.WriteLine("Processing poll votes for stories.");
							var pollData = new Dictionary<string, List<PollVote>>();

							while (await pollRdr.ReadAsync())
							{
								//Console.WriteLine("Poll vote reading.");
								var componentId = pollRdr.GetString("component_id");
								if (!pollData.ContainsKey(componentId))
								{
									pollData[componentId] = new List<PollVote>();
								}
								//Console.WriteLine($"Processing poll vote for component ID: {componentId}, Value: {pollRdr.GetString("value")}");

								string? displayPicPath = null;
								if (!pollRdr.IsDBNull(pollRdr.GetOrdinal("display_picture_folder")) &&
									!pollRdr.IsDBNull(pollRdr.GetOrdinal("display_picture_filename")))
								{
									displayPicPath = $"{pollRdr.GetString("display_picture_folder")}/{pollRdr.GetString("display_picture_filename")}";
								}

								pollData[componentId].Add(new PollVote
								{
									Id = pollRdr.GetInt32("id"),
									UserId = pollRdr.GetInt32("user_id"),
									ComponentId = componentId,
									Value = pollRdr.GetString("value"),
									Timestamp = pollRdr.GetDateTime("timestamp"),
									Username = pollRdr.GetString("username"),
									DisplayPicture = displayPicPath
								});
							}
							// Normalize poll data keys (merge keys like "commentTextcommentText1065" -> "commentText1065")
							Dictionary<string, List<PollVote>> normalizedPollData = new();
							string NormalizeComponentId(string compId)
							{
								if (string.IsNullOrEmpty(compId)) return compId;
								var prefixes = new[] { "commentText", "storyText", "messageText" };
								foreach (var p in prefixes)
								{
									var idx = compId.LastIndexOf(p, StringComparison.OrdinalIgnoreCase);
									if (idx >= 0)
									{
										return compId.Substring(idx);
									}
								}
								return compId;
							}

							foreach (var kv in pollData)
							{
								var canonical = NormalizeComponentId(kv.Key);
								if (!normalizedPollData.ContainsKey(canonical)) normalizedPollData[canonical] = new List<PollVote>();
								normalizedPollData[canonical].AddRange(kv.Value);
							}

											// Attach poll data directly to stories/comments (no aggregate list)
											foreach (var story in storyResponse.Stories)
							{
								try
								{
									// Story-level poll
									string storyText = _log.DecryptContent(story.StoryText ?? string.Empty, ((story.User?.Id ?? 0) + ""));
									string question = ExtractPollQuestion(storyText);
									List<PollOption> options = ExtractPollOptions(storyText);
									string componentId = $"storyText{story.Id}";

										if (!string.IsNullOrEmpty(question) && options.Any())
									{
										// Prefer direct lookup in pollData, fall back to normalized map
										var votes = pollData.TryGetValue(componentId, out var vlist) ? vlist : null;
										if ((votes == null || votes.Count == 0) && normalizedPollData.TryGetValue(componentId, out var nv)) votes = nv;

										var poll = new Poll
										{
											ComponentId = componentId,
											Question = question,
											Options = options,
											UserVotes = votes ?? new List<PollVote>(),
											TotalVotes = votes?.Count ?? 0,
											CreatedAt = story.Date
										};

										var voteCounts = poll.UserVotes
											.GroupBy(v => v.Value)
											.ToDictionary(g => g.Key, g => g.Count());

										foreach (var option in poll.Options)
										{
											int voteCount = voteCounts.FirstOrDefault(kvp => kvp.Key.Equals(option.Text, StringComparison.OrdinalIgnoreCase)).Value;
											option.VoteCount = voteCount;
											option.Percentage = poll.TotalVotes > 0
												? (int)Math.Round((double)voteCount / poll.TotalVotes * 100)
												: 0;
										}

											// Assign to story-level polls collection
											if (story.Polls == null) story.Polls = new List<Poll>();
											story.Polls.Add(poll);
									}

									// Comment-level polls (for all comments attached to this story, recursively)
									if (story.StoryComments != null && story.StoryComments.Count > 0)
									{
                                    foreach (var comment in FlattenComments(story.StoryComments))
                                    {
											try
											{
												string commentText = _log.DecryptContent(comment.CommentText ?? string.Empty, ((comment.User?.Id ?? 0) + ""));
												string cQuestion = ExtractPollQuestion(commentText);
												List<PollOption> cOptions = ExtractPollOptions(commentText);
												string cComponentId = $"commentText{comment.Id}";

													// If comment contains explicit poll markup, build from options; otherwise, if there are recorded votes, synthesize options from votes.
													if (!string.IsNullOrEmpty(cQuestion) && cOptions.Any())
													{
														var cvotesLocal = pollData.TryGetValue(cComponentId, out var cvotesFound) ? cvotesFound : null;
														if ((cvotesLocal == null || cvotesLocal.Count == 0) && normalizedPollData.TryGetValue(cComponentId, out var ncv)) cvotesLocal = ncv;
														cvotesLocal ??= new List<PollVote>();
														var cpoll = new Poll
														{
															ComponentId = cComponentId,
															Question = cQuestion,
															Options = cOptions,
															UserVotes = cvotesLocal,
															TotalVotes = cvotesLocal?.Count ?? 0,
															CreatedAt = comment.Date
														};

														var cvoteCounts = cpoll.UserVotes
															.GroupBy(v => v.Value)
															.ToDictionary(g => g.Key, g => g.Count());

														foreach (var option in cpoll.Options)
														{
															int voteCount = cvoteCounts.FirstOrDefault(kvp => kvp.Key.Equals(option.Text, StringComparison.OrdinalIgnoreCase)).Value;
															option.VoteCount = voteCount;
															option.Percentage = cpoll.TotalVotes > 0
																? (int)Math.Round((double)voteCount / cpoll.TotalVotes * 100)
																: 0;
														}

																// Attach to comment object
																if (comment.Polls == null) comment.Polls = new List<Poll>();
																comment.Polls.Add(cpoll);
													}
													else
													{
														// Fallback: if no markup but there are votes recorded for this component, synthesize a poll from distinct vote values
														if (pollData.TryGetValue(cComponentId, out var recordedVotes) && recordedVotes != null && recordedVotes.Count > 0)
														{
															var optionGroups = recordedVotes.GroupBy(v => v.Value)
																.Select(g => new PollOption { Id = g.Key, Text = g.Key, VoteCount = g.Count(), Percentage = 0 })
																.ToList();

															int total = recordedVotes.Count;
															foreach (var opt in optionGroups)
															{
																opt.Percentage = total > 0 ? (int)Math.Round((double)opt.VoteCount / total * 100) : 0;
															}

															var synthesized = new Poll
															{
																ComponentId = cComponentId,
																Question = "Poll",
																Options = optionGroups,
																UserVotes = recordedVotes,
																TotalVotes = total,
																CreatedAt = comment.Date
															};

																	// Attach synthesized poll to comment
																	if (comment.Polls == null) comment.Polls = new List<Poll>();
																	comment.Polls.Add(synthesized);
														}
													}
											}
											catch (Exception ex)
											{
												_ = _log.Db($"Error processing comment {comment.Id} for story {story.Id}: {ex.Message}\nStack Trace: {ex.StackTrace}", null, "SOCIAL", true);
												continue;
											}
										}
									}
								}
								catch (Exception ex)
								{
									_ = _log.Db($"Error processing story {story.Id}: {ex.Message}\nStack Trace: {ex.StackTrace}", null, "SOCIAL", true);
									continue;
								}
							}
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in FetchAndAttachPollVotesAsync: {ex.Message}\nStack Trace: {ex.StackTrace}", null, "SOCIAL", true);
				throw;
			}
		}
		private string ExtractPollQuestion(string storyText)
		{
			if (string.IsNullOrEmpty(storyText) || !storyText.Contains("[Poll]") || !storyText.Contains("[/Poll]"))
			{
				//Console.WriteLine("No valid poll found in story text.");
				return string.Empty;
			}

			try
			{
				// Extract the poll section
				int startIndex = storyText.IndexOf("[Poll]") + 6;
				int endIndex = storyText.IndexOf("[/Poll]");
				if (endIndex < startIndex)
				{
					_ = _log.Db("Malformed poll: [/Poll] tag missing or before [Poll].", null, "SOCIAL", true);
					return string.Empty;
				}

				string pollContent = storyText.Substring(startIndex, endIndex - startIndex).Trim();
				var lines = pollContent.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);

				foreach (var line in lines)
				{
					if (line.Trim().StartsWith("Question:", StringComparison.OrdinalIgnoreCase))
					{
						return line.Substring("Question:".Length).Trim();
					}
				}

				//Console.WriteLine("No question found in poll content.");
				return string.Empty;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error extracting poll question: {ex.Message}", null, "SOCIAL", true);
				return string.Empty;
			}
		}

		private List<PollOption> ExtractPollOptions(string storyText)
		{
			var options = new List<PollOption>();
			if (string.IsNullOrEmpty(storyText) || !storyText.Contains("[Poll]") || !storyText.Contains("[/Poll]"))
			{
				//	Console.WriteLine("No valid poll found in story text.");
				return options;
			}

			try
			{
				// Extract the poll section
				int startIndex = storyText.IndexOf("[Poll]") + 6;
				int endIndex = storyText.IndexOf("[/Poll]");
				if (endIndex < startIndex)
				{
					_ = _log.Db("Malformed poll: [/Poll] tag missing or before [Poll].", null, "SOCIAL", true);
					return options;
				}

				string pollContent = storyText.Substring(startIndex, endIndex - startIndex).Trim();
				var lines = pollContent.Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries);

				foreach (var line in lines)
				{
					if (line.Trim().StartsWith("Option ", StringComparison.OrdinalIgnoreCase))
					{
						var parts = line.Split(':', 2);
						if (parts.Length == 2)
						{
							string optionId = parts[0].Replace("Option ", "", StringComparison.OrdinalIgnoreCase).Trim();
							string optionText = parts[1].Trim();
							if (!string.IsNullOrEmpty(optionText))
							{
								options.Add(new PollOption
								{
									Id = optionId, // e.g., "1", "2"
									Text = optionText, // e.g., "Social", "Crypto"
									VoteCount = 0,
									Percentage = 0
								});
							}
						}
					}
				}

				//Console.WriteLine($"Extracted {options.Count} poll options.");
				return options;
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error extracting poll options: {ex.Message}", null, "SOCIAL", true);
				return options;
			}
		}

		private static Metadata? attachStoryMetadataDbData(MySqlDataReader rdr)
		{
			Metadata? metadata = null;
			string? metadataUrl = rdr.IsDBNull(rdr.GetOrdinal("metadata_url")) ? null : rdr.GetString("metadata_url");
			string? metadataImageUrl = rdr.IsDBNull(rdr.GetOrdinal("image_url")) ? null : rdr.GetString("image_url");
			string? metadataDescription = rdr.IsDBNull(rdr.GetOrdinal("description")) ? null : rdr.GetString("description");
			string? metadataTitle = rdr.IsDBNull(rdr.GetOrdinal("title")) ? null : rdr.GetString("title");
			if (metadataUrl != null || metadataImageUrl != null || metadataDescription != null || metadataTitle != null)
			{
				metadata = new Metadata
				{
					Url = metadataUrl,
					ImageUrl = metadataImageUrl,
					Description = metadataDescription,
					Title = metadataTitle
				};
			}

			return metadata;
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

					//_ = _log.Db(cmd.CommandText);

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
					r.comment_id AS comment_id,
					reactionusers.username AS user_name,
								udp.file_id as user_display_picture_file_id,
					r.type AS reaction_type,
					r.timestamp AS reaction_timestamp
				FROM 
					reactions AS r
					LEFT JOIN users AS reactionusers ON r.user_id = reactionusers.id
					LEFT JOIN user_display_pictures AS udp ON udp.user_id = reactionusers.id 
				WHERE 
					r.story_id IN ({0})
					AND r.comment_id IS NULL ";

			var storyIds = string.Join(",", stories.Select(s => s.Id)); // Convert IDs to comma-separated string

			// Format the SQL query with dynamic placeholders for story IDs
			reactionSql = string.Format(reactionSql, storyIds);

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();
				using (var cmd = new MySqlCommand(reactionSql, conn))
				{
					// No need to use cmd.Parameters.AddWithValue for @storyIds because it's dynamically inserted

					//_ = _log.Db(cmd.CommandText);

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
								CommentId = rdr.IsDBNull("comment_id") ? null : rdr.GetInt32("comment_id"),
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


	private async Task AttachFilesToStoriesAsync(int userId, List<Story> stories)
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
					f.file_type, 
					f.is_public, 
					f.is_folder, 
					f.shared_with, 
					f.given_file_name,
					f.description as file_data_description,
					f.last_updated as file_data_updated,
					f.upload_date AS file_date, 
					fu.username AS file_username, 
					f.user_id AS file_user_id,
					f.last_access AS last_access,
					f.access_count AS access_count,
					(SELECT COUNT(*) FROM file_favourites ff WHERE ff.file_id = f.id) AS favourite_count,
					(EXISTS(SELECT 1 FROM file_favourites ff2 WHERE ff2.file_id = f.id AND ff2.user_id = @userId)) AS is_favourited
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
					s.id, f.id, f.file_name, f.folder_path, f.file_type, f.is_public, f.is_folder, f.shared_with,
					f.given_file_name, file_data_description, file_data_updated,
					f.upload_date, fu.username, f.user_id, f.last_access, f.access_count;");

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
					// Bind userId for per-user is_favourited check
					cmd.Parameters.AddWithValue("@userId", userId);

					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						while (await rdr.ReadAsync())
						{
							int storyId = rdr.IsDBNull("story_id") ? 0 : rdr.GetInt32("story_id");
							Story? story = stories.FirstOrDefault(s => s.Id == storyId);

							if (story != null && !rdr.IsDBNull("file_id"))
							{
								var fileEntry = new FileEntry
								{
									Id = rdr.GetInt32("file_id"),
									FileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? null : rdr.GetString("file_name"),
									Directory = rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? _baseTarget : rdr.GetString("folder_path"),
									FileType = rdr.IsDBNull(rdr.GetOrdinal("file_type")) ? _baseTarget : rdr.GetString("file_type"),
									Visibility = rdr.GetBoolean("is_public") ? "Public" : "Private",
									SharedWith = rdr.IsDBNull(rdr.GetOrdinal("shared_with")) ? null : rdr.GetString("shared_with"),
									User = new User(
												rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? 0 : rdr.GetInt32("file_user_id"),
												rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? "Anonymous" : rdr.GetString("file_username")
										),
									IsFolder = rdr.GetBoolean("is_folder"),
									Date = rdr.GetDateTime("file_date"),
									FileComments = new List<FileComment>(),
									GivenFileName = rdr.IsDBNull(rdr.GetOrdinal("given_file_name")) ? null : rdr.GetString("given_file_name"),
									Description = rdr.IsDBNull(rdr.GetOrdinal("file_data_description")) ? null : rdr.GetString("file_data_description"),
									LastUpdated = rdr.IsDBNull(rdr.GetOrdinal("file_data_updated")) ? null : rdr.GetDateTime("file_data_updated"),
									LastAccess = rdr.IsDBNull(rdr.GetOrdinal("last_access")) ? (DateTime?)null : rdr.GetDateTime("last_access"),
									AccessCount = rdr.IsDBNull(rdr.GetOrdinal("access_count")) ? 0 : rdr.GetInt32("access_count"),
									FavouriteCount = rdr.IsDBNull(rdr.GetOrdinal("favourite_count")) ? 0 : rdr.GetInt32("favourite_count"),
									IsFavourited = rdr.IsDBNull(rdr.GetOrdinal("is_favourited")) ? false : rdr.GetBoolean("is_favourited"),
								};

								story.StoryFiles!.Add(fileEntry);
							}
						}
					}
				}
			}
		}

		private async Task AttachCommentsToStoriesAsync(int userId, List<Story> stories)
		{
			// Extract all unique story IDs from the list of stories
			var storyIds = stories.Select(s => s.Id).Distinct().ToList();

			// If there are no stories, return early
			if (storyIds.Count == 0)
			{
				return;
			}
			string whereC = "";
			if (userId != 0)
			{
				whereC = @"
					AND NOT EXISTS (
						SELECT 1 FROM user_blocks ub 
						WHERE (ub.user_id = @userId AND ub.blocked_user_id = c.user_id)
						OR (ub.user_id = c.user_id AND ub.blocked_user_id = @userId)
					) ";
			}
			// Construct SQL query with parameterized IN clause for story IDs
			StringBuilder sqlBuilder = new StringBuilder();
			sqlBuilder.AppendLine(@"WITH RECURSIVE comment_tree (id) AS (");
			sqlBuilder.AppendLine(@"  SELECT id");
			sqlBuilder.AppendLine(@"  FROM comments");
			// Anchor only top-level comments (those without a parent comment_id).
			sqlBuilder.AppendLine(@"  WHERE story_id IN (");
			for (int i = 0; i < storyIds.Count; i++)
			{
				sqlBuilder.Append("@storyId" + i);
				if (i < storyIds.Count - 1)
				{
					sqlBuilder.Append(", ");
				}
			}
			sqlBuilder.AppendLine(@") AND comment_id IS NULL");
			sqlBuilder.AppendLine(@"  UNION ALL");
			sqlBuilder.AppendLine(@"  SELECT c.id");
			sqlBuilder.AppendLine(@"  FROM comments c");
			sqlBuilder.AppendLine(@"  JOIN comment_tree ct ON c.comment_id = ct.id");
			sqlBuilder.AppendLine(@")");
			sqlBuilder.AppendLine(@$"
				SELECT 
					c.id AS comment_id,
					c.story_id AS story_id,
					c.user_id AS comment_user_id,
					c.city AS comment_city,
					c.country AS comment_country,
					c.ip AS comment_ip,
					u.username AS comment_username,
					udpfu.id as profileFileId,
					udpfu.file_name as profileFileName,
					udpfu.folder_path as profileFileFolder,
					c.comment,
					c.date,
					cf.file_id AS comment_file_id,
					f.file_name AS comment_file_name,
					f.folder_path AS comment_file_folder_path,
					f.file_type AS comment_file_file_type,
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
					rudp.file_id AS reaction_display_picture_file_id,
					r.timestamp AS reaction_time,
					c.comment_id AS parent_comment_id
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
				LEFT JOIN 
					user_display_pictures AS rudp ON rudp.user_id = ru.id   
				WHERE c.id IN (SELECT id FROM comment_tree)
				{whereC} 
				GROUP BY c.id, r.id, r.type, ru.id, ru.username, r.timestamp, 
				udpfu.file_name, udpfu.folder_path, cf.file_id, 
				f.file_name, f.folder_path, f.file_type, f.is_public, f.shared_with, f.is_folder,
				f.upload_date, fu.id, fu.username, f.given_file_name, f.description, f.last_updated
				ORDER BY c.id ASC;");

			// Execute the SQL query
			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				using (var cmd = new MySqlCommand(sqlBuilder.ToString(), conn))
				{
					// Bind each story ID to its respective parameter
					cmd.Parameters.AddWithValue("@userId", userId);

					for (int i = 0; i < storyIds.Count; i++)
					{
						cmd.Parameters.AddWithValue("@storyId" + i, storyIds[i]);
					}
					using (var rdr = await cmd.ExecuteReaderAsync())
					{
						var allComments = new List<FileComment>();

						while (await rdr.ReadAsync())
						{
							//if (rdr.IsDBNull("comment_id") || rdr.IsDBNull("story_id")) { continue; }
							int? storyId = rdr.IsDBNull("story_id") ? (int?)null : rdr.GetInt32("story_id");
							var commentId = rdr.GetInt32("comment_id");
							var parentCommentId = rdr.IsDBNull("parent_comment_id") ? (int?)null : rdr.GetInt32("parent_comment_id");
							var cuserId = rdr.GetInt32("comment_user_id");
							var userName = rdr.GetString("comment_username");
							var commentText = rdr.GetString("comment");
							var commentCity = rdr.IsDBNull(rdr.GetOrdinal("comment_city")) ? null : rdr.GetString("comment_city");
							var commentCountry = rdr.IsDBNull(rdr.GetOrdinal("comment_country")) ? null : rdr.GetString("comment_country");
							var commentIp = rdr.IsDBNull(rdr.GetOrdinal("comment_ip")) ? null : rdr.GetString("comment_ip");
							var date = rdr.GetDateTime("date");

							var story = stories.FirstOrDefault(s => s.Id == storyId);

							// Check if the comment already exists for the story
							var comment = allComments.FirstOrDefault(c => c.Id == commentId);
							if (comment == null)
							{
								int? displayPicId = rdr.IsDBNull(rdr.GetOrdinal("profileFileId")) ? null : rdr.GetInt32("profileFileId");
								string? displayPicFolderPath = rdr.IsDBNull(rdr.GetOrdinal("profileFileFolder")) ? null : rdr.GetString("profileFileFolder");
								string? displayPicFileFileName = rdr.IsDBNull(rdr.GetOrdinal("profileFileName")) ? null : rdr.GetString("profileFileName");
								FileEntry? dpFileEntry = displayPicId != null ? new FileEntry() { Id = (Int32)(displayPicId), Directory = displayPicFolderPath, FileName = displayPicFileFileName } : null;

								comment = new FileComment
								{
									Id = commentId,
									CommentId = parentCommentId,
									CommentText = commentText,
									StoryId = storyId,
									User = new User(cuserId, userName, null, dpFileEntry, null, null, null),
									Date = date,
									City = commentCity,
									Country = commentCountry,
									Ip = commentIp,
									CommentFiles = new List<FileEntry>(),
									Reactions = new List<Reaction>(), // Initialize reactions list
									Comments = new List<FileComment>() // Initialize subcomments list
								};

								allComments.Add(comment);
							}

							// Handle comment reactions
							if (!rdr.IsDBNull("reaction_id"))
							{
								var reactionId = rdr.GetInt32("reaction_id");
								var reactionType = rdr.GetString("reaction_type");
								var reactionUserId = rdr.GetInt32("reaction_user_id");
								var reactionUserName = rdr.GetString("reaction_username");
								int? reactionUserDisplayPictureFileId = rdr.IsDBNull(rdr.GetOrdinal("reaction_display_picture_file_id")) ? null : rdr.GetInt32("reaction_display_picture_file_id");
								var reactionTime = rdr.GetDateTime("reaction_time");

								// Check if the reaction already exists for the comment
								var existingReaction = comment.Reactions?.FirstOrDefault(r => r.Id == reactionId);
								if (existingReaction == null)
								{
									User reactionUser = new User(
										reactionUserId,
										reactionUserName,
										reactionUserDisplayPictureFileId != null ? new FileEntry(reactionUserDisplayPictureFileId.Value) : null
									);
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
									FileType = rdr.IsDBNull("comment_file_file_type") ? _baseTarget : rdr.GetString("comment_file_file_type"),
									Visibility = rdr.IsDBNull("comment_file_visibility") ? null : rdr.GetBoolean("comment_file_visibility") ? "Public" : "Private",
									SharedWith = rdr.IsDBNull("comment_file_shared_with") ? null : rdr.GetString("comment_file_shared_with"),
									User = new User(rdr.IsDBNull("file_user_id") ? 0 : rdr.GetInt32("file_user_id"), rdr.IsDBNull("file_username") ? "Anonymous" : rdr.GetString("file_username")),
									IsFolder = rdr.GetBoolean("comment_file_is_folder"),
									Date = rdr.GetDateTime("comment_file_date"),
									GivenFileName = rdr.IsDBNull("comment_file_given_file_name") ? null : rdr.GetString("comment_file_given_file_name"),
									Description = rdr.IsDBNull("comment_file_description") ? null : rdr.GetString("comment_file_description"),
									LastUpdated = rdr.IsDBNull("comment_file_date") ? null : rdr.GetDateTime("comment_file_date"),
								};
								if (comment.CommentFiles == null) { comment.CommentFiles = new List<FileEntry> { }; }
								if (!comment.CommentFiles.Any(f => f.Id == fileEntry.Id))
								{
									comment.CommentFiles.Add(fileEntry);
								}
							}

							if (parentCommentId.HasValue)
							{
								var parentComment = allComments.FirstOrDefault(c => c.Id == parentCommentId.Value);
								if (parentComment != null)
								{
									if (parentComment.Comments == null)
									{
										parentComment.Comments = new List<FileComment>();
									}
									if (!parentComment.Comments.Any(c => c.Id == comment.Id))
									{
										parentComment.Comments.Add(comment);
									}
								}
							}
						}

						foreach (var story in stories)
						{
							story.StoryComments = allComments
								.Where(c => c.StoryId == story.Id && c.CommentId == null)
								.ToList();
						}
					}
				}
			}
		}

		[HttpPost("/Social/Post-Story/", Name = "PostStory")]
		public async Task<IActionResult> PostStory([FromBody] StoryRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			try
			{
				// Use the request.userId for decryption so the server uses the same id the client used to encrypt
				string decryptedText = _log.DecryptContent(request.story.StoryText ?? "", (request.userId ?? 0) + "");
		    string sql = @"INSERT INTO stories (user_id, story_text, profile_user_id, city, country, date, visibility) 
			    VALUES (@userId, @storyText, @profileUserId, @city, @country, UTC_TIMESTAMP(), @visibility);";
				string topicSql = @"INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, @topicId);";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.userId);
						cmd.Parameters.AddWithValue("@storyText", decryptedText);
						cmd.Parameters.AddWithValue("@profileUserId", request.story.ProfileUserId.HasValue && request.story.ProfileUserId != 0
							? request.story.ProfileUserId.Value
							: (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@city", request.story.City ?? (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@country", request.story.Country ?? (object)DBNull.Value);
						cmd.Parameters.AddWithValue("@visibility", string.IsNullOrEmpty(request.story.Visibility) ? "public" : request.story.Visibility);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{
							// Fetch the last inserted ID
							int storyId = (int)cmd.LastInsertedId;
							if (request.userId != null)
							{
								await NotifyFollowers(request.userId, request.story.ProfileUserId, storyId);
							}
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
							string[]? urls = _crawler.ExtractUrls(decryptedText);
							if (urls != null)
							{
								// Fetch metadata
								Console.WriteLine($"Urls extracted for metadata: {string.Join(", ", urls)}");
								var metadataRequest = new MetadataRequest { Url = urls };
								var metadataResponse = SetMetadata(metadataRequest, storyId);
							}

							await AppendToSitemapAsync(storyId);

							// Return the storyId in the response
							return Ok(new { StoryId = storyId, Message = "Story posted successfully." });
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
				_ = _log.Db("An error occurred while posting story: " + ex.Message, request.userId, "SOCIAL", true);
				return StatusCode(500, "An error occurred while posting story.");
			}
		}


		[HttpPost("/Social/Delete-Story", Name = "DeleteStory")]
		public async Task<IActionResult> DeleteStory([FromBody] StoryRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			// Validate the requesting user is logged in
			if (request.userId == null || !await _log.ValidateUserLoggedIn(request.userId.Value, encryptedUserIdHeader))
				return StatusCode(500, "Access Denied.");

			try
			{
				string sql = @"
            DELETE FROM stories 
            WHERE 
                (user_id = @userId OR profile_user_id = @userId OR @userId = 1) 
                AND id = @storyId;";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", request.userId);
						cmd.Parameters.AddWithValue("@storyId", request.story.Id);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{
							await DeletePollsByStoryId(request.story.Id);
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
				_ = _log.Db("An error occurred while deleting story." + ex.Message, request.userId, "SOCIAL", true);
				return StatusCode(500, "An error occurred while deleting story.");
			}
		}


		[HttpPost("/Social/Edit-Story", Name = "EditStory")]
		public async Task<IActionResult> EditStory([FromBody] StoryRequest request, [FromHeader(Name = "Encrypted-UserId")] string encryptedUserIdHeader)
		{
			if (request.userId != null)
			{
				if (!await _log.ValidateUserLoggedIn(request.userId.Value, encryptedUserIdHeader)) return StatusCode(500, "Access Denied.");
			}

			try
			{
				string sql = @"UPDATE stories SET story_text = @Text, visibility = @visibility WHERE user_id = @UserId AND id = @StoryId;";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", request.userId);
						cmd.Parameters.AddWithValue("@StoryId", request.story.Id);
						// Use request.userId for decryption to match client-side encryption key selection
						cmd.Parameters.AddWithValue("@Text", _log.DecryptContent(request.story.StoryText ?? "", (request.userId ?? 0) + ""));
						cmd.Parameters.AddWithValue("@visibility", string.IsNullOrEmpty(request.story.Visibility) ? "public" : request.story.Visibility);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{
							await AppendToSitemapAsync(request.story.Id);
							string[]? url = _crawler.ExtractUrls(request.story.StoryText);
							if (url != null)
							{
								Console.WriteLine($"Urls extracted for metadata: {string.Join(", ", url)}");
								// Fetch metadata
								var metadataRequest = new MetadataRequest { Url = url };
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
				_ = _log.Db("An error occurred while deleting story." + ex.Message, request.userId, "SOCIAL", true);
				return StatusCode(500, "An error occurred while deleting story.");
			}
		}

		// Endpoint to replace files attached to a story (transactional replacement)
		[HttpPost("/Social/Edit-Story-Files", Name = "EditStoryFiles")]
		public async Task<IActionResult> EditStoryFiles([FromBody] EditStoryFilesRequest request, [FromHeader(Name = "Encrypted-UserId")] string? encryptedUserIdHeader = null)
		{
			if (request.UserId != 0 && !await _log.ValidateUserLoggedIn(request.UserId, encryptedUserIdHeader ?? ""))
			{
				return StatusCode(500, "Access Denied.");
			}

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string delSql = "DELETE FROM maxhanna.story_files WHERE story_id = @StoryId";
					using (var delCmd = new MySqlCommand(delSql, conn))
					{
						delCmd.Parameters.AddWithValue("@StoryId", request.StoryId);
						await delCmd.ExecuteNonQueryAsync();
					}

					if (request.SelectedFiles != null && request.SelectedFiles.Count > 0)
					{
						foreach (var f in request.SelectedFiles)
						{
							string insSql = "INSERT INTO maxhanna.story_files (story_id, file_id) VALUES (@StoryId, @FileId)";
							using (var insCmd = new MySqlCommand(insSql, conn))
							{
								insCmd.Parameters.AddWithValue("@StoryId", request.StoryId);
								insCmd.Parameters.AddWithValue("@FileId", f.Id);
								await insCmd.ExecuteNonQueryAsync();
							}
						}
					}
				}

				return Ok("Story files updated");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing EditStoryFiles request. " + ex.Message, request.UserId, "SOCIAL", true);
				return StatusCode(500, "An error occurred while processing the request.");
			}
		}

		[HttpPost("/Social/Edit-Topics", Name = "EditTopics")]
		public async Task<IActionResult> EditTopics([FromBody] DataContracts.Social.EditTopicRequest request)
		{
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
				_ = _log.Db("An error occurred while editing story topics." + ex.Message, null, "SOCIAL", true);
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
					using (var transaction = await connection.BeginTransactionAsync())
					{
						// Insert into hidden_files table (no permission check)
						var hideCommand = new MySqlCommand(
								"INSERT INTO maxhanna.hidden_stories (user_id, story_id) VALUES (@userId, @storyId) ON DUPLICATE KEY UPDATE updated = CURRENT_TIMESTAMP",
								connection, transaction);
						hideCommand.Parameters.AddWithValue("@userId", request.UserId);
						hideCommand.Parameters.AddWithValue("@storyId", request.StoryId);

						await hideCommand.ExecuteNonQueryAsync();
						// Commit transaction
						await transaction.CommitAsync();
					}
				}
				return Ok("Post hidden successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while hiding the post. " + ex.Message, request.UserId, "SOCIAL", true);
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
					using (var transaction = await connection.BeginTransactionAsync())
					{
						// Insert into hidden_files table (no permission check)
						var hideCommand = new MySqlCommand(
								"DELETE FROM maxhanna.hidden_stories WHERE user_id = @userId AND story_id = @storyId LIMIT 1;",
								connection, transaction);
						hideCommand.Parameters.AddWithValue("@userId", request.UserId);
						hideCommand.Parameters.AddWithValue("@storyId", request.StoryId);

						await hideCommand.ExecuteNonQueryAsync();

						// Commit transaction
						await transaction.CommitAsync();
					}
				}
				return Ok("Post unhidden successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while unhidden the post." + ex.Message, request.UserId, "SOCIAL", true);
				return StatusCode(500, "An error occurred while unhidden the post.");
			}
		}

		[HttpGet("/Social/GetLatestStoryId/", Name = "GetLatestStoryId")]
		public async Task<IActionResult> GetLatestStoryId()
		{
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();

					// Create command with the query
					using (var command = new MySqlCommand(
						"SELECT id FROM maxhanna.stories WHERE profile_user_id IS NULL ORDER BY id DESC LIMIT 1;",
						connection))
					{
						// Execute the query and get the result
						var result = await command.ExecuteScalarAsync();

						if (result != null && result != DBNull.Value)
						{
							// Convert the result to int
							int latestId = Convert.ToInt32(result);
							return Ok(latestId);
						}
						return NotFound("No stories found");
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while getting latest story ID: {ex.Message}", 0, "SOCIAL", true);
				return StatusCode(500, "An error occurred while getting latest story ID");
			}
		}

		[HttpPost("/Social/SetMetadata")]
		public async Task<IActionResult> SetMetadata([FromBody] MetadataRequest request, int? storyId)
		{
			try
			{
				if (request.Url != null)
				{
					if (storyId != null && storyId != 0)
					{
						await DeleteMetadata(storyId);
						for (int i = 0; i < request.Url.Length; i++)
						{
							Metadata? metadata = await _crawler.ScrapeUrlData(request.Url[i]);
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
		private async Task<string> InsertMetadata(int storyId, Metadata? metadata)
		{
			if (metadata == null) return "No metadata to insert";
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
			}
			catch
			{
				return "Could not delete metadata";
			}
			return "Deleted metadata";
		}
		private async Task<bool> NotifyFollowers(int? userId, int? userProfileId, int storyId)
		{
			if (userId == null || userId == 0) return false;

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					// Get all followers (friends + pending requests)
					string sql = @"
						-- Users who are friends with the poster
						SELECT friend_id AS follower_id FROM friends WHERE user_id = @userId
						UNION
						-- Users who have pending friend requests from the poster
						-- SELECT receiver_id AS follower_id FROM friend_requests 
						-- WHERE sender_id = @userId AND (status = 'pending' OR status = 'deleted') 
						-- UNION
						-- Users who the poster has pending friend requests from
						SELECT sender_id AS follower_id FROM friend_requests 
						WHERE receiver_id = @userId AND (status = 'pending' OR status = 'deleted') ";

					var followerIds = new List<int>();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@userId", userId);

						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							while (await rdr.ReadAsync())
							{
								followerIds.Add(rdr.GetInt32("follower_id"));
							}
						}
					}

					// Filter out followers who have blocked notifications
					var validFollowerIds = new List<int>();
					foreach (var followerId in followerIds)
					{
						if (await CanUserNotifyAsync(userId.Value, followerId))
						{
							validFollowerIds.Add(followerId);
						}
						else
						{
							_ = _log.Db($"Skipping story notification to {followerId} - notifications blocked", userId.Value, "SOCIAL");
						}
					}

					// Insert notifications for each valid follower
					if (validFollowerIds.Count > 0)
					{
						string notificationText = "New post.";
						string insertSql = $@"
							INSERT INTO notifications 
							(user_id, from_user_id{(userProfileId != null ? ", user_profile_id" : "")}, story_id, text, date, is_read) 
							VALUES (@userId, @fromUserId{(userProfileId != null ? ", @userProfileId" : "")}, @storyId, @text, UTC_TIMESTAMP(), 0)";

						foreach (var followerId in validFollowerIds)
						{
							using (var insertCmd = new MySqlCommand(insertSql, conn))
							{
								insertCmd.Parameters.AddWithValue("@userId", followerId);
								insertCmd.Parameters.AddWithValue("@fromUserId", userId);
								if (userProfileId != null)
								{
									insertCmd.Parameters.AddWithValue("@userProfileId", userProfileId);
								}
								insertCmd.Parameters.AddWithValue("@storyId", storyId);
								insertCmd.Parameters.AddWithValue("@text", notificationText);

								await insertCmd.ExecuteNonQueryAsync();
							}
						}

						// Send push notifications
						await SendStoryPushNotifications(userId.Value, validFollowerIds, storyId, notificationText);
					}

					return true;
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error in NotifyFollowers: {ex.Message}", userId, "SOCIAL", true);
				return false;
			}
		}

		private async Task SendStoryPushNotifications(int fromUserId, List<int> followerIds, int storyId, string message)
		{
			foreach (var followerId in followerIds)
			{
				try
				{
					var firebaseMessage = new Message()
					{
						Notification = new FirebaseAdmin.Messaging.Notification()
						{
							Title = $"New Story Post From UserId: {fromUserId}",
							Body = message,
							ImageUrl = "https://www.bughosted.com/assets/logo.jpg"
						},
						Data = new Dictionary<string, string>
						{
							{ "storyId", storyId.ToString() },
							{ "fromUserId", fromUserId.ToString() },
							{ "type", "story_post" }
						},
						Topic = $"notification{followerId}"
					};

					string response = await FirebaseMessaging.DefaultInstance.SendAsync(firebaseMessage);
				}
				catch (Exception ex)
				{
					_ = _log.Db($"Failed to send story notification to {followerId}: {ex.Message}", fromUserId, "SOCIAL");
				}
			}
		}
		public async Task<bool> CanUserNotifyAsync(int senderId, int recipientId)
		{
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				await conn.OpenAsync();

				string sql = @"
					SELECT COUNT(*) 
					FROM maxhanna.user_prevent_notification 
					WHERE user_id = @RecipientId 
					AND from_user_id = @SenderId
					LIMIT 1";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@RecipientId", recipientId);
				cmd.Parameters.AddWithValue("@SenderId", senderId);

				long? count = (long?)await cmd.ExecuteScalarAsync();
				return count == 0; // Returns true if no blocking record exists (can notify)
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error checking notification permission: {ex.Message}", recipientId, "NOTIFICATION");
				return true; // Default to allowing notifications if there's an error
			}
			finally
			{
				await conn.CloseAsync();
			}
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
					if (existingUrl != null && existingUrl.Parent != null)
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
				sitemap.Root?.Add(newUrlElement);

				sitemap.Save(_sitemapPath);
			}
			finally
			{
				_sitemapLock.Release();
			}
		}
		private async Task<bool> DeletePollsByStoryId(int storyId)
		{
			try
			{
				string sql = "DELETE FROM poll_votes WHERE component_id = @storyId";

				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@storyId", "storyText" + storyId);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();

						if (rowsAffected == 1)
						{

							return true;
						}
						else
						{
							return false;
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while deleting poll votes." + ex.Message, null, "SOCIAL", true);
				return false;
			}
		}

		private async Task RemoveFromSitemapAsync(int targetId)
		{
			string targetUrl = $"https://bughosted.com/Social/{targetId}";
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
						_ = _log.Db($"Removed {targetUrl} from sitemap!", null, "SOCIAL", true);
					}
				}
			}
			finally
			{
				_sitemapLock.Release();
			}
		}
	}
}