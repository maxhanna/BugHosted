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
		public const int SIDEWALK_SIZE = 55;
		public const int BIOME_RADIUS_CITY = 18;
		public const int BIOME_RADIUS_MOUNTAIN = 30;
		public const int BIOME_RADIUS_SUBURB = 50;
		public const int BIOME_RADIUS_BEACH = 60;

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
			if (cx >= -2 && cx <= 3 && cz >= -2 && cz <= 2) return cz >= 2 || cz <= -2 ? "beach" : "city";
			if (cx >= 4 && cx <= 5 && cz >= -1 && cz <= 1) return "bridge";
			if (cx >= 6 && cx <= 15 && cz >= -5 && cz <= 5) return cz >= 4 || cz <= -4 ? "beach" : "city";
			if (cx >= 16 && cx <= 17 && cz >= -2 && cz <= 2) return "bridge";
			if (cx >= 18 && cx <= 30 && cz >= -7 && cz <= 7) return cz >= 6 || cz <= -6 ? "beach" : "suburb";
			if (cx >= 31 && cx <= 32 && cz >= -3 && cz <= 3) return "bridge";
			if (cx >= 33 && cx <= 50 && cz >= -10 && cz <= 10) {
				if (cz >= 8 || cz <= -8) return "beach";
				if (cz >= -5 && cz <= 5) return "city";
				return "suburb";
			}
			if (cx >= 35 && cx <= 44 && cz >= 11 && cz <= 15) return "aeroport";
			return "ocean";
		}

		// Returns true if there is a building at the given world position.
		// Mirrors the frontend's per-chunk multi-building layout.
		public static bool IsBuildingAt(float x, float z, float margin = 2.0f)
		{
			int cx = (int)Math.Floor(x / CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CHUNK_SIZE);
			if (cx == 1 && cz == 0) return true;

			string biome = GetBiome(cx, cz);
			if (biome == "mountain" || biome == "beach" || biome == "ocean" || biome == "bridge" || biome == "aeroport") return false;

			float blockCenterX = cx * CHUNK_SIZE + CHUNK_SIZE / 2f;
			float blockCenterZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2f;
			uint state = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);
			float maxDim = SIDEWALK_SIZE;
			bool isSuburb = biome == "suburb";

			if (isSuburb)
			{
				bool hasPOI = RngNext(ref state) < 0.25f;
				if (hasPOI)
				{
					RngNext(ref state); // poi model index
					RngNext(ref state); // poi yaw
				}
				int numHouses = 1 + (int)(RngNext(ref state) * 3);
				for (int hi = 0; hi < numHouses; hi++)
				{
					if (RngNext(ref state) >= 0.85f) continue;
					float hw = 8f + RngNext(ref state) * (maxDim * 0.4f);
					float hd = 8f + RngNext(ref state) * (maxDim * 0.4f);
					RngNext(ref state); // h
					float xOff = -10f + RngNext(ref state) * 20f;
					float zOff = -10f + RngNext(ref state) * 20f;
					RngNext(ref state); // model index
					RngNext(ref state); // yaw
					float halfW = hw / 2f + margin;
					float halfD = hd / 2f + margin;
					float bx = blockCenterX + xOff;
					float bz = blockCenterZ + zOff;
					if (Math.Abs(x - bx) < halfW && Math.Abs(z - bz) < halfD) return true;
				}
				return false;
			}
			else
			{
				int numBld = 3 + (int)(RngNext(ref state) * 4);
				for (int bi = 0; bi < numBld; bi++)
				{
					if (RngNext(ref state) >= 0.85f) continue;
					float bw = 8f + RngNext(ref state) * (maxDim * 0.3f);
					float bd = 6f + RngNext(ref state) * (maxDim * 0.25f);
					RngNext(ref state); // h
					int side = bi % 2 == 0 ? -1 : 1;
					RngNext(ref state); // edgeOff
					RngNext(ref state); // model index
					float px, pz;
					if (bi < 4)
					{
						px = blockCenterX + side * (maxDim / 2f - bd / 2f);
						pz = blockCenterZ + side * (maxDim / 2f - bd / 2f);
					}
					else
					{
						px = blockCenterX + side * (maxDim / 2f - bd / 2f);
						pz = blockCenterZ + side * (maxDim / 2f - bd / 2f);
					}
					float halfW = bw / 2f + margin;
					float halfD = bd / 2f + margin;
					if (Math.Abs(x - px) < halfW && Math.Abs(z - pz) < halfD) return true;
				}
				return false;
			}
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
		// COP_ORBIT_SPEED was designed for 60fps (0.015 rad/tick → 0.9 rad/s).
		// GetNPCs runs ~1/s so multiply by 60 for the same effective rate.
		private const float COP_ORBIT_SPEED = 0.9f;
		private static readonly ConcurrentDictionary<int, PlayerShootState> _shootingPlayers = new();
		private static readonly ConcurrentDictionary<int, int> _playerHealth = new();
		private static readonly ConcurrentDictionary<int, float> _playerX = new();
		private static readonly ConcurrentDictionary<int, float> _playerZ = new();
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
		// NEW: Track each player's vehicle type and car color so other
		// players can render the correct car model (not just carMeshes[0]).
		private static readonly ConcurrentDictionary<int, string> _playerVehicleType = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarColorR = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarColorG = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarColorB = new();
		// FIX: Track which player's car this player is a passenger in.
		// 0 = not a passenger. Other players read this to render the
		// passenger inside the host's car instead of on foot.
		private static readonly ConcurrentDictionary<int, int> _playerPassengerOf = new();
		private const float DEAD_BODY_TIMEOUT_SECONDS = 30;
		private static readonly ConcurrentDictionary<int, DeadPlayerBody> _deadPlayerBodies = new();
		private static readonly ConcurrentDictionary<int, ConcurrentDictionary<long, NpcState>> _worldNpcs = new();
		// In-memory chat messages per world. Transient — lost on restart.
		// Max 100 messages; entries older than 120s are pruned on each send.
		private static readonly ConcurrentDictionary<int, List<ChatMessageEntry>> _worldChatMessages = new();
		private class ChatMessageEntry { public int UserId { get; set; } public string Username { get; set; } = ""; public string Message { get; set; } = ""; public DateTime Timestamp { get; set; } }

		// Dropped weapons system — weapons on the floor that players can pick up
		private static readonly ConcurrentDictionary<long, DroppedWeapon> _droppedWeapons = new();
		private static long _nextDropId = 1000000;
		private static long GetNextDropId() => Interlocked.Increment(ref _nextDropId);
		private class DroppedWeapon
		{
			public long Id { get; set; }
			public float PosX { get; set; }
			public float PosZ { get; set; }
			public int WeaponType { get; set; }
			public int Ammo { get; set; }
			public bool IsHomeBase { get; set; }
			public DateTime DroppedAt { get; set; }
		}
		// Track each player's owned weapons and ammo (indexed by weapon type 0–4)
		// Always has weapon 0 (Unarmed) with ammo 0. Weapons 1–4 are collected.
		private static readonly ConcurrentDictionary<int, bool[]> _playerWeapons = new();
		private static readonly ConcurrentDictionary<int, int[]> _playerAmmo = new();
		// Home base weapon respawn cooldowns
		private static readonly bool[] _homeBaseWeaponCollected = new bool[5];
		private static readonly DateTime[] _homeBaseWeaponRespawnAt = new DateTime[5];
		private const int HOME_BASE_WEAPON_RESPAWN_SECONDS = 60;
		private static readonly float[] HOME_BASE_WEAPON_X = { 0, 114, 120, 117, 123 };
		private static readonly float[] HOME_BASE_WEAPON_Z = { 0, 48, 48, 48, 48 };

		private static long _nextNpcId = 1;
		private static long GetNextNpcId() => Interlocked.Increment(ref _nextNpcId);

		private class NpcState
		{
			public long Id { get; set; }
			public string Type { get; set; } = "car";
			public string Gender { get; set; } = "male";
			public float X { get; set; }
			public float Z { get; set; }
			public float Y { get; set; } = 0f;
			public float Yaw { get; set; }
			public float Speed { get; set; }
			public float TargetX { get; set; }
			public float TargetZ { get; set; }
			public float Cr { get; set; }
			public float Cg { get; set; }
			public float Cb { get; set; }
			public int Health { get; set; } = 100;
			public int MaxHealth { get; set; } = 100;
			public bool OnFire { get; set; } = false;
			public DateTime? FireStartedAt { get; set; } = null;
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
			// NEW: Cop on-foot shooting state. Cops must be stationary for
			// 3-4 seconds before they can fire, and can't move while shooting.
			public double StationaryTime { get; set; } = 0;
			public long LastShotTime { get; set; } = 0;
			public bool IsShootingAt { get; set; } = false;
			// FIX: IsParked distinguishes player-parked cars from active NPC
			// traffic. The actual vehicle type is stored in Type (e.g. "car",
			// "taxi", "motorcycle") so other players render the correct model.
			public bool IsParked { get; set; } = false;
			// Panic mode: when shot at, NPCs flee from the shooter
			public DateTime? PanicUntil { get; set; } = null;
			public float PanicFromX { get; set; } = 0f;
			public float PanicFromZ { get; set; } = 0f;
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
		// FIX: Home base coordinates — the japaneseShop. Occupies the building
		// slot at chunk (1,0), one block east of the hospital (40,40). The
		// procedural building for this chunk is suppressed in the renderer.
		// Players who have been inactive for >30 minutes respawn here on rejoin.
		private const float HOME_BASE_X = 120f;
		private const float HOME_BASE_Z = 40f;
		private const float HOME_BASE_YAW = 0f;
		private const int INACTIVITY_RESPAWN_MINUTES = 30;
		[HttpPost("UpdatePosition")]
		public async Task<IActionResult> UpdatePosition([FromBody] GTUpdatePositionRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// FIX: Check if the player was inactive for >30 minutes. If so,
				// override their position to the home base (japaneseShop).
				// We do this BEFORE the UPSERT so the saved position is the
				// home base, not their stale logged-out position.
				bool respawnAtHome = false;
				using (var checkCmd = new MySqlCommand("SELECT last_seen FROM maxhanna.grandtheft_player_state WHERE user_id = @uid", conn))
				{
					checkCmd.Parameters.AddWithValue("@uid", req.UserId);
					using var rdr = await checkCmd.ExecuteReaderAsync();
					if (await rdr.ReadAsync())
					{
						var lastSeen = rdr.GetDateTime("last_seen");
						var inactiveMinutes = (DateTime.UtcNow - lastSeen.ToUniversalTime()).TotalMinutes;
						if (inactiveMinutes >= INACTIVITY_RESPAWN_MINUTES)
						{
							respawnAtHome = true;
							req.PosX = HOME_BASE_X;
							req.PosZ = HOME_BASE_Z;
							req.Yaw = HOME_BASE_YAW;
							req.CarYaw = HOME_BASE_YAW;
							req.CarSpeed = 0;
							req.IsInCar = false;
						}
					}
				}

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

				_playerX[req.UserId] = req.PosX;
				_playerZ[req.UserId] = req.PosZ;

				_playerMoney[req.UserId] = Math.Max(0, req.Money);
				// FIX: Use the explicit IsInCar field from the request instead
				// of inferring from CarSpeed. The old inference (CarSpeed > 0.5
				// with 5-second cooldown) caused "sometimes can't see the car"
				// — if a player stopped in their car for >5s, other players
				// would see them as standing. The client now sends its actual
				// isInCar state every tick.
				_playerInCar[req.UserId] = req.IsInCar;
				_playerInCarTime[req.UserId] = DateTime.UtcNow;
				// Store vehicle type and color so other players render the
				// correct car model (taxi, bus, motorcycle, etc.) instead of
				// always using carMeshes[0].
				if (!string.IsNullOrEmpty(req.VehicleType))
					_playerVehicleType[req.UserId] = req.VehicleType!;
				if (req.IsInCar)
				{
					_playerCarColorR[req.UserId] = req.CarColorR;
					_playerCarColorG[req.UserId] = req.CarColorG;
					_playerCarColorB[req.UserId] = req.CarColorB;
				}
				// FIX: Store which player's car this player is a passenger in.
				// 0 = not a passenger. Other players read this to render the
				// passenger inside the host's car.
				_playerPassengerOf[req.UserId] = req.PassengerOfUserId;

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

				// Chat message handling
				var chatMessages = new List<object>();
				if (!string.IsNullOrEmpty(req.ChatMessage))
				{
					string senderUsername = $"Player{req.UserId}";
					using (var nameCmd = new MySqlCommand("SELECT username FROM maxhanna.users WHERE id = @uid", conn))
					{
						nameCmd.Parameters.AddWithValue("@uid", req.UserId);
						var nameResult = await nameCmd.ExecuteScalarAsync();
						if (nameResult != null) senderUsername = nameResult.ToString()!;
					}
					var messages = _worldChatMessages.GetOrAdd(req.WorldId, _ => new List<ChatMessageEntry>());
					lock (messages)
					{
						messages.Add(new ChatMessageEntry { UserId = req.UserId, Username = senderUsername, Message = req.ChatMessage, Timestamp = DateTime.UtcNow });
						// Prune old messages (>120s) and cap at 100
						var pruneCutoff = DateTime.UtcNow.AddSeconds(-120);
						messages.RemoveAll(m => m.Timestamp < pruneCutoff);
						while (messages.Count > 100) messages.RemoveAt(0);
					}
				}
				// Always include recent chat messages in response
				{
					var messages = _worldChatMessages.GetOrAdd(req.WorldId, _ => new List<ChatMessageEntry>());
					lock (messages)
					{
						var chatCutoff = DateTime.UtcNow.AddSeconds(-60);
						foreach (var m in messages)
						{
							if (m.Timestamp >= chatCutoff)
							{
								chatMessages.Add(new { userId = m.UserId, username = m.Username, message = m.Message, timestamp = m.Timestamp });
							}
						}
					}
				}

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

					// FIX: Removed the old "Police damage simulation" block.
					// Cop damage is now handled in the cop movement branch
					// (GetNPCs endpoint), which only fires when the cop has
					// been stationary for 3.5s and has a clear shot. This
					// prevents cops from shooting while driving or walking.
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
						int otherUserId = rdr.GetInt32("user_id");
						players.Add(new
						{
							UserId = otherUserId,
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
							IsShooting = _shootingPlayers.ContainsKey(otherUserId),
							IsInCar = _playerInCar.TryGetValue(otherUserId, out var inCar) && inCar,
							VehicleType = _playerVehicleType.TryGetValue(otherUserId, out var vt) ? vt : "car",
							CarColorR = _playerCarColorR.TryGetValue(otherUserId, out var cr) ? cr : 1f,
							CarColorG = _playerCarColorG.TryGetValue(otherUserId, out var cg) ? cg : 1f,
							CarColorB = _playerCarColorB.TryGetValue(otherUserId, out var cb) ? cb : 1f,
							PassengerOfUserId = _playerPassengerOf.TryGetValue(otherUserId, out var pof) ? pof : 0
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

						// Panic mode: flee from the shooter
						if (npc.PanicUntil.HasValue && DateTime.UtcNow < npc.PanicUntil.Value)
						{
							float pdx = npc.X - npc.PanicFromX;
							float pdz = npc.Z - npc.PanicFromZ;
							float pDist = (float)Math.Sqrt(pdx * pdx + pdz * pdz);
							if (pDist > 0.1f)
							{
								float fleeSpeed = npc.Speed * 1.5f;
								float pmx = (pdx / pDist) * fleeSpeed * 0.1f;
								float pmz = (pdz / pDist) * fleeSpeed * 0.1f;
								npc.X += pmx;
								npc.Z += pmz;
							}
						}
						else
						{
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
						}

						// Aircraft movement in UpdatePosition
						if (npc.Type == "helicopter" || npc.Type == "plane")
						{
							float acAlt = npc.Type == "helicopter" ? 25f + (float)(rng.NextDouble() * 10f) : 45f + (float)(rng.NextDouble() * 15f);
							if (npc.Y == 0) npc.Y = acAlt;
							npc.Y += (acAlt - npc.Y) * 0.02f;
							if (dist > 10f)
							{
								npc.X += (dx / dist) * npc.Speed * 0.1f;
								npc.Z += (dz / dist) * npc.Speed * 0.1f;
								npc.Yaw = (float)Math.Atan2(dx, dz);
							}
							else
							{
								GetRandomAeroportOrDistantPoint(npc.X, npc.Z, out float tx, out float tz, rng);
								npc.TargetX = tx;
								npc.TargetZ = tz;
							}
						}

						// NPC car hits pedestrian in UpdatePosition too
						if (npc.Health > 0)
						{
							bool isCar = npc.Type == "car" || npc.Type == "bus" || npc.Type == "taxi" || npc.Type == "police";
							if (isCar)
							{
								foreach (var otherNpc in npcs.Values)
								{
									if (otherNpc.Id == npc.Id || otherNpc.DeadAt.HasValue) continue;
									if (otherNpc.Type != "ped_male" && otherNpc.Type != "ped_female") continue;
									float pdx = npc.X - otherNpc.X;
									float pdz = npc.Z - otherNpc.Z;
									if (pdx * pdx + pdz * pdz < 2.0f * 2.0f)
									{
										otherNpc.Health -= 25;
										if (otherNpc.Health <= 0) otherNpc.DeadAt = DateTime.UtcNow;
									}
								}
							}
						}

						// Car fire system: catch fire at 20% HP or in ocean, explode after 10s
						if (npc.Health > 0 && (npc.Type == "car" || npc.Type == "bus" || npc.Type == "taxi" || npc.Type == "police" || npc.Type == "bike" || npc.Type == "motorcycle" || npc.Type == "helicopter" || npc.Type == "plane"))
						{
							int cx = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
							int cz = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
							if (!npc.OnFire && CityLayout.GetBiome(cx, cz) == "ocean") { npc.OnFire = true; npc.FireStartedAt = DateTime.UtcNow; }
							int fireThreshold = Math.Max(80, npc.MaxHealth / 5);
							if (npc.Health <= fireThreshold && !npc.OnFire)
							{
								npc.OnFire = true;
								npc.FireStartedAt = DateTime.UtcNow;
							}
							if (npc.OnFire && npc.FireStartedAt.HasValue)
							{
								if ((DateTime.UtcNow - npc.FireStartedAt.Value).TotalSeconds >= 10.0)
								{
									npc.Health = 0;
									npc.DeadAt = DateTime.UtcNow;
								}
							}
						}

						npc.LastUpdate = now;
					}
				}

				// NEW (Feature 3): If this player was carjacked, signal eviction
				// so their client calls exitCar(). The flag is set by another
				// player calling StealCar with a negative npcId (see below).
				bool evicted = _evictedPlayers.TryRemove(req.UserId, out _);
				// FIX: Return the player's current health so the client can
				// detect damage from cop shooting and visualize the shot.
				int yourHealth = req.Health;
				if (_playerHealth.TryGetValue(req.UserId, out var serverHp)) yourHealth = serverHp;
				// FIX: Include respawnAtHome flag so the client teleports to
				// the home base if the player was inactive for >30 minutes.
				// Initialize weapon state for new players
				if (!_playerWeapons.ContainsKey(req.UserId))
					_playerWeapons[req.UserId] = new bool[5] { true, false, false, false, false };
				if (!_playerAmmo.ContainsKey(req.UserId))
					_playerAmmo[req.UserId] = new int[5];
				var pwArr = _playerWeapons[req.UserId];
				var paArr = _playerAmmo[req.UserId];
				var dw = BuildDroppedWeapons();
				return Ok(new { ok = true, players, wantedLevel, evicted, yourHealth, respawnAtHome, chatMessages,
					droppedWeapons = dw,
					ownedWeapons = pwArr,
					ammo = paArr });
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
			var aircraft = new List<object>();
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
							&& homeCar.IsParked)
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
									Type = "police",
									IsParked = true,
									X = npc.X,
									Z = npc.Z,
									Yaw = npc.Yaw,
									Health = 400, MaxHealth = 400,
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

				if (distSq > 300f * 300f && !npc.IsParked)
				{
					deadIds.Add(kv.Key);
					continue;
				}

				if (distSq < 150f * 150f)
				{
					if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") nearbyPeds++;
					else if (npc.Type == "helicopter" || npc.Type == "plane") { }
					else if (!npc.IsParked) nearbyCars++;
				}

				if (distSq > 200f * 200f) continue;

				if (npc.IsParked) { parkedCars.Add(new { id = npc.Id, posX = npc.X, posY = npc.Y, posZ = npc.Z, yaw = npc.Yaw, speed = 0f, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, health = npc.Health, isBurning = npc.OnFire }); continue; }

				float tdx = npc.TargetX - npc.X;
				float tdz = npc.TargetZ - npc.Z;
				float distToTarget = (float)Math.Sqrt(tdx * tdx + tdz * tdz);

				bool isVehicle = npc.Type == "car" || npc.Type == "bus" || npc.Type == "bike" || npc.Type == "motorcycle" || npc.Type == "taxi" || npc.Type == "helicopter" || npc.Type == "plane";

				if (isVehicle && (npc.Type == "helicopter" || npc.Type == "plane"))
				{
					// Aircraft simulation: fly in the sky
					float acAlt = npc.Type == "helicopter" ? 25f + (float)(rng.NextDouble() * 10f) : 45f + (float)(rng.NextDouble() * 15f);
					if (npc.Y == 0) npc.Y = acAlt;
					npc.Y += (acAlt - npc.Y) * 0.02f;

					bool isPanicking = npc.PanicUntil.HasValue && DateTime.UtcNow < npc.PanicUntil.Value;
					if (isPanicking)
					{
						float pdx = npc.X - npc.PanicFromX;
						float pdz = npc.Z - npc.PanicFromZ;
						float pDist = (float)Math.Sqrt(pdx * pdx + pdz * pdz);
						if (pDist > 0.1f)
						{
							npc.X += (pdx / pDist) * npc.Speed * SPEED_FACTOR * 1.5f;
							npc.Z += (pdz / pDist) * npc.Speed * SPEED_FACTOR * 1.5f;
							npc.Yaw = (float)Math.Atan2(pdx, pdz);
							npc.Y += 10f * 0.016f;
						}
					}
					else
					{
						if (distToTarget < 10f)
						{
							// Pick a new random distant target
							float tx, tz;
							GetRandomAeroportOrDistantPoint(npc.X, npc.Z, out tx, out tz, rng);
							npc.TargetX = tx;
							npc.TargetZ = tz;
						}
						else
						{
							float moveX = (tdx / distToTarget) * npc.Speed * SPEED_FACTOR;
							float moveZ = (tdz / distToTarget) * npc.Speed * SPEED_FACTOR;
							npc.X += moveX;
							npc.Z += moveZ;
							npc.Yaw = (float)Math.Atan2(moveX, moveZ);
						}
					}

					// Fire system for aircraft
					if (npc.Health > 0)
					{
						int cxc = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
						int czc = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
						if (!npc.OnFire && CityLayout.GetBiome(cxc, czc) == "ocean") { npc.OnFire = true; npc.FireStartedAt = DateTime.UtcNow; }
						int fireThreshold = Math.Max(80, npc.MaxHealth / 5);
						if (npc.Health <= fireThreshold && !npc.OnFire)
						{
							npc.OnFire = true;
							npc.FireStartedAt = DateTime.UtcNow;
						}
						if (npc.OnFire && npc.FireStartedAt.HasValue)
						{
							if ((DateTime.UtcNow - npc.FireStartedAt.Value).TotalSeconds >= 10.0)
							{
								npc.Health = 0;
								npc.DeadAt = DateTime.UtcNow;
							}
						}
					}
				}
				else if (isVehicle)
				{
					// --- Traffic-aware vehicle movement ---
					const float INTERSECTION_RADIUS = 14f;
					const float SPEED_FACTOR = 0.5f;

					// Panic mode: flee from the shooter instead of following path
					bool isPanicking = npc.PanicUntil.HasValue && DateTime.UtcNow < npc.PanicUntil.Value;
					if (isPanicking)
					{
						npc.PathIndices = null;
						float pdx = npc.X - npc.PanicFromX;
						float pdz = npc.Z - npc.PanicFromZ;
						float pDist = (float)Math.Sqrt(pdx * pdx + pdz * pdz);
						if (pDist > 0.1f)
						{
							float fleeSpeed = npc.Speed * 1.5f;
							float fmoveX = (pdx / pDist) * fleeSpeed * SPEED_FACTOR;
							float fmoveZ = (pdz / pDist) * fleeSpeed * SPEED_FACTOR;
							float fnextX = npc.X + fmoveX;
							float fnextZ = npc.Z + fmoveZ;
							if (!CityLayout.IsBuildingAt(fnextX, fnextZ)) { npc.X = fnextX; npc.Z = fnextZ; }
							npc.Yaw = (float)Math.Atan2(fmoveX, fmoveZ);
						}
					}
					else
					{
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

							// Check overshoot: if moving away from target, auto-advance
							bool overshot = false;
							if (distToTarget2 > 1.0f)
							{
								float dotProduct = ddx2 * (float)Math.Sin(npc.Yaw) + ddz2 * (float)Math.Cos(npc.Yaw);
								if (dotProduct < 0)
								{
									overshot = true;
									npc.PathIdx++;
									if (npc.PathIdx >= npc.PathIndices.Count)
									{
										npc.PathIndices = null;
									}
									else
									{
										var cn2 = nodes[npc.PathIndices[npc.PathIdx]];
										var nn3 = nodes[npc.PathIndices[npc.PathIdx + 1 < npc.PathIndices.Count ? npc.PathIdx + 1 : npc.PathIdx]];
										var off4 = CityLayout.GetLaneOffset(cn2.x, cn2.z, nn3.x, nn3.z, true);
										npc.LaneOffsetX = off4.ox;
										npc.LaneOffsetZ = off4.oz;
									}
								}
							}
							if (!overshot && npc.PathIndices != null)
							{
								distToTarget2 = (float)Math.Sqrt(ddx2 * ddx2 + ddz2 * ddz2);

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
					}

					// NPC car hits pedestrian — same 25 damage as player car
					if (npc.Health > 0 && (npc.Type == "car" || npc.Type == "bus" || npc.Type == "taxi" || npc.Type == "police"))
					{
						foreach (var otherKv in npcs)
						{
							if (otherKv.Key == kv.Key || otherKv.Value.DeadAt != null) continue;
							var ped = otherKv.Value;
							if (ped.Type != "ped_male" && ped.Type != "ped_female") continue;
							float pdx = npc.X - ped.X;
							float pdz = npc.Z - ped.Z;
							if (pdx * pdx + pdz * pdz < 2.0f * 2.0f)
							{
								ped.Health -= 25;
								if (ped.Health <= 0) ped.DeadAt = DateTime.UtcNow;
							}
						}
					}

					// Car fire system in GetNPCs (also checks ocean submersion)
					if (npc.Health > 0 && (npc.Type == "car" || npc.Type == "bus" || npc.Type == "taxi" || npc.Type == "police" || npc.Type == "bike" || npc.Type == "motorcycle" || npc.Type == "helicopter" || npc.Type == "plane"))
					{
						int cxc = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
						int czc = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
						if (!npc.OnFire && CityLayout.GetBiome(cxc, czc) == "ocean") { npc.OnFire = true; npc.FireStartedAt = DateTime.UtcNow; }
						int fireThreshold = Math.Max(80, npc.MaxHealth / 5);
						if (npc.Health <= fireThreshold && !npc.OnFire)
						{
							npc.OnFire = true;
							npc.FireStartedAt = DateTime.UtcNow;
						}
						if (npc.OnFire && npc.FireStartedAt.HasValue)
						{
							if ((DateTime.UtcNow - npc.FireStartedAt.Value).TotalSeconds >= 10.0)
							{
								npc.Health = 0;
								npc.DeadAt = DateTime.UtcNow;
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
						&& homeCar2.IsParked)
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
						// Cop engagement phases. StationaryTime accumulates
						// while the cop is within 25 units of the hunted player.
						//   0 – 3.5s : orbit (close in on the player)
						//   3.5+     : shoot (stand still, fire at player)
						// Once shooting starts the cop stays in shoot mode
						// until the player dies or the wanted level drops to 0
						// (both reset StationaryTime via the conditions below).
						if (npc.TargetUserId == userId && wantedLevel > 0)
						{
							float sdx = npc.X - posX;
							float sdz = npc.Z - posZ;
							if (sdx * sdx + sdz * sdz < 25f * 25f)
								npc.StationaryTime += 1.0;
							else
								npc.StationaryTime = 0;
						}
						else
						{
							npc.StationaryTime = 0;
						}

						// Removed the 5.5s reset — once shooting starts the cop
						// stays in shoot mode until player die s or wanted level drops.

						if (distToTarget < 2.0f)
						{
							if (npc.TargetUserId == userId && wantedLevel > 0)
							{
								if (npc.StationaryTime < 3.5)
								{
									npc.ApproachAngle += COP_ORBIT_SPEED;
									npc.TargetX = posX + (float)Math.Cos(npc.ApproachAngle) * COP_APPROACH_RADIUS;
									npc.TargetZ = posZ + (float)Math.Sin(npc.ApproachAngle) * COP_APPROACH_RADIUS;
								}
								else
								{
									// Shoot phase: chase the player's current position
									npc.TargetX = posX;
									npc.TargetZ = posZ;
								}
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

						// NEW: Cop shooting logic. Cops can only fire if:
						// - Actively hunting this player (TargetUserId == userId)
						// - Player has a wanted level
						// - Cop has been in combat range for >= 3.5 seconds (shooting phase)
						// - Cop is within 25 units of the player
						// - At least 500ms since the last shot (fire rate)
						// Damage is applied directly to _playerHealth. The
						// IsShootingAt flag is set so the client can visualize
						// the shot (tracer + pistol sound) — it's cleared on
						// the next tick.
						npc.IsShootingAt = false;
						if (npc.TargetUserId == userId && wantedLevel > 0
								&& npc.StationaryTime >= 3.5)
						{
							float sdx = npc.X - posX;
							float sdz = npc.Z - posZ;
							float sdistSq = sdx * sdx + sdz * sdz;
							if (sdistSq < 25f * 25f)
							{
								var nowMs = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
								if (npc.LastShotTime == 0 || (nowMs - npc.LastShotTime) > 500)
								{
									npc.LastShotTime = nowMs;
									npc.IsShootingAt = true;
									// Apply pistol damage (5 per shot). The target is the
									// player identified by `userId` (the GetNPCs query param).
									// If we don't have a stored health value, default to 100.
									if (_playerHealth.TryGetValue(userId, out var hp))
										_playerHealth[userId] = Math.Max(0, hp - 5);
									else
										_playerHealth[userId] = Math.Max(0, 100 - 5);
									_lastPoliceDamageTime[userId] = nowMs;
								}
							}
						}

						// NEW (Bug 2): Face the player only while actively
						// hunting them. Otherwise face the movement direction
						// (pedestrian-style) so the cop doesn't appear sideways.
						//
						// FIX: The policeMan GLTF model faces +X by default
						// (not +Z like pedestrian models). The yaw convention
						// assumes +Z forward (yaw=0 → +Z). So we subtract π/2
						// to compensate for the model's 90° offset.
						// Also, the face-player formula uses (posX - npc.X,
						// posZ - npc.Z) — direction from cop TO player — so
						// the cop faces toward the player, not away.
						const float copModelOffset = -(float)Math.PI / 2f;
						if (npc.TargetUserId == userId && wantedLevel > 0)
						{
							npc.Yaw = (float)Math.Atan2(posX - npc.X, posZ - npc.Z) + copModelOffset;
						}
						else
						{
							npc.Yaw = (float)Math.Atan2(tdx, tdz) + copModelOffset;
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

				var entry = new { id = npc.Id, posX = npc.X, posY = npc.Y, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health, hasDriver = npc.HasDriver, passengerCount = npc.PassengerCount, isShootingAt = npc.IsShootingAt, isBurning = npc.OnFire };
				if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") pedestrians.Add(entry);
				else if (npc.Type == "helicopter" || npc.Type == "plane") aircraft.Add(entry);
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

			while (nearbyCars < 20)
			{
				long id = GetNextNpcId();
				// "taxi" added to the traffic pool — appears with the same
				// probability as the other vehicle types so the city has a
				// steady trickle of cabs the player can steal and use to
				// start taxi missions (see grandtheft.component.ts).
				var type = new[] { "car", "bus", "bike", "motorcycle", "taxi" }[rng.Next(5)];
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng, minDist: 150f);
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
					Health = type == "bike" || type == "motorcycle" ? 200 : 400,
					MaxHealth = type == "bike" || type == "motorcycle" ? 200 : 400,
					Cr = type == "taxi" ? 1.0f : (float)rng.NextDouble(),
					Cg = type == "taxi" ? 0.85f : (float)rng.NextDouble(),
					Cb = type == "taxi" ? 0.1f : (float)rng.NextDouble(),
					HasDriver = true,
					PassengerCount = type == "bus" ? rng.Next(1, 4) : rng.Next(0, 2),
					Gender = rng.Next(2) == 0 ? "male" : "female"
				};
				nearbyCars++;
			}

			while (nearbyPeds < 40)
			{
				long id = GetNextNpcId();
				var type = new[] { "ped_male", "ped_female" }[rng.Next(2)];
				GetRandomSidewalkPointNearPlayer(posX, posZ, out float x, out float z, rng, minDist: 30f);
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
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng, minDist: 150f);

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
					Health = 400, MaxHealth = 400,
					Cr = 0.1f,
					Cg = 0.1f,
					Cb = 0.2f,
					TargetUserId = userId,
					ApproachAngle = angle  // <-- NEW
				};
				nearbyPolice++;
			}

			// Spawn aircraft near aeroport if player is in range
			int playerCX = (int)Math.Floor(posX / CityLayout.CHUNK_SIZE);
			int playerCZ = (int)Math.Floor(posZ / CityLayout.CHUNK_SIZE);
			bool nearAeroport = Math.Abs(playerCX - 40) <= 10 && Math.Abs(playerCZ - 13) <= 8;
			int nearbyAircraft = 0;
			foreach (var kv in npcs) if (kv.Value.Type == "helicopter" || kv.Value.Type == "plane") nearbyAircraft++;
			while (nearAeroport && nearbyAircraft < 3)
			{
				long id = GetNextNpcId();
				string acType = nearbyAircraft % 2 == 0 ? "helicopter" : "plane";
				int acx = 35 + rng.Next(10);
				int acz = 11 + rng.Next(5);
				float x = acx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
				float z = acz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
				float y = acType == "helicopter" ? 25f + (float)rng.NextDouble() * 10f : 45f + (float)rng.NextDouble() * 15f;
				npcs[id] = new NpcState
				{
					Id = id,
					Type = acType,
					X = x,
					Y = y,
					Z = z,
					TargetX = x + (float)(rng.NextDouble() - 0.5) * 200f,
					TargetZ = z + (float)(rng.NextDouble() - 0.5) * 200f,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = acType == "helicopter" ? 8f : 15f,
					Health = 200, MaxHealth = 200,
					Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
					Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
					Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
				};
				nearbyAircraft++;
			}

			var dw = BuildDroppedWeapons();
			return Ok(new { cars, pedestrians, parkedCars, aircraft, deadBodies, droppedWeapons = dw });
		}

		private List<object> BuildDroppedWeapons()
		{
			var now = DateTime.UtcNow;
			var result = new List<object>();
			// Clean up expired regular drops (>30s old)
			var expired = _droppedWeapons.Where(kv => (now - kv.Value.DroppedAt).TotalSeconds > 30).Select(kv => kv.Key).ToList();
			foreach (var k in expired) _droppedWeapons.TryRemove(k, out _);
			// Include active dropped weapons
			foreach (var kv in _droppedWeapons)
			{
				result.Add(new { id = kv.Key, posX = kv.Value.PosX, posZ = kv.Value.PosZ, weaponType = kv.Value.WeaponType });
			}
			// Include home base weapons that are available
			for (int i = 1; i <= 4; i++)
			{
				if (HOME_BASE_WEAPON_X[i] == 0) continue;
				if (_homeBaseWeaponCollected[i] && now < _homeBaseWeaponRespawnAt[i]) continue;
				if (_homeBaseWeaponCollected[i] && now >= _homeBaseWeaponRespawnAt[i])
					_homeBaseWeaponCollected[i] = false;
				if (!_homeBaseWeaponCollected[i])
				{
					result.Add(new { id = (long)(-i), posX = HOME_BASE_WEAPON_X[i], posZ = HOME_BASE_WEAPON_Z[i], weaponType = i });
				}
			}
			return result;
		}

		private void SeedNPCs(int worldId, float posX = 0, float posZ = 0)
		{
			var dict = _worldNpcs[worldId];
			var rng = new Random();
			// Keep "taxi" in the seed pool too so cabs are present the moment
			// a player joins (not only after the dynamic spawner kicks in).
			var vTypes = new[] { "car", "bus", "bike", "motorcycle", "taxi" };
			var gTypes = new[] { "ped_male", "ped_female" };

			for (int i = 0; i < 40; i++)
			{
				long id = GetNextNpcId();
				var type = vTypes[rng.Next(vTypes.Length)];
				GetRandomRoadPointNearPlayer(posX, posZ, out float x, out float z, rng, minDist: 80f);
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
					Health = type == "bike" || type == "motorcycle" ? 200 : 400,
					MaxHealth = type == "bike" || type == "motorcycle" ? 200 : 400,
					Cr = type == "taxi" ? 1.0f : (float)rng.NextDouble(),
					Cg = type == "taxi" ? 0.85f : (float)rng.NextDouble(),
					Cb = type == "taxi" ? 0.1f : (float)rng.NextDouble(),
					HasDriver = true,
					PassengerCount = type == "bus" ? rng.Next(1, 4) : rng.Next(0, 2),
					Gender = rng.Next(2) == 0 ? "male" : "female"
				};
			}

			for (int i = 0; i < 60; i++)
			{
				long id = GetNextNpcId();
				var type = gTypes[rng.Next(gTypes.Length)];
				GetRandomSidewalkPointNearPlayer(posX, posZ, out float x, out float z, rng, minDist: 30f);
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

			// Seed aircraft at the aeroport
			for (int i = 0; i < 3; i++)
			{
				long id = GetNextNpcId();
				string acType = i % 2 == 0 ? "helicopter" : "plane";
				int acx = 35 + rng.Next(10);
				int acz = 11 + rng.Next(5);
				float ax = acx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
				float az = acz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
				float ay = acType == "helicopter" ? 25f + (float)rng.NextDouble() * 10f : 45f + (float)rng.NextDouble() * 15f;
				dict[id] = new NpcState
				{
					Id = id,
					Type = acType,
					X = ax,
					Y = ay,
					Z = az,
					TargetX = ax + (float)(rng.NextDouble() - 0.5) * 200f,
					TargetZ = az + (float)(rng.NextDouble() - 0.5) * 200f,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = acType == "helicopter" ? 8f : 15f,
					Health = 200, MaxHealth = 200,
					Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
					Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
					Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
				};
			}
		}

		private void GetRandomRoadPointNearPlayer(float px, float pz, out float x, out float z, Random rng, float minDist = 0f)
		{
			int gridRange = minDist > 0f ? Math.Max(6, (int)(minDist / 80f) + 2) : 3;
			int baseGx = (int)Math.Round(px / 80f);
			int baseGz = (int)Math.Round(pz / 80f);

			for (int attempt = 0; attempt < 50; attempt++)
			{
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
				for (int b = 0; b < 5 && CityLayout.IsBuildingAt(x, z); b++)
				{
					x += (float)(rng.NextDouble() - 0.5) * 20f;
					z += (float)(rng.NextDouble() - 0.5) * 20f;
				}

				if (CityLayout.IsBuildingAt(x, z)) continue;

				if (minDist > 0f)
				{
					float dx = x - px;
					float dz = z - pz;
					if (dx * dx + dz * dz < minDist * minDist) continue;
				}

				return;
			}

			// Fallback: farthest point we can find
			x = px + (float)(rng.NextDouble() - 0.5) * 120f;
			z = pz + (float)(rng.NextDouble() - 0.5) * 120f;
		}

		private void GetRandomSidewalkPointNearPlayer(float px, float pz, out float x, out float z, Random rng, float minDist = 0f)
		{
			// Use the same 80m grid as the frontend (GRID_PITCH = 80).
			int gridRange = minDist > 0f ? Math.Max(6, (int)(minDist / 80f) + 2) : 3;
			int baseGx = (int)Math.Round((px - 40f) / 80f);
			int baseGz = (int)Math.Round((pz - 40f) / 80f);

			for (int attempt = 0; attempt < 50; attempt++)
			{
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

				if (minDist > 0f)
				{
					float dx = x - px;
					float dz = z - pz;
					if (dx * dx + dz * dz < minDist * minDist) continue;
				}

				return;
			}

			// Fallback
			x = px + (float)(rng.NextDouble() - 0.5) * 80f;
			z = pz + (float)(rng.NextDouble() - 0.5) * 80f;
		}

		private void GetRandomAeroportOrDistantPoint(float px, float pz, out float x, out float z, Random rng)
		{
			// 50% chance: pick a point at the aeroport (cx 35-44, cz 11-15)
			if (rng.NextDouble() < 0.5)
			{
				int acx = 35 + rng.Next(10);
				int acz = 11 + rng.Next(5);
				x = acx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
				z = acz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
			}
			else
			{
				// Pick a distant random point (any biome except ocean)
				for (int attempt = 0; attempt < 20; attempt++)
				{
					int gx = (int)Math.Round(px / 80f) + rng.Next(-15, 16);
					int gz = (int)Math.Round(pz / 80f) + rng.Next(-15, 16);
					int cx = (int)Math.Floor((gx * 80f) / 80f);
					int cz = (int)Math.Floor((gz * 80f) / 80f);
					string biome = CityLayout.GetBiome(cx, cz);
					if (biome == "ocean") continue;
					x = gx * 80f + 40f;
					z = gz * 80f + 40f;
					return;
				}
				x = px + (float)(rng.NextDouble() - 0.5) * 300f;
				z = pz + (float)(rng.NextDouble() - 0.5) * 300f;
			}
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
					float driverAngle = (float)(rng.NextDouble() * Math.PI * 2);
					float driverDist = 5f + (float)rng.NextDouble() * 3f;
					float driverX = npc.X + (float)Math.Cos(driverAngle) * driverDist;
					float driverZ = npc.Z + (float)Math.Sin(driverAngle) * driverDist;
					GetRandomSidewalkPointNearPlayer(driverX, driverZ, out float driverTx, out float driverTz, rng);
					float driverYaw = (float)Math.Atan2(driverTx - driverX, driverTz - driverZ);
					_worldNpcs[req.WorldId][driverId] = new NpcState
					{
						Id = driverId,
						Type = "ped_" + npc.Gender,
						Gender = npc.Gender,
						X = driverX,
						Z = driverZ,
						TargetX = driverTx,
						TargetZ = driverTz,
						Yaw = driverYaw,
						Speed = 2.0f,
						Health = 100,
						Cr = 0.4f,
						Cg = 0.4f,
						Cb = 0.4f
					};
					evictedNpcs.Add(new { id = driverId, posX = driverX, posZ = driverZ, yaw = driverYaw, gender = npc.Gender, type = "ped_" + npc.Gender, health = 100, speed = 2.0f, colorR = 0.4f, colorG = 0.4f, colorB = 0.4f });
				}
				// Evict passengers as pedestrian NPCs
				for (int p = 0; p < npc.PassengerCount; p++)
				{
					long passengerId = GetNextNpcId();
					string pGender = npc.Gender;
					float passAngle = (float)(rng.NextDouble() * Math.PI * 2);
					float passDist = 5f + (float)rng.NextDouble() * 3f;
					float passX = npc.X + (float)Math.Cos(passAngle) * passDist;
					float passZ = npc.Z + (float)Math.Sin(passAngle) * passDist;
					GetRandomSidewalkPointNearPlayer(passX, passZ, out float passTx, out float passTz, rng);
					float passYaw = (float)Math.Atan2(passTx - passX, passTz - passZ);
					_worldNpcs[req.WorldId][passengerId] = new NpcState
					{
						Id = passengerId,
						Type = "ped_" + pGender,
						Gender = pGender,
						X = passX,
						Z = passZ,
						TargetX = passTx,
						TargetZ = passTz,
						Yaw = (float)Math.Atan2(passTx - passX, passTz - passZ),
						Speed = 2.0f,
						Health = 100,
						Cr = 0.4f,
						Cg = 0.4f,
						Cb = 0.4f
					};
					evictedNpcs.Add(new { id = passengerId, posX = passX, posZ = passZ, yaw = passYaw, gender = pGender, type = "ped_" + pGender, health = 100, speed = 2.0f, colorR = 0.4f, colorG = 0.4f, colorB = 0.4f });
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
				// FIX: Store the ACTUAL vehicle type (e.g. "car", "taxi",
				// "motorcycle") so other players render the correct model.
				// IsParked=true distinguishes this from active NPC traffic.
				Type = string.IsNullOrEmpty(req.VehicleType) ? "car" : req.VehicleType!,
				IsParked = true,
				X = req.PosX,
				Z = req.PosZ,
				Yaw = req.Yaw,
				Health = 400, MaxHealth = 400,
				Cr = req.ColorR,
				Cg = req.ColorG,
				Cb = req.ColorB,
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
			var hitAnything = false;
			bool targetDied = false;
			float deathX = 0, deathZ = 0;
			int deathWeapon = 0;

			if (_worldNpcs.ContainsKey(worldId))
			{
				var npcs = _worldNpcs[worldId];
				foreach (var kv in npcs)
				{
					if (kv.Key == req.TargetId && kv.Value.Health > 0 && kv.Value.DeadAt == null)
					{
						kv.Value.Health -= req.Damage;
						hitAnything = true;
						bool isVehicle = kv.Value.Type == "car" || kv.Value.Type == "bus" || kv.Value.Type == "taxi" || kv.Value.Type == "police" || kv.Value.Type == "bike" || kv.Value.Type == "motorcycle";
						if (kv.Value.Health <= 0)
						{
							if (isVehicle)
							{
								// Vehicles catch fire instead of dying instantly
								kv.Value.Health = 1;
							}
							else
							{
								kv.Value.DeadAt = DateTime.UtcNow;
								targetDied = true;
							}
							deathX = kv.Value.X;
							deathZ = kv.Value.Z;
							// Cops always drop pistol with ammo
							if (kv.Value.Type == "cop")
							{
								var drop = new DroppedWeapon { Id = GetNextDropId(), PosX = deathX, PosZ = deathZ, WeaponType = 1, Ammo = 15, DroppedAt = DateTime.UtcNow };
								_droppedWeapons[drop.Id] = drop;
							}
						}
						kv.Value.PanicUntil = DateTime.UtcNow.AddSeconds(5);
						kv.Value.PanicFromX = req.AttackerX;
						kv.Value.PanicFromZ = req.AttackerZ;
						break;
					}
				}

				// Panic nearby NPCs/peds within 15 units of the attacker position
				{
					float panicRadius = 15f;
					foreach (var kv in npcs)
					{
						if (kv.Value.DeadAt.HasValue || kv.Value.PanicUntil.HasValue) continue;
						float pdx = kv.Value.X - req.AttackerX;
						float pdz = kv.Value.Z - req.AttackerZ;
						if (pdx * pdx + pdz * pdz < panicRadius * panicRadius)
						{
							kv.Value.PanicUntil = DateTime.UtcNow.AddSeconds(5);
							kv.Value.PanicFromX = req.AttackerX;
							kv.Value.PanicFromZ = req.AttackerZ;
						}
					}
				}
			}

			int playerTargetId = (int)req.TargetId;
			if (_playerHealth.TryGetValue(playerTargetId, out var hp))
			{
				int newHp = Math.Max(0, hp - req.Damage);
				_playerHealth[playerTargetId] = newHp;
				hitAnything = true;
				if (newHp <= 0)
				{
					targetDied = true;
					_playerX.TryGetValue(playerTargetId, out deathX);
					_playerZ.TryGetValue(playerTargetId, out deathZ);
					// Respawn home base weapons on player death
					for (int i = 1; i <= 4; i++) _homeBaseWeaponCollected[i] = false;
					// Drop all weapons the player had (except Unarmed)
					if (_playerWeapons.TryGetValue(playerTargetId, out var pw))
					{
						var ammoArr = _playerAmmo.TryGetValue(playerTargetId, out var pa) ? pa : new int[5];
						for (int w = 1; w <= 4; w++)
						{
							if (pw[w])
							{
								var drop = new DroppedWeapon { Id = GetNextDropId(), PosX = deathX, PosZ = deathZ, WeaponType = w, Ammo = ammoArr[w], DroppedAt = DateTime.UtcNow };
								_droppedWeapons[drop.Id] = drop;
							}
						}
					}
					_playerWeapons[playerTargetId] = new bool[5] { true, false, false, false, false };
					_playerAmmo[playerTargetId] = new int[5];
				}
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

		[HttpPost("pickup")]
		public IActionResult Pickup([FromBody] GTPickupRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false, message = "invalid user" });
			if (_droppedWeapons.TryRemove(req.DropId, out var drop))
			{
				if (!_playerWeapons.ContainsKey(req.UserId))
					_playerWeapons[req.UserId] = new bool[5] { true, false, false, false, false };
				if (!_playerAmmo.ContainsKey(req.UserId))
					_playerAmmo[req.UserId] = new int[5];
				var pw = _playerWeapons[req.UserId];
				var pa = _playerAmmo[req.UserId];
				pw[drop.WeaponType] = true;
				pa[drop.WeaponType] += drop.Ammo;
				return Ok(new { ok = true, weaponType = drop.WeaponType, ammo = pa[drop.WeaponType] });
			}
			// Check home base weapon pickups
			if (drop == null && req.DropId < 0)
			{
				int hbIdx = (int)(-req.DropId);
				if (hbIdx >= 1 && hbIdx <= 4 && !_homeBaseWeaponCollected[hbIdx])
				{
					if (!_playerWeapons.ContainsKey(req.UserId))
						_playerWeapons[req.UserId] = new bool[5] { true, false, false, false, false };
					if (!_playerAmmo.ContainsKey(req.UserId))
						_playerAmmo[req.UserId] = new int[5];
					var pw = _playerWeapons[req.UserId];
					var pa = _playerAmmo[req.UserId];
					int ammo = hbIdx == 1 ? 15 : hbIdx == 2 ? 30 : hbIdx == 4 ? 5 : 10;
					pw[hbIdx] = true;
					pa[hbIdx] += ammo;
					_homeBaseWeaponCollected[hbIdx] = true;
					_homeBaseWeaponRespawnAt[hbIdx] = DateTime.UtcNow.AddSeconds(HOME_BASE_WEAPON_RESPAWN_SECONDS);
					return Ok(new { ok = true, weaponType = hbIdx, ammo = pa[hbIdx] });
				}
			}
			return Ok(new { ok = false, message = "already picked up" });
		}

		private void SimulateDamage(GTUpdatePositionRequest req)
		{
			var worldId = req.WorldId;
			if (!_worldNpcs.ContainsKey(worldId)) return;

			var now = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;
			if (_lastDamageTime.TryGetValue(req.UserId, out var last) && (now - last) < 150) return;
			_lastDamageTime[req.UserId] = now;
		}

		// FIX: Garage system. Players can store one car per house. The car
		// is saved to the grandtheft_garage table with its type + color.
		// When the player approaches the garage, the server returns the
		// stored car (if any). When the player drives the car out, it's
		// removed from the garage.
		[HttpGet("garage/{userId}")]
		public async Task<IActionResult> GetGarageCar(int userId)
		{
			if (userId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand("SELECT vehicle_type, color_r, color_g, color_b, yaw FROM maxhanna.grandtheft_garage WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				if (await rdr.ReadAsync())
				{
					return Ok(new
					{
						ok = true,
						hasCar = true,
						vehicleType = rdr.GetString("vehicle_type"),
						colorR = rdr.GetFloat("color_r"),
						colorG = rdr.GetFloat("color_g"),
						colorB = rdr.GetFloat("color_b"),
						yaw = rdr.GetFloat("yaw")
					});
				}
				return Ok(new { ok = true, hasCar = false });
			}
			catch (Exception ex)
			{
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("garage/store")]
		public async Task<IActionResult> StoreGarageCar([FromBody] GTGarageRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				// UPSERT: store one car per user (replace if exists)
				using var cmd = new MySqlCommand(@"
                                        INSERT INTO maxhanna.grandtheft_garage (user_id, vehicle_type, color_r, color_g, color_b, yaw)
                                        VALUES (@uid, @vt, @cr, @cg, @cb, @yaw)
                                        ON DUPLICATE KEY UPDATE vehicle_type = @vt, color_r = @cr, color_g = @cg, color_b = @cb, yaw = @yaw", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				cmd.Parameters.AddWithValue("@vt", string.IsNullOrEmpty(req.VehicleType) ? "car" : req.VehicleType);
				cmd.Parameters.AddWithValue("@cr", req.ColorR);
				cmd.Parameters.AddWithValue("@cg", req.ColorG);
				cmd.Parameters.AddWithValue("@cb", req.ColorB);
				cmd.Parameters.AddWithValue("@yaw", req.Yaw);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex)
			{
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}

		[HttpPost("garage/remove")]
		public async Task<IActionResult> RemoveGarageCar([FromBody] GTGarageRemoveRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
				using var cmd = new MySqlCommand("DELETE FROM maxhanna.grandtheft_garage WHERE user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", req.UserId);
				await cmd.ExecuteNonQueryAsync();
				return Ok(new { ok = true });
			}
			catch (Exception ex)
			{
				return StatusCode(500, new { ok = false, error = ex.Message });
			}
		}
	}

	public class GrandTheftSaveRequest { public int UserId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public int Score { get; set; } }
	public class GrandTheftScoreRequest { public int UserId { get; set; } public int Score { get; set; } }
	public class GTUpdatePositionRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public float PosX { get; set; } public float PosY { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float Pitch { get; set; } public float CarYaw { get; set; } public float CarSpeed { get; set; } public int Health { get; set; } = 100; public int Weapon { get; set; } = 0; public bool IsShooting { get; set; } public string? ModelUrl { get; set; } public int Money { get; set; } = 0; public bool IsInCar { get; set; } public string? VehicleType { get; set; } public float CarColorR { get; set; } = 1f; public float CarColorG { get; set; } = 1f; public float CarColorB { get; set; } = 1f; public int PassengerOfUserId { get; set; } = 0; public string? ChatMessage { get; set; } }
	public class GTShootRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public int Weapon { get; set; } = 0; public float OriginX { get; set; } public float OriginY { get; set; } public float OriginZ { get; set; } public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } }
	public class GTHitRequest { public int AttackerId { get; set; } public long TargetId { get; set; } public int WorldId { get; set; } = 1; public int Damage { get; set; } = 10; public float AttackerX { get; set; } public float AttackerZ { get; set; } }
	public class GTStealCarRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; }
	public class GTParkCarRequest { public int WorldId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float ColorR { get; set; } public float ColorG { get; set; } public float ColorB { get; set; } public string? VehicleType { get; set; } }
	public class GTGarageRequest { public int UserId { get; set; } public string? VehicleType { get; set; } public float ColorR { get; set; } = 1f; public float ColorG { get; set; } = 1f; public float ColorB { get; set; } = 1f; public float Yaw { get; set; } = 0f; }
	public class GTGarageRemoveRequest { public int UserId { get; set; } }
	public class PlayerShootState { public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } public int Weapon { get; set; } public DateTime LastUpdated { get; set; } }
	public class GTPickupRequest { public int UserId { get; set; } public long DropId { get; set; } }
}