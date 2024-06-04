using HtmlAgilityPack;
using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
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
        public async Task<IActionResult> GetStories([FromBody] User? user, [FromQuery] string? search)
        {
            _logger.LogInformation($"POST /Social for user: {user?.Id} with search: {search}");
            try
            {
                string sql = !string.IsNullOrEmpty(search)
                    ? @"SELECT 
                        s.id, 
                        u.id,
                        u.username, 
                        s.story_text, 
                        s.date,
                        COUNT(CASE WHEN sv.upvote = 1 THEN 1 ELSE 0 END) AS upvotes,
                        COUNT(CASE WHEN sv.downvote = 1 THEN 1 ELSE 0 END) AS downvotes,
                        COUNT(sc.id) AS comments_count,
                        sm.title, 
                        sm.description, 
                        sm.image_url,
                        f.id AS file_id, 
                        f.file_name, 
                        f.is_public, 
                        f.is_folder, 
                        f.shared_with, 
                        COALESCE(SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END), 0) AS file_upvotes,
                        COALESCE(SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END), 0) AS file_downvotes,
                        COUNT(fc.id) AS file_comment_count, 
                        f.upload_date AS file_date, 
                        u.username AS file_username, 
                        f.user_id AS file_user_id
                    FROM 
                        stories AS s 
                    JOIN 
                        users AS u ON s.user_id = u.id 
                    LEFT JOIN 
                        story_votes AS sv ON s.id = sv.story_id 
                    LEFT JOIN 
                        story_comments AS sc ON s.id = sc.story_id 
                    LEFT JOIN 
                        story_metadata AS sm ON s.id = sm.story_id 
                    LEFT JOIN 
                        story_files AS sf ON s.id = sf.story_id 
                    LEFT JOIN 
                        file_uploads AS f ON sf.file_id = f.id
                    LEFT JOIN 
                        file_votes AS fv ON f.id = fv.file_id
                    LEFT JOIN 
                        file_comments AS fc ON f.id = fc.file_id
                    WHERE 
                        s.story_text LIKE CONCAT('%', @search, '%') OR 
                        u.username = @search 
                    GROUP BY 
                        s.id, u.id, u.username, s.story_text, s.date, 
                        sm.title, sm.description, sm.image_url,
                        f.id, f.file_name, f.is_public, f.is_folder, f.shared_with, 
                        f.upload_date, u.username, f.user_id
                    ORDER BY 
                        s.id DESC;"
                    : @"SELECT 
                        s.id, 
                        u.id, 
                        u.username, 
                        s.story_text, 
                        s.date,
                        COUNT(CASE WHEN sv.upvote = 1 THEN 1 ELSE NULL END) AS upvotes,
                        COUNT(CASE WHEN sv.downvote = 1 THEN 1 ELSE NULL END) AS downvotes,
                        COUNT(sc.id) AS comments_count,
                        sm.title, 
                        sm.description, 
                        sm.image_url,
                        f.id AS file_id, 
                        f.file_name, 
                        f.is_public, 
                        f.is_folder, 
                        f.shared_with, 
                        COALESCE(SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END), 0) AS file_upvotes,
                        COALESCE(SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END), 0) AS file_downvotes,
                        COUNT(fc.id) AS file_comment_count, 
                        f.upload_date AS file_date, 
                        u.username AS file_username, 
                        f.user_id AS file_user_id
                    FROM 
                        stories AS s 
                    JOIN 
                        users AS u ON s.user_id = u.id 
                    LEFT JOIN 
                        story_votes AS sv ON s.id = sv.story_id 
                    LEFT JOIN 
                        story_comments AS sc ON s.id = sc.story_id 
                    LEFT JOIN 
                        story_metadata AS sm ON s.id = sm.story_id 
                    LEFT JOIN 
                        story_files AS sf ON s.id = sf.story_id 
                    LEFT JOIN 
                        file_uploads AS f ON sf.file_id = f.id
                    LEFT JOIN 
                        file_votes AS fv ON f.id = fv.file_id
                    LEFT JOIN 
                        file_comments AS fc ON f.id = fc.file_id
                    GROUP BY 
                        s.id, u.id, u.username, s.story_text, s.date, 
                        sm.title, sm.description, sm.image_url,
                        f.id, f.file_name, f.is_public, f.is_folder, f.shared_with, 
                        f.upload_date, u.username, f.user_id
                    ORDER BY 
                        s.id DESC;";

                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        if (search != null)
                        {
                            cmd.Parameters.AddWithValue("@search", search);
                        }

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var stories = new Dictionary<int, Story>();

                            while (await rdr.ReadAsync())
                            {
                                int storyId = rdr.GetInt32(0);
                                if (!stories.ContainsKey(storyId))
                                {
                                    var story = new Story
                                    {
                                        Id = storyId,
                                        User = new User(rdr.GetInt32(1), rdr.GetString(2), null),
                                        StoryText = rdr.GetString(3),
                                        Date = rdr.GetDateTime(4),
                                        Upvotes = rdr.IsDBNull(rdr.GetOrdinal("upvotes")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("upvotes")),
                                        Downvotes = rdr.IsDBNull(rdr.GetOrdinal("downvotes")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("downvotes")),
                                        CommentsCount = rdr.IsDBNull(rdr.GetOrdinal("comments_count")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("comments_count")),
                                        Metadata = new MetadataDto
                                        {
                                            Title = rdr.IsDBNull(rdr.GetOrdinal("title")) ? null : rdr.GetString(rdr.GetOrdinal("title")),
                                            Description = rdr.IsDBNull(rdr.GetOrdinal("description")) ? null : rdr.GetString(rdr.GetOrdinal("description")),
                                            ImageUrl = rdr.IsDBNull(rdr.GetOrdinal("image_url")) ? null : rdr.GetString(rdr.GetOrdinal("image_url"))
                                        },
                                        StoryFiles = new List<FileEntry>()
                                    };

                                    stories.Add(storyId, story);
                                }

                                if (!rdr.IsDBNull(rdr.GetOrdinal("file_id"))) // Check if there is a file
                                {
                                    var fileEntry = new FileEntry
                                    {
                                        Id = rdr.GetInt32(rdr.GetOrdinal("file_id")),
                                        Name = rdr.GetString(rdr.GetOrdinal("file_name")),
                                        Visibility = rdr.GetBoolean(rdr.GetOrdinal("is_public")) ? "Public" : "Private",
                                        SharedWith = rdr.IsDBNull(rdr.GetOrdinal("shared_with")) ? null : rdr.GetString(rdr.GetOrdinal("shared_with")),
                                        Username = rdr.IsDBNull(rdr.GetOrdinal("file_username")) ? null : rdr.GetString(rdr.GetOrdinal("file_username")),
                                        UserId = rdr.GetInt32(rdr.GetOrdinal("file_user_id")),
                                        IsFolder = rdr.GetBoolean(rdr.GetOrdinal("is_folder")),
                                        Upvotes = rdr.IsDBNull(rdr.GetOrdinal("file_upvotes")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("file_upvotes")),
                                        Downvotes = rdr.IsDBNull(rdr.GetOrdinal("file_downvotes")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("file_downvotes")),
                                        CommentCount = rdr.IsDBNull(rdr.GetOrdinal("file_comment_count")) ? 0 : rdr.GetInt32(rdr.GetOrdinal("file_comment_count")),
                                        Date = rdr.GetDateTime(rdr.GetOrdinal("file_date"))
                                    };

                                    stories[storyId].StoryFiles!.Add(fileEntry);
                                }
                            }

                            return Ok(stories.Values.ToList());
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching stories.");
                return StatusCode(500, "An error occurred while fetching stories.");
            }
        }




        [HttpPost("/Social/Post-Story/", Name = "PostStory")]
        public async Task<IActionResult> PostStory([FromBody] StoryRequest story)
        {
            _logger.LogInformation($"POST /Social/Post-Story/ for user: {story.user.Id} with #of attached files : {story.story.StoryFiles?.Count}");
            try
            {
                string sql = @"INSERT INTO stories (user_id, story_text) VALUES (@userId, @storyText);"; 

                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@userId", story.user.Id);
                        cmd.Parameters.AddWithValue("@storyText", story.story.StoryText);
                        if (story.story.FileId != null && story.story.FileId != 0)
                        {
                            cmd.Parameters.AddWithValue("@fileId", story.story.FileId);
                        }

                        int rowsAffected = await cmd.ExecuteNonQueryAsync();

                        if (rowsAffected == 1)
                        {
                            // Fetch the last inserted ID
                            int storyId = (int)(cmd.LastInsertedId);

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


        [HttpPost("/Social/{storyId}/Comments", Name = "GetSocialComments")]
        public async Task<IActionResult> GetSocialComments([FromBody] User? user, int storyId)
        {
            _logger.LogInformation($"/POST /Social/{storyId}/Comments (for user : {user!.Id})");
            try
            {
                string sql = @"SELECT 
                          sc.id, sc.story_id, sc.user_id, u.username, sc.text, 
                          COUNT(CASE WHEN svc.upvote = 1 THEN 1 ELSE NULL END) AS upvotes,
                          COUNT(CASE WHEN svc.downvote = 1 THEN 1 ELSE NULL END) AS downvotes
                       FROM 
                          story_comments AS sc 
                       JOIN 
                          users AS u ON sc.user_id = u.id 
                       LEFT JOIN 
                          story_comment_votes AS svc ON sc.id = svc.comment_id 
                       WHERE 
                          sc.story_id = @storyId
                       GROUP BY 
                          sc.id, sc.story_id, sc.user_id, u.username, sc.text;";

                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (var cmd = new MySqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@storyId", storyId);

                        using (var rdr = await cmd.ExecuteReaderAsync())
                        {
                            var comments = new List<StoryComment>();

                            while (await rdr.ReadAsync())
                            {
                                var comment = new StoryComment
                                {
                                    Id = rdr.GetInt32(0),
                                    StoryId = rdr.GetInt32(1),
                                    UserId = rdr.GetInt32(2),
                                    Username = rdr.GetString(3),
                                    Text = rdr.GetString(4),
                                    Upvotes = rdr.GetInt32(5),
                                    Downvotes = rdr.GetInt32(6)
                                };

                                comments.Add(comment);
                            }

                            return Ok(comments);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while fetching comments.");
                return StatusCode(500, "An error occurred while fetching comments.");
            }
        }
        [HttpPost("/Social/Story/Upvote", Name = "UpvoteSocialStory")]
        public async Task<IActionResult> UpvoteSocialStory([FromBody] StoryVoteRequest request)
        {
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO story_votes (story_id, user_id, upvote, downvote) VALUES (@storyId, @userId, @upvote, 0) ON DUPLICATE KEY UPDATE upvote = @upvote, downvote = 0", connection);
                    command.Parameters.AddWithValue("@storyId", request.StoryId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@upvote", request.Upvote);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Story upvoted successfully.");
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
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO story_votes (story_id, user_id, upvote, downvote) VALUES (@storyId, @userId, 0, @downvote) ON DUPLICATE KEY UPDATE upvote = 0, downvote = @downvote", connection);
                    command.Parameters.AddWithValue("@storyId", request.StoryId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@downvote", request.Downvote);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Story downvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while downvoting the story.");
                return StatusCode(500, "An error occurred while downvoting the story.");
            }
        }

        [HttpPost("/Social/Comment/Upvote", Name = "UpvoteSocialComment")]
        public async Task<IActionResult> UpvoteComment([FromBody] CommentVoteRequest request)
        {
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO story_comment_votes (comment_id, user_id, upvote, downvote) VALUES (@commentId, @userId, @upvote, 0) ON DUPLICATE KEY UPDATE upvote = @upvote, downvote = 0", connection);
                    command.Parameters.AddWithValue("@commentId", request.CommentId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@upvote", request.Upvote);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Comment upvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while upvoting the comment.");
                return StatusCode(500, "An error occurred while upvoting the comment.");
            }
        }

        [HttpPost("/Social/Comment/Downvote", Name = "DownvoteSocialComment")]
        public async Task<IActionResult> DownvoteSocialComment([FromBody] CommentVoteRequest request)
        {
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO story_comment_votes (comment_id, user_id, upvote, downvote) VALUES (@commentId, @userId, 0, @downvote) ON DUPLICATE KEY UPDATE upvote = 0, downvote = @downvote", connection);
                    command.Parameters.AddWithValue("@commentId", request.CommentId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@downvote", request.Downvote);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Comment downvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while downvoting the comment.");
                return StatusCode(500, "An error occurred while downvoting the comment.");
            }
        }

        [HttpPost("/Social/GetMetadata")]
        public async Task<IActionResult> GetMetadata([FromBody] MetadataRequest request, int? storyId)
        {
            try
            {
                _logger.LogInformation($"Getting metadata for user : {request.User.Id} for url: {request.Url} for storyId: {storyId}");
                var metadata = await FetchMetadataAsync(request.Url);

                if(storyId != null && storyId != 0)
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
            } catch
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
