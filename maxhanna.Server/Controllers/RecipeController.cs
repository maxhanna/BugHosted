using System.Collections.Concurrent;
using System.Xml.Linq;
using maxhanna.Server.Services;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

public class RecipeDto
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Ingredients { get; set; } = new();
    public List<string> Instructions { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<int> ImageFileIds { get; set; } = new();
    public List<string> ExternalLinks { get; set; } = new();
    public string CreatedBy { get; set; } = "Community cook";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public double AverageRating { get; set; }
    public int RatingCount { get; set; }
    public double UserRating { get; set; }
}

public class RecipeCreateRequest
{
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string CreatedBy { get; set; } = string.Empty;
    public List<string> Ingredients { get; set; } = new();
    public List<string> Instructions { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<int> ImageFileIds { get; set; } = new();
    public List<string> ExternalLinks { get; set; } = new();
}

[ApiController]
[Route("[controller]")]
public class RecipeController : ControllerBase
{
    private readonly string _connectionString;
    private readonly Log _log;
    private static readonly SemaphoreSlim _sitemapLock = new(1, 1);
    private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");

    public RecipeController(IConfiguration configuration, Log log)
    {
        _connectionString = configuration.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;
        _log = log;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<RecipeDto>>> Get([FromQuery] string? search, [FromQuery] int? userId = null)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var query = @"SELECT r.id, r.user_id, r.name, r.description, r.ingredients, r.instructions, r.tags, r.image_file_ids, r.external_links, r.created_by, r.created_at,
                       COALESCE(AVG(rat.rating), 0) AS average_rating,
                       COUNT(rat.id) AS rating_count,
                       COALESCE((SELECT rat3.rating FROM ratings rat3 WHERE rat3.recipe_id = r.id AND rat3.user_id = @UserId LIMIT 1), 0) AS user_rating
                FROM recipes r
                LEFT JOIN ratings rat ON rat.recipe_id = r.id";
        var parameters = new List<MySqlParameter> { new MySqlParameter("@UserId", userId ?? 0) };

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query += " WHERE CAST(r.id AS CHAR) LIKE @term OR LOWER(r.name) LIKE @term OR LOWER(r.description) LIKE @term OR LOWER(r.ingredients) LIKE @term OR LOWER(r.tags) LIKE @term OR LOWER(r.instructions) LIKE @term";
            parameters.Add(new MySqlParameter("@term", $"%{term.ToLowerInvariant()}%"));
        }

        query += " GROUP BY r.id ORDER BY r.created_at DESC";

        await using var command = new MySqlCommand(query, connection);
        foreach (var parameter in parameters)
        {
            command.Parameters.Add(parameter);
        }

        await using var reader = await command.ExecuteReaderAsync();
        var recipes = new List<RecipeDto>();
        while (await reader.ReadAsync())
        {
            recipes.Add(new RecipeDto
            {
                Id = reader.GetInt32(reader.GetOrdinal("id")),
                UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
                Name = reader.GetString(reader.GetOrdinal("name")),
                Description = reader.IsDBNull(reader.GetOrdinal("description")) ? string.Empty : reader.GetString(reader.GetOrdinal("description")),
                Ingredients = ParseList(reader, "ingredients"),
                Instructions = ParseList(reader, "instructions"),
                Tags = ParseList(reader, "tags"),
                ImageFileIds = ParseIntList(reader, "image_file_ids"),
                ExternalLinks = ParseList(reader, "external_links"),
                CreatedBy = reader.IsDBNull(reader.GetOrdinal("created_by")) ? "Community cook" : reader.GetString(reader.GetOrdinal("created_by")),
                CreatedAt = reader.GetDateTime(reader.GetOrdinal("created_at")),
                AverageRating = reader.IsDBNull(reader.GetOrdinal("average_rating")) ? 0 : Convert.ToDouble(reader["average_rating"]),
                RatingCount = reader.IsDBNull(reader.GetOrdinal("rating_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("rating_count")),
                UserRating = reader.IsDBNull(reader.GetOrdinal("user_rating")) ? 0 : Convert.ToDouble(reader["user_rating"])
            });
        }

        return Ok(recipes);
    }

    [HttpPost]
    public async Task<ActionResult<RecipeDto>> Create([FromBody] RecipeCreateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Recipe name is required.");
        }

        var recipe = new RecipeDto
        {
            UserId = request.UserId,
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            Ingredients = request.Ingredients.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            Instructions = request.Instructions.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            Tags = request.Tags.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            ImageFileIds = request.ImageFileIds.Where(x => x > 0).ToList(),
            ExternalLinks = request.ExternalLinks.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            CreatedAt = DateTime.UtcNow,
            CreatedBy = request.CreatedBy
        };

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string query = @"
            INSERT INTO recipes (name, description, ingredients, instructions, tags, image_file_ids, external_links, user_id, created_by, created_at)
            VALUES (@name, @description, @ingredients, @instructions, @tags, @imageFileIds, @externalLinks, @userId, @createdBy, @createdAt);
            SELECT LAST_INSERT_ID();";

        await using var command = new MySqlCommand(query, connection);
        command.Parameters.AddWithValue("@name", recipe.Name);
        command.Parameters.AddWithValue("@description", recipe.Description);
        command.Parameters.AddWithValue("@ingredients", SerializeList(recipe.Ingredients));
        command.Parameters.AddWithValue("@instructions", SerializeList(recipe.Instructions));
        command.Parameters.AddWithValue("@tags", SerializeList(recipe.Tags));
        command.Parameters.AddWithValue("@imageFileIds", SerializeList(recipe.ImageFileIds.Select(x => x.ToString()).ToList()));
        command.Parameters.AddWithValue("@externalLinks", SerializeList(recipe.ExternalLinks));
        command.Parameters.AddWithValue("@userId", recipe.UserId);
        command.Parameters.AddWithValue("@createdBy", recipe.CreatedBy);
        command.Parameters.AddWithValue("@createdAt", recipe.CreatedAt);

        var insertedId = Convert.ToInt32(await command.ExecuteScalarAsync());
        recipe.Id = insertedId;

        _ = AppendToSitemapAsync(insertedId, recipe.Name, recipe.Description, recipe.ImageFileIds, recipe.ExternalLinks);

        return Ok(recipe);
    }


    [HttpPut("{id}")]
    public async Task<ActionResult<RecipeDto>> Update(int id, [FromBody] RecipeCreateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Recipe name is required.");
        }

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var ownerQuery = "SELECT user_id FROM recipes WHERE id = @id";
        await using var ownerCmd = new MySqlCommand(ownerQuery, connection);
        ownerCmd.Parameters.AddWithValue("@id", id);
        var ownerResult = await ownerCmd.ExecuteScalarAsync();
        if (ownerResult == null || Convert.ToInt32(ownerResult) != request.UserId)
        {
            return Forbid();
        }

        const string updateQuery = @"
            UPDATE recipes
            SET name = @name, description = @description, ingredients = @ingredients,
                instructions = @instructions, tags = @tags, image_file_ids = @imageFileIds,
                external_links = @externalLinks
            WHERE id = @id";

        await using var updateCmd = new MySqlCommand(updateQuery, connection);
        updateCmd.Parameters.AddWithValue("@id", id);
        updateCmd.Parameters.AddWithValue("@name", request.Name.Trim());
        updateCmd.Parameters.AddWithValue("@description", request.Description.Trim());
        updateCmd.Parameters.AddWithValue("@ingredients", SerializeList(request.Ingredients.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList()));
        updateCmd.Parameters.AddWithValue("@instructions", SerializeList(request.Instructions.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList()));
        updateCmd.Parameters.AddWithValue("@tags", SerializeList(request.Tags.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList()));
        updateCmd.Parameters.AddWithValue("@imageFileIds", SerializeList(request.ImageFileIds.Where(x => x > 0).Select(x => x.ToString()).ToList()));
        updateCmd.Parameters.AddWithValue("@externalLinks", SerializeList(request.ExternalLinks.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList()));

        await updateCmd.ExecuteNonQueryAsync();

        var getQuery = @"SELECT r.id, r.user_id, r.name, r.description, r.ingredients, r.instructions, r.tags, r.image_file_ids, r.external_links, r.created_by, r.created_at,
                         COALESCE(AVG(rat.rating), 0) AS average_rating,
                         COUNT(rat.id) AS rating_count,
                         0 AS user_rating
                  FROM recipes r
                  LEFT JOIN ratings rat ON rat.recipe_id = r.id
                  WHERE r.id = @id
                  GROUP BY r.id";
        await using var getCmd = new MySqlCommand(getQuery, connection);
        getCmd.Parameters.AddWithValue("@id", id);
        await using var reader = await getCmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            var recipeDto = new RecipeDto
            {
                Id = reader.GetInt32(reader.GetOrdinal("id")),
                UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
                Name = reader.GetString(reader.GetOrdinal("name")),
                Description = reader.IsDBNull(reader.GetOrdinal("description")) ? string.Empty : reader.GetString(reader.GetOrdinal("description")),
                Ingredients = ParseList(reader, "ingredients"),
                Instructions = ParseList(reader, "instructions"),
                Tags = ParseList(reader, "tags"),
                ImageFileIds = ParseIntList(reader, "image_file_ids"),
                ExternalLinks = ParseList(reader, "external_links"),
                CreatedBy = reader.IsDBNull(reader.GetOrdinal("created_by")) ? "Community cook" : reader.GetString(reader.GetOrdinal("created_by")),
                CreatedAt = reader.GetDateTime(reader.GetOrdinal("created_at")),
                AverageRating = reader.IsDBNull(reader.GetOrdinal("average_rating")) ? 0 : Convert.ToDouble(reader["average_rating"]),
                RatingCount = reader.IsDBNull(reader.GetOrdinal("rating_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("rating_count")),
                UserRating = reader.IsDBNull(reader.GetOrdinal("user_rating")) ? 0 : Convert.ToDouble(reader["user_rating"])
            };
            // Refresh the sitemap entry on every successful edit so a renamed
            // recipe gets a fresh lastmod (and updated image/video metadata).
            _ = AppendToSitemapAsync(id, recipeDto.Name, recipeDto.Description, recipeDto.ImageFileIds, recipeDto.ExternalLinks);
            return Ok(recipeDto);
        }

        return NotFound();
    }

    private async Task AppendToSitemapAsync(int recipeId, string name, string description, List<int>? imageFileIds = null, List<string>? externalLinks = null)
    {
        var url = $"https://bughosted.com/recipe/{recipeId}";
        var lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

        await _sitemapLock.WaitAsync();
        try
        {
            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            XNamespace imageNs = "http://www.google.com/schemas/sitemap-image/1.1";
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

            // The recipe entries carry image-sitemap metadata (image loc/title/
            // caption), matching the media entries already in the file, plus
            // video-sitemap metadata when the recipe embeds a YouTube video.
            sitemap.Root?.SetAttributeValue(XNamespace.Xmlns + "image", imageNs);
            sitemap.Root?.SetAttributeValue(XNamespace.Xmlns + "video", videoNs);

            var existingEntry = sitemap.Descendants(ns + "url")
                .FirstOrDefault(x => x.Element(ns + "loc")?.Value == url);
            existingEntry?.Remove();

            sitemap.Root?.Add(BuildSitemapUrlElement(url, name, description, lastMod, imageFileIds, externalLinks, ns, imageNs, videoNs));
            sitemap.Save(_sitemapPath);
        }
        catch (Exception ex)
        {
            _ = _log.Db($"Failed to update sitemap for recipe {recipeId}: {ex.Message}", null, "RECIPE", true);
        }
        finally
        {
            _sitemapLock.Release();
        }
    }

    /// <summary>
    /// Build one recipe &lt;url&gt; element with the standard fields plus image
    /// metadata (up to three images) and video metadata (first YouTube link).
    /// Shared by single-entry appends and the full backfill.
    /// </summary>
    private static XElement BuildSitemapUrlElement(string url, string name, string description, string lastMod,
        List<int>? imageFileIds, List<string>? externalLinks,
        XNamespace ns, XNamespace imageNs, XNamespace videoNs)
    {
        var urlElement = new XElement(ns + "url",
            new XElement(ns + "loc", url),
            new XElement(ns + "lastmod", lastMod),
            new XElement(ns + "changefreq", "weekly"),
            new XElement(ns + "priority", "0.6")
        );

        // Attach up to three of the recipe's images; the recipe name and
        // description ride along as the image title/caption so search
        // engines associate the right metadata with the recipe page.
        if (imageFileIds != null)
        {
            foreach (var imageId in imageFileIds.Where(id => id > 0).Take(3))
            {
                urlElement.Add(new XElement(imageNs + "image",
                    new XElement(imageNs + "loc", $"https://bughosted.com/File/{imageId}"),
                    new XElement(imageNs + "title", name),
                    new XElement(imageNs + "caption", description)
                ));
            }
        }

        // When the recipe uses a YouTube video instead of (or alongside)
        // images, attach Google's video-sitemap metadata: YouTube's own
        // thumbnail as the video thumbnail and an embed player_loc so the
        // video can surface in results. The title/description mirror the
        // recipe page, truncated to Google's field limits.
        var videoId = externalLinks?.Select(ExtractYouTubeVideoId).FirstOrDefault(id => !string.IsNullOrEmpty(id));
        if (!string.IsNullOrEmpty(videoId))
        {
            urlElement.Add(new XElement(videoNs + "video",
                new XElement(videoNs + "thumbnail_loc", $"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg"),
                new XElement(videoNs + "title", Truncate(name, 100)),
                new XElement(videoNs + "description", Truncate(description ?? string.Empty, 2048)),
                new XElement(videoNs + "player_loc",
                    new XAttribute("allow_embed", "yes"),
                    $"https://www.youtube.com/embed/{videoId}")
            ));
        }

        return urlElement;
    }

    /// <summary>
    /// One-time backfill: write sitemap entries for every recipe in the DB so
    /// recipes created before the sitemap feature (or before the metadata
    /// work) get indexed. Idempotent — if the sitemap already contains
    /// /recipe/ entries it does nothing, so it is safe to run on every boot.
    /// Writes the whole batch in a single document pass (one load, one save).
    /// </summary>
    public async Task<int> BackfillSitemapAsync()
    {
        await _sitemapLock.WaitAsync();
        try
        {
            if (System.IO.File.Exists(_sitemapPath))
            {
                var existing = XDocument.Load(_sitemapPath);
                if (existing.Descendants().Any(x => x.Name.LocalName == "loc" && x.Value.Contains("/recipe/")))
                {
                    return 0; // already backfilled — nothing to do
                }
            }

            var recipes = new List<RecipeDto>();
            await using (var conn = new MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                const string query = @"SELECT r.id, r.name, r.description, r.image_file_ids, r.external_links
                    FROM recipes r
                    ORDER BY r.id";
                await using var cmd = new MySqlCommand(query, conn);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    recipes.Add(new RecipeDto
                    {
                        Id = reader.GetInt32(reader.GetOrdinal("id")),
                        Name = reader.GetString(reader.GetOrdinal("name")),
                        Description = reader.IsDBNull(reader.GetOrdinal("description")) ? string.Empty : reader.GetString(reader.GetOrdinal("description")),
                        ImageFileIds = ParseIntList(reader, "image_file_ids"),
                        ExternalLinks = ParseList(reader, "external_links"),
                    });
                }
            }

            if (recipes.Count == 0) return 0;

            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            XNamespace imageNs = "http://www.google.com/schemas/sitemap-image/1.1";
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
            sitemap.Root?.SetAttributeValue(XNamespace.Xmlns + "image", imageNs);
            sitemap.Root?.SetAttributeValue(XNamespace.Xmlns + "video", videoNs);

            var lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var written = 0;
            foreach (var r in recipes)
            {
                var url = $"https://bughosted.com/recipe/{r.Id}";
                var existingEntry = sitemap.Descendants(ns + "url")
                    .FirstOrDefault(x => x.Element(ns + "loc")?.Value == url);
                existingEntry?.Remove();
                sitemap.Root?.Add(BuildSitemapUrlElement(url, r.Name, r.Description, lastMod, r.ImageFileIds, r.ExternalLinks, ns, imageNs, videoNs));
                written++;
            }

            sitemap.Save(_sitemapPath);
            _ = _log.Db($"Sitemap backfill: wrote {written} recipe entr(ies).", null, "RECIPE", true);
            return written;
        }
        catch (Exception ex)
        {
            _ = _log.Db($"Sitemap backfill failed: {ex.Message}", null, "RECIPE", true);
            return 0;
        }
        finally
        {
            _sitemapLock.Release();
        }
    }

    /// <summary>
    /// Pull the 11-character video id out of a YouTube link (watch, youtu.be,
    /// embed, or shorts forms), mirroring the client's parseYoutubeId.
    /// </summary>
    private static string? ExtractYouTubeVideoId(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        url = url.Trim();
        if (!url.Contains("://")) url = "https://" + url;
        try
        {
            var uri = new Uri(url);
            var host = uri.Host.StartsWith("www.", StringComparison.OrdinalIgnoreCase)
                ? uri.Host.Substring(4)
                : uri.Host;

            if (host.Equals("youtu.be", StringComparison.OrdinalIgnoreCase))
            {
                var segment = uri.AbsolutePath.Trim('/');
                var id = segment.Split('?')[0].Split('#')[0];
                return System.Text.RegularExpressions.Regex.IsMatch(id, "^[a-zA-Z0-9_-]{11}$") ? id : null;
            }

            var queryMatch = System.Text.RegularExpressions.Regex.Match(uri.Query, "[?&]v=([a-zA-Z0-9_-]{11})");
            if (queryMatch.Success) return queryMatch.Groups[1].Value;

            var embed = System.Text.RegularExpressions.Regex.Match(uri.AbsolutePath, "/embed/([a-zA-Z0-9_-]{11})");
            if (embed.Success) return embed.Groups[1].Value;

            var shorts = System.Text.RegularExpressions.Regex.Match(uri.AbsolutePath, "/shorts/([a-zA-Z0-9_-]{11})");
            if (shorts.Success) return shorts.Groups[1].Value;
        }
        catch { /* not a URL */ }
        return null;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= maxLength ? value : value.Substring(0, maxLength);
    }

    private static List<string> ParseList(MySqlDataReader reader, string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);
        if (reader.IsDBNull(ordinal))
        {
            return new List<string>();
        }

        var raw = reader.GetString(ordinal);
        return string.IsNullOrWhiteSpace(raw)
            ? new List<string>()
            : raw.Split('|').Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
    }

    private static List<int> ParseIntList(MySqlDataReader reader, string columnName)
    {
        var ordinal = reader.GetOrdinal(columnName);
        if (reader.IsDBNull(ordinal))
        {
            return new List<int>();
        }

        var raw = reader.GetString(ordinal);
        return string.IsNullOrWhiteSpace(raw)
            ? new List<int>()
            : raw.Split('|').Where(x => int.TryParse(x, out _)).Select(int.Parse).ToList();
    }

    private static string SerializeList(IReadOnlyCollection<string> values)
    {
        return values.Count == 0 ? string.Empty : string.Join('|', values);
    }
}