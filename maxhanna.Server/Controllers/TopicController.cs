using maxhanna.Server.Controllers.DataContracts.Topics;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class TopicController : ControllerBase
	{
		private readonly ILogger<TopicController> _logger;
		private readonly IConfiguration _config;

		public TopicController(ILogger<TopicController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
		}

		[HttpPost("/Topic/Get", Name = "GetTopics")]
		public async Task<List<Topic>> GetTopics([FromBody] String? topic)
		{
			_logger.LogInformation($"POST /Topic/Get (with search key: {topic})");
			var topics = new List<Topic>();

			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{

				conn.Open();

				string sql = string.IsNullOrEmpty(topic) ?
						@"SELECT id, topic FROM maxhanna.topics" :
						@"SELECT id, topic FROM maxhanna.topics WHERE topic LIKE @topic";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				if (!string.IsNullOrEmpty(topic))
				{
					cmd.Parameters.AddWithValue("@topic", $"%{topic}%");
				}
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
				_logger.LogError(ex, "An error occurred while trying to get Topics.");
			}
			finally
			{
				conn.Close();
			}
			return topics;
		}

		[HttpPost("/Topic/Add", Name = "AddTopic")]
		public async Task<IActionResult> AddTopic([FromBody] TopicRequest request)
		{
			_logger.LogInformation($"POST /Topic/Add (with topic: {request.Topic.TopicText} for user {request.User.Id})");
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
					_logger.LogInformation($"Topic '{request.Topic.TopicText}' already exists. ID: {existingId}");
					return BadRequest(new Topic(existingId, request.Topic.TopicText));
				}

				sql = @"INSERT INTO maxhanna.topics (topic, created_by_user_id) VALUES (@topic, @user_id); SELECT LAST_INSERT_ID();";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@topic", request.Topic.TopicText);
				cmd.Parameters.AddWithValue("@user_id", request.User.Id);

				int topicId = Convert.ToInt32(await cmd.ExecuteScalarAsync());
				if (topicId > 0)
				{
					_logger.LogInformation($"Topic added successfully. ID: {topicId}, Topic: {request.Topic.TopicText}");
					return Ok(new Topic(topicId, request.Topic.TopicText));
				}
				else
				{
					_logger.LogError($"Failed to add topic: {request.Topic.TopicText}");
					return StatusCode(500, "Failed to add topic");
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while processing the POST request to add a topic.");
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
			_logger.LogInformation($@"GET /Social/GetTopStoryTopics");

			try
			{
				List<TopicRank> topicRanks = await GetStoryTopicRanks();
				return Ok(topicRanks);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching story topic ranks.");
				return StatusCode(500, "An error occurred while fetching story topic ranks.");
			}
		}

		[HttpGet("/Topic/GetTopFileTopics/", Name = "GetTopFileTopics")]
		public async Task<IActionResult> GetTopFileTopics()
		{
			_logger.LogInformation($@"GET /Social/GetTopFileTopics");

			try
			{
				List<TopicRank> topicRanks = await GetFileTopicRanks();
				return Ok(topicRanks);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching file topic ranks.");
				return StatusCode(500, "An error occurred while fetching file topic ranks.");
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
					_logger.LogError(ex, "An error occurred while fetching story topic ranks.");
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
					_logger.LogError(ex, "An error occurred while fetching file topic ranks.");
					throw;
				}
			}
			return topicRanks;
		}

	}
}
