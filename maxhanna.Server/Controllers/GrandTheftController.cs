using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;
using System.Threading;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class GrandTheftController : ControllerBase
	{
		private readonly IConfiguration _config;
		private const int INACTIVITY_TIMEOUT_SECONDS = 15;
		private const float POLICE_ARRIVAL_DISTANCE = 15.0f;
		private static readonly ConcurrentDictionary<int, PlayerShootState> _shootingPlayers = new();
		private static readonly ConcurrentDictionary<int, int> _playerHealth = new();
		private static readonly ConcurrentDictionary<int, string> _playerModelUrls = new();
		private static readonly ConcurrentDictionary<int, double> _lastDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerWantedLevels = new();
		private static readonly ConcurrentDictionary<int, DateTime> _lastWantedDecay = new();
		private static readonly ConcurrentDictionary<int, double> _lastPoliceDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerMoney = new();

		private static long _nextNpcId = 1;
		private static long GetNextNpcId() => Interlocked.Increment(ref _nextNpcId);

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
			public int TargetUserId { get; set; } = 0;
		}

		private static readonly int[] WEAPON_DAMAGES = new[] { 15, 25, 8, 100 };
		private static readonly float[] HIT_RADII = new[] { 1.0f, 1.0f, 1.5f };

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
                    INSERT INTO maxhanna.grandtheft_player_state (user_id, world_id, pos_x, pos_y, pos_z, yaw, pitch, car_yaw, car_speed, health, weapon, money, last_seen)
                    VALUES (@uid, @wid, @px, @py, @pz, @y, @p, @cy, @cs, @h, @w, @money, NOW())
                    ON DUPLICATE KEY UPDATE pos_x = @px, pos_y = @py, pos_z = @pz, yaw = @y, pitch = @p, car_yaw = @cy, car_speed = @cs, health = @h, weapon = @w, money = @money, last_seen = NOW()", conn))
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
					cmd.Parameters.AddWithValue("@money", req.Money);
					await cmd.ExecuteNonQueryAsync();
				}

				if (!_playerHealth.ContainsKey(req.UserId)) _playerHealth[req.UserId] = req.Health;
				else if (req.Health > _playerHealth[req.UserId]) _playerHealth[req.UserId] = Math.Min(100, req.Health); // Allow healing

				_playerMoney[req.UserId] = Math.Max(0, req.Money);

				if (!string.IsNullOrEmpty(req.ModelUrl)) _playerModelUrls[req.UserId] = req.ModelUrl!;

				if (req.IsShooting)
				{
					_shootingPlayers[req.UserId] = new PlayerShootState { DirX = (float)(Math.Sin(req.Yaw) * Math.Cos(req.Pitch)), DirY = (float)(-Math.Sin(req.Pitch)), DirZ = (float)(Math.Cos(req.Yaw) * Math.Cos(req.Pitch)), Weapon = req.Weapon, LastUpdated = DateTime.UtcNow };
					SimulateDamage(req);
				}
				else { _shootingPlayers.TryRemove(req.UserId, out _); }

				var cutoff = DateTime.UtcNow.AddSeconds(-1);
				foreach (var kv in _shootingPlayers) if (kv.Value.LastUpdated < cutoff) _shootingPlayers.TryRemove(kv.Key, out _);

				// Wanted Level Logic
				int wantedLevel = 0;
				if (_playerWantedLevels.TryGetValue(req.UserId, out var w)) wantedLevel = w;

				if (wantedLevel > 0)
				{
					// Decay wanted level
					if (_lastWantedDecay.TryGetValue(req.UserId, out var lastDecay))
					{
						if ((DateTime.UtcNow - lastDecay).TotalSeconds > 20)
						{
							_playerWantedLevels[req.UserId] = Math.Max(0, wantedLevel - 1);
							_lastWantedDecay[req.UserId] = DateTime.UtcNow;
						}
					}
					else
					{
						_lastWantedDecay[req.UserId] = DateTime.UtcNow;
					}

					// Police damage simulation
					if (_worldNpcs.ContainsKey(req.WorldId))
					{
						foreach (var npc in _worldNpcs[req.WorldId].Values)
						{
							if ((npc.Type == "police" || npc.Type == "cop") && npc.TargetUserId == req.UserId)
							{
								float dx = npc.X - req.PosX;
								float dz = npc.Z - req.PosZ;
								float distSq = dx * dx + dz * dz;
								if (distSq < 25 * 25)
								{
									var nowMs = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
									if (!_lastPoliceDamageTime.TryGetValue(req.UserId, out var last) || (nowMs - last) > 500)
									{
										if (_playerHealth.TryGetValue(req.UserId, out var hp))
											_playerHealth[req.UserId] = Math.Max(0, hp - 5);
										else
											_playerHealth[req.UserId] = Math.Max(0, req.Health - 5);

										_lastPoliceDamageTime[req.UserId] = nowMs;
									}
								}
							}
						}
					}
				}

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
				var myHp = _playerHealth.TryGetValue(req.UserId, out var myH) ? myH : req.Health;
				var myWanted = _playerWantedLevels.TryGetValue(req.UserId, out var mw) ? mw : 0;
				var myMoney = _playerMoney.TryGetValue(req.UserId, out var mm) ? mm : req.Money;
				return Ok(new { ok = true, players, yourHealth = myHp, wantedLevel = myWanted, yourMoney = myMoney });
			}
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
		}

		[HttpGet("npcs/{worldId}")]
		public IActionResult GetNPCs(int worldId, [FromQuery] float posX = 0, [FromQuery] float posZ = 0, [FromQuery] int userId = 0)
		{
			if (!_worldNpcs.ContainsKey(worldId))
			{
				_worldNpcs[worldId] = new ConcurrentDictionary<long, NpcState>();
				SeedNPCs(worldId, posX, posZ);
			}

			var npcs = _worldNpcs[worldId];
			var cars = new List<object>();
			var pedestrians = new List<object>();
			var parkedCars = new List<object>();
			var deadIds = new List<long>();
			var rng = new Random();

			int nearbyCars = 0;
			int nearbyPeds = 0;
			int wantedLevel = 0;
			if (userId > 0 && _playerWantedLevels.TryGetValue(userId, out var w)) wantedLevel = w;

			foreach (var kv in npcs)
			{
				var npc = kv.Value;
				if (npc.Health <= 0) { deadIds.Add(kv.Key); continue; }

				if (npc.Type == "police" || npc.Type == "cop")
				{
					if (npc.TargetUserId == userId && wantedLevel == 0)
					{
						deadIds.Add(kv.Key);
						continue;
					}
					if (npc.TargetUserId == userId && wantedLevel > 0)
					{
						if (npc.Type == "police")
						{
							float pdx = npc.X - posX;
							float pdz = npc.Z - posZ;
							float pdist = (float)Math.Sqrt(pdx * pdx + pdz * pdz);
							if (pdist < POLICE_ARRIVAL_DISTANCE)
							{
								long parkedId = GetNextNpcId();
								npcs[parkedId] = new NpcState
								{
									Id = parkedId,
									Type = "parked",
									X = npc.X,
									Z = npc.Z,
									Yaw = npc.Yaw,
									Health = 150,
									Cr = 0.1f, Cg = 0.1f, Cb = 0.2f,
								};
								npc.Type = "cop";
								npc.Speed = 5.0f;
							}
						}
						npc.TargetX = posX;
						npc.TargetZ = posZ;
					}
				}

				float dx = npc.X - posX;
				float dz = npc.Z - posZ;
				float distSq = dx * dx + dz * dz;

				if (distSq > 300f * 300f && npc.Type != "parked")
				{
					deadIds.Add(kv.Key);
					continue;
				}

				if (distSq < 150f * 150f)
				{
					if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") nearbyPeds++;
					else if (npc.Type != "parked") nearbyCars++;
				}

				if (distSq > 200f * 200f) continue;

				if (npc.Type == "parked") { parkedCars.Add(new { id = npc.Id, posX = npc.X, posZ = npc.Z, yaw = npc.Yaw, speed = 0f, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, health = npc.Health }); continue; }

				float tdx = npc.TargetX - npc.X;
				float tdz = npc.TargetZ - npc.Z;
				float distToTarget = (float)Math.Sqrt(tdx * tdx + tdz * tdz);

				if (distToTarget < 2.0f)
				{
					if (npc.Type == "cop")
					{
						npc.TargetX = posX;
						npc.TargetZ = posZ;
					}
					else
					{
						float targetX = 0, targetZ = 0;
						if (npc.Type == "ped_male" || npc.Type == "ped_female") GetRandomSidewalkPointNearPlayer(posX, posZ, out targetX, out targetZ, rng);
						else GetRandomRoadPointNearPlayer(posX, posZ, out targetX, out targetZ, rng);
						npc.TargetX = targetX;
						npc.TargetZ = targetZ;
					}
				}
				else
				{
					float moveX = (tdx / distToTarget) * npc.Speed * 0.5f; // Increased movement speed for smoothness
					float moveZ = (tdz / distToTarget) * npc.Speed * 0.5f;
					npc.X += moveX;
					npc.Z += moveZ;
					npc.Yaw = (float)Math.Atan2(-moveX, -moveZ);
				}

				var entry = new { id = npc.Id, posX = npc.X, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health };
				if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") pedestrians.Add(entry);
				else cars.Add(entry);
			}
			foreach (var id in deadIds) npcs.TryRemove(id, out _);

			while (nearbyCars < 10)
			{
				long id = GetNextNpcId();
				var type = new[] { "car", "bus", "bike", "motorcycle" }[rng.Next(4)];
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng);
				npcs[id] = new NpcState
				{
					Id = id,
					Type = type,
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = type == "bike" || type == "motorcycle" ? 6.0f : 4.0f,
					Health = type == "bike" || type == "motorcycle" ? 80 : 100,
					Cr = (float)rng.NextDouble(),
					Cg = (float)rng.NextDouble(),
					Cb = (float)rng.NextDouble()
				};
				nearbyCars++;
			}

			while (nearbyPeds < 15)
			{
				long id = GetNextNpcId();
				var type = new[] { "ped_male", "ped_female" }[rng.Next(2)];
				GetRandomSidewalkPointNearPlayer(posX, posZ, out float x, out float z, rng);
				npcs[id] = new NpcState
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
				nearbyPeds++;
			}

			// Spawn Police
			int nearbyPolice = 0;
			foreach (var kv in npcs) if ((kv.Value.Type == "police" || kv.Value.Type == "cop") && kv.Value.TargetUserId == userId) nearbyPolice++;

			while (wantedLevel > 0 && nearbyPolice < wantedLevel * 2)
			{
				long id = GetNextNpcId();
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng);
				npcs[id] = new NpcState
				{
					Id = id,
					Type = "police",
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = 15.0f, // Fast police
					Health = 150,
					Cr = 0.1f,
					Cg = 0.1f,
					Cb = 0.2f,
					TargetUserId = userId
				};
				nearbyPolice++;
			}

			return Ok(new { cars, pedestrians, parkedCars });
		}

		private void SeedNPCs(int worldId, float posX = 0, float posZ = 0)
		{
			var dict = _worldNpcs[worldId];
			var rng = new Random();
			var vTypes = new[] { "car", "bus", "bike", "motorcycle" };
			var gTypes = new[] { "ped_male", "ped_female" };

			for (int i = 0; i < 20; i++)
			{
				long id = GetNextNpcId();
				var type = vTypes[rng.Next(vTypes.Length)];
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng);
				dict[id] = new NpcState
				{
					Id = id,
					Type = type,
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = type == "bike" || type == "motorcycle" ? 6.0f : 4.0f,
					Health = type == "bike" || type == "motorcycle" ? 80 : 100,
					Cr = (float)rng.NextDouble(),
					Cg = (float)rng.NextDouble(),
					Cb = (float)rng.NextDouble()
				};
			}

			for (int i = 0; i < 30; i++)
			{
				long id = GetNextNpcId();
				var type = gTypes[rng.Next(gTypes.Length)];
				GetRandomSidewalkPointNearPlayer(posX, posZ, out float x, out float z, rng);
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

		private void GetRandomRoadPointNearPlayer(float px, float pz, out float x, out float z, Random rng)
		{
			float angle = (float)(rng.NextDouble() * Math.PI * 2);
			float dist = 40 + (float)rng.NextDouble() * 60;
			x = px + (float)Math.Cos(angle) * dist;
			z = pz + (float)Math.Sin(angle) * dist;

			int ix = (int)Math.Round(x / 40f);
			int iz = (int)Math.Round(z / 40f);
			float cx = ix * 40f;
			float cz = iz * 40f;

			if (rng.NextDouble() < 0.5) { x = cx + (float)(rng.NextDouble() - 0.5) * 100f; z = cz; }
			else { x = cx; z = cz + (float)(rng.NextDouble() - 0.5) * 100f; }
		}

		private void GetRandomSidewalkPointNearPlayer(float px, float pz, out float x, out float z, Random rng)
		{
			float angle = (float)(rng.NextDouble() * Math.PI * 2);
			float dist = 30 + (float)rng.NextDouble() * 50;
			x = px + (float)Math.Cos(angle) * dist;
			z = pz + (float)Math.Sin(angle) * dist;

			int ix = (int)Math.Round(x / 40f);
			int iz = (int)Math.Round(z / 40f);
			float cx = ix * 40f + 20f;
			float cz = iz * 40f + 20f;

			int edge = rng.Next(4);
			if (edge == 0) { x = cx; z = cz - 14f; }
			else if (edge == 1) { x = cx; z = cz + 14f; }
			else if (edge == 2) { x = cx - 14f; z = cz; }
			else { x = cx + 14f; z = cz; }

			if (edge < 2) x += (float)(rng.NextDouble() - 0.5) * 20f;
			else z += (float)(rng.NextDouble() - 0.5) * 20f;
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
			long id = GetNextNpcId();
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
			if (req.TargetId <= 0) return BadRequest(new { ok = false });
			var worldId = req.WorldId;
			if (!_worldNpcs.ContainsKey(worldId)) return Ok(new { ok = true });

			var npcs = _worldNpcs[worldId];
			var hitAnything = false;

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

			int playerTargetId = (int)req.TargetId;
			if (_playerHealth.TryGetValue(playerTargetId, out var hp))
			{
				_playerHealth[playerTargetId] = Math.Max(0, hp - req.Damage);
				hitAnything = true;
			}

			// Increment wanted level for attacker (if not police)
			if (hitAnything && req.AttackerId > 0)
			{
				if (_playerWantedLevels.TryGetValue(req.AttackerId, out var w))
					_playerWantedLevels[req.AttackerId] = Math.Min(5, w + 1);
				else
					_playerWantedLevels[req.AttackerId] = 1;

				_lastWantedDecay[req.AttackerId] = DateTime.UtcNow;
			}

			return Ok(new { ok = true, hit = hitAnything, targetHealth = _playerHealth.TryGetValue(playerTargetId, out var th) ? th : 0 });
		}

		private void SimulateDamage(GTUpdatePositionRequest req)
		{
			var worldId = req.WorldId;
			if (!_worldNpcs.ContainsKey(worldId)) return;

			var now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
			if (_lastDamageTime.TryGetValue(req.UserId, out var last) && (now - last) < 150) return;
			_lastDamageTime[req.UserId] = now;
		}
	}

	public class GrandTheftSaveRequest { public int UserId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public int Score { get; set; } }
	public class GrandTheftScoreRequest { public int UserId { get; set; } public int Score { get; set; } }
	public class GTUpdatePositionRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public float PosX { get; set; } public float PosY { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float Pitch { get; set; } public float CarYaw { get; set; } public float CarSpeed { get; set; } public int Health { get; set; } = 100; public int Weapon { get; set; } = 0; public bool IsShooting { get; set; } public string? ModelUrl { get; set; } public int Money { get; set; } = 0; }
	public class GTShootRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public int Weapon { get; set; } = 0; public float OriginX { get; set; } public float OriginY { get; set; } public float OriginZ { get; set; } public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } }
	public class GTHitRequest { public int AttackerId { get; set; } public long TargetId { get; set; } public int WorldId { get; set; } = 1; public int Damage { get; set; } = 10; }
	public class GTStealCarRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; }
	public class GTParkCarRequest { public int WorldId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float ColorR { get; set; } public float ColorG { get; set; } public float ColorB { get; set; } }
	public class PlayerShootState { public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } public int Weapon { get; set; } public DateTime LastUpdated { get; set; } }
}