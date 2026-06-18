using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class GrandTheftController : ControllerBase
	{
		private readonly IConfiguration _config;
		private const int INACTIVITY_TIMEOUT_SECONDS = 15;

		public GrandTheftController(IConfiguration config)
		{
			_config = config;
		}

		[HttpPost("Save")]
		public async Task<IActionResult> SaveGame([FromBody] GrandTheftSaveRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_saves (user_id, pos_x, pos_z, score, updated_at)
					VALUES (@uid, @px, @pz, @sc, NOW())
					ON DUPLICATE KEY UPDATE pos_x = @px, pos_z = @pz, score = @sc, updated_at = NOW()", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@px", req.PosX);
				cmd.Parameters.AddWithValue("@pz", req.PosZ);
				cmd.Parameters.AddWithValue("@sc", req.Score);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.SaveGame error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpGet("Load/{userId}")]
		public async Task<IActionResult> LoadGame(int userId)
		{
			if (userId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand("SELECT pos_x, pos_z, score FROM maxhanna.grandtheft_saves WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				if (await rdr.ReadAsync())
					return Ok(new { posX = rdr.GetFloat("pos_x"), posZ = rdr.GetFloat("pos_z"), score = rdr.GetInt32("score") });
				return Ok(new { posX = 0f, posZ = 0f, score = 0 });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.LoadGame error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("SubmitScore")]
		public async Task<IActionResult> SubmitScore([FromBody] GrandTheftScoreRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_leaderboard (user_id, score, achieved_at)
					VALUES (@uid, @sc, NOW())", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@sc", req.Score);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.SubmitScore error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpGet("Leaderboard")]
		public async Task<IActionResult> GetLeaderboard()
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
					SELECT u.username, MAX(gl.score) as score
					FROM maxhanna.grandtheft_leaderboard gl
					JOIN maxhanna.users u ON u.id = gl.user_id
					GROUP BY gl.user_id
					ORDER BY score DESC
					LIMIT 20", conn);
				var list = new List<object>();
				using var rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
					list.Add(new { username = rdr.GetString("username"), score = rdr.GetInt32("score") });
				return Ok(list);
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.GetLeaderboard error: {ex.Message}");
				return StatusCode(500, new { error = ex.Message });
			}
		}

		[HttpPost("UpdatePosition")]
		public async Task<IActionResult> UpdatePosition([FromBody] GTUpdatePositionRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// Upsert player state
				using (var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_player_state (user_id, world_id, pos_x, pos_y, pos_z, yaw, pitch, car_yaw, car_speed, health, weapon, last_seen)
					VALUES (@uid, @wid, @px, @py, @pz, @y, @p, @cy, @cs, @h, @w, NOW())
					ON DUPLICATE KEY UPDATE pos_x = @px, pos_y = @py, pos_z = @pz, yaw = @y, pitch = @p, car_yaw = @cy, car_speed = @cs, health = @h, weapon = @w, last_seen = NOW()", conn))
				{
					cmd.Parameters.AddWithValue("@uid", req.UserId);
					cmd.Parameters.AddWithValue("@wid", req.WorldId);
					cmd.Parameters.AddWithValue("@px", req.PosX);
					cmd.Parameters.AddWithValue("@py", req.PosY);
					cmd.Parameters.AddWithValue("@pz", req.PosZ);
					cmd.Parameters.AddWithValue("@y", req.Yaw);
					cmd.Parameters.AddWithValue("@p", req.Pitch);
					cmd.Parameters.AddWithValue("@cy", req.CarYaw);
					cmd.Parameters.AddWithValue("@cs", req.CarSpeed);
					cmd.Parameters.AddWithValue("@h", req.Health);
					cmd.Parameters.AddWithValue("@w", req.Weapon);
					await cmd.ExecuteNonQueryAsync();
				}

				// Return other active players
				var players = new List<object>();
				using (var selCmd = new MySqlCommand(@"
					SELECT ps.user_id, ps.pos_x, ps.pos_y, ps.pos_z, ps.yaw, ps.pitch, ps.car_yaw, ps.car_speed, ps.health, ps.weapon,
					       COALESCE(u.username, CONCAT('Player', ps.user_id)) as username
					FROM maxhanna.grandtheft_player_state ps
					LEFT JOIN maxhanna.users u ON u.id = ps.user_id
					WHERE ps.world_id = @wid2 AND ps.user_id != @uid2 AND ps.last_seen > DATE_SUB(NOW(), INTERVAL @timeout SECOND)", conn))
				{
					selCmd.Parameters.AddWithValue("@wid2", req.WorldId);
					selCmd.Parameters.AddWithValue("@uid2", req.UserId);
					selCmd.Parameters.AddWithValue("@timeout", INACTIVITY_TIMEOUT_SECONDS);
					using var rdr = await selCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
						players.Add(new
						{
							userId = rdr.GetInt32("user_id"),
							posX = rdr.GetFloat("pos_x"),
							posY = rdr.GetFloat("pos_y"),
							posZ = rdr.GetFloat("pos_z"),
							yaw = rdr.GetFloat("yaw"),
							pitch = rdr.GetFloat("pitch"),
							carYaw = rdr.GetFloat("car_yaw"),
							carSpeed = rdr.GetFloat("car_speed"),
							health = rdr.GetInt32("health"),
							weapon = rdr.GetInt32("weapon"),
							username = rdr.GetString("username"),
						});
				}

				// Return recent shots
				var shots = new List<object>();
				using (var shotCmd = new MySqlCommand(@"
					SELECT id, shooter_id, weapon, origin_x, origin_y, origin_z, dir_x, dir_y, dir_z
					FROM maxhanna.grandtheft_shots
					WHERE world_id = @wid3 AND created_at > DATE_SUB(NOW(), INTERVAL 3 SECOND)
					ORDER BY id ASC", conn))
				{
					shotCmd.Parameters.AddWithValue("@wid3", req.WorldId);
					using var shotRdr = await shotCmd.ExecuteReaderAsync();
					while (await shotRdr.ReadAsync())
						shots.Add(new
						{
							id = shotRdr.GetInt64("id"),
							shooterId = shotRdr.GetInt32("shooter_id"),
							weapon = shotRdr.GetInt32("weapon"),
							originX = shotRdr.GetFloat("origin_x"),
							originY = shotRdr.GetFloat("origin_y"),
							originZ = shotRdr.GetFloat("origin_z"),
							dirX = shotRdr.GetFloat("dir_x"),
							dirY = shotRdr.GetFloat("dir_y"),
							dirZ = shotRdr.GetFloat("dir_z"),
						});
				}

				return Ok(new { ok = true, players, shots });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.UpdatePosition error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("Shoot")]
		public async Task<IActionResult> Shoot([FromBody] GTShootRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_shots (world_id, shooter_id, weapon, origin_x, origin_y, origin_z, dir_x, dir_y, dir_z, created_at)
					VALUES (@wid, @uid, @w, @ox, @oy, @oz, @dx, @dy, @dz, NOW())", conn);
				cmd.Parameters.AddWithValue("@wid", req.WorldId);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@w", req.Weapon);
				cmd.Parameters.AddWithValue("@ox", req.OriginX);
				cmd.Parameters.AddWithValue("@oy", req.OriginY);
				cmd.Parameters.AddWithValue("@oz", req.OriginZ);
				cmd.Parameters.AddWithValue("@dx", req.DirX);
				cmd.Parameters.AddWithValue("@dy", req.DirY);
				cmd.Parameters.AddWithValue("@dz", req.DirZ);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.Shoot error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("Hit")]
		public async Task<IActionResult> Hit([FromBody] GTHitRequest req)
		{
			if (req.AttackerId <= 0 || req.TargetId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// Reduce target health
				using var cmd = new MySqlCommand(@"
					UPDATE maxhanna.grandtheft_player_state
					SET health = GREATEST(0, health - @dmg), last_seen = NOW()
					WHERE user_id = @tid AND world_id = @wid AND health > 0", conn);
				cmd.Parameters.AddWithValue("@dmg", req.Damage);
				cmd.Parameters.AddWithValue("@tid", req.TargetId);
				cmd.Parameters.AddWithValue("@wid", req.WorldId);
				int affected = await cmd.ExecuteNonQueryAsync();

				if (affected > 0)
				{
					// Read remaining health
					using var selCmd = new MySqlCommand("SELECT health FROM maxhanna.grandtheft_player_state WHERE user_id = @tid2 AND world_id = @wid2", conn);
					selCmd.Parameters.AddWithValue("@tid2", req.TargetId);
					selCmd.Parameters.AddWithValue("@wid2", req.WorldId);
					var healthObj = await selCmd.ExecuteScalarAsync();
					int remainingHealth = healthObj != null ? Convert.ToInt32(healthObj) : 0;
					return Ok(new { ok = true, remainingHealth });
				}
				return Ok(new { ok = false, remainingHealth = 0 });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.Hit error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpGet("npcs/{worldId}")]
		public async Task<IActionResult> GetNPCs(int worldId)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				await SeedNPCsIfNeeded(conn, worldId);

				var rng = new Random();
				var cars = new List<object>();
				var pedestrians = new List<object>();
				var parkedCars = new List<object>();
				var updates = new List<(long id, float x, float z, float yaw, float speed)>();

				var rawNpcs = new List<(long id, string type, float x, float z, float yaw, float speed, float cr, float cg, float cb, DateTime updatedAt)>();
				using (var selectCmd = new MySqlCommand(@"
					SELECT id, npc_type, pos_x, pos_z, yaw, speed, color_r, color_g, color_b, updated_at
					FROM maxhanna.grandtheft_npc_state
					WHERE world_id = @wid AND (stolen_by IS NULL OR stolen_by = 0)", conn))
				{
					selectCmd.Parameters.AddWithValue("@wid", worldId);
					using var rdr = await selectCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						rawNpcs.Add((
							rdr.GetInt64("id"),
							rdr.GetString("npc_type"),
							rdr.GetFloat("pos_x"),
							rdr.GetFloat("pos_z"),
							rdr.GetFloat("yaw"),
							rdr.GetFloat("speed"),
							rdr.GetFloat("color_r"),
							rdr.GetFloat("color_g"),
							rdr.GetFloat("color_b"),
							rdr.GetDateTime("updated_at")
						));
					}
				}

				foreach (var (id, type, x, z, yaw, speed, cr, cg, cb, updatedAt) in rawNpcs)
				{
					if (type != "parked")
					{
						var newX = x;
						var newZ = z;
						var newYaw = yaw;
						var newSpeed = speed;

						var elapsed = (float)(DateTime.UtcNow - updatedAt.ToUniversalTime()).TotalSeconds;
						if (elapsed > 1) elapsed = 1;

						if (elapsed > 0)
						{
							var intervals = (int)(elapsed / 4);
							for (int i = 0; i < intervals; i++)
							{
								if (rng.NextDouble() < 0.3)
									newYaw += (float)((rng.NextDouble() - 0.5) * 0.3 * Math.PI);
							}
						}

						newX += (float)Math.Sin(newYaw) * newSpeed * elapsed;
						newZ += (float)Math.Cos(newYaw) * newSpeed * elapsed;

						var dist = (float)Math.Sqrt(newX * newX + newZ * newZ);
						if (dist > 300)
						{
							var gp = 40;
							var gx = rng.Next(-7, 8);
							var gz = rng.Next(-7, 8);
							newX = gx * gp;
							newZ = gz * gp;
							var yaws = new[] { 0f, (float)(Math.PI / 2), (float)Math.PI };
							newYaw = yaws[rng.Next(3)];
							newSpeed = type == "car" ? 3 + (float)rng.NextDouble() * 5 : 1 + (float)rng.NextDouble() * 2;
						}

						updates.Add((id, newX, newZ, newYaw, newSpeed));
						var entry = new { id, posX = newX, posZ = newZ, yaw = newYaw, speed = newSpeed, colorR = cr, colorG = cg, colorB = cb };
						if (type == "car") cars.Add(entry);
						else pedestrians.Add(entry);
					}
					else
					{
						parkedCars.Add(new { id, posX = x, posZ = z, yaw, speed = 0f, colorR = cr, colorG = cg, colorB = cb });
					}
				}

				foreach (var (id, newX, newZ, newYaw, newSpeed) in updates)
				{
					using var upCmd = new MySqlCommand(@"
						UPDATE maxhanna.grandtheft_npc_state
						SET pos_x = @x, pos_z = @z, yaw = @y, speed = @sp, updated_at = NOW()
						WHERE id = @id", conn);
					upCmd.Parameters.AddWithValue("@x", newX);
					upCmd.Parameters.AddWithValue("@z", newZ);
					upCmd.Parameters.AddWithValue("@y", newYaw);
					upCmd.Parameters.AddWithValue("@sp", newSpeed);
					upCmd.Parameters.AddWithValue("@id", id);
					await upCmd.ExecuteNonQueryAsync();
				}

				return Ok(new { cars, pedestrians, parkedCars });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.GetNPCs error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("stealcar/{npcId}")]
		public async Task<IActionResult> StealCar(long npcId, [FromBody] GTStealCarRequest req)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand("UPDATE maxhanna.grandtheft_npc_state SET stolen_by = @uid WHERE id = @id", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@id", npcId);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.StealCar error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("parkcar")]
		public async Task<IActionResult> ParkCar([FromBody] GTParkCarRequest req)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetConnectionString("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_npc_state (world_id, npc_type, pos_x, pos_z, yaw, speed, color_r, color_g, color_b)
					VALUES (@wid, 'parked', @x, @z, @y, 0, @cr, @cg, @cb)", conn);
				cmd.Parameters.AddWithValue("@wid", req.WorldId);
				cmd.Parameters.AddWithValue("@x", req.PosX);
				cmd.Parameters.AddWithValue("@z", req.PosZ);
				cmd.Parameters.AddWithValue("@y", req.Yaw);
				cmd.Parameters.AddWithValue("@cr", req.ColorR);
				cmd.Parameters.AddWithValue("@cg", req.ColorG);
				cmd.Parameters.AddWithValue("@cb", req.ColorB);
				await cmd.ExecuteNonQueryAsync();
				var id = cmd.LastInsertedId;
				return Ok(new { ok = true, id });
			}
			catch (Exception ex)
			{
				Console.WriteLine($"GrandTheftController.ParkCar error: {ex.Message}");
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		private async Task SeedNPCsIfNeeded(MySqlConnection conn, int worldId)
		{
			using var checkCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.grandtheft_npc_state WHERE world_id = @wid", conn);
			checkCmd.Parameters.AddWithValue("@wid", worldId);
			var count = Convert.ToInt64(await checkCmd.ExecuteScalarAsync());
			if (count > 0) return;

			var rng = new Random();
			var gridPitch = 40;
			var roadHalf = 5;
			var sidewalkOffset = roadHalf + 1.5f;

			for (int i = 0; i < 8; i++)
			{
				var gx = rng.Next(-5, 6);
				var gz = rng.Next(-5, 6);
				var x = gx * gridPitch;
				var z = gz * gridPitch;
				var yaws = new[] { 0f, (float)(Math.PI / 2), (float)Math.PI };
				var yaw = yaws[rng.Next(3)];
				var speed = 3 + (float)rng.NextDouble() * 5;
				using var insCmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_npc_state (world_id, npc_type, pos_x, pos_z, yaw, speed, color_r, color_g, color_b)
					VALUES (@wid, 'car', @x, @z, @y, @sp, @cr, @cg, @cb)", conn);
				insCmd.Parameters.AddWithValue("@wid", worldId);
				insCmd.Parameters.AddWithValue("@x", x);
				insCmd.Parameters.AddWithValue("@z", z);
				insCmd.Parameters.AddWithValue("@y", yaw);
				insCmd.Parameters.AddWithValue("@sp", speed);
				insCmd.Parameters.AddWithValue("@cr", (float)rng.NextDouble());
				insCmd.Parameters.AddWithValue("@cg", (float)rng.NextDouble());
				insCmd.Parameters.AddWithValue("@cb", (float)rng.NextDouble());
				await insCmd.ExecuteNonQueryAsync();
			}

			for (int i = 0; i < 15; i++)
			{
				var gx = rng.Next(-5, 6);
				var gz = rng.Next(-5, 6);
				var side = rng.Next(2) == 0 ? -sidewalkOffset : sidewalkOffset;
				float x, z;
				if (rng.Next(2) == 0)
				{
					x = gx * gridPitch + side;
					z = gz * gridPitch + (float)(rng.NextDouble() - 0.5) * 6;
				}
				else
				{
					x = gx * gridPitch + (float)(rng.NextDouble() - 0.5) * 6;
					z = gz * gridPitch + side;
				}
				var yaws = new[] { 0f, (float)(Math.PI / 2), (float)Math.PI };
				var yaw = yaws[rng.Next(3)];
				var speed = 1 + (float)rng.NextDouble() * 2;
				using var insCmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_npc_state (world_id, npc_type, pos_x, pos_z, yaw, speed, color_r, color_g, color_b)
					VALUES (@wid, 'ped', @x, @z, @y, @sp, 0.3, 0.6, 0.3)", conn);
				insCmd.Parameters.AddWithValue("@wid", worldId);
				insCmd.Parameters.AddWithValue("@x", x);
				insCmd.Parameters.AddWithValue("@z", z);
				insCmd.Parameters.AddWithValue("@y", yaw);
				insCmd.Parameters.AddWithValue("@sp", speed);
				await insCmd.ExecuteNonQueryAsync();
			}
		}
	}

	public class GrandTheftSaveRequest
	{
		public int UserId { get; set; }
		public float PosX { get; set; }
		public float PosZ { get; set; }
		public int Score { get; set; }
	}

	public class GrandTheftScoreRequest
	{
		public int UserId { get; set; }
		public int Score { get; set; }
	}

	public class GTUpdatePositionRequest
	{
		public int UserId { get; set; }
		public int WorldId { get; set; } = 1;
		public float PosX { get; set; }
		public float PosY { get; set; }
		public float PosZ { get; set; }
		public float Yaw { get; set; }
		public float Pitch { get; set; }
		public float CarYaw { get; set; }
		public float CarSpeed { get; set; }
		public int Health { get; set; } = 100;
		public int Weapon { get; set; } = 0;
	}

	public class GTShootRequest
	{
		public int UserId { get; set; }
		public int WorldId { get; set; } = 1;
		public int Weapon { get; set; } = 0;
		public float OriginX { get; set; }
		public float OriginY { get; set; }
		public float OriginZ { get; set; }
		public float DirX { get; set; }
		public float DirY { get; set; }
		public float DirZ { get; set; }
	}

	public class GTHitRequest
	{
		public int AttackerId { get; set; }
		public int TargetId { get; set; }
		public int WorldId { get; set; } = 1;
		public int Damage { get; set; } = 10;
	}

	public class GTStealCarRequest
	{
		public int UserId { get; set; }
	}

	public class GTParkCarRequest
	{
		public int WorldId { get; set; }
		public float PosX { get; set; }
		public float PosZ { get; set; }
		public float Yaw { get; set; }
		public float ColorR { get; set; }
		public float ColorG { get; set; }
		public float ColorB { get; set; }
	}
}
