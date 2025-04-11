using FirebaseAdmin.Messaging;
using maxhanna.Server.Controllers.DataContracts.Favourite;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class FavouriteController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;

		public FavouriteController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Favourite", Name = "GetFavourites")]
		public async Task<IActionResult> Get([FromBody] GetFavouritesRequest request)
		{  
			string sql = $@"
				SELECT  
            f.id,
            f.url, 
            f.image_url, 
            f.created_by, 
            f.creation_date, 
            f.modified_by, 
            f.modification_date,
            f.last_added_date,
            f.name,
            COUNT(fs.user_id) AS user_count
        FROM favourites f
        LEFT JOIN favourites_selected fs ON f.id = fs.favourite_id
        WHERE 1=1  
            {(string.IsNullOrEmpty(request.Search) ? "" : " AND (url LIKE CONCAT('%', @Search, '%') OR name LIKE CONCAT('%', @Search, '%')) ")}
				GROUP BY f.id, f.url, f.image_url, f.created_by, f.creation_date, f.modified_by, f.modification_date, f.last_added_date, f.name  
        ORDER BY {(string.IsNullOrEmpty(request.Search) ? "url, creation_date" : "creation_date")} DESC
				LIMIT @PageSize OFFSET @Offset;";
			int offset = (request.Page - 1) * request.PageSize;

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
						cmd.Parameters.AddWithValue("@PageSize", request.PageSize);
						cmd.Parameters.AddWithValue("@Offset", offset);
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var favourites = new List<Favourite>();

							int idIndex = rdr.GetOrdinal("id");
							int urlIndex = rdr.GetOrdinal("url");
							int imageUrlIndex = rdr.GetOrdinal("image_url");
							int userCountIndex = rdr.GetOrdinal("user_count");
							int createdByIndex = rdr.GetOrdinal("created_by");
							int creationDateIndex = rdr.GetOrdinal("creation_date");
							int modifiedByIndex = rdr.GetOrdinal("modified_by");
							int modificationDateIndex = rdr.GetOrdinal("modification_date");
							int lastAddedDateIndex = rdr.GetOrdinal("last_added_date");
							int nameIndex = rdr.GetOrdinal("name");

							while (await rdr.ReadAsync())
							{
								favourites.Add(new Favourite(
										id: rdr.GetInt32(idIndex),
										url: rdr.GetString(urlIndex),
										name: rdr.IsDBNull(nameIndex) ? null : rdr.GetString(nameIndex),
										imageUrl: rdr.IsDBNull(imageUrlIndex) ? null : rdr.GetString(imageUrlIndex),
										userCount: rdr.IsDBNull(userCountIndex) ? 0 : rdr.GetInt32(userCountIndex),
										createdBy: rdr.IsDBNull(createdByIndex) ? null : rdr.GetInt32(createdByIndex),
										creationDate: rdr.GetDateTime(creationDateIndex),
										modifiedBy: rdr.IsDBNull(modifiedByIndex) ? null : rdr.GetInt32(modifiedByIndex),
										modificationDate: rdr.GetDateTime(modificationDateIndex),
										lastAddedDate: rdr.GetDateTime(lastAddedDateIndex)
								));
							}

							return Ok(new
							{
								Items = favourites,
								Page = request.Page,
								PageSize = request.PageSize, 
							});
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching favourites. " + ex.Message, null, "FAV", true);
				return StatusCode(500, "An error occurred while fetching favourites.");
			}
		}

		[HttpPut("/Favourite", Name = "UpsertFavourite")]
		public async Task<IActionResult> UpsertFavourite([FromBody] FavouriteUpdateRequest request)
		{ 
			if (request.Id == 0) request.Id = null;

			string checkSql = request.Id != null ? "SELECT id FROM favourites WHERE id = @Id LIMIT 1;" : "SELECT id FROM favourites WHERE url = @Url LIMIT 1;";
			string insertSql = @"
        INSERT INTO favourites (url, image_url, created_by, creation_date, modified_by, modification_date, name, last_added_date)
        VALUES (@Url, @ImageUrl, @CreatedBy, UTC_TIMESTAMP(), @ModifiedBy, UTC_TIMESTAMP(), @Name, UTC_TIMESTAMP());
        SELECT LAST_INSERT_ID();";
			string updateSql = $@"
        UPDATE favourites
        SET url = @Url, 
						image_url = @ImageUrl, 
            name = @Name, 
            modified_by = @ModifiedBy, 
            modification_date = UTC_TIMESTAMP(),
            last_added_date = UTC_TIMESTAMP()
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
				_ = _log.Db("An error occurred while upserting favourite. " + ex.Message, request.CreatedBy, "FAV", true);
				return StatusCode(500, new { Message = "An error occurred while upserting favourite." });
			}
		}



		[HttpPost("/Favourite/Add", Name = "AddFavourite")]
		public async Task<IActionResult> AddFavourite([FromBody] AddFavouriteRequest request)
		{ 
			string sql = @"
			UPDATE maxhanna.favourites SET last_added_date = UTC_TIMESTAMP() WHERE id = @fav_id LIMIT 1;
			INSERT INTO maxhanna.favourites_selected (favourite_id, user_id) VALUES (@fav_id, @user_id);";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@fav_id", request.FavouriteId);
						cmd.Parameters.AddWithValue("@user_id", request.UserId);

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
				_ = _log.Db("An error occurred while adding favourite. " + ex.Message, request.UserId, "FAV", true);
				return StatusCode(500, "An error occurred while adding favourite.");
			}
		}


		[HttpPost("/Favourite/Remove", Name = "RemoveFavourite")]
		public async Task<IActionResult> RemoveFavourite([FromBody] AddFavouriteRequest request)
		{ 
			string sql = @"DELETE FROM favourites_selected WHERE favourite_id = @fav_id AND user_id = @user_id LIMIT 1;";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@fav_id", request.FavouriteId);
						cmd.Parameters.AddWithValue("@user_id", request.UserId);

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
				_ = _log.Db("An error occurred while removing favourite. " + ex.Message, request.UserId, "FAV", true);
				return StatusCode(500, "An error occurred while removing favourite.");
			}
		}

		[HttpPost("/Favourite/Delete", Name = "DeleteFavourite")]
		public async Task<IActionResult> DeleteFavourite([FromBody] AddFavouriteRequest request)
		{ 
			string sql = @"DELETE FROM favourites WHERE id = @fav_id AND created_by = @user_id LIMIT 1;";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@fav_id", request.FavouriteId);
						cmd.Parameters.AddWithValue("@user_id", request.UserId);

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
				_ = _log.Db("An error occurred while removing favourite. " + ex.Message, request.UserId, "FAV", true);
				return StatusCode(500, "An error occurred while removing favourite.");
			}
		}

		[HttpPost("/Favourite/User", Name = "GetUserFavourites")]
		public async Task<IActionResult> GetUserFavourites([FromBody] GetUserFavouritesRequest request)
		{ 
			string sql = @"
				SELECT  
						f.id,
						f.url, 
						f.image_url, 
						f.created_by, 
						f.creation_date, 
						f.modified_by, 
						f.modification_date,
						f.last_added_date,
						f.name,
						COUNT(fs.user_id) AS user_count
				FROM favourites f
				LEFT JOIN favourites_selected fs ON f.id = fs.favourite_id
				WHERE f.id IN (SELECT favourite_id FROM favourites_selected WHERE user_id = @UserId)
				GROUP BY f.id, f.url, f.image_url, f.created_by, f.creation_date, f.modified_by, f.modification_date, f.last_added_date, f.name
				ORDER BY f.name, f.modification_date, f.creation_date DESC;";

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
							int userCountIndex = rdr.GetOrdinal("user_count");
							int createdByIndex = rdr.GetOrdinal("created_by");
							int creationDateIndex = rdr.GetOrdinal("creation_date");
							int modifiedByIndex = rdr.GetOrdinal("modified_by");
							int modificationDateIndex = rdr.GetOrdinal("modification_date");
							int lastAddedDateIndex = rdr.GetOrdinal("last_added_date");
							int nameIndex = rdr.GetOrdinal("name");

							while (await rdr.ReadAsync())
							{
								favourites.Add(new Favourite(
										id: rdr.GetInt32(idIndex),
										url: rdr.GetString(urlIndex),
										name: rdr.IsDBNull(nameIndex) ? null : rdr.GetString(nameIndex),
										imageUrl: rdr.IsDBNull(imageUrlIndex) ? null : rdr.GetString(imageUrlIndex),
										userCount: rdr.IsDBNull(userCountIndex) ? 0 : rdr.GetInt32(userCountIndex),
										createdBy: rdr.IsDBNull(createdByIndex) ? null : rdr.GetInt32(createdByIndex),
										creationDate: rdr.GetDateTime(creationDateIndex),
										modifiedBy: rdr.IsDBNull(modifiedByIndex) ? null : rdr.GetInt32(modifiedByIndex),
										modificationDate: rdr.GetDateTime(modificationDateIndex),
										lastAddedDate: rdr.GetDateTime(lastAddedDateIndex)
								));
							}

							return Ok(favourites);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching user favourites. " + ex.Message, request.UserId, "FAV", true);
				return StatusCode(500, "An error occurred while fetching user favourites.");
			}
		}
	}
}
