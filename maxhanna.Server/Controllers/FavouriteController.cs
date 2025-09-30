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
			string orderByClause = request.OrderBy switch
			{
				"popular" => "user_count DESC",
				"name" => "name",
				"url" => "url",
				"visited" => "access_count DESC",
				_ => "creation_date DESC" // default is recent
			};

			string sql = $@"
				SELECT SQL_CALC_FOUND_ROWS
					f.id,
					f.url, 
					f.image_url, 
					f.created_by, 
					f.creation_date, 
					f.modified_by, 
					f.modification_date,
					f.last_added_date,
					f.name,
					f.access_count,
					COUNT(fs.user_id) AS user_count,
					EXISTS (
						SELECT 1 
						FROM favourites_selected fs2 
						WHERE fs2.favourite_id = f.id 
						AND fs2.user_id = @UserId
					) AS is_user_favourite
				FROM favourites f
				LEFT JOIN favourites_selected fs ON f.id = fs.favourite_id
				WHERE 1=1  
					{(string.IsNullOrEmpty(request.Search) ? "" : " AND (f.url LIKE CONCAT('%', @Search, '%') OR f.name LIKE CONCAT('%', @Search, '%'))")}
					{(!request.ShowAll ? " AND f.id IN(SELECT favourite_id FROM favourites_selected WHERE user_id = @UserId)" : "")} 
				GROUP BY f.id, f.url, f.image_url, f.created_by, f.creation_date, f.modified_by, f.modification_date, f.last_added_date, f.name, f.access_count
				ORDER BY {orderByClause}
				LIMIT @PageSize OFFSET @Offset;

				SELECT FOUND_ROWS() AS totalCount; ";

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
						 
						cmd.Parameters.AddWithValue("@UserId", request.UserId ?? 0); 
						cmd.Parameters.AddWithValue("@PageSize", request.PageSize);
						cmd.Parameters.AddWithValue("@Offset", offset);
						//Console.WriteLine(cmd.CommandText);
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							var favourites = new List<Favourite>();
							int totalCount = 0;

							// Process the first result set (favourites)
							while (await rdr.ReadAsync())
							{
								favourites.Add(new Favourite(
									id: rdr.GetInt32("id"),
									url: rdr.GetString("url"),
									name: rdr.IsDBNull(rdr.GetOrdinal("name")) ? null : rdr.GetString("name"),
									imageUrl: rdr.IsDBNull(rdr.GetOrdinal("image_url")) ? null : rdr.GetString("image_url"),
									userCount: rdr.GetInt32("user_count"),
									createdBy: rdr.IsDBNull(rdr.GetOrdinal("created_by")) ? null : rdr.GetInt32("created_by"),
									creationDate: rdr.GetDateTime("creation_date"),
									modifiedBy: rdr.IsDBNull(rdr.GetOrdinal("modified_by")) ? null : rdr.GetInt32("modified_by"),
									modificationDate: rdr.GetDateTime("modification_date"),
									lastAddedDate: rdr.GetDateTime("last_added_date"),
									accessCount: rdr.GetInt32("access_count"),
									isUserFavourite: rdr.GetBoolean("is_user_favourite")
								));
							}

							// Move to the second result set (totalCount)
							if (await rdr.NextResultAsync() && await rdr.ReadAsync())
							{
								totalCount = rdr.GetInt32("totalCount");
							}

							return Ok(new
							{
								Items = favourites,
								Page = request.Page,
								PageSize = request.PageSize,
								TotalCount = totalCount
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

		[HttpPost("/Favourite/Visit", Name = "VisitFavourite")]
		public async Task<IActionResult> VisitFavourite([FromBody] int favouriteId)
		{
			string sql = @"
				UPDATE maxhanna.favourites 
				SET access_count = access_count + 1 
				WHERE id = @fav_id 
				LIMIT 1;
				
				SELECT ROW_COUNT();";
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@fav_id", favouriteId);

						long? rowsAffected = (long?)await cmd.ExecuteScalarAsync();

						if (rowsAffected != null && rowsAffected == 1)
						{
							return Ok(new
							{
								success = true,
								message = "Favourite visit count updated successfully"
							});
						}
						else
						{
							return NotFound(new
							{
								success = false,
								message = "Favourite not found"
							});
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error updating favourite visit count for ID {FavouriteId}. " + ex.Message, outputToConsole: true);
				return StatusCode(500, new
				{
					success = false,
					message = "An error occurred while updating favourite visit count",
					error = ex.Message
				});
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

		[HttpGet("/Favourite/GetFavouritesCount", Name = "GetFavouritesCount")]
		public async Task<IActionResult> GetFavouritesCount([FromQuery] int? userId)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();
					string sql;
					if (userId.HasValue)
						sql = "SELECT COUNT(*) FROM favourites WHERE created_by = @UserId;";
					else
						sql = "SELECT COUNT(*) FROM favourites;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						if (userId.HasValue) cmd.Parameters.AddWithValue("@UserId", userId.Value);
						var result = await cmd.ExecuteScalarAsync();
						int count = 0;
						if (result != null && int.TryParse(result.ToString(), out int tmp)) count = tmp;
						return Ok(count);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error fetching favourites count: " + ex.Message, null, "FAV", true);
				return StatusCode(500, 0);
			}
		}
	}
}
