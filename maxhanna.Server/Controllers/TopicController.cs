using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using maxhanna.Server.Controllers.DataContracts;
using static maxhanna.Server.Controllers.ChatController;

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

                sql = @"INSERT INTO maxhanna.topics (topic) VALUES (@topic); SELECT LAST_INSERT_ID();";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@topic", request.Topic.TopicText);

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

    }
}
