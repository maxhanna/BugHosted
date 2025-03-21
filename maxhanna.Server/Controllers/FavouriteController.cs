using maxhanna.Server.Controllers.DataContracts.Favourite;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class FavouriteController : ControllerBase
	{
		private readonly ILogger<TodoController> _logger;
		private readonly IConfiguration _config;

		public FavouriteController(ILogger<TodoController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
		}

		[HttpPost("/Favourite", Name = "GetFavourites")]
		public async Task<IActionResult> Get([FromBody] GetFavouritesRequest request)
		{
			_logger.LogInformation($"POST /Favourite (search: {request.Search})");

			string sql = $@"
        SELECT  
						id,
            url, 
            image_url, 
            created_by, 
            creation_date, 
            modified_by, 
            modification_date,
						name
        FROM 
            favourites
        WHERE 1=1  
            {(string.IsNullOrEmpty(request.Search) ? "" : " AND (url LIKE CONCAT('%', @Search, '%') OR name LIKE CONCAT('%', @Search, '%')) ")}
        ORDER BY {(string.IsNullOrEmpty(request.Search) ? "url, creation_date" : "creation_date")} DESC
				LIMIT 20;";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{ 
						if (!string.IsNullOrEmpty(request.Search))
						{
							cmd.Parameters.AddWithValue("@Search", request.Search);
						}

						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var favourites = new List<Favourite>();

							int idIndex = rdr.GetOrdinal("id");
							int urlIndex = rdr.GetOrdinal("url");
							int imageUrlIndex = rdr.GetOrdinal("image_url");
							int createdByIndex = rdr.GetOrdinal("created_by");
							int creationDateIndex = rdr.GetOrdinal("creation_date");
							int modifiedByIndex = rdr.GetOrdinal("modified_by");
							int modificationDateIndex = rdr.GetOrdinal("modification_date");
							int nameIndex = rdr.GetOrdinal("name");

							while (await rdr.ReadAsync())
							{
								favourites.Add(new Favourite(
										id: rdr.GetInt32(idIndex),
										url: rdr.GetString(urlIndex),
										name: rdr.IsDBNull(nameIndex) ? null : rdr.GetString(nameIndex),
										imageUrl: rdr.IsDBNull(imageUrlIndex) ? null : rdr.GetString(imageUrlIndex),
										createdBy: rdr.IsDBNull(createdByIndex) ? null : rdr.GetInt32(createdByIndex),
										creationDate: rdr.GetDateTime(creationDateIndex),
										modifiedBy: rdr.IsDBNull(modifiedByIndex) ? null : rdr.GetInt32(modifiedByIndex),
										modificationDate: rdr.GetDateTime(modificationDateIndex)
								));
							}

							return Ok(favourites);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching favourites.");
				return StatusCode(500, "An error occurred while fetching favourites.");
			}
		}

		[HttpPut("/Favourite", Name = "UpsertFavourite")]
		public async Task<IActionResult> UpsertFavourite([FromBody] FavouriteUpdateRequest request)
		{
			_logger.LogInformation($"PUT /Favourite (url: {request.Url})");
			if (request.Id == 0) request.Id = null;

			string checkSql = request.Id != null ? "SELECT id FROM favourites WHERE id = @Id LIMIT 1;" : "SELECT id FROM favourites WHERE url = @Url LIMIT 1;";
			string insertSql = @"
        INSERT INTO favourites (url, image_url, created_by, creation_date, modified_by, modification_date, name)
        VALUES (@Url, @ImageUrl, @CreatedBy, NOW(), @ModifiedBy, NOW(), @Name);
        SELECT LAST_INSERT_ID();";
			string updateSql = $@"
        UPDATE favourites
        SET url = @Url, 
						image_url = @ImageUrl, 
            name = @Name, 
            modified_by = @ModifiedBy, 
            modification_date = NOW()
        WHERE {(request.Id != null ? "id = @Id" : "url = @Url")};
        SELECT id FROM favourites WHERE {(request.Id != null ? "id = @Id" : "url = @Url")};";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var checkCmd = new MySqlCommand(checkSql, conn))
					{
						checkCmd.Parameters.AddWithValue("@Url", request.Url);
						if (request.Id != null && request.Id != 0)
						{
							checkCmd.Parameters.AddWithValue("@Id", request.Id);
						}
						var result = await checkCmd.ExecuteScalarAsync();

						if (result != null)
						{
							int? insertedId = null;
							using (var updateCmd = new MySqlCommand(updateSql, conn))
							{
								updateCmd.Parameters.AddWithValue("@Url", request.Url);
								if (request.Id != null)
								{ 
									updateCmd.Parameters.AddWithValue("@Id", request.Id);
								}
								updateCmd.Parameters.AddWithValue("@ImageUrl", (object?)request.ImageUrl ?? DBNull.Value);
								updateCmd.Parameters.AddWithValue("@Name", (object?)request.Name ?? DBNull.Value);
								updateCmd.Parameters.AddWithValue("@ModifiedBy", request.CreatedBy);

								insertedId = (int?)await updateCmd.ExecuteScalarAsync();
							}

							string insertSql2 = @"INSERT IGNORE INTO favourites_selected (favourite_id, user_id) VALUES (@fav_id, @user_id);";
							using (var cmd2 = new MySqlCommand(insertSql2, conn))
							{
								cmd2.Parameters.AddWithValue("@fav_id", insertedId);
								cmd2.Parameters.AddWithValue("@user_id", request.CreatedBy);
								cmd2.ExecuteNonQuery();
							}
							return Ok(new { Id = insertedId, Message = "Favourite updated successfully." });
						}
						else
						{
							int? insertedId;
							using (var insertCmd = new MySqlCommand(insertSql, conn))
							{
								insertCmd.Parameters.AddWithValue("@Url", request.Url);
								insertCmd.Parameters.AddWithValue("@ImageUrl", (object?)request.ImageUrl ?? DBNull.Value);
								insertCmd.Parameters.AddWithValue("@CreatedBy", request.CreatedBy);
								insertCmd.Parameters.AddWithValue("@ModifiedBy", request.CreatedBy);
								insertCmd.Parameters.AddWithValue("@Name", (object?)request.Name ?? DBNull.Value);

								insertedId = Convert.ToInt32(await insertCmd.ExecuteScalarAsync());
							}
							string insertSql2 = @"INSERT IGNORE INTO favourites_selected (favourite_id, user_id) VALUES (@fav_id, @user_id);";
							using (var cmd2 = new MySqlCommand(insertSql2, conn))
							{
								cmd2.Parameters.AddWithValue("@fav_id", insertedId);
								cmd2.Parameters.AddWithValue("@user_id", request.CreatedBy);
								cmd2.ExecuteNonQuery();
							}

							return Ok(new { Id = insertedId, Message = "Favourite inserted successfully." });

						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while upserting favourite.");
				return StatusCode(500, "An error occurred while upserting favourite.");
			}
		}



		[HttpPost("/Favourite/Add", Name = "AddFavourite")]
		public async Task<IActionResult> AddFavourite([FromBody] AddFavouriteRequest request)
		{
			_logger.LogInformation($"Post /Favourite/Add (id: {request.FavouriteId})");

			string sql = @"INSERT INTO favourites_selected (favourite_id, user_id) VALUES (@fav_id, @user_id);";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@fav_id", request.FavouriteId);
						cmd.Parameters.AddWithValue("@user_id", request.User.Id);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();
						if (rowsAffected > 0)
						{
							return Ok("Favourite added successfully.");
						}
						else
						{
							return NotFound("Failed to add favourite.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while adding favourite.");
				return StatusCode(500, "An error occurred while adding favourite.");
			}
		}


		[HttpPost("/Favourite/Remove", Name = "RemoveFavourite")]
		public async Task<IActionResult> RemoveFavourite([FromBody] AddFavouriteRequest request)
		{
			_logger.LogInformation($"Post /Favourite/Remove (id: {request.FavouriteId})");

			string sql = @"DELETE FROM favourites_selected WHERE favourite_id = @fav_id AND user_id = @user_id LIMIT 1;";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@fav_id", request.FavouriteId);
						cmd.Parameters.AddWithValue("@user_id", request.User.Id);

						int rowsAffected = await cmd.ExecuteNonQueryAsync();
						if (rowsAffected > 0)
						{
							return Ok("Favourite removed successfully.");
						}
						else
						{
							return NotFound("Failed to removed favourite.");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while removing favourite.");
				return StatusCode(500, "An error occurred while removing favourite.");
			}
		}

		[HttpPost("/Favourite/User", Name = "GetUserFavourites")]
		public async Task<IActionResult> GetUserFavourites([FromBody] GetUserFavouritesRequest request)
		{
			_logger.LogInformation($"POST /Favourite/User (user_id: {request.UserId})");

			string sql = @"
        SELECT 
            f.id,
            f.url, 
            f.image_url, 
            f.created_by, 
            f.creation_date, 
            f.modified_by, 
            f.modification_date,
            f.name
        FROM favourites_selected fs
        JOIN favourites f ON fs.favourite_id = f.id
        WHERE fs.user_id = @UserId
        ORDER BY f.creation_date DESC;";

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", request.UserId);

						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var favourites = new List<Favourite>();

							int idIndex = rdr.GetOrdinal("id");
							int urlIndex = rdr.GetOrdinal("url");
							int imageUrlIndex = rdr.GetOrdinal("image_url");
							int createdByIndex = rdr.GetOrdinal("created_by");
							int creationDateIndex = rdr.GetOrdinal("creation_date");
							int modifiedByIndex = rdr.GetOrdinal("modified_by");
							int modificationDateIndex = rdr.GetOrdinal("modification_date");
							int nameIndex = rdr.GetOrdinal("name");

							while (await rdr.ReadAsync())
							{
								favourites.Add(new Favourite(
										id: rdr.GetInt32(idIndex),
										url: rdr.GetString(urlIndex),
										name: rdr.IsDBNull(nameIndex) ? null : rdr.GetString(nameIndex),
										imageUrl: rdr.IsDBNull(imageUrlIndex) ? null : rdr.GetString(imageUrlIndex),
										createdBy: rdr.IsDBNull(createdByIndex) ? null : rdr.GetInt32(createdByIndex),
										creationDate: rdr.GetDateTime(creationDateIndex),
										modifiedBy: rdr.IsDBNull(modifiedByIndex) ? null : rdr.GetInt32(modifiedByIndex),
										modificationDate: rdr.GetDateTime(modificationDateIndex)
								));
							}

							return Ok(favourites);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "An error occurred while fetching user favourites.");
				return StatusCode(500, "An error occurred while fetching user favourites.");
			}
		}
	}
}
