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

		// Returns road intersection nodes (grid points) within radius chunks of (cx, cz).
		// Mirrors grandtheft-renderer.ts getRoadNodesInRadius().
		public static List<(float x, float z)> GetRoadNodes(int cx, int cz, int radius)
		{
			var nodes = new List<(float x, float z)>();
			int blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
			int startGx = (cx * blocksPerChunk) - radius;
			int startGz = (cz * blocksPerChunk) - radius;
			int endGx = (cx * blocksPerChunk + blocksPerChunk) + radius;
			int endGz = (cz * blocksPerChunk + blocksPerChunk) + radius;
			for (int gx = startGx; gx <= endGx; gx++)
			{
				for (int gz = startGz; gz <= endGz; gz++)
				{
					int nc = gx / blocksPerChunk;
					int nz = gz / blocksPerChunk;
					if (gx < 0) nc = (gx - blocksPerChunk + 1) / blocksPerChunk;
					if (gz < 0) nz = (gz - blocksPerChunk + 1) / blocksPerChunk;
					string biome = GetBiome(nc, nz);
					if (biome == "mountain" || biome == "beach" || biome == "ocean") continue;
					nodes.Add((gx * GRID_PITCH, gz * GRID_PITCH));
				}
			}
			return nodes;
		}

		// Builds undirected edges between adjacent nodes (same row/col, GRID_PITCH apart).
		// Mirrors grandtheft-renderer.ts getRoadEdges().
		public static List<(int from, int to)> GetRoadEdges(List<(float x, float z)> nodes)
		{
			var edges = new List<(int from, int to)>();
			for (int i = 0; i < nodes.Count; i++)
			{
				for (int j = i + 1; j < nodes.Count; j++)
				{
					float dx = Math.Abs(nodes[i].x - nodes[j].x);
					float dz = Math.Abs(nodes[i].z - nodes[j].z);
					if ((dx == GRID_PITCH && dz == 0) || (dx == 0 && dz == GRID_PITCH))
					{
						edges.Add((i, j));
					}
				}
			}
			return edges;
		}

		// Returns the lane offset perpendicular to the road direction for
		// right-hand driving: offset is (+perpZ, -perpX) normalized to 12.5.
		public static (float ox, float oz) GetLaneOffset(float fromX, float fromZ, float toX, float toZ, bool forward)
		{
			float dx = toX - fromX;
			float dz = toZ - fromZ;
			float len = (float)Math.Sqrt(dx * dx + dz * dz);
			if (len < 0.001f) return (0, 0);
			const float laneOffset = 12.5f;
			float perpX = dz / len * laneOffset;
			float perpZ = -dx / len * laneOffset;
			if (forward) return (perpX, perpZ);
			return (-perpX, -perpZ);
		}

		// Returns true if the traffic light at this intersection is currently red
		// for vehicles travelling along the X axis (horizontal roads).
		// Phase alternates every 6s, matching the client renderer.
		public static bool IsLightRedForX()
		{
			long ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
			return (ms / 6000) % 2 == 0;
		}

		// Find index of the node closest to (x, z).
		public static int ClosestNode(List<(float x, float z)> nodes, float x, float z)
		{
			int best = -1;
			float bestDist = float.MaxValue;
			for (int i = 0; i < nodes.Count; i++)
			{
				float dx = nodes[i].x - x;
				float dz = nodes[i].z - z;
				float d = dx * dx + dz * dz;
				if (d < bestDist) { bestDist = d; best = i; }
			}
			return Math.Max(0, best);
		}

		// Simple BFS pathfind on the grid between node indices.
		// Returns list of node indices forming a path, or null if unreachable.
		public static List<int>? FindPath(List<(float x, float z)> nodes, int start, int end)
		{
			if (nodes.Count < 2) return null;
			var edges = GetRoadEdges(nodes);
			var adj = new List<List<int>>(nodes.Count);
			for (int i = 0; i < nodes.Count; i++) adj.Add(new List<int>());
			foreach (var e in edges)
			{
				adj[e.from].Add(e.to);
				adj[e.to].Add(e.from);
			}
			int[] prev = new int[nodes.Count];
			bool[] visited = new bool[nodes.Count];
			for (int i = 0; i < nodes.Count; i++) prev[i] = -1;
			var queue = new Queue<int>();
			queue.Enqueue(start);
			visited[start] = true;
			while (queue.Count > 0)
			{
				int cur = queue.Dequeue();
				if (cur == end) break;
				foreach (var nxt in adj[cur])
				{
					if (!visited[nxt])
					{
						visited[nxt] = true;
						prev[nxt] = cur;
						queue.Enqueue(nxt);
					}
				}
			}
			if (!visited[end]) return null;
			var path = new List<int>();
			for (int at = end; at != -1; at = prev[at])
				path.Add(at);
			path.Reverse();
			return path;
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
		// NEW (Feature 3): Track which players are currently in cars and which
		// have been carjacked. In-memory only — resets on server restart,
		// avoids a DB migration. isInCar is inferred from CarSpeed > 0 with
		// a 5-second cooldown so stopped-in-car still counts as in-car.
		private static readonly ConcurrentDictionary<int, bool> _playerInCar = new();
		private static readonly ConcurrentDictionary<int, DateTime> _playerInCarTime = new();
		private static readonly ConcurrentDictionary<int, bool> _evictedPlayers = new();
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
			// NEW (Bug 3): If this cop exited a police car to chase the
			// player, this stores the Id of the parked police car so the
			// cop can walk back and re-enter it when the player loses their
			// wanted level. 0 means no home vehicle (cop will become a
			// normal pedestrian on wanted-loss).
			public long HomeVehicleId { get; set; } = 0;
			// Traffic/path state for road-following vehicles
			public List<int>? PathIndices { get; set; } = null;
			public int PathIdx { get; set; } = 0;
			public float LaneOffsetX { get; set; } = 0f;
			public float LaneOffsetZ { get; set; } = 0f;
			public float StopTimer { get; set; } = 0f;
			public bool Stopped { get; set; } = false;
			public bool HasDriver { get; set; } = true;
			public int PassengerCount { get; set; } = 0;
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
				// NEW (Feature 3): Infer in-car state from CarSpeed. If the player
				// is moving (speed > 0.5) they must be in a car. Keep the flag
				// alive for 5 seconds after the last movement so stopped-in-car
				// still counts. This avoids needing a new IsInCar field in the
				// request DTO (which would require a service-method change).
				if (req.CarSpeed > 0.5f)
				{
					_playerInCar[req.UserId] = true;
					_playerInCarTime[req.UserId] = DateTime.UtcNow;
				}
				else if (_playerInCarTime.TryGetValue(req.UserId, out var lastDrive) &&
						 (DateTime.UtcNow - lastDrive).TotalSeconds > 5)
				{
					_playerInCar[req.UserId] = false;
				}

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
					// Reset wanted level and money on death
					_playerWantedLevels[req.UserId] = 0;
					_playerMoney[req.UserId] = 0;
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
							Username = rdr.GetString("username"),
							// NEW (Feature 3): expose in-car state so other clients can
							// render the player inside a car and allow carjacking.
							IsInCar = _playerInCar.TryGetValue(rdr.GetInt32("user_id"), out var inCar) && inCar
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

				// NEW (Feature 3): If this player was carjacked, signal eviction
				// so their client calls exitCar(). The flag is set by another
				// player calling StealCar with a negative npcId (see below).
				bool evicted = _evictedPlayers.TryRemove(req.UserId, out _);
				return Ok(new { ok = true, players, wantedLevel, evicted });
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
						// NEW (Bug 3): Instead of deleting the cop, either walk
						// back to the police car (if it still exists and is
						// parked) or become a normal pedestrian. Clear the target
						// so the cop stops chasing and the movement branch below
						// uses pedestrian-style wandering.
						npc.TargetUserId = 0;
						if (npc.HomeVehicleId != 0
							&& npcs.TryGetValue(npc.HomeVehicleId, out var homeCar)
							&& homeCar.Type == "parked")
						{
							// Walk back to the police car. The re-entry check in
							// the cop movement branch below will convert the cop
							// back to a "police" NPC when it gets close enough.
							npc.TargetX = homeCar.X;
							npc.TargetZ = homeCar.Z;
						}
						else
						{
							// Car gone or occupied — become a normal pedestrian.
							npc.HomeVehicleId = 0;
							npc.Type = "ped_" + npc.Gender;
							GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out float sx, out float sz, rng);
							npc.TargetX = sx;
							npc.TargetZ = sz;
							npc.Speed = 2.0f;
						}
						// Do NOT continue — fall through so the cop/ped actually
						// moves this tick. The movement branch will handle
						// walking toward the target or re-entering the car.
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
								// NEW (Bug 3): Remember the parked police car so the
								// cop can walk back to it when the player loses wanted.
								npc.HomeVehicleId = parkedId;
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

				bool isVehicle = npc.Type == "car" || npc.Type == "bus" || npc.Type == "bike" || npc.Type == "motorcycle" || npc.Type == "taxi";

				if (isVehicle)
				{
					// --- Traffic-aware vehicle movement ---
					const float INTERSECTION_RADIUS = 14f;
					const float SPEED_FACTOR = 0.5f;

					// Build road graph around this NPC
					int npcCX = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
					int npcCZ = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
					var nodes = CityLayout.GetRoadNodes(npcCX, npcCZ, 4);
					if (nodes.Count < 2)
					{
						// Fallback for areas with no roads — use old movement
						float moveX = (tdx / distToTarget) * npc.Speed * SPEED_FACTOR;
						float moveZ = (tdz / distToTarget) * npc.Speed * SPEED_FACTOR;
						float nextX = npc.X + moveX;
						float nextZ = npc.Z + moveZ;
						if (!CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
						npc.Yaw = (float)Math.Atan2(moveX, moveZ);
					}
					else
					{
						// Find or build a path
						if (npc.PathIndices == null || npc.PathIdx >= npc.PathIndices.Count)
						{
							// Pick a random start/end node and build a path
							int startIdx = CityLayout.ClosestNode(nodes, npc.X, npc.Z);
							int endIdx = rng.Next(nodes.Count);
							if (endIdx == startIdx) endIdx = (startIdx + 1) % nodes.Count;
							npc.PathIndices = CityLayout.FindPath(nodes, startIdx, endIdx);
							npc.PathIdx = 0;
							if (npc.PathIndices == null || npc.PathIndices.Count < 2)
							{
								npc.PathIndices = new List<int> { startIdx, (startIdx + 1) % nodes.Count };
							}
							// Set lane offset based on first edge direction
							var fromN = nodes[npc.PathIndices[0]];
							var toN = nodes[npc.PathIndices[1]];
							var off = CityLayout.GetLaneOffset(fromN.x, fromN.z, toN.x, toN.z, true);
							npc.LaneOffsetX = off.ox;
							npc.LaneOffsetZ = off.oz;
						}

						int currIdx = npc.PathIndices[npc.PathIdx];
						int nextIdx = npc.PathIdx + 1 < npc.PathIndices.Count ? npc.PathIndices[npc.PathIdx + 1] : currIdx;
						var currNode = nodes[currIdx];
						var nextNode = nodes[nextIdx];

						float targetX = nextNode.x + npc.LaneOffsetX;
						float targetZ = nextNode.z + npc.LaneOffsetZ;
						float ddx2 = targetX - npc.X;
						float ddz2 = targetZ - npc.Z;
						float distToTarget2 = (float)Math.Sqrt(ddx2 * ddx2 + ddz2 * ddz2);

						// Traffic light check at intersections
						bool lightStop = false;
						if (nextIdx != currIdx && distToTarget2 < INTERSECTION_RADIUS)
						{
							float nodeDx = nextNode.x - currNode.x;
							float nodeDz = nextNode.z - currNode.z;
							bool isHorizontal = Math.Abs(nodeDx) > Math.Abs(nodeDz);
							if (CityLayout.IsLightRedForX() == isHorizontal)
							{
								lightStop = true;
							}
						}

						// Obstacle check — other NPCs ahead
						bool blocked = false;
						for (float ahead = 2f; ahead < 8f; ahead += 2f)
						{
							float cx = npc.X + (float)Math.Sin(npc.Yaw) * ahead;
							float cz = npc.Z + (float)Math.Cos(npc.Yaw) * ahead;
							foreach (var otherKv in npcs)
							{
								if (otherKv.Key == kv.Key || otherKv.Value.DeadAt != null) continue;
								float odx = otherKv.Value.X - cx;
								float odz = otherKv.Value.Z - cz;
								if (odx * odx + odz * odz < 9f) { blocked = true; break; }
							}
							if (blocked) break;
						}

						if (lightStop || blocked || npc.Stopped)
						{
							npc.Stopped = true;
							npc.StopTimer += 0.016f;
							if (npc.StopTimer > 1.5f) { npc.Stopped = false; npc.StopTimer = 0; }
						}
						else
						{
							npc.StopTimer = 0f;
							if (distToTarget2 < 2.5f)
							{
								// Advance to next node
								npc.PathIdx++;
								if (npc.PathIdx >= npc.PathIndices.Count)
								{
									// Reached end — pick new destination
									int newEnd = rng.Next(nodes.Count);
									npc.PathIndices = CityLayout.FindPath(nodes, currIdx, newEnd);
									npc.PathIdx = 0;
									if (npc.PathIndices == null || npc.PathIndices.Count < 2)
									{
										npc.PathIndices = new List<int> { currIdx, (currIdx + 1) % nodes.Count };
									}
									var nn = nodes[npc.PathIndices[0]];
									var nm = nodes[npc.PathIndices[1]];
									var off2 = CityLayout.GetLaneOffset(nn.x, nn.z, nm.x, nm.z, true);
									npc.LaneOffsetX = off2.ox;
									npc.LaneOffsetZ = off2.oz;
								}
								else
								{
									// Update lane offset for new segment
									var cn = nodes[npc.PathIndices[npc.PathIdx]];
									var nn2 = nodes[npc.PathIndices[npc.PathIdx + 1 < npc.PathIndices.Count ? npc.PathIdx + 1 : npc.PathIdx]];
									var off3 = CityLayout.GetLaneOffset(cn.x, cn.z, nn2.x, nn2.z, true);
									npc.LaneOffsetX = off3.ox;
									npc.LaneOffsetZ = off3.oz;
								}
							}
							else
							{
								float moveX = (ddx2 / distToTarget2) * npc.Speed * SPEED_FACTOR;
								float moveZ = (ddz2 / distToTarget2) * npc.Speed * SPEED_FACTOR;
								float nextX = npc.X + moveX;
								float nextZ = npc.Z + moveZ;
								if (!CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
								npc.Yaw = (float)Math.Atan2(moveX, moveZ);
							}
						}
					}
				}
				else if (npc.Type == "cop")
				{
					// NEW (Bug 3D): If the cop has been relieved of duty
					// (TargetUserId == 0) and is close to its home police
					// car, re-enter the car and become a "police" NPC with
					// a driver again. The parked car is removed.
					//
					// FIX: Only attempt re-entry when TargetUserId == 0
					// (i.e., the cop's wanted target was lost). Without
					// this gate, the cop re-enters the car on the very
					// next tick after exiting it — because the parked
					// car is at the same position the cop spawned at,
					// so the distance check passes immediately. The cop
					// would never chase on foot; it would just arrive
					// and immediately drive away.
					bool copReEntered = false;
					if (npc.TargetUserId == 0
						&& npc.HomeVehicleId != 0
						&& npcs.TryGetValue(npc.HomeVehicleId, out var homeCar2)
						&& homeCar2.Type == "parked")
					{
						float hcdx = npc.X - homeCar2.X;
						float hcdz = npc.Z - homeCar2.Z;
						if (hcdx * hcdx + hcdz * hcdz < 2.5f * 2.5f)
						{
							npc.Type = "police";
							npc.X = homeCar2.X;
							npc.Z = homeCar2.Z;
							npc.Yaw = homeCar2.Yaw;
							npc.HasDriver = true;
							npc.Speed = 15.0f;
							npc.HomeVehicleId = 0;
							npc.TargetUserId = 0;
							npc.TargetX = npc.X;
							npc.TargetZ = npc.Z;
							deadIds.Add(homeCar2.Id);
							copReEntered = true;
						}
					}
					if (!copReEntered)
					{
						if (distToTarget < 2.0f)
						{
							// NEW (Bug 2): Only orbit around the player if actively
							// hunting them. Otherwise pick a sidewalk point and
							// walk there (pedestrian-style), or keep walking toward
							// the home car if returning.
							if (npc.TargetUserId == userId && wantedLevel > 0)
							{
								npc.ApproachAngle += COP_ORBIT_SPEED;
								npc.TargetX = posX + (float)Math.Cos(npc.ApproachAngle) * COP_APPROACH_RADIUS;
								npc.TargetZ = posZ + (float)Math.Sin(npc.ApproachAngle) * COP_APPROACH_RADIUS;
							}
							else if (npc.HomeVehicleId == 0)
							{
								// Not hunting, no car to return to — wander
								GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out float sx, out float sz, rng);
								npc.TargetX = sx;
								npc.TargetZ = sz;
							}
							// else: keep walking toward the home car (target
							// already set by the wanted-loss block above).
						}
						else
						{
							float moveX = (tdx / distToTarget) * npc.Speed * 0.5f;
							float moveZ = (tdz / distToTarget) * npc.Speed * 0.5f;
							float nextX = npc.X + moveX;
							float nextZ = npc.Z + moveZ;
							if (!CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
						}
						// NEW (Bug 2): Face the player only while actively
						// hunting them. Otherwise face the movement direction
						// (pedestrian-style) so the cop doesn't appear sideways.
						if (npc.TargetUserId == userId && wantedLevel > 0)
						{
							npc.Yaw = (float)Math.Atan2(npc.X - posX, npc.Z - posZ);
						}
						else
						{
							npc.Yaw = (float)Math.Atan2(tdx, tdz);
						}
					}
				}
				else
				{
					// Pedestrian movement (unchanged)
					if (distToTarget < 2.0f)
					{
						float targetX = 0, targetZ = 0;
						GetRandomSidewalkPointNearPlayer(posX, posZ, out targetX, out targetZ, rng);
						npc.TargetX = targetX;
						npc.TargetZ = targetZ;
					}
					else
					{
						float moveX = (tdx / distToTarget) * npc.Speed * 0.5f;
						float moveZ = (tdz / distToTarget) * npc.Speed * 0.5f;

						float sepX = 0f, sepZ = 0f;
						foreach (var otherKv in npcs)
						{
							if (otherKv.Key == kv.Key || otherKv.Value.DeadAt != null) continue;
							float sdx = npc.X - otherKv.Value.X;
							float sdz = npc.Z - otherKv.Value.Z;
							float sDistSq = sdx * sdx + sdz * sdz;
							if (sDistSq < 2f * 2f && sDistSq > 0.01f)
							{
								float sDist = (float)Math.Sqrt(sDistSq);
								float force = (2f - sDist) / 2f;
								sepX += (sdx / sDist) * force;
								sepZ += (sdz / sDist) * force;
							}
						}
						moveX += sepX * 0.5f;
						moveZ += sepZ * 0.5f;

						float nextX = npc.X + moveX;
						float nextZ = npc.Z + moveZ;
						if (!CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
						npc.Yaw = (float)Math.Atan2(moveX, moveZ);
					}
				}

				var entry = new { id = npc.Id, posX = npc.X, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health, hasDriver = npc.HasDriver, passengerCount = npc.PassengerCount };
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
					Cr = type == "taxi" ? 1.0f : (float)rng.NextDouble(),
					Cg = type == "taxi" ? 0.85f : (float)rng.NextDouble(),
					Cb = type == "taxi" ? 0.1f : (float)rng.NextDouble(),
					HasDriver = true,
					PassengerCount = type == "bus" ? rng.Next(1, 4) : rng.Next(0, 2),
					Gender = rng.Next(2) == 0 ? "male" : "female"
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
					Cb = type == "taxi" ? 0.1f : (float)rng.NextDouble(),
					HasDriver = true,
					PassengerCount = type == "bus" ? rng.Next(1, 4) : rng.Next(0, 2),
					Gender = rng.Next(2) == 0 ? "male" : "female"
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
			// NEW (Feature 3): Negative npcId means carjack a human player.
			// The target userId is -npcId. Sets the eviction flag; the target
			// player's next UpdatePosition call will see evicted=true and
			// call exitCar() on their client. Reuses the existing stealCar
			// service method so no new endpoint/service change is needed.
			if (npcId < 0)
			{
				int targetUserId = (int)(-npcId);
				_evictedPlayers[targetUserId] = true;
				return Ok(new { ok = true, evictedNpcs = new List<object>() });
			}

			if (_worldNpcs.ContainsKey(req.WorldId) && _worldNpcs[req.WorldId].TryRemove(npcId, out var npc))
			{
				var rng = new Random();
				// NEW (Feature 2): Collect evicted NPCs so we can return them to
				// the client in the response. The client adds them to
				// serverPedestrians immediately, avoiding the 1-second poll
				// delay. The NPCs are ALSO inserted into _worldNpcs so future
				// polls from other players see them.
				var evictedNpcs = new List<object>();
				// Evict driver as a pedestrian NPC
				if (npc.HasDriver)
				{
					long driverId = GetNextNpcId();
					float driverX = npc.X + (float)(rng.NextDouble() * 2.0 - 1.0);
					float driverZ = npc.Z + (float)(rng.NextDouble() * 2.0 - 1.0);
					_worldNpcs[req.WorldId][driverId] = new NpcState
					{
						Id = driverId,
						Type = "ped_" + npc.Gender,
						Gender = npc.Gender,
						X = driverX,
						Z = driverZ,
						TargetX = npc.X,
						TargetZ = npc.Z,
						Yaw = npc.Yaw,
						Speed = 1.5f,
						Health = 50,
						Cr = 0.4f,
						Cg = 0.4f,
						Cb = 0.4f
					};
					evictedNpcs.Add(new { id = driverId, posX = driverX, posZ = driverZ, yaw = npc.Yaw, gender = npc.Gender, type = "ped_" + npc.Gender, health = 50, speed = 1.5f, colorR = 0.4f, colorG = 0.4f, colorB = 0.4f });
				}
				// Evict passengers as pedestrian NPCs
				for (int p = 0; p < npc.PassengerCount; p++)
				{
					long passengerId = GetNextNpcId();
					string pGender = rng.Next(2) == 0 ? "male" : "female";
					float passX = npc.X + (float)(rng.NextDouble() * 3.0 - 1.5);
					float passZ = npc.Z + (float)(rng.NextDouble() * 3.0 - 1.5);
					_worldNpcs[req.WorldId][passengerId] = new NpcState
					{
						Id = passengerId,
						Type = "ped_" + pGender,
						Gender = pGender,
						X = passX,
						Z = passZ,
						TargetX = npc.X,
						TargetZ = npc.Z,
						Yaw = npc.Yaw + (float)Math.PI,
						Speed = 1.5f,
						Health = 50,
						Cr = 0.4f,
						Cg = 0.4f,
						Cb = 0.4f
					};
					evictedNpcs.Add(new { id = passengerId, posX = passX, posZ = passZ, yaw = npc.Yaw + (float)Math.PI, gender = pGender, type = "ped_" + pGender, health = 50, speed = 1.5f, colorR = 0.4f, colorG = 0.4f, colorB = 0.4f });
				}
				return Ok(new { ok = true, evictedNpcs });
			}
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
				Cb = req.ColorB,
				// FIX: The car is now empty — the player exited. Mark it as
				// having no driver and no passengers so that when someone
				// steals this parked car later, StealCar won't spawn fake
				// evicted pedestrians (the driver/passengers already left
				// when the previous player parked it).
				HasDriver = false,
				PassengerCount = 0
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