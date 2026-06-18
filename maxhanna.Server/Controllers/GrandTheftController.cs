using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class GrandTheftController : ControllerBase
	{
		private readonly IConfiguration _config;
		private const int INACTIVITY_TIMEOUT_SECONDS = 15;
		private static readonly ConcurrentDictionary<int, PlayerShootState> _shootingPlayers = new();
		private static readonly ConcurrentDictionary<int, int> _playerHealth = new();
		private static readonly ConcurrentDictionary<int, string> _playerModelUrls = new();
		private static readonly ConcurrentDictionary<int, double> _lastDamageTime = new();

		// In-memory NPC state for smooth pathing without DB overhead
	private class NpcState
	{
		public long Id { get; set; }
		public string Type { get; set; } = "car";
		public string Gender { get; set; } = "male";
		public float X { get; set; }
		public float Z { get; set; }
		public float Yaw { get; set; }
		public float Speed { get; set; }
		public float TargetX { get; set; }
		public float TargetZ { get; set; }
		public float Cr { get; set; }
		public float Cg { get; set; }
		public float Cb { get; set; }
		public int Health { get; set; } = 100;
		public DateTime LastUpdate { get; set; }
	}

	private static readonly int[] WEAPON_DAMAGES = new[] { 15, 25, 8, 100 };
	private static readonly float[] HIT_RADII = new[] { 1.0f, 1.0f, 1.5f }; // NPC cars/players/pedestrians

		private static readonly ConcurrentDictionary<int, ConcurrentDictionary<long, NpcState>> _worldNpcs = new();

		public GrandTheftController(IConfiguration config) { _config = config; }

		[HttpPost("Save")]
		public async Task<IActionResult> SaveGame([FromBody] GrandTheftSaveRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
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
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
		}

		[HttpGet("Load/{userId}")]
		public async Task<IActionResult> LoadGame(int userId)
		{
			if (userId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand("SELECT pos_x, pos_z, score FROM maxhanna.grandtheft_saves WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				if (await rdr.ReadAsync()) return Ok(new { posX = rdr.GetFloat("pos_x"), posZ = rdr.GetFloat("pos_z"), score = rdr.GetInt32("score") });
				return Ok(new { posX = 0f, posZ = 0f, score = 0 });
			}
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
		}

		[HttpPost("SubmitScore")]
		public async Task<IActionResult> SubmitScore([FromBody] GrandTheftScoreRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand("INSERT INTO maxhanna.grandtheft_leaderboard (user_id, score, achieved_at) VALUES (@uid, @sc, NOW())", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@sc", req.Score);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
		}

		[HttpGet("Leaderboard")]
		public async Task<IActionResult> GetLeaderboard()
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand(@"
                    SELECT u.username, MAX(gl.score) as score FROM maxhanna.grandtheft_leaderboard gl
                    JOIN maxhanna.users u ON u.id = gl.user_id GROUP BY gl.user_id ORDER BY score DESC LIMIT 20", conn);
				var list = new List<object>();
				using var rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync()) list.Add(new { username = rdr.GetString("username"), score = rdr.GetInt32("score") });
				return Ok(list);
			}
			catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
		}

		[HttpPost("UpdatePosition")]
		public async Task<IActionResult> UpdatePosition([FromBody] GTUpdatePositionRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

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

				_playerHealth[req.UserId] = req.Health;

				if (!string.IsNullOrEmpty(req.ModelUrl)) _playerModelUrls[req.UserId] = req.ModelUrl!;

			if (req.IsShooting)
			{
				_shootingPlayers[req.UserId] = new PlayerShootState { DirX = (float)(Math.Sin(req.Yaw) * Math.Cos(req.Pitch)), DirY = (float)(-Math.Sin(req.Pitch)), DirZ = (float)(Math.Cos(req.Yaw) * Math.Cos(req.Pitch)), Weapon = req.Weapon, LastUpdated = DateTime.UtcNow };

				// Line-of-fire damage simulation against NPCs and other players
				SimulateDamage(req);
			}
			else { _shootingPlayers.TryRemove(req.UserId, out _); }

			var cutoff = DateTime.UtcNow.AddSeconds(-1);
			foreach (var kv in _shootingPlayers) if (kv.Value.LastUpdated < cutoff) _shootingPlayers.TryRemove(kv.Key, out _);

			var players = new List<object>();
			using (var selCmd = new MySqlCommand(@"
                    SELECT ps.user_id, ps.pos_x, ps.pos_y, ps.pos_z, ps.yaw, ps.pitch, ps.car_yaw, ps.car_speed, ps.health, ps.weapon,
                           COALESCE(u.username, CONCAT('Player', ps.user_id)) as username
                    FROM maxhanna.grandtheft_player_state ps LEFT JOIN maxhanna.users u ON u.id = ps.user_id
                    WHERE ps.world_id = @wid2 AND ps.user_id != @uid2 AND ps.last_seen > DATE_SUB(NOW(), INTERVAL @timeout SECOND)", conn))
			{
				selCmd.Parameters.AddWithValue("@wid2", req.WorldId);
				selCmd.Parameters.AddWithValue("@uid2", req.UserId);
				selCmd.Parameters.AddWithValue("@timeout", INACTIVITY_TIMEOUT_SECONDS);
				using var rdr = await selCmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					var uid = rdr.GetInt32("user_id");
					var hasShoot = _shootingPlayers.TryGetValue(uid, out var ss);
					// Override DB health with server-authoritative in-memory health
					var hp = _playerHealth.TryGetValue(uid, out var h) ? h : rdr.GetInt32("health");
					players.Add(new
					{
						userId = uid,
						posX = rdr.GetFloat("pos_x"),
						posY = rdr.GetFloat("pos_y"),
						posZ = rdr.GetFloat("pos_z"),
						yaw = rdr.GetFloat("yaw"),
						pitch = rdr.GetFloat("pitch"),
						carYaw = rdr.GetFloat("car_yaw"),
						carSpeed = rdr.GetFloat("car_speed"),
						health = hp,
						weapon = rdr.GetInt32("weapon"),
						username = rdr.GetString("username"),
						isShooting = hasShoot,
						modelUrl = _playerModelUrls.TryGetValue(uid, out var mu) ? mu : null
					});
				}
			}
			return Ok(new { ok = true, players, yourHealth = req.Health });
			}
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
		}

		[HttpGet("npcs/{worldId}")]
		public IActionResult GetNPCs(int worldId)
		{
			if (!_worldNpcs.ContainsKey(worldId))
			{
				_worldNpcs[worldId] = new ConcurrentDictionary<long, NpcState>();
				SeedNPCs(worldId);
			}

			var npcs = _worldNpcs[worldId];
			var cars = new List<object>();
			var pedestrians = new List<object>();
			var parkedCars = new List<object>();
			var deadIds = new List<long>();
			var rng = new Random();

			foreach (var kv in npcs)
			{
				var npc = kv.Value;
				if (npc.Health <= 0) { deadIds.Add(kv.Key); continue; }

				if (npc.Type == "parked") { parkedCars.Add(new { id = npc.Id, posX = npc.X, posZ = npc.Z, yaw = npc.Yaw, speed = 0f, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, health = npc.Health }); continue; }

				// Smooth pathing
				float dx = npc.TargetX - npc.X;
				float dz = npc.TargetZ - npc.Z;
				float distToTarget = (float)Math.Sqrt(dx * dx + dz * dz);

				if (distToTarget < 2.0f)
				{
					// Pick new target
					npc.TargetX = npc.X + (float)(rng.NextDouble() - 0.5) * 80.0f;
					npc.TargetZ = npc.Z + (float)(rng.NextDouble() - 0.5) * 80.0f;
				}
				else
				{
					float moveX = (dx / distToTarget) * npc.Speed * 0.1f; // 0.1s delta sim
					float moveZ = (dz / distToTarget) * npc.Speed * 0.1f;
					npc.X += moveX;
					npc.Z += moveZ;
					npc.Yaw = (float)Math.Atan2(-moveX, -moveZ); // Smooth yaw update
				}

				var entry = new { id = npc.Id, posX = npc.X, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health };
				if (npc.Type == "ped_male" || npc.Type == "ped_female") pedestrians.Add(entry);
				else cars.Add(entry);
			}
			foreach (var id in deadIds) npcs.TryRemove(id, out _);

			return Ok(new { cars, pedestrians, parkedCars });
		}

		private void SeedNPCs(int worldId)
		{
			var dict = _worldNpcs[worldId];
			var rng = new Random();
			var vTypes = new[] { "car", "bus", "plane", "bike", "motorcycle" };
			var gTypes = new[] { "ped_male", "ped_female" };

			for (int i = 0; i < 20; i++)
			{
				long id = DateTime.UtcNow.Ticks + i;
				var type = vTypes[rng.Next(vTypes.Length)];
				var x = (float)(rng.NextDouble() - 0.5) * 200.0f;
				var z = (float)(rng.NextDouble() - 0.5) * 200.0f;
				var health = type == "plane" ? 200 : (type == "bike" || type == "motorcycle" ? 80 : 100);
				dict[id] = new NpcState
				{
					Id = id,
					Type = type,
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = type == "plane" ? 15.0f : (type == "bike" || type == "motorcycle" ? 6.0f : 4.0f),
					Health = health,
					Cr = (float)rng.NextDouble(),
					Cg = (float)rng.NextDouble(),
					Cb = (float)rng.NextDouble()
				};
			}

			for (int i = 0; i < 30; i++)
			{
				long id = DateTime.UtcNow.Ticks + 1000 + i;
				var type = gTypes[rng.Next(gTypes.Length)];
				var x = (float)(rng.NextDouble() - 0.5) * 200.0f;
				var z = (float)(rng.NextDouble() - 0.5) * 200.0f;
				dict[id] = new NpcState
				{
					Id = id,
					Type = type,
					Gender = type.Contains("female") ? "female" : "male",
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = 1.5f,
					Health = 50,
					Cr = 0.4f,
					Cg = 0.4f,
					Cb = 0.4f
				};
			}
		}

		[HttpPost("stealcar/{npcId}")]
		public IActionResult StealCar(long npcId, [FromBody] GTStealCarRequest req)
		{
			if (_worldNpcs.ContainsKey(req.WorldId) && _worldNpcs[req.WorldId].TryRemove(npcId, out _))
				return Ok(new { ok = true });
			return Ok(new { ok = false });
		}

		[HttpPost("parkcar")]
		public IActionResult ParkCar([FromBody] GTParkCarRequest req)
		{
			if (!_worldNpcs.ContainsKey(req.WorldId)) _worldNpcs[req.WorldId] = new ConcurrentDictionary<long, NpcState>();
			long id = DateTime.UtcNow.Ticks;
			_worldNpcs[req.WorldId][id] = new NpcState
			{
				Id = id,
				Type = "parked",
				X = req.PosX,
				Z = req.PosZ,
				Yaw = req.Yaw,
				Health = 100,
				Cr = req.ColorR,
				Cg = req.ColorG,
				Cb = req.ColorB
			};
			return Ok(new { ok = true, id });
		}

		[HttpPost("hit")]
		public IActionResult Hit([FromBody] GTHitRequest req)
		{
			if (req.AttackerId <= 0) return BadRequest(new { ok = false });
			var worldId = req.WorldId;
			if (!_worldNpcs.ContainsKey(worldId)) return Ok(new { ok = true });

			var npcs = _worldNpcs[worldId];
			var hitAnything = false;

			// Check NPC cars & pedestrians (by target ID matching NPC's Id)
			foreach (var kv in npcs)
			{
				if (kv.Key == req.TargetId && kv.Value.Health > 0)
				{
					kv.Value.Health -= req.Damage;
					hitAnything = true;
					if (kv.Value.Health <= 0) npcs.TryRemove(kv.Key, out _);
					break;
				}
			}

			// Check other players (by target ID)
			if (_playerHealth.TryGetValue(req.TargetId, out var hp))
			{
				_playerHealth[req.TargetId] = Math.Max(0, hp - req.Damage);
				hitAnything = true;
			}

			return Ok(new { ok = true, hit = hitAnything, targetHealth = _playerHealth.TryGetValue(req.TargetId, out var th) ? th : 0 });
		}

		private void SimulateDamage(GTUpdatePositionRequest req)
		{
			var worldId = req.WorldId;
			if (!_worldNpcs.ContainsKey(worldId)) return;

			// Rate limit: only simulate once per ~200ms per player
			var now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
			if (_lastDamageTime.TryGetValue(req.UserId, out var last) && (now - last) < 150) return;
			_lastDamageTime[req.UserId] = now;

			float ox = req.PosX;
			float oy = req.PosY + (req.CarSpeed > 0.5f ? 0.5f : 1.2f);
			float oz = req.PosZ;
			float dx = (float)(Math.Sin(req.Yaw) * Math.Cos(req.Pitch));
			float dy = (float)(-Math.Sin(req.Pitch));
			float dz = (float)(Math.Cos(req.Yaw) * Math.Cos(req.Pitch));
			float maxDist = 50f;
			int damage = req.Weapon >= 0 && req.Weapon < WEAPON_DAMAGES.Length ? WEAPON_DAMAGES[req.Weapon] : 15;

			var npcs = _worldNpcs[worldId];
			var deadIds = new List<long>();

			foreach (var kv in npcs)
			{
				if (kv.Value.Health <= 0) { deadIds.Add(kv.Key); continue; }
				float tx = kv.Value.X;
				float ty = (kv.Value.Type == "ped_male" || kv.Value.Type == "ped_female") ? 0.5f : 0f;
				float tz = kv.Value.Z;
				float radius = (kv.Value.Type == "ped_male" || kv.Value.Type == "ped_female") ? 0.5f : 1.5f;

				if (LineCheck(ox, oy, oz, dx, dy, dz, tx, ty, tz, radius, maxDist))
				{
					kv.Value.Health -= damage;
					if (kv.Value.Health <= 0) deadIds.Add(kv.Key);
				}
			}
			foreach (var id in deadIds) npcs.TryRemove(id, out _);

			// Check other players
			foreach (var kv in _playerHealth)
			{
				if (kv.Key == req.UserId) continue;
				// Player positions come from the DB — we don't have them in memory
				// So we rely on the client-side Hit call for player-vs-player for now.
				// Future: store player positions in _playerPos dict for server-side checks.
			}
		}

		private static bool LineCheck(float ox, float oy, float oz, float dx, float dy, float dz, float tx, float ty, float tz, float radius, float maxDist)
		{
			float vx = tx - ox, vy = ty - oy, vz = tz - oz;
			float proj = vx * dx + vy * dy + vz * dz;
			if (proj < 0 || proj > maxDist) return false;
			float cx = ox + dx * proj, cy = oy + dy * proj, cz = oz + dz * proj;
			float dsq = (tx - cx) * (tx - cx) + (ty - cy) * (ty - cy) + (tz - cz) * (tz - cz);
			return dsq < radius * radius;
		}
	}

	public class GrandTheftSaveRequest { public int UserId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public int Score { get; set; } }
	public class GrandTheftScoreRequest { public int UserId { get; set; } public int Score { get; set; } }
	public class GTUpdatePositionRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public float PosX { get; set; } public float PosY { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float Pitch { get; set; } public float CarYaw { get; set; } public float CarSpeed { get; set; } public int Health { get; set; } = 100; public int Weapon { get; set; } = 0; public bool IsShooting { get; set; } public string? ModelUrl { get; set; } }
	public class GTShootRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public int Weapon { get; set; } = 0; public float OriginX { get; set; } public float OriginY { get; set; } public float OriginZ { get; set; } public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } }
	public class GTHitRequest { public int AttackerId { get; set; } public int TargetId { get; set; } public int WorldId { get; set; } = 1; public int Damage { get; set; } = 10; }
	public class GTStealCarRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; }
	public class GTParkCarRequest { public int WorldId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float ColorR { get; set; } public float ColorG { get; set; } public float ColorB { get; set; } }
	public class PlayerShootState { public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } public int Weapon { get; set; } public DateTime LastUpdated { get; set; } }
}