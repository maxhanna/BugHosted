using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class SocialController : ControllerBase
    {
        private readonly ILogger<SocialController> _logger;
        private readonly IConfiguration _config;

        public SocialController(ILogger<SocialController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost(Name = "GetStories")]
        public async Task<IActionResult> GetStories([FromBody] GetStoryRequest request, [FromQuery] string? search)
        {
            _logger.LogInformation($"POST /Social for user: {request.User?.Id} with search: {search} for profile: {request.ProfileUserId}.");
            var stories = new Dictionary<int, Story>();

            try
            {
                var whereClause = new StringBuilder("WHERE 1=1 ");
                var parameters = new Dictionary<string, object>();

                if (!string.IsNullOrEmpty(search))
                {
                    whereClause.Append("AND s.story_text LIKE CONCAT('%', @search, '%') ");
                    parameters.Add("@search", search);
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


                string sql = $@"
            SELECT 
                s.id AS story_id, 
                u.id AS user_id,
                u.username, 
                s.story_text, 
                s.date,
                COUNT(CASE WHEN sv.upvote = 1 THEN 1 END) AS upvotes,
                COUNT(CASE WHEN sv.downvote = 1 THEN 1 END) AS downvotes,
                COUNT(sc.id) AS comments_count,
                sm.title, 
                sm.description, 
                sm.image_url,
                f.id AS file_id, 
                f.file_name, 
                f.is_public, 
                f.is_folder, 
                f.shared_with, 
                COALESCE(SUM(CASE WHEN fv.upvote = 1 THEN 1 END), 0) AS file_upvotes,
                COALESCE(SUM(CASE WHEN fv.downvote = 1 THEN 1 END), 0) AS file_downvotes, 
                fd.given_file_name,
                fd.description as file_data_description,
                fd.last_updated as file_data_updated,
                f.upload_date AS file_date, 
                fu.username AS file_username, 
                f.user_id AS file_user_id,
                fc.id AS file_comment_id, 
                fc.user_id AS file_comment_user_id, 
                fcu.username AS file_comment_username,
                fc.comment AS file_comment_text, 
                fc.date AS file_comment_date,
                COUNT(CASE WHEN fcv.upvote = 1 THEN 1 END) AS file_comment_upvotes,
                COUNT(CASE WHEN fcv.downvote = 1 THEN 1 END) AS file_comment_downvotes,
                sc.id AS comment_id, 
                sc.user_id AS comment_user_id, 
                uc.username as comment_username,
                sc.comment AS comment_text, 
                sc.date AS comment_date,
                COUNT(CASE WHEN svc.upvote = 1 THEN 1 END) AS comment_upvotes,
                COUNT(CASE WHEN svc.downvote = 1 THEN 1 END) AS comment_downvotes,
                GROUP_CONCAT(t.id) AS topic_ids,
                GROUP_CONCAT(t.topic) AS topics
            FROM 
                stories AS s 
            JOIN 
                users AS u ON s.user_id = u.id 
            LEFT JOIN 
                story_votes AS sv ON s.id = sv.story_id 
            LEFT JOIN 
                comments AS sc ON s.id = sc.story_id 
            LEFT JOIN 
                users AS uc ON sc.user_id = uc.id
            LEFT JOIN 
                story_metadata AS sm ON s.id = sm.story_id 
            LEFT JOIN 
                story_files AS sf ON s.id = sf.story_id 
            LEFT JOIN 
                file_uploads AS f ON sf.file_id = f.id
            LEFT JOIN 
                file_votes AS fv ON f.id = fv.file_id
            LEFT JOIN 
                comments AS fc ON f.id = fc.file_id
            LEFT JOIN 
                file_data AS fd ON f.id = fd.file_id
            LEFT JOIN 
                users AS fu ON f.user_id = fu.id
            LEFT JOIN 
                users AS fcu ON fc.user_id = fcu.id
            LEFT JOIN 
                comment_votes AS fcv ON fc.id = fcv.comment_id
            LEFT JOIN 
                comment_votes AS svc ON sc.id = svc.comment_id
            LEFT JOIN 
                story_topics AS st ON s.id = st.story_id
            LEFT JOIN 
                topics AS t ON st.topic_id = t.id
            {whereClause}
            GROUP BY 
                s.id, u.id, u.username, s.story_text, s.date, 
                sm.title, sm.description, sm.image_url,
                f.id, f.file_name, f.is_public, f.is_folder, f.shared_with,
                fd.given_file_name, file_data_description, file_data_updated,
                f.upload_date, fu.username, f.user_id,
                fc.id, fc.user_id, fc.comment,
                sc.id, sc.user_id, sc.comment, t.topic, t.id
            ORDER BY 
                s.id DESC;";

                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    _logger.LogInformation("SQL connection opened.");

                    using (var cmd = new MySqlCommand(sql, conn))
                    {

                        if (search != null)
                        {
                            cmd.Parameters.AddWithValue("@search", search);
                        }
                        if (request.ProfileUserId != null)
                        {
                            cmd.Parameters.AddWithValue("@profile", request.ProfileUserId);
                        }
                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            _logger.LogInformation("SQL query executed, processing results.");

                            while (await rdr.ReadAsync())
                            {
                                int storyId = rdr.GetInt32("story_id");
                                if (!stories.ContainsKey(storyId))
                                { 
                                    var story = new Story
                                    {
                                        Id = storyId,
                                        User = new User(rdr.GetInt32("user_id"), rdr.GetString("username"), null),
                                        StoryText = rdr.GetString("story_text"),
                                        Date = rdr.GetDateTime("date"),
                                        Upvotes = rdr.GetInt32("upvotes"),
                                        Downvotes = rdr.GetInt32("downvotes"),
                                        CommentsCount = rdr.GetInt32("comments_count"),
                                        Metadata = new MetadataDto
                                        {
                                            Title = rdr.IsDBNull(rdr.GetOrdinal("title")) ? null : rdr.GetString("title"),
                                            Description = rdr.IsDBNull(rdr.GetOrdinal("description")) ? null : rdr.GetString("description"),
                                            ImageUrl = rdr.IsDBNull(rdr.GetOrdinal("image_url")) ? null : rdr.GetString("image_url")
                                        },
                                        StoryFiles = new List<FileEntry>(),
                                        StoryComments = new List<StoryComment>(),
                                        StoryTopics = new List<Topic>()
                                    };

                                    stories.Add(storyId, story);
                                }

                                if (!rdr.IsDBNull(rdr.GetOrdinal("file_id"))) // Check if there is a file
                                {
                                    _logger.LogInformation($"Processing file for story ID: {storyId}");

                                    var fileEntry = new FileEntry
                                    {
                                        Id = rdr.GetInt32("file_id"),
                                        FileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? null : rdr.GetString("file_name"),
                                        Visibility = rdr.GetBoolean("is_public") ? "Public" : "Private",
                                        SharedWith = rdr.IsDBNull(rdr.GetOrdinal("shared_with")) ? null : rdr.GetString("shared_with"),
                                        User = new User(
                                            rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? 0 : rdr.GetInt32("file_user_id"),
                                            rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? "Anonymous" : rdr.GetString("file_username")
                                        ),
                                        IsFolder = rdr.GetBoolean("is_folder"),
                                        Upvotes = rdr.GetInt32("file_upvotes"),
                                        Downvotes = rdr.GetInt32("file_downvotes"),
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

                                    // Process file comments
                                    if (!rdr.IsDBNull(rdr.GetOrdinal("file_comment_id")))
                                    {
                                        var fileComment = new FileComment
                                        {
                                            Id = rdr.GetInt32("file_comment_id"),
                                            FileId = rdr.GetInt32("file_id"),
                                            User = new User(
                                                rdr.GetInt32("file_comment_user_id"),
                                                rdr.IsDBNull(rdr.GetOrdinal("file_comment_username")) ? "Anonymous" : rdr.GetString("file_comment_username")
                                            ),
                                            CommentText = rdr.IsDBNull(rdr.GetOrdinal("file_comment_text")) ? null : rdr.GetString("file_comment_text"),
                                            Upvotes = rdr.GetInt32("file_comment_upvotes"),
                                            Downvotes = rdr.GetInt32("file_comment_downvotes"),
                                            Date = rdr.GetDateTime("file_comment_date")
                                        };

                                        fileEntry.FileComments.Add(fileComment);
                                    }

                                    stories[storyId].StoryFiles!.Add(fileEntry);
                                }

                                if (!rdr.IsDBNull(rdr.GetOrdinal("comment_id"))) // Check if there is a comment
                                {
                                    var comment = new StoryComment
                                    {
                                        Id = rdr.GetInt32("comment_id"),
                                        StoryId = rdr.GetInt32("story_id"),
                                        User = new User(
                                            rdr.GetInt32("comment_user_id"),
                                            rdr.IsDBNull(rdr.GetOrdinal("comment_username")) ? "Anonymous" : rdr.GetString("comment_username")
                                        ),
                                        CommentText = rdr.IsDBNull(rdr.GetOrdinal("comment_text")) ? null : rdr.GetString("comment_text"),
                                        Upvotes = rdr.GetInt32("comment_upvotes"),
                                        Downvotes = rdr.GetInt32("comment_downvotes"),
                                        Date = rdr.GetDateTime("comment_date"),
                                    };

                                    stories[storyId].StoryComments!.Add(comment);
                                }

                                if (!rdr.IsDBNull(rdr.GetOrdinal("topics"))) // Check if there are topics
                                {
                                    string[] topicIds = rdr.GetString("topic_ids").Split(','); // Split topic IDs by comma
                                    string[] topicNames = rdr.GetString("topics").Split(','); // Split topics by comma
                                    for (int i = 0; i < topicNames.Length; i++)
                                    {
                                        var topic = new Topic
                                        {
                                            Id = int.Parse(topicIds[i]), // Use the corresponding ID from the array
                                            TopicText = topicNames[i]
                                        };
                                        if (stories[storyId].StoryTopics!.Where(x => x.TopicText == topic.TopicText).Count() == 0) {

                                            stories[storyId].StoryTopics!.Add(topic);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching stories");
                return StatusCode(500, "Internal server error");
            }
            return Ok(stories.Values.ToList());
        }


        [HttpPost("/Social/Post-Story/", Name = "PostStory")]
        public async Task<IActionResult> PostStory([FromBody] StoryRequest story)
        {
            _logger.LogInformation($"POST /Social/Post-Story/ for user: {story.user.Id} with #of attached files : {story.story.StoryFiles?.Count}");

            try
            {
                string sql = @"INSERT INTO stories (user_id, story_text, profile_user_id) VALUES (@userId, @storyText, @profileUserId);";
                string topicSql = @"INSERT INTO story_topics (story_id, topic_id) VALUES (@storyId, @topicId);";

                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@userId", story.user.Id);
                        cmd.Parameters.AddWithValue("@storyText", story.story.StoryText);
                        cmd.Parameters.AddWithValue("@profileUserId", story.story.ProfileUserId.HasValue && story.story.ProfileUserId != 0 ? story.story.ProfileUserId.Value : (object)DBNull.Value);

                        int rowsAffected = await cmd.ExecuteNonQueryAsync();

                        if (rowsAffected == 1)
                        {
                            // Fetch the last inserted ID
                            int storyId = (int)cmd.LastInsertedId;

                            // Insert attached files into story_files table
                            if (story.story.StoryFiles != null && story.story.StoryFiles.Count > 0)
                            {
                                foreach (var file in story.story.StoryFiles)
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
                            if (story.story.StoryTopics != null && story.story.StoryTopics.Count > 0)
                            {
                                foreach (var topic in story.story.StoryTopics)
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
                            var url = ExtractUrl(story.story.StoryText);
                            if (url != null)
                            {
                                // Fetch metadata
                                var metadataRequest = new MetadataRequest { User = story.user, Url = url };
                                var metadataResponse = GetMetadata(metadataRequest, storyId);
                            }

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
         

        [HttpPost("/Social/Story/Upvote", Name = "UpvoteSocialStory")]
        public async Task<IActionResult> UpvoteSocialStory([FromBody] StoryVoteRequest request)
        {
            _logger.LogInformation($"POST /Social/Story/Upvote (StoryId = {request.StoryId}, UserId = {request.User.Id}, Upvote = {request.Upvote})");

            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();


                    var command = new MySqlCommand(
                        @"INSERT INTO story_votes (story_id, user_id, upvote, downvote) 
                          VALUES (@storyId, @userId, @upvote, 0) 
                          ON DUPLICATE KEY UPDATE upvote = @upvote, downvote = 0; 
                          SELECT LAST_INSERT_ID();"
                        , connection);
                    command.Parameters.AddWithValue("@storyId", request.StoryId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@upvote", request.Upvote);



                    var result = Convert.ToInt32(await command.ExecuteScalarAsync());

                    // Query to get the updated counts
                    var countCommand = new MySqlCommand(
                        @"SELECT 
                            SUM(CASE WHEN upvote = 1 THEN 1 ELSE 0 END) AS upvoteCount, 
                            SUM(CASE WHEN downvote = 1 THEN 1 ELSE 0 END) AS downvoteCount 
                          FROM story_votes 
                          WHERE story_id = @storyId;", connection);
                    countCommand.Parameters.AddWithValue("@storyId", request.StoryId);

                    using (var reader = await countCommand.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            var upvotes = reader.GetInt32("upvoteCount");
                            var downvotes = reader.GetInt32("downvoteCount");

                            return Ok(new UpDownVoteCounts()
                            {
                                Upvotes = upvotes,
                                Downvotes = downvotes
                            });
                        }
                        else
                        {
                            return StatusCode(500, "An error occurred while fetching the vote counts.");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while upvoting the story.");
                return StatusCode(500, "An error occurred while upvoting the story.");
            }
        }
        [HttpPost("/Social/Story/Downvote", Name = "DownvoteSocialStory")]
        public async Task<IActionResult> DownvoteSocialStory([FromBody] StoryVoteRequest request)
        {
            _logger.LogInformation($"POST /Social/Story/Downvote (StoryId = {request.StoryId}, UserId = {request.User.Id}, Downvote = {request.Downvote})");

            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand(
                        @"INSERT INTO story_votes (story_id, user_id, upvote, downvote) 
                  VALUES (@storyId, @userId, 0, @downvote) 
                  ON DUPLICATE KEY UPDATE upvote = 0, downvote = @downvote; 
                  SELECT LAST_INSERT_ID();"
                        , connection);
                    command.Parameters.AddWithValue("@storyId", request.StoryId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@downvote", request.Downvote);

                    var result = Convert.ToInt32(await command.ExecuteScalarAsync());

                    // Query to get the updated counts
                    var countCommand = new MySqlCommand(
                        @"SELECT 
                            SUM(CASE WHEN upvote = 1 THEN 1 ELSE 0 END) AS upvoteCount, 
                            SUM(CASE WHEN downvote = 1 THEN 1 ELSE 0 END) AS downvoteCount 
                          FROM story_votes 
                          WHERE story_id = @storyId;", connection);
                    countCommand.Parameters.AddWithValue("@storyId", request.StoryId);

                    using (var reader = await countCommand.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            var upvotes = reader.GetInt32("upvoteCount");
                            var downvotes = reader.GetInt32("downvoteCount");

                            return Ok(new UpDownVoteCounts()
                            {
                                Upvotes = upvotes,
                                Downvotes = downvotes,
                            });
                        }
                        else
                        {
                            return StatusCode(500, "An error occurred while fetching the vote counts.");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while downvoting the story.");
                return StatusCode(500, "An error occurred while downvoting the story.");
            }
        }
         

        [HttpPost("/Social/GetMetadata")]
        public async Task<IActionResult> GetMetadata([FromBody] MetadataRequest request, int? storyId)
        {
            try
            {
                _logger.LogInformation($"Getting metadata for user : {request.User.Id} for url: {request.Url} for storyId: {storyId}");
                var metadata = await FetchMetadataAsync(request.Url);

                if (storyId != null && storyId != 0)
                {
                    _logger.LogInformation($"Inserting metadata for story {storyId}");
                    return Ok(await InsertMetadata((int)storyId, metadata));
                }
                return Ok(metadata);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"An error occurred while fetching metadata: {ex.Message}");
            }
        }
        private async Task<string> InsertMetadata(int storyId, MetadataDto metadata)
        {
            string sql = @"INSERT INTO story_metadata (story_id, title, description, image_url) VALUES (@storyId, @title, @description, @imageUrl);";
            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@storyId", storyId);
                        cmd.Parameters.AddWithValue("@title", metadata.Title);
                        cmd.Parameters.AddWithValue("@description", metadata.Description);
                        cmd.Parameters.AddWithValue("@imageUrl", metadata.ImageUrl);

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

        private static string? ExtractUrl(string? text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return "";
            }
            // Regular expression pattern to match URLs
            string urlPattern = @"(https?:\/\/[^\s]+)";

            // Match URLs in the text
            var matches = System.Text.RegularExpressions.Regex.Matches(text, urlPattern);

            // Return the first match if found, otherwise return null
            return matches.Count > 0 ? matches[0].Value : null;
        }

        private async Task<MetadataDto> FetchMetadataAsync(string url)
        {
            var httpClient = new HttpClient();
            var response = await httpClient.GetAsync(url);
            var html = await response.Content.ReadAsStringAsync();

            var htmlDocument = new HtmlDocument();
            htmlDocument.LoadHtml(html);
            var metadata = new MetadataDto();
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

            return metadata;
        }

    }
}
