using maxhanna.Server.Controllers.DataContracts.Topics;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
 
namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class TopicController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public TopicController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Topic/Get", Name = "GetTopics")]
		public async Task<List<Topic>> GetTopics([FromBody] TopicRequest req)
		{
			var topics = new List<Topic>();

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();

					string sql;
					if (string.IsNullOrEmpty(req.Topic?.TopicText))
					{
						if (req.UserId.HasValue)
						{
							// Get top 20 with favorites first, then alphabetical
							sql = @"
								SELECT t.id, t.topic, 
									CASE WHEN tf.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
								FROM maxhanna.topics t
								LEFT JOIN maxhanna.topic_favourite tf 
									ON t.id = tf.topic_id AND tf.user_id = @userId
								ORDER BY is_favorite DESC, t.topic ASC
								LIMIT 20";
						}
						else
						{
							// Get top 20 alphabetically when no user ID
							sql = @"SELECT id, topic FROM maxhanna.topics 
                            ORDER BY topic ASC LIMIT 20";
						}
					}
					else
					{
						// Original search functionality when topic text is provided
						sql = @"SELECT id, topic FROM maxhanna.topics 
                        WHERE topic LIKE @topic
                        ORDER BY topic ASC";
					}

					using (var cmd = new MySqlCommand(sql, conn))
					{
						if (req.UserId.HasValue && string.IsNullOrEmpty(req.Topic?.TopicText))
						{
							cmd.Parameters.AddWithValue("@userId", req.UserId.Value);
						}
						if (!string.IsNullOrEmpty(req.Topic?.TopicText))
						{
							cmd.Parameters.AddWithValue("@topic", $"%{req.Topic?.TopicText}%");
						}

						using (var reader = await cmd.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								var topic = new Topic(
									reader.GetInt32("id"),
									reader.GetString("topic")); 
								topics.Add(topic);
							}
						}
					}
				}
				catch (Exception ex)
				{
					await _log.Db("Error getting topics: " + ex.Message, req.UserId, "TOPIC", true);
				}
			}

			return topics;
		}

		[HttpPost("/Topic/Add", Name = "AddTopic")]
		public async Task<IActionResult> AddTopic([FromBody] TopicRequest request)
		{
			if (string.IsNullOrEmpty(request.Topic.TopicText))
			{
				return BadRequest(new Topic(0, ""));
			}
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql = @"SELECT id FROM maxhanna.topics WHERE topic = @topic";
				MySqlCommand checkCmd = new MySqlCommand(sql, conn);
				checkCmd.Parameters.AddWithValue("@topic", request.Topic.TopicText);
				object existingTopicId = await checkCmd.ExecuteScalarAsync() ?? DBNull.Value;
				if (existingTopicId != null && existingTopicId != DBNull.Value)
				{
					int existingId = Convert.ToInt32(existingTopicId);
					return BadRequest(new Topic(existingId, request.Topic.TopicText));
				}

				sql = @"INSERT INTO maxhanna.topics (topic, created_by_user_id) VALUES (@topic, @user_id); SELECT LAST_INSERT_ID();";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@topic", request.Topic.TopicText);
				cmd.Parameters.AddWithValue("@user_id", request.UserId);

				int topicId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
				if (topicId > 0)
				{
					_ = _log.Db($"Topic added successfully. ID: {topicId}, Topic: {request.Topic.TopicText}", request.UserId, "TOPIC", true);
					return Ok(new Topic(topicId, request.Topic.TopicText));
				}
				else
				{
					_ = _log.Db($"Failed to add topic: {request.Topic.TopicText}", request.UserId, "TOPIC", true);
					return StatusCode(500, "Failed to add topic");
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request to add a topic." + ex.Message, request.UserId, "TOPIC", true);
				return StatusCode(500, "An error occurred while processing the request");
			}
			finally
			{
				conn.Close();
			}
		}

		[HttpGet("/Topic/GetTopStoryTopics/", Name = "GetTopStoryTopics")]
		public async Task<IActionResult> GetTopStoryTopics()
		{ 
			try
			{
				List<TopicRank> topicRanks = await GetStoryTopicRanks();
				return Ok(topicRanks);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching story topic ranks." + ex.Message, null, "TOPIC", true);
				return StatusCode(500, "An error occurred while fetching story topic ranks.");
			}
		}

		[HttpGet("/Topic/GetTopFileTopics/", Name = "GetTopFileTopics")]
		public async Task<IActionResult> GetTopFileTopics()
		{
			try
			{
				List<TopicRank> topicRanks = await GetFileTopicRanks();
				return Ok(topicRanks);
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching file topic ranks." + ex.Message, null, "TOPIC", true);
				return StatusCode(500, "An error occurred while fetching file topic ranks.");
			}
		}


		[HttpPost("/Topic/GetFavTopics/", Name = "GetFavTopics")]
		public async Task<IActionResult> GetFavTopics([FromBody] int userId)
		{
			var topics = new List<Topic>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();
				string sql = @"SELECT id, topic FROM maxhanna.topics WHERE id IN (SELECT topic_id FROM topic_favourite WHERE user_id = @UserId)";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@UserId", userId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var id = reader.GetInt32(reader.GetOrdinal("id"));
						var topicText = reader.GetString(reader.GetOrdinal("topic"));
						var topicObject = new Topic(id, topicText);
						topics.Add(topicObject);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while trying to get Topics." + ex.Message, null, "TOPIC", true);
			}
			finally
			{
				conn.Close();
			}
			return Ok(topics);
		}


		[HttpPost("/Topic/AddFavTopic/", Name = "AddFavTopic")]
		public async Task<IActionResult> AddFavTopic([FromBody] AddFavTopicRequest req)
		{
			if (req.UserId <= 0 || req.TopicIds == null || req.TopicIds.Length == 0)
			{
				return BadRequest("Invalid request data");
			}

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				// Start transaction
				using (var transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// 1. First check if topics exist
						var existingTopics = new List<Topic>();
						var topicIds = req.TopicIds;
						string idList = string.Join(",", topicIds);

						string checkSql = @$"
							SELECT id, topic 
							FROM maxhanna.topics 
							WHERE id IN ({idList})";

						using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
						{
							using (var reader = await checkCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									existingTopics.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						// 2. Only proceed with existing topics
						var existingTopicIds = existingTopics.Select(t => t.Id).ToList();

						// 3. Insert into topic_favourite
						string insertSql = @"
							INSERT IGNORE INTO maxhanna.topic_favourite (topic_id, user_id)
							VALUES (@TopicId, @UserId)";

						foreach (var topicId in existingTopicIds)
						{
							using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
							{
								insertCmd.Parameters.AddWithValue("@TopicId", topicId);
								insertCmd.Parameters.AddWithValue("@UserId", req.UserId);
								await insertCmd.ExecuteNonQueryAsync();
							}
						}

						// 4. Get ALL favorite topics for the user after update
						var allFavorites = new List<Topic>();
						string favoritesSql = @"
							SELECT t.id, t.topic
							FROM maxhanna.topics t
							INNER JOIN maxhanna.topic_favourite tf ON t.id = tf.topic_id
							WHERE tf.user_id = @UserId
							ORDER BY t.topic ASC";

						using (var favoritesCmd = new MySqlCommand(favoritesSql, conn, transaction))
						{
							favoritesCmd.Parameters.AddWithValue("@UserId", req.UserId);

							using (var reader = await favoritesCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									allFavorites.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						await transaction.CommitAsync();

						return Ok(new
						{
							Success = true,
							Message = $"Added {existingTopicIds.Count} topics to favorites",
							AllFavoriteTopics = allFavorites
						});
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						await _log.Db($"Error adding favorite topics: {ex.Message}", req.UserId, "TOPIC", true);
						return StatusCode(500, new
						{
							Success = false,
							Message = "An error occurred while adding topics to favorites"
						});
					}
				}
			}
		}

		[HttpPost("/Topic/RemoveFavTopic/", Name = "RemoveFavTopic")]
		public async Task<IActionResult> RemoveFavTopic([FromBody] AddFavTopicRequest req)
		{
			if (req.UserId <= 0 || req.TopicIds == null || req.TopicIds.Length == 0)
			{
				return BadRequest("Invalid request data");
			}

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				// Start transaction
				using (var transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// 1. First verify topics exist in user's favorites
						var existingFavorites = new List<Topic>();
						string idList = string.Join(",", req.TopicIds);

						string checkSql = @$"
                    SELECT t.id, t.topic
                    FROM maxhanna.topics t
                    INNER JOIN maxhanna.topic_favourite tf ON t.id = tf.topic_id
                    WHERE tf.user_id = @UserId
                    AND t.id IN ({idList})";

						using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
						{
							checkCmd.Parameters.AddWithValue("@UserId", req.UserId);

							using (var reader = await checkCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									existingFavorites.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						// 2. Only proceed with existing favorite topics
						var existingFavoriteIds = existingFavorites.Select(t => t.Id).ToList();
						int removedCount = 0;

						if (existingFavoriteIds.Count > 0)
						{
							// 3. Delete from topic_favourite
							string deleteSql = @$"
                        DELETE FROM maxhanna.topic_favourite
                        WHERE user_id = @UserId
                        AND topic_id IN ({string.Join(",", existingFavoriteIds)})";

							using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
							{
								deleteCmd.Parameters.AddWithValue("@UserId", req.UserId);
								removedCount = await deleteCmd.ExecuteNonQueryAsync();
							}
						}

						// 4. Get remaining favorite topics for the user
						var remainingFavorites = new List<Topic>();
						string favoritesSql = @"
                    SELECT t.id, t.topic
                    FROM maxhanna.topics t
                    INNER JOIN maxhanna.topic_favourite tf ON t.id = tf.topic_id
                    WHERE tf.user_id = @UserId
                    ORDER BY t.topic ASC";

						using (var favoritesCmd = new MySqlCommand(favoritesSql, conn, transaction))
						{
							favoritesCmd.Parameters.AddWithValue("@UserId", req.UserId);

							using (var reader = await favoritesCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									remainingFavorites.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						await transaction.CommitAsync();

						return Ok(new
						{
							Success = true,
							Message = $"Removed {removedCount} topics from favorites",
							RemainingFavoriteTopics = remainingFavorites
						});
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						await _log.Db($"Error removing favorite topics: {ex.Message}", req.UserId, "TOPIC", true);
						return StatusCode(500, new
						{
							Success = false,
							Message = "An error occurred while removing topics from favorites"
						});
					}
				}
			}
		}

		[HttpPost("/Topic/GetIgnoredTopics/", Name = "GetIgnoredTopics")]
		public async Task<IActionResult> GetIgnoredTopics([FromBody] int userId)
		{
			var topics = new List<Topic>();

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					await conn.OpenAsync();
					string sql = @"SELECT id, topic FROM maxhanna.topics 
                          WHERE id IN (SELECT topic_id FROM topic_ignored WHERE user_id = @UserId)";
					MySqlCommand cmd = new MySqlCommand(sql, conn);
					cmd.Parameters.AddWithValue("@UserId", userId);

					using (var reader = await cmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							var id = reader.GetInt32(reader.GetOrdinal("id"));
							var topicText = reader.GetString(reader.GetOrdinal("topic"));
							var topicObject = new Topic(id, topicText);
							topics.Add(topicObject);
						}
					}
				}
				catch (Exception ex)
				{
					await _log.Db("An error occurred while trying to get ignored Topics." + ex.Message, null, "TOPIC", true);
					return StatusCode(500, new { Success = false, Message = "Error getting ignored topics" });
				}
			}
			return Ok(topics);
		}

		[HttpPost("/Topic/AddIgnoredTopic/", Name = "AddIgnoredTopic")]
		public async Task<IActionResult> AddIgnoredTopic([FromBody] AddFavTopicRequest req)
		{
			if (req.UserId <= 0 || req.TopicIds == null || req.TopicIds.Length == 0)
			{
				return BadRequest("Invalid request data");
			}

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				using (var transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// 1. First check if topics exist
						var existingTopics = new List<Topic>();
						var topicIds = req.TopicIds;
						string idList = string.Join(",", topicIds);

						string checkSql = @$"
                    SELECT id, topic 
                    FROM maxhanna.topics 
                    WHERE id IN ({idList})";

						using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
						{
							using (var reader = await checkCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									existingTopics.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						// 2. Only proceed with existing topics
						var existingTopicIds = existingTopics.Select(t => t.Id).ToList();

						// 3. Insert into topic_ignored
						string insertSql = @"
                    INSERT IGNORE INTO maxhanna.topic_ignored (topic_id, user_id)
                    VALUES (@TopicId, @UserId)";

						foreach (var topicId in existingTopicIds)
						{
							using (var insertCmd = new MySqlCommand(insertSql, conn, transaction))
							{
								insertCmd.Parameters.AddWithValue("@TopicId", topicId);
								insertCmd.Parameters.AddWithValue("@UserId", req.UserId);
								await insertCmd.ExecuteNonQueryAsync();
							}
						}

						// 4. Get ALL ignored topics for the user after update
						var allIgnored = new List<Topic>();
						string ignoredSql = @"
                    SELECT t.id, t.topic
                    FROM maxhanna.topics t
                    INNER JOIN maxhanna.topic_ignored ti ON t.id = ti.topic_id
                    WHERE ti.user_id = @UserId
                    ORDER BY t.topic ASC";

						using (var ignoredCmd = new MySqlCommand(ignoredSql, conn, transaction))
						{
							ignoredCmd.Parameters.AddWithValue("@UserId", req.UserId);

							using (var reader = await ignoredCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									allIgnored.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						await transaction.CommitAsync();

						return Ok(new
						{
							Success = true,
							Message = $"Added {existingTopicIds.Count} topics to ignored list",
							AllIgnoredTopics = allIgnored
						});
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						await _log.Db($"Error adding ignored topics: {ex.Message}", req.UserId, "TOPIC", true);
						return StatusCode(500, new
						{
							Success = false,
							Message = "An error occurred while adding topics to ignored list"
						});
					}
				}
			}
		}

		[HttpPost("/Topic/RemoveIgnoredTopic/", Name = "RemoveIgnoredTopic")]
		public async Task<IActionResult> RemoveIgnoredTopic([FromBody] AddFavTopicRequest req)
		{
			if (req.UserId <= 0 || req.TopicIds == null || req.TopicIds.Length == 0)
			{
				return BadRequest("Invalid request data");
			}

			using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await conn.OpenAsync();

				using (var transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// 1. First verify topics exist in user's ignored list
						var existingIgnored = new List<Topic>();
						string idList = string.Join(",", req.TopicIds);

						string checkSql = @$"
                    SELECT t.id, t.topic
                    FROM maxhanna.topics t
                    INNER JOIN maxhanna.topic_ignored ti ON t.id = ti.topic_id
                    WHERE ti.user_id = @UserId
                    AND t.id IN ({idList})";

						using (var checkCmd = new MySqlCommand(checkSql, conn, transaction))
						{
							checkCmd.Parameters.AddWithValue("@UserId", req.UserId);

							using (var reader = await checkCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									existingIgnored.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						// 2. Only proceed with existing ignored topics
						var existingIgnoredIds = existingIgnored.Select(t => t.Id).ToList();
						int removedCount = 0;

						if (existingIgnoredIds.Count > 0)
						{
							// 3. Delete from topic_ignored
							string deleteSql = @$"
                        DELETE FROM maxhanna.topic_ignored
                        WHERE user_id = @UserId
                        AND topic_id IN ({string.Join(",", existingIgnoredIds)})";

							using (var deleteCmd = new MySqlCommand(deleteSql, conn, transaction))
							{
								deleteCmd.Parameters.AddWithValue("@UserId", req.UserId);
								removedCount = await deleteCmd.ExecuteNonQueryAsync();
							}
						}

						// 4. Get remaining ignored topics for the user
						var remainingIgnored = new List<Topic>();
						string ignoredSql = @"
                    SELECT t.id, t.topic
                    FROM maxhanna.topics t
                    INNER JOIN maxhanna.topic_ignored ti ON t.id = ti.topic_id
                    WHERE ti.user_id = @UserId
                    ORDER BY t.topic ASC";

						using (var ignoredCmd = new MySqlCommand(ignoredSql, conn, transaction))
						{
							ignoredCmd.Parameters.AddWithValue("@UserId", req.UserId);

							using (var reader = await ignoredCmd.ExecuteReaderAsync())
							{
								while (await reader.ReadAsync())
								{
									remainingIgnored.Add(new Topic(
										reader.GetInt32("id"),
										reader.GetString("topic"))
									);
								}
							}
						}

						await transaction.CommitAsync();

						return Ok(new
						{
							Success = true,
							Message = $"Removed {removedCount} topics from ignored list",
							RemainingIgnoredTopics = remainingIgnored
						});
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						await _log.Db($"Error removing ignored topics: {ex.Message}", req.UserId, "TOPIC", true);
						return StatusCode(500, new
						{
							Success = false,
							Message = "An error occurred while removing topics from ignored list"
						});
					}
				}
			}
		}

		private async Task<List<TopicRank>> GetStoryTopicRanks()
		{
			// Create a list to store the results
			var topicRanks = new List<TopicRank>();
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					// Open the connection
					await conn.OpenAsync();

					// SQL query to get topic ranks
					string sql = @"
                SELECT 
                    t.id AS topic_id,
                    t.topic AS topic_name,
                    COUNT(st.story_id) AS story_count
                FROM 
                    topics t
                LEFT JOIN 
                    story_topics st ON t.id = st.topic_id
                GROUP BY 
                    t.id, t.topic
                ORDER BY 
                    story_count DESC;";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							// Read data from the query result
							while (await reader.ReadAsync())
							{
								topicRanks.Add(new TopicRank
								{
									TopicId = reader.GetInt32("topic_id"),
									TopicName = reader.GetString("topic_name"),
									StoryCount = reader.GetInt32("story_count")
								});
							}
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while fetching story topic ranks." + ex.Message, null, "TOPIC", true);
					throw;
				}
			}
			return topicRanks;
		}

		private async Task<List<TopicRank>> GetFileTopicRanks()
		{
			// Create a list to store the results
			var topicRanks = new List<TopicRank>();
			using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				try
				{
					// Open the connection
					await conn.OpenAsync();

					// SQL query to get topic ranks
					string sql = @"
                SELECT 
                    t.id AS topic_id,
                    t.topic AS topic_name,
                    COUNT(st.file_id) AS file_count
                FROM 
                    topics t
                LEFT JOIN 
                    file_topics st ON t.id = st.topic_id
                GROUP BY 
                    t.id, t.topic
                ORDER BY 
                    file_count DESC;";

					using (MySqlCommand cmd = new MySqlCommand(sql, conn))
					{
						using (var reader = await cmd.ExecuteReaderAsync())
						{
							// Read data from the query result
							while (await reader.ReadAsync())
							{
								topicRanks.Add(new TopicRank
								{
									TopicId = reader.GetInt32("topic_id"),
									TopicName = reader.GetString("topic_name"),
									FileCount = reader.GetInt32("file_count")
								});
							}
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db("An error occurred while fetching file topic ranks. " + ex.Message, null, "TOPIC", true);
					throw;
				}
			}
			return topicRanks;
		}

	}
}
