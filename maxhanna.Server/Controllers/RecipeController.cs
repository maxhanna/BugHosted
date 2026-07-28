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
    public async Task<ActionResult<IEnumerable<RecipeDto>>> Get([FromQuery] string? search)
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var query = @"SELECT r.id, r.user_id, r.name, r.description, r.ingredients, r.instructions, r.tags, r.image_file_ids, r.external_links, r.created_by, r.created_at,
                       COALESCE(AVG(rat.rating), 0) AS average_rating,
                       COUNT(rat.id) AS rating_count
                FROM recipes r
                LEFT JOIN ratings rat ON rat.recipe_id = r.id";
        var parameters = new List<MySqlParameter>();

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
                RatingCount = reader.IsDBNull(reader.GetOrdinal("rating_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("rating_count"))
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

        _ = AppendToSitemapAsync(insertedId, recipe.Name, recipe.Description);

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
                         COUNT(rat.id) AS rating_count
                  FROM recipes r
                  LEFT JOIN ratings rat ON rat.recipe_id = r.id
                  WHERE r.id = @id
                  GROUP BY r.id";
        await using var getCmd = new MySqlCommand(getQuery, connection);
        getCmd.Parameters.AddWithValue("@id", id);
        await using var reader = await getCmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return Ok(new RecipeDto
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
                RatingCount = reader.IsDBNull(reader.GetOrdinal("rating_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("rating_count"))
            });
        }

        _ = AppendToSitemapAsync(id, request.Name.Trim(), request.Description.Trim());

        return NotFound();
    }

    private async Task AppendToSitemapAsync(int recipeId, string name, string description)
    {
        var url = $"https://bughosted.com/recipe/{recipeId}";
        var lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");

        await _sitemapLock.WaitAsync();
        try
        {
            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            XDocument sitemap;

            if (System.IO.File.Exists(_sitemapPath))
            {
                sitemap = XDocument.Load(_sitemapPath);
            }
            else
            {
                sitemap = new XDocument(new XElement(ns + "urlset"));
            }

            var existingEntry = sitemap.Descendants(ns + "url")
                .FirstOrDefault(x => x.Element(ns + "loc")?.Value == url);
            existingEntry?.Remove();

            var urlElement = new XElement(ns + "url",
                new XElement(ns + "loc", url),
                new XElement(ns + "lastmod", lastMod),
                new XElement(ns + "changefreq", "weekly"),
                new XElement(ns + "priority", "0.6")
            );

            sitemap.Root?.Add(urlElement);
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