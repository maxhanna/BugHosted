using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;
using System.Threading;

namespace maxhanna.Server.Controllers
{
	// Mirrors the frontend renderer's procedural city generation so the
	// backend can query building positions for NPC collision avoidance.
	// MUST stay in sync with grandtheft-renderer.ts getCityChunk().
	internal static class CityLayout
	{
		public const int CHUNK_SIZE = 80;
		public const int GRID_PITCH = 80;
		public const int BLOCK_SIZE = 30;
		public const int SIDEWALK_SIZE = BLOCK_SIZE + 6; // 36
		public const int BIOME_RADIUS_CITY = 28;
		public const int BIOME_RADIUS_MOUNTAIN = 35;
		public const int BIOME_RADIUS_SUBURB = 45;
		public const int BIOME_RADIUS_BEACH = 55;

		// Signed 32-bit multiply (C# equivalent of JS Math.imul)
		private static int Imul(int a, int b)
		{
			unchecked { return a * b; }
		}

		// Mulberry32 PRNG — same algorithm as the frontend's mulberry32().
		private static uint Mulberry32(ref uint state)
		{
			unchecked
			{
				state += 0x6D2B79F5u;
				uint t = state;
				t = (uint)Imul((int)(t ^ (t >> 15)), (int)(t | 1));
				t ^= (uint)((int)t + Imul((int)(t ^ (t >> 7)), (int)(t | 61)));
				return t ^ (t >> 14);
			}
		}

		private static float RngNext(ref uint state)
		{
			return Mulberry32(ref state) / 4294967296f;
		}

		public static string GetBiome(int cx, int cz)
		{
			double d = Math.Sqrt(cx * cx + cz * cz);
			if (d <= BIOME_RADIUS_CITY) return "city";
			if (d <= BIOME_RADIUS_MOUNTAIN) return "mountain";
			if (d <= BIOME_RADIUS_SUBURB) return "suburb";
			if (d <= BIOME_RADIUS_BEACH) return "beach";
			return "ocean";
		}

		// Returns true if there is a building at the given world position.
		// Replicates the frontend's per-chunk procedural building generation.
		public static bool IsBuildingAt(float x, float z)
		{
			int cx = (int)Math.Floor(x / CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CHUNK_SIZE);
			string biome = GetBiome(cx, cz);
			if (biome == "mountain" || biome == "beach" || biome == "ocean") return false;

			float blockCenterX = cx * CHUNK_SIZE + CHUNK_SIZE / 2f;
			float blockCenterZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2f;

			uint state = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);

			bool isSuburb = biome == "suburb";
			float buildChance = isSuburb ? 0.45f : 0.75f;
			if (RngNext(ref state) >= buildChance) return false;

			float w, d;
			if (isSuburb)
			{
				w = 10f + RngNext(ref state) * 14f;
				d = 10f + RngNext(ref state) * 14f;
			}
			else
			{
				float maxDim = BLOCK_SIZE + 6;
				w = 14f + RngNext(ref state) * (maxDim - 14f);
				d = 14f + RngNext(ref state) * (maxDim - 14f);
			}

			float halfW = w / 2f;
			float halfD = d / 2f;
			return Math.Abs(x - blockCenterX) < halfW && Math.Abs(z - blockCenterZ) < halfD;
		}

		// Returns true if a point is on a road.
		public static bool IsRoadAt(float x, float z)
		{
			float dx = x % GRID_PITCH;
			if (dx < 0) dx += GRID_PITCH;
			float distToGridX = Math.Min(dx, GRID_PITCH - dx);

			float dz = z % GRID_PITCH;
			if (dz < 0) dz += GRID_PITCH;
			float distToGridZ = Math.Min(dz, GRID_PITCH - dz);

			float sidewalkHalf = SIDEWALK_SIZE / 2f;
			float blockCenterOffset = GRID_PITCH / 2f;
			float roadHalfWidth = blockCenterOffset - sidewalkHalf;

			return distToGridX < roadHalfWidth || distToGridZ < roadHalfWidth;
		}
	}

	[ApiController]
	[Route("[controller]")]
	public class GrandTheftController : ControllerBase
	{
		private readonly IConfiguration _config;
		private const int INACTIVITY_TIMEOUT_SECONDS = 15;
		private const float POLICE_ARRIVAL_DISTANCE = 15.0f;
		private const float COP_APPROACH_RADIUS = 7.0f;
		private const float COP_ORBIT_SPEED = 0.015f;
		private static readonly ConcurrentDictionary<int, PlayerShootState> _shootingPlayers = new();
		private static readonly ConcurrentDictionary<int, int> _playerHealth = new();
		private static readonly ConcurrentDictionary<int, string> _playerModelUrls = new();
		private static readonly ConcurrentDictionary<int, double> _lastDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerWantedLevels = new();
		private static readonly ConcurrentDictionary<int, DateTime> _lastWantedDecay = new();
		private static readonly ConcurrentDictionary<int, double> _lastPoliceDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerMoney = new();
		private const float DEAD_BODY_TIMEOUT_SECONDS = 30;
		private static readonly ConcurrentDictionary<int, DeadPlayerBody> _deadPlayerBodies = new();
		private static readonly ConcurrentDictionary<int, ConcurrentDictionary<long, NpcState>> _worldNpcs = new();

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
			public DateTime? DeadAt { get; set; } = null;
			public float ApproachAngle { get; set; } = 0f;
		}

		private class DeadPlayerBody
		{
			public int UserId { get; set; }
			public float PosX { get; set; }
			public float PosZ { get; set; }
			public float Yaw { get; set; }
			public DateTime DiedAt { get; set; }
		}

		public GrandTheftController(IConfiguration config) { _config = config; }
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

				if (req.Health <= 0)
				{
					if (!_deadPlayerBodies.ContainsKey(req.UserId))
					{
						_deadPlayerBodies[req.UserId] = new DeadPlayerBody
						{
							UserId = req.UserId,
							PosX = req.PosX,
							PosZ = req.PosZ,
							Yaw = req.CarYaw,
							DiedAt = DateTime.UtcNow
						};
					}
				}
				else
				{
					_deadPlayerBodies.TryRemove(req.UserId, out _);
				}

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
                SELECT ps.user_id, ps.pos_x, ps.pos_y, ps.pos_z, ps.yaw, ps.pitch, ps.car_yaw, ps.car_speed, ps.health, ps.weapon, ps.money,
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
						players.Add(new
						{
							UserId = rdr.GetInt32("user_id"),
							PosX = rdr.GetFloat("pos_x"),
							PosY = rdr.GetFloat("pos_y"),
							PosZ = rdr.GetFloat("pos_z"),
							Yaw = rdr.GetFloat("yaw"),
							Pitch = rdr.GetFloat("pitch"),
							CarYaw = rdr.GetFloat("car_yaw"),
							CarSpeed = rdr.GetFloat("car_speed"),
							Health = rdr.GetInt32("health"),
							Weapon = rdr.GetInt32("weapon"),
							Money = rdr.GetInt32("money"),
							Username = rdr.GetString("username")
						});
					}
				}

				// NPC Logic
				if (_worldNpcs.ContainsKey(req.WorldId))
				{
					var npcs = _worldNpcs[req.WorldId];
					var now = DateTime.UtcNow;
					foreach (var npc in npcs.Values)
					{
						if (npc.DeadAt.HasValue) continue;

						// NEW: Proper separation force instead of random nudge
						float sepX = 0f, sepZ = 0f;
						float minSep = npc.Type == "cop" ? 3.5f : 2.0f;
						int sepCount = 0;

						foreach (var otherNpc in npcs.Values)
						{
							if (otherNpc.Id == npc.Id || otherNpc.DeadAt.HasValue) continue;
							float sdx = npc.X - otherNpc.X;
							float sdz = npc.Z - otherNpc.Z;
							float sDistSq = sdx * sdx + sdz * sdz;
							if (sDistSq < minSep * minSep && sDistSq > 0.01f)
							{
								float sDist = (float)Math.Sqrt(sDistSq);
								float force = (minSep - sDist) / minSep;
								sepX += (sdx / sDist) * force;
								sepZ += (sdz / sDist) * force;
								sepCount++;
							}
						}

						// Apply separation force
						npc.X += sepX * 0.3f;
						npc.Z += sepZ * 0.3f;

						// Move towards target (only if not too close after separation)
						float dx = npc.TargetX - npc.X;
						float dz = npc.TargetZ - npc.Z;
						float dist = (float)Math.Sqrt(dx * dx + dz * dz);
						if (dist > 0.5f)
						{
							npc.X += (dx / dist) * npc.Speed * 0.1f;
							npc.Z += (dz / dist) * npc.Speed * 0.1f;
						}
						else
						{
							// Set new target using road/sidewalk points
							// (not random offsets which can be inside buildings)
							if (npc.Type != "cop")
							{
								var pathRng = new Random();
								float tx = npc.TargetX, tz = npc.TargetZ;
								if (npc.Type == "ped_male" || npc.Type == "ped_female")
									GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out tx, out tz, pathRng);
								else
									GetRandomRoadPointNearPlayer(npc.X, npc.Z, out tx, out tz, pathRng);
								npc.TargetX = tx;
								npc.TargetZ = tz;
							}
						}

						npc.LastUpdate = now;
					}
				}

				return Ok(new { ok = true, players, wantedLevel });
			}
			catch (Exception ex)
			{
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
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
			var deadBodies = new List<object>();
			var deadIds = new List<long>();
			var rng = new Random();

			int nearbyCars = 0;
			int nearbyPeds = 0;
			int wantedLevel = 0;
			if (userId > 0 && _playerWantedLevels.TryGetValue(userId, out var w)) wantedLevel = w;

			foreach (var kv in npcs)
			{
				var npc = kv.Value;

				// Dead body handling
				if (npc.DeadAt != null)
				{
					if ((DateTime.UtcNow - npc.DeadAt.Value).TotalSeconds > DEAD_BODY_TIMEOUT_SECONDS)
					{
						deadIds.Add(kv.Key);
					}
					else
					{
						float ddx = npc.X - posX;
						float ddz = npc.Z - posZ;
						if (ddx * ddx + ddz * ddz < 250f * 250f)
						{
							deadBodies.Add(new
							{
								id = npc.Id,
								posX = npc.X,
								posZ = npc.Z,
								yaw = npc.Yaw,
								type = npc.Type,
								gender = npc.Gender,
								colorR = npc.Cr,
								colorG = npc.Cg,
								colorB = npc.Cb,
								deathTime = ((DateTimeOffset)npc.DeadAt.Value).ToUnixTimeSeconds()
							});
						}
					}
					continue;
				}

				if (npc.Health <= 0) { npc.DeadAt = DateTime.UtcNow; continue; }

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
									Cr = 0.1f,
									Cg = 0.1f,
									Cb = 0.2f,
								};
								npc.Type = "cop";
								npc.Speed = 5.0f;
								npc.ApproachAngle = (float)Math.Atan2(npc.X - posX, npc.Z - posZ);
							}
						}

						npc.TargetX = posX + (float)Math.Cos(npc.ApproachAngle) * COP_APPROACH_RADIUS;
						npc.TargetZ = posZ + (float)Math.Sin(npc.ApproachAngle) * COP_APPROACH_RADIUS;
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
						// NEW: Once a cop reaches their offset position, slowly orbit the player
						// instead of re-targeting the center. This keeps them spread out and circling.
						npc.ApproachAngle += COP_ORBIT_SPEED;
						npc.TargetX = posX + (float)Math.Cos(npc.ApproachAngle) * COP_APPROACH_RADIUS;
						npc.TargetZ = posZ + (float)Math.Sin(npc.ApproachAngle) * COP_APPROACH_RADIUS;
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
					float moveX = (tdx / distToTarget) * npc.Speed * 0.5f;
					float moveZ = (tdz / distToTarget) * npc.Speed * 0.5f;

					// Separation force — push NPCs away from each other
					float sepX = 0f, sepZ = 0f;
					float minDist = npc.Type == "cop" ? 3.5f : 2.0f;
					foreach (var otherKv in npcs)
					{
						if (otherKv.Key == kv.Key) continue;
						var other = otherKv.Value;
						if (other.DeadAt != null) continue;
						float sdx = npc.X - other.X;
						float sdz = npc.Z - other.Z;
						float sDistSq = sdx * sdx + sdz * sdz;
						if (sDistSq < minDist * minDist && sDistSq > 0.01f)
						{
							float sDist = (float)Math.Sqrt(sDistSq);
							float force = (minDist - sDist) / minDist;
							sepX += (sdx / sDist) * force;
							sepZ += (sdz / sDist) * force;
						}
					}

					moveX += sepX * 0.5f;
					moveZ += sepZ * 0.5f;

					// Building collision avoidance: check if next position is
					// inside a building. If so, try sliding along one axis.
					float nextX = npc.X + moveX;
					float nextZ = npc.Z + moveZ;

					if (!CityLayout.IsBuildingAt(nextX, nextZ))
					{
						npc.X = nextX;
						npc.Z = nextZ;
					}
					else if (!CityLayout.IsBuildingAt(npc.X + moveX, npc.Z))
					{
						npc.X += moveX; // slide along X
					}
					else if (!CityLayout.IsBuildingAt(npc.X, npc.Z + moveZ))
					{
						npc.Z += moveZ; // slide along Z
					}
					else
					{
						// Both axes blocked — pick a new target
						if (npc.Type != "cop")
						{
							float tx = npc.TargetX, tz = npc.TargetZ;
							if (npc.Type == "ped_male" || npc.Type == "ped_female")
								GetRandomSidewalkPointNearPlayer(posX, posZ, out tx, out tz, rng);
							else
								GetRandomRoadPointNearPlayer(posX, posZ, out tx, out tz, rng);
							npc.TargetX = tx;
							npc.TargetZ = tz;
						}
					}

					npc.Yaw = (float)Math.Atan2(moveX, moveZ);
				}

				var entry = new { id = npc.Id, posX = npc.X, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health };
				if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") pedestrians.Add(entry);
				else cars.Add(entry);
			}
			foreach (var id in deadIds) npcs.TryRemove(id, out _);

			// Add dead player bodies
			var expiredPlayers = new List<int>();
			foreach (var kv in _deadPlayerBodies)
			{
				if ((DateTime.UtcNow - kv.Value.DiedAt).TotalSeconds > DEAD_BODY_TIMEOUT_SECONDS)
				{
					expiredPlayers.Add(kv.Key);
					continue;
				}
				float ddx = kv.Value.PosX - posX;
				float ddz = kv.Value.PosZ - posZ;
				if (ddx * ddx + ddz * ddz < 250f * 250f)
				{
					deadBodies.Add(new
					{
						id = kv.Key,
						posX = kv.Value.PosX,
						posZ = kv.Value.PosZ,
						yaw = kv.Value.Yaw,
						type = "player",
						gender = "male",
						colorR = 0.5f,
						colorG = 0.5f,
						colorB = 0.5f,
						deathTime = ((DateTimeOffset)kv.Value.DiedAt).ToUnixTimeSeconds(),
						userId = kv.Value.UserId
					});
				}
			}
			foreach (var pid in expiredPlayers) _deadPlayerBodies.TryRemove(pid, out _);

			while (nearbyCars < 10)
			{
				long id = GetNextNpcId();
				// "taxi" added to the traffic pool — appears with the same
				// probability as the other vehicle types so the city has a
				// steady trickle of cabs the player can steal and use to
				// start taxi missions (see grandtheft.component.ts).
				var type = new[] { "car", "bus", "bike", "motorcycle", "taxi" }[rng.Next(5)];
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
					// Taxis are always yellow so the player can spot them.
					// Other types keep their random colors.
					Cr = type == "taxi" ? 1.0f : (float)rng.NextDouble(),
					Cg = type == "taxi" ? 0.85f : (float)rng.NextDouble(),
					Cb = type == "taxi" ? 0.1f : (float)rng.NextDouble()
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

			int totalDesired = wantedLevel * 2;
			while (wantedLevel > 0 && nearbyPolice < totalDesired)
			{
				long id = GetNextNpcId();
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng);

				// NEW: Evenly distribute approach angles so cops spread out from the start
				// Small random jitter (+/-0.3 rad) keeps it looking natural
				float angle = (float)(nearbyPolice * Math.PI * 2.0 / totalDesired) + (float)(rng.NextDouble() * 0.6 - 0.3);

				npcs[id] = new NpcState
				{
					Id = id,
					Type = "police",
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = 15.0f,
					Health = 150,
					Cr = 0.1f,
					Cg = 0.1f,
					Cb = 0.2f,
					TargetUserId = userId,
					ApproachAngle = angle  // <-- NEW
				};
				nearbyPolice++;
			}

			return Ok(new { cars, pedestrians, parkedCars, deadBodies });
		}

		private void SeedNPCs(int worldId, float posX = 0, float posZ = 0)
		{
			var dict = _worldNpcs[worldId];
			var rng = new Random();
			// Keep "taxi" in the seed pool too so cabs are present the moment
			// a player joins (not only after the dynamic spawner kicks in).
			var vTypes = new[] { "car", "bus", "bike", "motorcycle", "taxi" };
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
					Cr = type == "taxi" ? 1.0f : (float)rng.NextDouble(),
					Cg = type == "taxi" ? 0.85f : (float)rng.NextDouble(),
					Cb = type == "taxi" ? 0.1f : (float)rng.NextDouble()
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
			// Use the same 80m grid as the frontend (GRID_PITCH = 80).
			int gridRange = 3;
			int baseGx = (int)Math.Round(px / 80f);
			int baseGz = (int)Math.Round(pz / 80f);
			int gx = baseGx + rng.Next(-gridRange, gridRange + 1);
			int gz = baseGz + rng.Next(-gridRange, gridRange + 1);

			if (rng.NextDouble() < 0.5)
			{
				x = gx * 80f;
				z = pz + (float)(rng.NextDouble() - 0.5) * 120f;
			}
			else
			{
				x = px + (float)(rng.NextDouble() - 0.5) * 120f;
				z = gz * 80f;
			}

			// Ensure the point is not inside a building
			for (int attempt = 0; attempt < 5 && CityLayout.IsBuildingAt(x, z); attempt++)
			{
				x += (float)(rng.NextDouble() - 0.5) * 20f;
				z += (float)(rng.NextDouble() - 0.5) * 20f;
			}
		}

		private void GetRandomSidewalkPointNearPlayer(float px, float pz, out float x, out float z, Random rng)
		{
			// Use the same 80m grid as the frontend (GRID_PITCH = 80).
			int gridRange = 3;
			int baseGx = (int)Math.Round((px - 40f) / 80f);
			int baseGz = (int)Math.Round((pz - 40f) / 80f);
			int gx = baseGx + rng.Next(-gridRange, gridRange + 1);
			int gz = baseGz + rng.Next(-gridRange, gridRange + 1);

			float cx = gx * 80f + 40f;
			float cz = gz * 80f + 40f;
			float sidewalkEdge = 18f;

			int edge = rng.Next(4);
			if (edge == 0) { x = cx; z = cz - sidewalkEdge; }
			else if (edge == 1) { x = cx; z = cz + sidewalkEdge; }
			else if (edge == 2) { x = cx - sidewalkEdge; z = cz; }
			else { x = cx + sidewalkEdge; z = cz; }

			if (edge < 2) x += (float)(rng.NextDouble() - 0.5) * 30f;
			else z += (float)(rng.NextDouble() - 0.5) * 30f;
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
				if (kv.Key == req.TargetId && kv.Value.Health > 0 && kv.Value.DeadAt == null)
				{
					kv.Value.Health -= req.Damage;
					hitAnything = true;
					if (kv.Value.Health <= 0) kv.Value.DeadAt = DateTime.UtcNow;
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