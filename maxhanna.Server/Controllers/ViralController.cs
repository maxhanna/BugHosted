using maxhanna.Server.Controllers.DataContracts.Viral;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ViralController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly string _connectionString;

        public ViralController(IConfiguration config)
        {
            _config = config;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        }

        [HttpPost("/Viral/Create", Name = "CreateVirus")]
        public async Task<IActionResult> CreateVirus([FromBody] ViralEntity entity)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                string sql = @"INSERT INTO viral_entity (user_id, name, coordsX, coordsY, size, color, map, speed) VALUES (@UserId, @Name, @CoordsX, @CoordsY, @Size, @Color, @Map, @Speed); SELECT LAST_INSERT_ID();";
                using (var command = new MySqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@UserId", entity.UserId);
                    command.Parameters.AddWithValue("@Name", entity.Name ?? "");
                    command.Parameters.AddWithValue("@CoordsX", entity.CoordsX);
                    command.Parameters.AddWithValue("@CoordsY", entity.CoordsY);
                    command.Parameters.AddWithValue("@Size", entity.Size);
                    command.Parameters.AddWithValue("@Color", entity.Color ?? "");
                    command.Parameters.AddWithValue("@Map", entity.Map ?? "");
                    command.Parameters.AddWithValue("@Speed", entity.Speed);
                    var id = await command.ExecuteScalarAsync();
                    return Ok(new { id });
                }
            }
        }

        [HttpPost("/Viral/ConsumeObject", Name = "ConsumeObject")]
        public async Task<IActionResult> ConsumeObject([FromBody] ViralConsumedObject consumed)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                string sql = @"INSERT INTO viral_consumed_object (viral_id, object_type, object_id, growth_value) VALUES (@ViralId, @ObjectType, @ObjectId, @GrowthValue);";
                using (var command = new MySqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@ViralId", consumed.ViralId);
                    command.Parameters.AddWithValue("@ObjectType", consumed.ObjectType ?? "");
                    command.Parameters.AddWithValue("@ObjectId", consumed.ObjectId);
                    command.Parameters.AddWithValue("@GrowthValue", consumed.GrowthValue);
                    await command.ExecuteNonQueryAsync();
                }
                // Update virus size
                string updateSql = @"UPDATE viral_entity SET size = size + @GrowthValue WHERE id = @ViralId;";
                using (var updateCmd = new MySqlCommand(updateSql, connection))
                {
                    updateCmd.Parameters.AddWithValue("@GrowthValue", consumed.GrowthValue);
                    updateCmd.Parameters.AddWithValue("@ViralId", consumed.ViralId);
                    await updateCmd.ExecuteNonQueryAsync();
                }
                return Ok();
            }
        }

        [HttpPost("/Viral/UpdateEvent", Name = "UpdateEvent")]
        public async Task<IActionResult> UpdateEvent([FromBody] ViralEvent viralEvent)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                string sql = @"INSERT INTO viral_event (viral_id, event_type, map, data) VALUES (@ViralId, @EventType, @Map, @Data);";
                using (var command = new MySqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@ViralId", viralEvent.ViralId);
                    command.Parameters.AddWithValue("@EventType", viralEvent.EventType ?? "");
                    command.Parameters.AddWithValue("@Map", viralEvent.Map ?? "");
                    command.Parameters.AddWithValue("@Data", System.Text.Json.JsonSerializer.Serialize(viralEvent.Data ?? new Dictionary<string, string>()));
                    await command.ExecuteNonQueryAsync();
                }
                return Ok();
            }
        }

        [HttpPost("/Viral/GetState", Name = "GetViralState")]
        public async Task<IActionResult> GetViralState([FromBody] int userId)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                string sql = @"SELECT * FROM viral_entity WHERE user_id = @UserId;";
                using (var command = new MySqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@UserId", userId);
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        if (await reader.ReadAsync())
                        {
                            var entity = new ViralEntity
                            {
                                Id = reader.GetInt32("id"),
                                UserId = reader.GetInt32("user_id"),
                                Name = reader.GetString("name"),
                                CoordsX = reader.GetInt32("coordsX"),
                                CoordsY = reader.GetInt32("coordsY"),
                                Size = reader.GetInt32("size"),
                                Color = reader.GetString("color"),
                                Map = reader.GetString("map"),
                                Speed = reader.GetInt32("speed"),
                                Created = reader.GetDateTime("created")
                            };
                            return Ok(entity);
                        }
                    }
                }
                // If not found, create a new virus and return it
                string insertSql = @"INSERT INTO viral_entity (user_id, name, coordsX, coordsY, size, color, map, speed) VALUES (@UserId, @Name, @CoordsX, @CoordsY, @Size, @Color, @Map, @Speed); SELECT LAST_INSERT_ID();";
                using (var insertCmd = new MySqlCommand(insertSql, connection))
                {
                    insertCmd.Parameters.AddWithValue("@UserId", userId);
                    insertCmd.Parameters.AddWithValue("@Name", "Virus" + userId);
                    insertCmd.Parameters.AddWithValue("@CoordsX", 100);
                    insertCmd.Parameters.AddWithValue("@CoordsY", 100);
                    insertCmd.Parameters.AddWithValue("@Size", 20);
                    insertCmd.Parameters.AddWithValue("@Color", "#e91e63");
                    insertCmd.Parameters.AddWithValue("@Map", "default");
                    insertCmd.Parameters.AddWithValue("@Speed", 1);
                    var newId = Convert.ToInt32(await insertCmd.ExecuteScalarAsync());
                    // Fetch and return the newly created virus
                    string fetchSql = @"SELECT * FROM viral_entity WHERE id = @Id;";
                    using (var fetchCmd = new MySqlCommand(fetchSql, connection))
                    {
                        fetchCmd.Parameters.AddWithValue("@Id", newId);
                        using (var reader = await fetchCmd.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                var entity = new ViralEntity
                                {
                                    Id = reader.GetInt32("id"),
                                    UserId = reader.GetInt32("user_id"),
                                    Name = reader.GetString("name"),
                                    CoordsX = reader.GetInt32("coordsX"),
                                    CoordsY = reader.GetInt32("coordsY"),
                                    Size = reader.GetInt32("size"),
                                    Color = reader.GetString("color"),
                                    Map = reader.GetString("map"),
                                    Speed = reader.GetInt32("speed"),
                                    Created = reader.GetDateTime("created")
                                };
                                return Ok(entity);
                            }
                        }
                    }
                }
                // Fallback: if something goes wrong, return Ok(null)
                return Ok(null);
            }
        }

        [HttpPost("/Viral/SyncMultiplayer", Name = "SyncMultiplayer")]
        public async Task<IActionResult> SyncMultiplayer([FromBody] MultiplayerSyncRequest req)
        {
            if (string.IsNullOrEmpty(req.Map))
                return BadRequest("The map field is required.");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                // Update virus position for this user
                string updateSql = @"UPDATE viral_entity SET coordsX = @X, coordsY = @Y WHERE user_id = @UserId AND map = @Map;";
                using (var updateCmd = new MySqlCommand(updateSql, connection))
                {
                    updateCmd.Parameters.AddWithValue("@X", req.Position.X);
                    updateCmd.Parameters.AddWithValue("@Y", req.Position.Y);
                    updateCmd.Parameters.AddWithValue("@UserId", req.UserId);
                    updateCmd.Parameters.AddWithValue("@Map", req.Map);
                    await updateCmd.ExecuteNonQueryAsync();
                }
                // Fetch all viruses for this map
                var entities = new List<ViralEntity>();
                string sql = @"SELECT * FROM viral_entity WHERE map = @Map;";
                using (var command = new MySqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@Map", req.Map);
                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            entities.Add(new ViralEntity
                            {
                                Id = reader.GetInt32("id"),
                                UserId = reader.GetInt32("user_id"),
                                Name = reader.GetString("name"),
                                CoordsX = reader.GetInt32("coordsX"),
                                CoordsY = reader.GetInt32("coordsY"),
                                Size = reader.GetInt32("size"),
                                Color = reader.GetString("color"),
                                Map = reader.GetString("map"),
                                Speed = reader.GetInt32("speed"),
                                Created = reader.GetDateTime("created")
                            });
                        }
                    }
                }
                // Also fetch events for the map
                var events = new List<ViralEvent>();
                string eventSql = @"SELECT * FROM viral_event WHERE map = @Map;";
                using (var eventCmd = new MySqlCommand(eventSql, connection))
                {
                    eventCmd.Parameters.AddWithValue("@Map", req.Map);
                    using (var reader = await eventCmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            events.Add(new ViralEvent
                            {
                                Id = reader.GetInt32("id"),
                                ViralId = reader.GetInt32("viral_id"),
                                EventType = reader.GetString("event_type"),
                                Map = reader.GetString("map"),
                                Data = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, string>>(reader.GetString("data")),
                                Timestamp = reader.GetDateTime("timestamp")
                            });
                        }
                    }
                }
                return Ok(new { entities, events });
            }
        }
    }
    public class MultiplayerSyncRequest
    {
        public string Map { get; set; } = "default";
        public int UserId { get; set; }
        public Position Position { get; set; } = new Position();
    }

    public class Position
    {
        public int X { get; set; }
        public int Y { get; set; }
    }

}
