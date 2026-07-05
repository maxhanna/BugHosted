using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Microsoft.Extensions.Configuration;

public class RecipeDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Ingredients { get; set; } = new();
    public List<string> Instructions { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<int> ImageFileIds { get; set; } = new();
    public string CreatedBy { get; set; } = "Community cook";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class RecipeCreateRequest
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Ingredients { get; set; } = new();
    public List<string> Instructions { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<int> ImageFileIds { get; set; } = new();
}

[ApiController]
[Route("[controller]")]
public class RecipeController : ControllerBase
{
    private readonly string _connectionString;

    public RecipeController(IConfiguration configuration)
    {
        _connectionString = configuration.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<RecipeDto>>> Get([FromQuery] string? search)
    {
        await EnsureSchemaAsync();

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        var query = "SELECT id, name, description, ingredients, instructions, tags, image_file_ids, created_by, created_at FROM recipes";
        var parameters = new List<MySqlParameter>();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query += " WHERE LOWER(name) LIKE @term OR LOWER(description) LIKE @term OR LOWER(ingredients) LIKE @term OR LOWER(tags) LIKE @term OR LOWER(instructions) LIKE @term";
            parameters.Add(new MySqlParameter("@term", $"%{term.ToLowerInvariant()}%"));
        }

        query += " ORDER BY created_at DESC";

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
                Name = reader.GetString(reader.GetOrdinal("name")),
                Description = reader.IsDBNull(reader.GetOrdinal("description")) ? string.Empty : reader.GetString(reader.GetOrdinal("description")),
                Ingredients = ParseList(reader, "ingredients"),
                Instructions = ParseList(reader, "instructions"),
                Tags = ParseList(reader, "tags"),
                ImageFileIds = ParseIntList(reader, "image_file_ids"),
                CreatedBy = reader.IsDBNull(reader.GetOrdinal("created_by")) ? "Community cook" : reader.GetString(reader.GetOrdinal("created_by")),
                CreatedAt = reader.GetDateTime(reader.GetOrdinal("created_at"))
            });
        }

        return Ok(recipes);
    }

    [HttpPost]
    public async Task<ActionResult<RecipeDto>> Create([FromBody] RecipeCreateRequest request)
    {
        await EnsureSchemaAsync();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Recipe name is required.");
        }

        var recipe = new RecipeDto
        {
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            Ingredients = request.Ingredients.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            Instructions = request.Instructions.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            Tags = request.Tags.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList(),
            ImageFileIds = request.ImageFileIds.Where(x => x > 0).ToList(),
            CreatedAt = DateTime.UtcNow
        };

        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        const string query = @"
            INSERT INTO recipes (name, description, ingredients, instructions, tags, image_file_ids, created_by, created_at)
            VALUES (@name, @description, @ingredients, @instructions, @tags, @imageFileIds, @createdBy, @createdAt);
            SELECT LAST_INSERT_ID();";

        await using var command = new MySqlCommand(query, connection);
        command.Parameters.AddWithValue("@name", recipe.Name);
        command.Parameters.AddWithValue("@description", recipe.Description);
        command.Parameters.AddWithValue("@ingredients", SerializeList(recipe.Ingredients));
        command.Parameters.AddWithValue("@instructions", SerializeList(recipe.Instructions));
        command.Parameters.AddWithValue("@tags", SerializeList(recipe.Tags));
        command.Parameters.AddWithValue("@imageFileIds", SerializeList(recipe.ImageFileIds.Select(x => x.ToString()).ToList()));
        command.Parameters.AddWithValue("@createdBy", recipe.CreatedBy);
        command.Parameters.AddWithValue("@createdAt", recipe.CreatedAt);

        var insertedId = Convert.ToInt32(await command.ExecuteScalarAsync());
        recipe.Id = insertedId;

        return Ok(recipe);
    }

    private async Task EnsureSchemaAsync()
    {
        await using var connection = new MySqlConnection(_connectionString);
        await connection.OpenAsync();

        await using var command = new MySqlCommand(
            "CREATE TABLE IF NOT EXISTS recipes (id INT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, description TEXT NULL, ingredients TEXT NULL, instructions TEXT NULL, tags TEXT NULL, image_file_ids TEXT NULL, created_by VARCHAR(255) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
            connection);
        await command.ExecuteNonQueryAsync();
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