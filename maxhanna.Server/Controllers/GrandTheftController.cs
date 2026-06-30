using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.Concurrent;
using System.Threading;

namespace maxhanna.Server.Controllers
{
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

		// Reused edges array — avoids per-call allocation
		private static readonly int[][] EDGES = new int[][]
		{
			new int[] { 0, 1 }, new int[] { 0, -1 }, new int[] { 1, 0 }, new int[] { -1, 0 }
		};

		// ── Road graph cache ──────────────────────────────────────────
		// Building road nodes + adjacency is O(N²) via GetRoadEdges.
		// Cache the result per (chunkX, chunkZ) so we only pay once.
		private const int ROAD_RADIUS = 4;
		private static readonly ConcurrentDictionary<(int cx, int cz), RoadGraph> _roadGraphCache = new();
		private static HashSet<(float x, float z)>? _airportParkingPositions;
		internal static HashSet<(float x, float z)> GetAirportParkingPositions()
		{
			if (_airportParkingPositions == null)
			{
				var set = new HashSet<(float, float)>();
				foreach (var entry in AIRPORT_ENTRY_ROADS)
				{
					float wx = entry.gx * GRID_PITCH;
					float wz = entry.gzEnd * GRID_PITCH;
					set.Add((wx, wz));
				}
				_airportParkingPositions = set;
			}
			return _airportParkingPositions;
		}

		internal sealed class RoadGraph
		{
			public (float x, float z)[] Nodes = null!;
			public int[][] Adjacency = null!;
		}

		private static int Imul(int a, int b) { unchecked { return a * b; } }

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

		private static readonly (int cx, int cz, double cityR, double suburbR, double ruralR)[] ISLANDS = new[]
		{
			(0, 0, 2.5, 3.5, 4.5),     // Island 1 (Home/Spawn)
			(10, 0, 5, 7, 9),           // Island 2 (Downtown)
			(24, 0, 3, 6, 9),           // Island 3 (Suburbs)
			(41, 0, 5, 8, 11),          // Island 4 (Beach Resort)
			(-10, 0, 0, 0, 6),          // Rural West
			(61, 0, 0, 0, 10),          // Rural East
			(-18, 0, 0, 0, 5),          // Rural Far West
			(75, 0, 0, 0, 7),           // Rural Far East
		};

		private static readonly (int startCx, int endCx, int startCz, int endCz)[] BRIDGES = new[]
		{
	(4, 5, 0, 0),     // Island 1 ↔ Island 2
    (16, 17, 0, 0),   // Island 2 ↔ Island 3
    (31, 32, 0, 0),   // Island 3 ↔ Island 4
};
		public static bool IsInAnyIsland(int cx, int cz)
		{
			foreach (var isl in ISLANDS)
			{
				double dx = cx - isl.cx;
				double dz = cz - isl.cz;
				if (dx * dx + dz * dz < isl.ruralR * isl.ruralR) return true;
			}
			return false;
		}

		public static string GetBiome(int cx, int cz)
		{
			if (cx >= 0 && cx <= 3 && cz >= -3 && cz <= -1) return "aeroport";
			if (cx >= 8 && cx <= 15 && cz >= -6 && cz <= -4) return "aeroport";
			if (cx >= 22 && cx <= 30 && cz >= -8 && cz <= -6) return "aeroport";
			if (cx >= 36 && cx <= 46 && cz >= -11 && cz <= -9) return "aeroport";
			if (cx >= 33 && cx <= 46 && cz >= 12 && cz <= 16) return "aeroport";

			foreach (var br in BRIDGES)
				if (cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz) return "bridge";

			bool IsParkingPatch()
			{
				uint h = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);
				return (h % 9u) == 0u;
			}

			(int cx, int cz, double cityR, double suburbR, double ruralR)? bestIsl = null;
			double bestDist = double.MaxValue;
			foreach (var isl in ISLANDS)
			{
				double dx = cx - isl.cx;
				double dz = cz - isl.cz;
				double dist = Math.Sqrt(dx * dx + dz * dz);
				if (dist < isl.ruralR && dist < bestDist) { bestIsl = isl; bestDist = dist; }
			}
			if (bestIsl == null) return "ocean";

			var islV = bestIsl.Value;
			double distV = bestDist;

			if (!IsInAnyIsland(cx + 1, cz) || !IsInAnyIsland(cx - 1, cz) ||
				!IsInAnyIsland(cx, cz + 1) || !IsInAnyIsland(cx, cz - 1)) return "beach";

			if (distV < islV.cityR) return IsParkingPatch() ? "parking_lot" : "city";
			if (distV < islV.suburbR) return IsParkingPatch() ? "parking_lot" : "suburb";

			uint hr = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);
			return (hr % 3u == 0u) ? "rural_farm" : "rural_hills";
		}

		public static bool IsAeroportParkingChunk(int cx, int cz)
		{
			if (cx >= 0 && cx <= 3 && cz == -3) return true;
			if (cx >= 8 && cx <= 15 && cz == -6) return true;
			if (cx >= 22 && cx <= 30 && cz == -8) return true;
			if (cx >= 36 && cx <= 46 && cz == -11) return true;
			if (cx >= 33 && cx <= 46 && cz == 16) return true;
			return false;
		}

		// Airport entry roads: each entry has a grid-X, and a range of gz values.
		// The node just before gzStart (outside the zone, toward the city) must
		// already exist in the regular road grid so the entry road connects.
		// The last node (gzEnd) is the parking spot.
		private static readonly (int gx, int gzStart, int gzEnd)[] AIRPORT_ENTRY_ROADS = new[]
		{
			(2, -1, -3),   // Zone 1 (cx 0-3, cz -3..-1): city at gz=0
			(12, -4, -6),  // Zone 2 (cx 8-15, cz -6..-4): city at gz=-3
			(26, -7, -8),  // Zone 3 (cx 22-30, cz -8..-6): city at gz=-7 (suburb)
			(41, -7, -11), // Zone 4 (cx 36-46, cz -11..-9): city at gz=-7 (suburb)
			(39, 7, 16),   // Zone 5 (cx 33-46, cz 12-16): city at gz=7 (suburb)
		};

		public static List<(float worldX, float worldZ, bool isParking)> GetAirportEntryNodesInRange(int cx, int cz, int radius)
		{
			int blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
			int startGx = (cx * blocksPerChunk) - radius;
			int startGz = (cz * blocksPerChunk) - radius;
			int endGx = (cx * blocksPerChunk + blocksPerChunk) + radius;
			int endGz = (cz * blocksPerChunk + blocksPerChunk) + radius;

			var result = new List<(float, float, bool)>();
			foreach (var entry in AIRPORT_ENTRY_ROADS)
			{
				if (entry.gx < startGx || entry.gx > endGx) continue;
				int minGz = Math.Min(entry.gzStart, entry.gzEnd);
				int maxGz = Math.Max(entry.gzStart, entry.gzEnd);
				if (maxGz < startGz || minGz > endGz) continue;

				int step = entry.gzStart <= entry.gzEnd ? 1 : -1;
				int gz = entry.gzStart;
				while (true)
				{
					bool isParking = gz == entry.gzEnd;
					result.Add((entry.gx * GRID_PITCH, gz * GRID_PITCH, isParking));
					if (gz == entry.gzEnd) break;
					gz += step;
				}
			}
			return result;
		}

		public static bool IsBoulevard(int gridCoord)
		{
			int m = ((gridCoord % 4) + 4) % 4;
			return m == 0;
		}
		public static readonly (int minCx, int maxCx, int minCz, int maxCz)[] AIRPORT_ZONES = new[]
		{
			(0, 3, -3, -1),
			(8, 15, -6, -4),
			(22, 30, -8, -6),
			(36, 46, -11, -9),
			(33, 46, 12, 16)
		};

		public static bool IsAeroportChunk(int cx, int cz)
		{
			foreach (var z in AIRPORT_ZONES)
				if (cx >= z.minCx && cx <= z.maxCx && cz >= z.minCz && cz <= z.maxCz) return true;
			return false;
		}

		public static void GetRandomAeroportWorldPoint(Random rng, out float x, out float z)
		{
			int zi = rng.Next(AIRPORT_ZONES.Length);
			var zone = AIRPORT_ZONES[zi];
			int cx = zone.minCx + rng.Next(zone.maxCx - zone.minCx + 1);
			int cz = zone.minCz + rng.Next(zone.maxCz - zone.minCz + 1);
			x = cx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
			z = cz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
		}

		public static bool IsBuildingAt(float x, float z, float margin = 2.0f)
		{
			int cx = (int)Math.Floor(x / CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CHUNK_SIZE);
			if (cx == 1 && cz == 0) return true;

			string biome = GetBiome(cx, cz);
			if (biome == "mountain" || biome == "beach" || biome == "ocean"
				|| biome == "bridge"
				|| biome == "parking_lot") return false;
			// Aeroport tarmac (non-parking) is treated as "building" so NPC traffic avoids runways/hangars
			if (biome == "aeroport" && !IsAeroportParkingChunk(cx, cz)) return true;

			// Rural: sparse buildings at random positions
			if (biome == "rural_farm" || biome == "rural_hills")
			{
				uint rstate = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);
				if (RngNext(ref rstate) >= 0.35f) return false;
				float bx = cx * CHUNK_SIZE + CHUNK_SIZE / 2f + (float)((RngNext(ref rstate) - 0.5) * 40.0);
				float bz = cz * CHUNK_SIZE + CHUNK_SIZE / 2f + (float)((RngNext(ref rstate) - 0.5) * 40.0);
				return Math.Abs(x - bx) < 4f + margin && Math.Abs(z - bz) < 4f + margin;
			}

			float blockCenterX = cx * CHUNK_SIZE + CHUNK_SIZE / 2f;
			float blockCenterZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2f;
			uint state = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);
			bool isSuburb = biome == "suburb";
			float halfSW = SIDEWALK_SIZE / 2f;

			if (isSuburb)
			{
				bool hasPOI = RngNext(ref state) < 0.25f;
				if (hasPOI) { RngNext(ref state); RngNext(ref state); }

				for (int e = 0; e < EDGES.Length; e++)
				{
					var edge = EDGES[e];
					int numHouses = 1 + (int)(RngNext(ref state) * 2);
					// CHANGED: SIDEWALK_SIZE - 12 instead of -8 → 6u corner gap each end
					float houseWidth = (SIDEWALK_SIZE - 12f) / numHouses;
					for (int i = 0; i < numHouses; i++)
					{
						if (RngNext(ref state) >= 0.7f) continue;
						float w = houseWidth;
						float d = 7f + RngNext(ref state) * (SIDEWALK_SIZE * 0.22f);
						float px, pz;
						if (edge[0] == 0)
						{
							// CHANGED: start at halfSW - 6 instead of halfSW - 4
							px = blockCenterX - halfSW + 6f + houseWidth / 2f + i * houseWidth;
							pz = blockCenterZ + edge[1] * (halfSW - d / 2f - 1f);
						}
						else
						{
							pz = blockCenterZ - halfSW + 6f + houseWidth / 2f + i * houseWidth;
							px = blockCenterX + edge[0] * (halfSW - d / 2f - 1f);
						}
						if (Math.Abs(x - px) < w / 2f + margin && Math.Abs(z - pz) < d / 2f + margin) return true;
					}
				}
			}
			else
			{
				for (int e = 0; e < EDGES.Length; e++)
				{
					var edge = EDGES[e];
					int numStores = 2 + (int)(RngNext(ref state) * 2);
					// CHANGED: SIDEWALK_SIZE - 8 instead of -4 → 4u corner gap each end
					float storeWidth = (SIDEWALK_SIZE - 8f) / numStores;
					for (int i = 0; i < numStores; i++)
					{
						if (RngNext(ref state) >= 0.78f) continue;   // CHANGED: 0.78 instead of 0.80 (match client)
						float w = storeWidth;
						float d = 7f + RngNext(ref state) * (SIDEWALK_SIZE * 0.18f); // CHANGED: 0.18 not 0.20
						float px, pz;
						if (edge[0] == 0)
						{
							px = blockCenterX - halfSW + 4f + storeWidth / 2f + i * storeWidth;
							pz = blockCenterZ + edge[1] * (halfSW - d / 2f - 1f);
						}
						else
						{
							pz = blockCenterZ - halfSW + 4f + storeWidth / 2f + i * storeWidth;
							px = blockCenterX + edge[0] * (halfSW - d / 2f - 1f);
						}
						if (Math.Abs(x - px) < w / 2f + margin && Math.Abs(z - pz) < d / 2f + margin) return true;
					}
				}
			}

			// Boulevard medians are obstacles (palms + benches placed there)
			int blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
			int gx0 = cx * blocksPerChunk;
			int gz0 = cz * blocksPerChunk;
			for (int g = 0; g < 2; g++)
			{
				if (IsBoulevard(gx0 + g))
				{
					float worldX = (gx0 + g) * GRID_PITCH;
					if (Math.Abs(x - worldX) < 2f + margin && Math.Abs(z - blockCenterZ) < CHUNK_SIZE / 2f) return true;
				}
				if (IsBoulevard(gz0 + g))
				{
					float worldZ = (gz0 + g) * GRID_PITCH;
					if (Math.Abs(z - worldZ) < 2f + margin && Math.Abs(x - blockCenterX) < CHUNK_SIZE / 2f) return true;
				}
			}

			return false;
		}

		public static bool IsRoadAt(float x, float z)
		{
			int cx = (int)Math.Floor(x / CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CHUNK_SIZE);
			string biome = GetBiome(cx, cz);
			// FIX: Bridge is fully drivable — without this, NPC movement validation
			// fails and cars get stuck trying to cross bridges
			if (biome == "parking_lot" || biome == "rural_farm" || biome == "rural_hills" || biome == "bridge") return true;

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
					if (biome == "mountain" || biome == "beach" || biome == "ocean" || biome == "aeroport" || biome == "rural_farm" || biome == "rural_hills") continue;
					nodes.Add((gx * GRID_PITCH, gz * GRID_PITCH));
				}
			}
			return nodes;
		}

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
						edges.Add((i, j));
				}
			}
			return edges;
		}

		// ── Cached road graph ─────────────────────────────────────────
		// Returns nodes + pre-built adjacency for the chunk, cached forever.
		// Uses a dictionary to build edges in O(N) instead of O(N²).
		public static RoadGraph GetRoadGraph(int cx, int cz)
		{
			var key = (cx, cz);
			if (_roadGraphCache.TryGetValue(key, out var existing)) return existing;

			var nodes = GetRoadNodes(cx, cz, ROAD_RADIUS);
			// Merge airport entry/parking nodes
			var airportNodes = GetAirportEntryNodesInRange(cx, cz, ROAD_RADIUS);
			foreach (var an in airportNodes)
				nodes.Add((an.worldX, an.worldZ));

			int n = nodes.Count;
			var adjLists = new List<int>[n];
			for (int i = 0; i < n; i++) adjLists[i] = new List<int>(4);

			// O(N) edge build via coordinate lookup
			var nodeIndex = new Dictionary<(int, int), int>(n);
			for (int i = 0; i < n; i++)
			{
				int gx = (int)Math.Round(nodes[i].x / GRID_PITCH);
				int gz = (int)Math.Round(nodes[i].z / GRID_PITCH);
				nodeIndex[(gx, gz)] = i;
			}
			for (int i = 0; i < n; i++)
			{
				int gx = (int)Math.Round(nodes[i].x / GRID_PITCH);
				int gz = (int)Math.Round(nodes[i].z / GRID_PITCH);
				if (nodeIndex.TryGetValue((gx + 1, gz), out var r)) { adjLists[i].Add(r); adjLists[r].Add(i); }
				if (nodeIndex.TryGetValue((gx, gz + 1), out var d)) { adjLists[i].Add(d); adjLists[d].Add(i); }
			}

			var graph = new RoadGraph
			{
				Nodes = nodes.ToArray(),
				Adjacency = new int[n][]
			};
			for (int i = 0; i < n; i++) graph.Adjacency[i] = adjLists[i].ToArray();

			// Only add if no other thread beat us; return the winner
			_roadGraphCache.TryAdd(key, graph);
			return _roadGraphCache[key];
		}

		public static (float ox, float oz) GetLaneOffset(float fromX, float fromZ, float toX, float toZ, bool forward)
		{
			float dx = toX - fromX;
			float dz = toZ - fromZ;
			float len = (float)Math.Sqrt(dx * dx + dz * dz);
			if (len < 0.001f) return (0, 0);
			const float laneOffset = 4.0f;
			float perpX = dz / len * laneOffset;
			float perpZ = -dx / len * laneOffset;
			if (forward) return (perpX, perpZ);
			return (-perpX, -perpZ);
		}

		public static bool IsLightRedForX()
		{
			long ms = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
			return (ms / 6000) % 2 == 0;
		}

		public static int ClosestNode(List<(float x, float z)> nodes, float x, float z)
		{
			int best = 0;
			float bestDist = float.MaxValue;
			for (int i = 0; i < nodes.Count; i++)
			{
				float dx = nodes[i].x - x;
				float dz = nodes[i].z - z;
				float d = dx * dx + dz * dz;
				if (d < bestDist) { bestDist = d; best = i; }
			}
			return best;
		}

		public static int ClosestNodeArr((float x, float z)[] nodes, float x, float z)
		{
			int best = 0;
			float bestDist = float.MaxValue;
			for (int i = 0; i < nodes.Length; i++)
			{
				float dx = nodes[i].x - x;
				float dz = nodes[i].z - z;
				float d = dx * dx + dz * dz;
				if (d < bestDist) { bestDist = d; best = i; }
			}
			return best;
		}

		public static List<int>? FindPath(List<(float x, float z)> nodes, int start, int end)
		{
			if (nodes.Count < 2) return null;
			var edges = GetRoadEdges(nodes);
			var adj = new List<List<int>>(nodes.Count);
			for (int i = 0; i < nodes.Count; i++) adj.Add(new List<int>());
			foreach (var e in edges) { adj[e.from].Add(e.to); adj[e.to].Add(e.from); }
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
					if (!visited[nxt]) { visited[nxt] = true; prev[nxt] = cur; queue.Enqueue(nxt); }
				}
			}
			if (!visited[end]) return null;
			var path = new List<int>();
			for (int at = end; at != -1; at = prev[at]) path.Add(at);
			path.Reverse();
			return path;
		}

		// BFS using a pre-built cached RoadGraph — no edge rebuild, no List allocation
		public static List<int>? FindPathCached(RoadGraph graph, int start, int end)
		{
			int n = graph.Nodes.Length;
			if (n < 2) return null;
			int[] prev = new int[n];
			bool[] visited = new bool[n];
			for (int i = 0; i < n; i++) prev[i] = -1;
			var queue = new Queue<int>(n);
			queue.Enqueue(start);
			visited[start] = true;
			while (queue.Count > 0)
			{
				int cur = queue.Dequeue();
				if (cur == end) break;
				var neighbors = graph.Adjacency[cur];
				for (int i = 0; i < neighbors.Length; i++)
				{
					int nxt = neighbors[i];
					if (!visited[nxt]) { visited[nxt] = true; prev[nxt] = cur; queue.Enqueue(nxt); }
				}
			}
			if (!visited[end]) return null;
			var path = new List<int>();
			for (int at = end; at != -1; at = prev[at]) path.Add(at);
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
		private const float COP_ORBIT_SPEED = 0.9f;
		private static readonly ConcurrentDictionary<int, PlayerShootState> _shootingPlayers = new();
		private static readonly ConcurrentDictionary<int, int> _playerHealth = new();
		private static readonly ConcurrentDictionary<int, int> _lastClientHealth = new();
		private static readonly ConcurrentDictionary<int, float> _playerX = new();
		private static readonly ConcurrentDictionary<int, float> _playerZ = new();
		private static readonly ConcurrentDictionary<int, string> _playerModelUrls = new();
		private static readonly ConcurrentDictionary<int, double> _lastDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerWantedLevels = new();
		private static readonly ConcurrentDictionary<int, DateTime> _lastUndetectedTime = new();
		private const float COP_DETECTION_RANGE = 25f;
		private const float COP_DETECTION_RANGE_SQ = COP_DETECTION_RANGE * COP_DETECTION_RANGE;
		private static readonly ConcurrentDictionary<int, double> _lastPoliceDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerMoney = new();
		private static readonly ConcurrentDictionary<int, bool> _playerInCar = new();
		private static readonly ConcurrentDictionary<int, DateTime> _playerInCarTime = new();
		private static readonly ConcurrentDictionary<int, bool> _evictedPlayers = new();
		private static readonly ConcurrentDictionary<int, string> _playerVehicleType = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarColorR = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarColorG = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarColorB = new();
		private static readonly ConcurrentDictionary<int, int> _playerPassengerOf = new();
		private const float DEAD_BODY_TIMEOUT_SECONDS = 30;
		private static readonly ConcurrentDictionary<int, DeadPlayerBody> _deadPlayerBodies = new();
		private static readonly ConcurrentDictionary<int, ConcurrentDictionary<long, NpcState>> _worldNpcs = new();
		private static readonly ConcurrentDictionary<int, List<ChatMessageEntry>> _worldChatMessages = new();
		private class ChatMessageEntry { public int UserId { get; set; } public string Username { get; set; } = ""; public string Message { get; set; } = ""; public DateTime Timestamp { get; set; } }
		private static readonly ConcurrentDictionary<int, string> _playerUsername = new();
		private static readonly ConcurrentDictionary<int, bool> _playerDeathBroadcasted = new();

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
		private static readonly ConcurrentDictionary<int, bool[]> _playerWeapons = new();
		private static readonly ConcurrentDictionary<int, int[]> _playerAmmo = new();
		private static readonly bool[] _homeBaseWeaponCollected = new bool[5];
		private static readonly DateTime[] _homeBaseWeaponRespawnAt = new DateTime[5];
		private const int HOME_BASE_WEAPON_RESPAWN_SECONDS = 60;
		private static readonly float[] HOME_BASE_WEAPON_X = { 0, 114, 120, 117, 123 };
		private static readonly float[] HOME_BASE_WEAPON_Z = { 0, 48, 48, 48, 48 };

		private static long _nextNpcId = 1;
		private static long GetNextNpcId() => Interlocked.Increment(ref _nextNpcId);

		private void BroadcastDeathMessage(int worldId, string killerName, string victimName, string cause)
		{
			var messages = _worldChatMessages.GetOrAdd(worldId, _ => new List<ChatMessageEntry>());
			lock (messages)
			{
				string msg = $"{killerName} killed {victimName}{cause}";
				messages.Add(new ChatMessageEntry { UserId = 0, Username = "SYSTEM", Message = msg, Timestamp = DateTime.UtcNow });
				var pruneCutoff = DateTime.UtcNow.AddSeconds(-120);
				messages.RemoveAll(m => m.Timestamp < pruneCutoff);
				while (messages.Count > 100) messages.RemoveAt(0);
			}
		}

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
			public long HomeVehicleId { get; set; } = 0;
			public List<int>? PathIndices { get; set; } = null;
			public int PathIdx { get; set; } = 0;
			public int PathChunkX { get; set; } = 0;
			public int PathChunkZ { get; set; } = 0;
			public float LaneOffsetX { get; set; } = 0f;
			public float LaneOffsetZ { get; set; } = 0f;
			public float StopTimer { get; set; } = 0f;
			public bool Stopped { get; set; } = false;
			public bool HasDriver { get; set; } = true;
			public int PassengerCount { get; set; } = 0;
			public double StationaryTime { get; set; } = 0;
			public long LastShotTime { get; set; } = 0;
			public bool IsShootingAt { get; set; } = false;
			public bool IsParked { get; set; } = false;
			public DateTime? PanicUntil { get; set; } = null;
			public float PanicFromX { get; set; } = 0f;
			public float PanicFromZ { get; set; } = 0f;
			// Aircraft phase state machine: "parked" | "taxiing" | "taking_off" | "flying" | "landing"
			public string AircraftPhase { get; set; } = "flying";
			public DateTime PhaseStartedAt { get; set; } = DateTime.UtcNow;
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
		private const float HOME_BASE_X = 120f;
		private const float HOME_BASE_Z = 40f;
		private const float HOME_BASE_YAW = 0f;
		private const int INACTIVITY_RESPAWN_MINUTES = 30;
		public float SPEED_FACTOR { get; private set; } = 0.5f;

		[HttpPost("UpdatePosition")]
		public async Task<IActionResult> UpdatePosition([FromBody] GTUpdatePositionRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

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
                VALUES (@uid, @wid, @px, @py, @pz, @y, @p, @cy, @cs, @h, @w, @money, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE pos_x = @px, pos_y = @py, pos_z = @pz, yaw = @y, pitch = @p, car_yaw = @cy, car_speed = @cs, health = @h, weapon = @w, money = @money, last_seen = UTC_TIMESTAMP()", conn))
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

				_playerX[req.UserId] = req.PosX;
				_playerZ[req.UserId] = req.PosZ;
				_playerMoney[req.UserId] = Math.Max(0, req.Money);
				int lastClientHp = _lastClientHealth.GetOrAdd(req.UserId, req.Health);

				if (!_playerHealth.ContainsKey(req.UserId))
				{
					_playerHealth[req.UserId] = req.Health;
				}
				else
				{
					int currentServerHp = _playerHealth[req.UserId];
					if (req.Health > currentServerHp)
					{
						if (req.Health > lastClientHp)
							_playerHealth[req.UserId] = Math.Min(100, req.Health);
					}
					else
					{
						_playerHealth[req.UserId] = req.Health;
					}
				}
				_lastClientHealth[req.UserId] = req.Health;

				_playerInCar[req.UserId] = req.IsInCar;
				_playerInCarTime[req.UserId] = DateTime.UtcNow;
				if (!string.IsNullOrEmpty(req.VehicleType))
					_playerVehicleType[req.UserId] = req.VehicleType!;
				if (req.IsInCar)
				{
					_playerCarColorR[req.UserId] = req.CarColorR;
					_playerCarColorG[req.UserId] = req.CarColorG;
					_playerCarColorB[req.UserId] = req.CarColorB;
				}
				_playerPassengerOf[req.UserId] = req.PassengerOfUserId;

				if (req.Health <= 0)
				{
					if (!_deadPlayerBodies.ContainsKey(req.UserId))
					{
						if (!_playerDeathBroadcasted.TryGetValue(req.UserId, out _))
						{
							string victimName = _playerUsername.GetOrAdd(req.UserId, $"Player{req.UserId}");
							BroadcastDeathMessage(req.WorldId, "the police", victimName, "");
						}
						_deadPlayerBodies[req.UserId] = new DeadPlayerBody
						{
							UserId = req.UserId,
							PosX = req.PosX,
							PosZ = req.PosZ,
							Yaw = req.CarYaw,
							DiedAt = DateTime.UtcNow
						};
					}
					_playerWantedLevels[req.UserId] = 0;
					_playerMoney[req.UserId] = 0;
				}
				else
				{
					_deadPlayerBodies.TryRemove(req.UserId, out _);
					_playerDeathBroadcasted.TryRemove(req.UserId, out _);
				}

				if (!string.IsNullOrEmpty(req.ModelUrl)) _playerModelUrls[req.UserId] = req.ModelUrl!;

				if (req.IsShooting)
				{
					_shootingPlayers[req.UserId] = new PlayerShootState { DirX = (float)(Math.Sin(req.Yaw) * Math.Cos(req.Pitch)), DirY = (float)(-Math.Sin(req.Pitch)), DirZ = (float)(Math.Cos(req.Yaw) * Math.Cos(req.Pitch)), Weapon = req.Weapon, LastUpdated = DateTime.UtcNow };
					SimulateDamage(req);
				}
				else if (_shootingPlayers.TryGetValue(req.UserId, out var ps))
				{
					// Keep the shooting flag visible for other players for 500ms
					// after the shooter releases the button. This ensures a brief
					// click is still visible even if the poll interval misses it.
					ps.LastUpdated = DateTime.UtcNow;
				}

				// Clean up stale shooting entries (older than 500ms)
				var cutoff = DateTime.UtcNow.AddMilliseconds(-500);
				foreach (var kv in _shootingPlayers) if (kv.Value.LastUpdated < cutoff) _shootingPlayers.TryRemove(kv.Key, out _);

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
					_playerUsername[req.UserId] = senderUsername;
					var messages = _worldChatMessages.GetOrAdd(req.WorldId, _ => new List<ChatMessageEntry>());
					lock (messages)
					{
						messages.Add(new ChatMessageEntry { UserId = req.UserId, Username = senderUsername, Message = req.ChatMessage, Timestamp = DateTime.UtcNow });
						var pruneCutoff = DateTime.UtcNow.AddSeconds(-120);
						messages.RemoveAll(m => m.Timestamp < pruneCutoff);
						while (messages.Count > 100) messages.RemoveAt(0);
					}
				}
				{
					var messages = _worldChatMessages.GetOrAdd(req.WorldId, _ => new List<ChatMessageEntry>());
					lock (messages)
					{
						var chatCutoff = DateTime.UtcNow.AddSeconds(-60);
						foreach (var m in messages)
						{
							if (m.Timestamp >= chatCutoff)
								chatMessages.Add(new { userId = m.UserId, username = m.Username, message = m.Message, timestamp = m.Timestamp });
						}
					}
				}

			int wantedLevel = 0;
			if (_playerWantedLevels.TryGetValue(req.UserId, out var w)) wantedLevel = w;
			if (wantedLevel > 0)
			{
				// Check if any cop is detecting the player
				bool detected = false;
				if (_worldNpcs.TryGetValue(req.WorldId, out var npcs))
				{
					float px = req.PosX, pz = req.PosZ;
					foreach (var kv in npcs)
					{
						var npc = kv.Value;
						if (npc.DeadAt != null || npc.Health <= 0) continue;
						if (npc.TargetUserId != req.UserId) continue;
						if ((npc.Type != "police" && npc.Type != "cop")) continue;
						float dx = npc.X - px, dz = npc.Z - pz;
						if (dx * dx + dz * dz < COP_DETECTION_RANGE_SQ) { detected = true; break; }
					}
				}
				if (detected)
				{
					_lastUndetectedTime[req.UserId] = DateTime.UtcNow;
				}
				else if (_lastUndetectedTime.TryGetValue(req.UserId, out var last))
				{
					if ((DateTime.UtcNow - last).TotalSeconds >= 60)
					{
						_playerWantedLevels[req.UserId] = 0;
					}
				}
				else
				{
					_lastUndetectedTime[req.UserId] = DateTime.UtcNow;
				}
			}

				var players = new List<object>();
				using (var selCmd = new MySqlCommand(@"
                SELECT ps.user_id, ps.pos_x, ps.pos_y, ps.pos_z, ps.yaw, ps.pitch, ps.car_yaw, ps.car_speed, ps.health, ps.weapon, ps.money,
                COALESCE(u.username, CONCAT('Player', ps.user_id)) as username
                FROM maxhanna.grandtheft_player_state ps LEFT JOIN maxhanna.users u ON u.id = ps.user_id
                WHERE ps.world_id = @wid2 AND ps.user_id != @uid2 AND ps.last_seen > DATE_SUB(UTC_TIMESTAMP(), INTERVAL @timeout SECOND)", conn))
				{
					selCmd.Parameters.AddWithValue("@wid2", req.WorldId);
					selCmd.Parameters.AddWithValue("@uid2", req.UserId);
					selCmd.Parameters.AddWithValue("@timeout", INACTIVITY_TIMEOUT_SECONDS);
					using var rdr = await selCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						int otherUserId = rdr.GetInt32("user_id");
						_playerUsername[otherUserId] = rdr.GetString("username");
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

				// ── NPC simulation ──────────────────────────────────────
				// Only simulate NPCs within 300 units of the requesting player.
				// Other players' requests handle distant NPCs.
				if (_worldNpcs.ContainsKey(req.WorldId))
				{
					var npcs = _worldNpcs[req.WorldId];
					var now = DateTime.UtcNow;
					var simRng = new Random();
					const float simRadiusSq = 300f * 300f;

					foreach (var npc in npcs.Values)
					{
						if (npc.DeadAt.HasValue) continue;

						// Skip far NPCs — saves O(N²) work when world is large
						float sfdx = npc.X - req.PosX;
						float sfdz = npc.Z - req.PosZ;
						if (sfdx * sfdx + sfdz * sfdz > simRadiusSq) continue;

						// Separation force with quick-reject
						float sepX = 0f, sepZ = 0f;
						float minSep = npc.Type == "cop" ? 3.5f : 2.0f;
						float minSepSq = minSep * minSep;

						foreach (var otherNpc in npcs.Values)
						{
							if (otherNpc.Id == npc.Id || otherNpc.DeadAt.HasValue) continue;
							float sdx = npc.X - otherNpc.X;
							// Quick component-wise reject before Math.Sqrt
							if (sdx > minSep || sdx < -minSep) continue;
							float sdz = npc.Z - otherNpc.Z;
							if (sdz > minSep || sdz < -minSep) continue;
							float sDistSq = sdx * sdx + sdz * sdz;
							if (sDistSq < minSepSq && sDistSq > 0.01f)
							{
								float sDist = (float)Math.Sqrt(sDistSq);
								float force = (minSep - sDist) / minSep;
								sepX += (sdx / sDist) * force;
								sepZ += (sdz / sDist) * force;
							}
						}

						npc.X += sepX * 0.05f;
						npc.Z += sepZ * 0.05f;

						bool isAircraft = npc.Type == "helicopter" || npc.Type == "plane";
						if (!isAircraft)
						{
							if (npc.PanicUntil.HasValue && now < npc.PanicUntil.Value)
							{
								float pdx = npc.X - npc.PanicFromX;
								float pdz = npc.Z - npc.PanicFromZ;
								float pDist = (float)Math.Sqrt(pdx * pdx + pdz * pdz);
								if (pDist > 0.1f)
								{
									float fleeSpeed = npc.Speed * 1.5f;
									npc.X += (pdx / pDist) * fleeSpeed * 0.1f;
									npc.Z += (pdz / pDist) * fleeSpeed * 0.1f;
								}
							}
							else
							{
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
									if (npc.Type != "cop")
									{
										float tx = npc.TargetX, tz = npc.TargetZ;
										if (npc.Type == "ped_male" || npc.Type == "ped_female")
											GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out tx, out tz, simRng);
										else
											GetRandomRoadPointNearPlayer(npc.X, npc.Z, out tx, out tz, simRng);
										npc.TargetX = tx;
										npc.TargetZ = tz;
									}
								}
							}
						}

						if (npc.Type == "helicopter" || npc.Type == "plane")
						{
							SimulateAircraft(npc, now, simRng);
						}

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
									if (pdx * pdx + pdz * pdz < 4f)
									{
										otherNpc.Health -= 25;
										if (otherNpc.Health <= 0) otherNpc.DeadAt = now;
									}
								}
							}
						}

						if (npc.Health > 0 && (npc.Type == "car" || npc.Type == "bus" || npc.Type == "taxi" || npc.Type == "police" || npc.Type == "bike" || npc.Type == "motorcycle" || npc.Type == "helicopter" || npc.Type == "plane"))
						{
							int cx = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
							int cz = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
							if (!npc.OnFire && CityLayout.GetBiome(cx, cz) == "ocean") { npc.OnFire = true; npc.FireStartedAt = now; }
							int fireThreshold = Math.Max(80, npc.MaxHealth / 5);
							if (npc.Health <= fireThreshold && !npc.OnFire) { npc.OnFire = true; npc.FireStartedAt = now; }
							if (npc.OnFire && npc.FireStartedAt.HasValue && (now - npc.FireStartedAt.Value).TotalSeconds >= 10.0)
							{
								npc.Health = 0;
								npc.DeadAt = now;
							}
						}

						npc.LastUpdate = now;
					}
				}

			bool evicted = _evictedPlayers.TryRemove(req.UserId, out _);
			int yourHealth = req.Health;
			if (_playerHealth.TryGetValue(req.UserId, out var serverHp))
			{
				if (serverHp <= 0 && req.Health > 0)
				{
					// Client has respawned — reset server health
					_playerHealth[req.UserId] = req.Health;
					yourHealth = req.Health;
				}
				else
				{
					yourHealth = serverHp;
				}
			}
				if (!_playerWeapons.ContainsKey(req.UserId))
					_playerWeapons[req.UserId] = new bool[5] { true, false, false, false, false };
				if (!_playerAmmo.ContainsKey(req.UserId))
					_playerAmmo[req.UserId] = new int[5];
				var pwArr = _playerWeapons[req.UserId];
				var paArr = _playerAmmo[req.UserId];
				var dw = BuildDroppedWeapons();
				return Ok(new { ok = true, players, wantedLevel, evicted, yourHealth, respawnAtHome, chatMessages, droppedWeapons = dw, ownedWeapons = pwArr, ammo = paArr });
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
			var now = DateTime.UtcNow;

			int nearbyCars = 0;
			int nearbyPeds = 0;
			int wantedLevel = 0;
			if (userId > 0 && _playerWantedLevels.TryGetValue(userId, out var w)) wantedLevel = w;

			foreach (var kv in npcs)
			{
				var npc = kv.Value;

				if (npc.DeadAt != null)
				{
					if ((now - npc.DeadAt.Value).TotalSeconds > DEAD_BODY_TIMEOUT_SECONDS)
					{
						deadIds.Add(kv.Key);
					}
					else
					{
						float ddx = npc.X - posX;
						float ddz = npc.Z - posZ;
						if (ddx * ddx + ddz * ddz < 62500f)
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

				if (npc.Health <= 0) { npc.DeadAt = now; continue; }

				if (npc.Type == "police" || npc.Type == "cop")
				{
					if (npc.TargetUserId == userId && wantedLevel == 0)
					{
						npc.TargetUserId = 0;
						if (npc.HomeVehicleId != 0 && npcs.TryGetValue(npc.HomeVehicleId, out var homeCar) && homeCar.IsParked)
						{
							npc.TargetX = homeCar.X;
							npc.TargetZ = homeCar.Z;
						}
						else
						{
							npc.HomeVehicleId = 0;
							npc.Type = "ped_" + npc.Gender;
							GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out float sx, out float sz, rng);
							npc.TargetX = sx;
							npc.TargetZ = sz;
							npc.Speed = 2.0f;
						}
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
									Health = 400,
									MaxHealth = 400,
									Cr = 0.1f,
									Cg = 0.1f,
									Cb = 0.2f,
								};
								npc.Type = "cop";
								npc.Speed = 5.0f;
								npc.ApproachAngle = (float)Math.Atan2(npc.X - posX, npc.Z - posZ);
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

				if (distSq > 90000f && !npc.IsParked) { deadIds.Add(kv.Key); continue; }

				if (distSq < 22500f)
				{
					if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") nearbyPeds++;
					else if (npc.Type == "helicopter" || npc.Type == "plane") { }
					else if (!npc.IsParked) nearbyCars++;
				}

				if (distSq > 40000f) continue;

				if (npc.IsParked) { parkedCars.Add(new { id = npc.Id, posX = npc.X, posY = npc.Y, posZ = npc.Z, yaw = npc.Yaw, speed = 0f, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, health = npc.Health, isBurning = npc.OnFire }); continue; }

				float tdx = npc.TargetX - npc.X;
				float tdz = npc.TargetZ - npc.Z;
				float distToTarget = (float)Math.Sqrt(tdx * tdx + tdz * tdz);

				bool isVehicle = npc.Type == "car" || npc.Type == "bus" || npc.Type == "bike" || npc.Type == "motorcycle" || npc.Type == "taxi" || npc.Type == "helicopter" || npc.Type == "plane";

				if (isVehicle && (npc.Type == "helicopter" || npc.Type == "plane"))
				{
					SimulateAircraft(npc, now, rng);

					if (npc.Health > 0)
					{
						int cxc = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
						int czc = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
						if (!npc.OnFire && CityLayout.GetBiome(cxc, czc) == "ocean") { npc.OnFire = true; npc.FireStartedAt = now; }
						int fireThreshold = Math.Max(80, npc.MaxHealth / 5);
						if (npc.Health <= fireThreshold && !npc.OnFire) { npc.OnFire = true; npc.FireStartedAt = now; }
						if (npc.OnFire && npc.FireStartedAt.HasValue && (now - npc.FireStartedAt.Value).TotalSeconds >= 10.0)
						{
							npc.Health = 0;
							npc.DeadAt = now;
						}
					}
				}
				else if (isVehicle)
				{
					const float INTERSECTION_RADIUS = 14f;
					const float SPEED_FACTOR_LOCAL = 0.5f;

					bool isPanicking = npc.PanicUntil.HasValue && now < npc.PanicUntil.Value;
					if (isPanicking)
					{
						npc.PathIndices = null;
						float pdx = npc.X - npc.PanicFromX;
						float pdz = npc.Z - npc.PanicFromZ;
						float pDist = (float)Math.Sqrt(pdx * pdx + pdz * pdz);
						if (pDist > 0.1f)
						{
							float fleeSpeed = npc.Speed * 1.5f;
							float fmoveX = (pdx / pDist) * fleeSpeed * SPEED_FACTOR_LOCAL;
							float fmoveZ = (pdz / pDist) * fleeSpeed * SPEED_FACTOR_LOCAL;
							float fnextX = npc.X + fmoveX;
							float fnextZ = npc.Z + fmoveZ;
							int panicCX = (int)Math.Floor(fnextX / CityLayout.CHUNK_SIZE);
							int panicCZ = (int)Math.Floor(fnextZ / CityLayout.CHUNK_SIZE);
							string panicBiome = CityLayout.GetBiome(panicCX, panicCZ);
							if (panicBiome != "ocean" && panicBiome != "beach" && !CityLayout.IsBuildingAt(fnextX, fnextZ)) { npc.X = fnextX; npc.Z = fnextZ; }
							npc.Yaw = (float)Math.Atan2(fmoveX, fmoveZ);
						}
					}
					else
					{
						int npcCX = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
						int npcCZ = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);

						// Use cached road graph instead of rebuilding every call
						var graph = CityLayout.GetRoadGraph(npcCX, npcCZ);
						var nodes = graph.Nodes;

						if (nodes.Length < 2)
						{
							float moveX = (tdx / distToTarget) * npc.Speed * SPEED_FACTOR_LOCAL;
							float moveZ = (tdz / distToTarget) * npc.Speed * SPEED_FACTOR_LOCAL;
							float nextX = npc.X + moveX;
							float nextZ = npc.Z + moveZ;
							int fallbackCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
							int fallbackCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
							string fallbackBiome = CityLayout.GetBiome(fallbackCX, fallbackCZ);
							if (fallbackBiome != "ocean" && fallbackBiome != "beach" && !CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
							npc.Yaw = (float)Math.Atan2(moveX, moveZ);
						}
						else
						{
							if (npc.PathChunkX != npcCX || npc.PathChunkZ != npcCZ)
							{
								npc.PathIndices = null;
								npc.PathChunkX = npcCX;
								npc.PathChunkZ = npcCZ;
							}

							if (npc.PathIndices == null || npc.PathIdx >= npc.PathIndices.Count)
							{
								int startIdx = CityLayout.ClosestNodeArr(nodes, npc.X, npc.Z);
								int endIdx = rng.Next(nodes.Length);
								if (endIdx == startIdx) endIdx = (startIdx + 1) % nodes.Length;
								npc.PathIndices = CityLayout.FindPathCached(graph, startIdx, endIdx);
								npc.PathIdx = 0;
								if (npc.PathIndices == null || npc.PathIndices.Count < 2)
									npc.PathIndices = new List<int> { startIdx, (startIdx + 1) % nodes.Length };
								var fromN = nodes[npc.PathIndices[0]];
								var toN = nodes[npc.PathIndices[1]];
								var off = CityLayout.GetLaneOffset(fromN.x, fromN.z, toN.x, toN.z, true);
								npc.LaneOffsetX = off.ox;
								npc.LaneOffsetZ = off.oz;
							}

							int currIdx = npc.PathIndices[npc.PathIdx];
							int nextIdx = npc.PathIdx + 1 < npc.PathIndices.Count ? npc.PathIndices[npc.PathIdx + 1] : currIdx;
							if (currIdx < 0 || currIdx >= nodes.Length || nextIdx < 0 || nextIdx >= nodes.Length)
							{
								npc.PathIndices = null;
								continue;
							}

							var currNode = nodes[currIdx];
							var nextNode = nodes[nextIdx];
							float targetX = nextNode.x + npc.LaneOffsetX;
							float targetZ = nextNode.z + npc.LaneOffsetZ;
							float ddx2 = targetX - npc.X;
							float ddz2 = targetZ - npc.Z;
							float distToTarget2 = (float)Math.Sqrt(ddx2 * ddx2 + ddz2 * ddz2);

							bool overshot = false;
							if (distToTarget2 > 1.0f)
							{
								float dotProduct = ddx2 * (float)Math.Sin(npc.Yaw) + ddz2 * (float)Math.Cos(npc.Yaw);
								if (dotProduct < 0)
								{
									overshot = true;
									npc.PathIdx++;
									if (npc.PathIdx >= npc.PathIndices.Count) { npc.PathIndices = null; }
									else
									{
										var cn = nodes[npc.PathIndices[npc.PathIdx]];
										var nn3 = nodes[npc.PathIndices[npc.PathIdx + 1 < npc.PathIndices.Count ? npc.PathIdx + 1 : npc.PathIdx]];
										var off4 = CityLayout.GetLaneOffset(cn.x, cn.z, nn3.x, nn3.z, true);
										npc.LaneOffsetX = off4.ox;
										npc.LaneOffsetZ = off4.oz;
									}
								}
							}
							if (!overshot && npc.PathIndices != null)
							{
								// Traffic light check
								bool lightStop = false;
								if (nextIdx != currIdx && distToTarget2 < INTERSECTION_RADIUS)
								{
									float nodeDx = nextNode.x - currNode.x;
									float nodeDz = nextNode.z - currNode.z;
									bool isHorizontal = Math.Abs(nodeDx) > Math.Abs(nodeDz);
									if (CityLayout.IsLightRedForX() == isHorizontal) lightStop = true;
								}

								// Obstacle check — single pass, quick-reject by forward distance
								bool blocked = false;
								float sinYaw = (float)Math.Sin(npc.Yaw);
								float cosYaw = (float)Math.Cos(npc.Yaw);
								foreach (var otherKv in npcs)
								{
									if (otherKv.Key == kv.Key || otherKv.Value.DeadAt != null) continue;
									float relX = otherKv.Value.X - npc.X;
									float relZ = otherKv.Value.Z - npc.Z;
									float forward = relX * sinYaw + relZ * cosYaw;
									if (forward < 1f || forward > 9f) continue;
									float side = relX * cosYaw - relZ * sinYaw;
									if (side * side < 9f) { blocked = true; break; }
								}

								float speedMult = 1.0f;
								if (lightStop) speedMult = 0.1f;
								else if (blocked) speedMult = 0.4f;

								npc.StopTimer = 0;
								if (distToTarget2 < 2.5f)
								{
									// Airport parking: if this is the last node and it's a parking spot, park + evict driver
									if (npc.PathIdx + 1 >= npc.PathIndices.Count && CityLayout.GetAirportParkingPositions().Contains((currNode.x, currNode.z)))
									{
										npc.IsParked = true;
										npc.HasDriver = false;
										npc.Speed = 0;
										npc.PathIndices = null;
										// Evict driver as pedestrian
										float driverAngle = (float)(rng.NextDouble() * Math.PI * 2);
										float driverDist = 3f + (float)rng.NextDouble() * 2f;
										float driverX = npc.X + (float)Math.Cos(driverAngle) * driverDist;
										float driverZ = npc.Z + (float)Math.Sin(driverAngle) * driverDist;
										GetRandomSidewalkPointNearPlayer(driverX, driverZ, out float driverTx, out float driverTz, rng, 0);
										float driverYaw = (float)Math.Atan2(driverTx - driverX, driverTz - driverZ);
										long driverId = GetNextNpcId();
										npcs[driverId] = new NpcState
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
										continue;
									}
									npc.PathIdx++;
									if (npc.PathIdx >= npc.PathIndices.Count)
									{
										int newEnd = rng.Next(nodes.Length);
										npc.PathIndices = CityLayout.FindPathCached(graph, currIdx, newEnd);
										npc.PathIdx = 0;
										if (npc.PathIndices == null || npc.PathIndices.Count < 2)
											npc.PathIndices = new List<int> { currIdx, (currIdx + 1) % nodes.Length };
										var nn = nodes[npc.PathIndices[0]];
										var nm = nodes[npc.PathIndices[1]];
										var off2 = CityLayout.GetLaneOffset(nn.x, nn.z, nm.x, nm.z, true);
										npc.LaneOffsetX = off2.ox;
										npc.LaneOffsetZ = off2.oz;
									}
									else
									{
										var cn = nodes[npc.PathIndices[npc.PathIdx]];
										var nn2 = nodes[npc.PathIndices[npc.PathIdx + 1 < npc.PathIndices.Count ? npc.PathIdx + 1 : npc.PathIdx]];
										var off3 = CityLayout.GetLaneOffset(cn.x, cn.z, nn2.x, nn2.z, true);
										npc.LaneOffsetX = off3.ox;
										npc.LaneOffsetZ = off3.oz;
									}
								}
								else
								{
									float moveX = (ddx2 / distToTarget2) * npc.Speed * SPEED_FACTOR_LOCAL * speedMult;
									float moveZ = (ddz2 / distToTarget2) * npc.Speed * SPEED_FACTOR_LOCAL * speedMult;
									float nextX = npc.X + moveX;
									float nextZ = npc.Z + moveZ;

									// STRICT VALIDATION: Cars must stay on land roads!
									int nextCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
									int nextCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
									string nextBiome = CityLayout.GetBiome(nextCX, nextCZ);
									bool isOcean = nextBiome == "ocean" || nextBiome == "beach";
									if (!isOcean && !CityLayout.IsBuildingAt(nextX, nextZ) && CityLayout.IsRoadAt(nextX, nextZ))
									{
										npc.X = nextX;
										npc.Z = nextZ;
									}
									else
									{
										npc.PathIndices = null;
									}
									npc.Yaw = (float)Math.Atan2(moveX, moveZ);
								}
							}
						}
					}
				}
				else if (npc.Type == "cop")
				{
					bool copReEntered = false;
					if (npc.TargetUserId == 0 && npc.HomeVehicleId != 0 && npcs.TryGetValue(npc.HomeVehicleId, out var homeCar2) && homeCar2.IsParked)
					{
						float hcdx = npc.X - homeCar2.X;
						float hcdz = npc.Z - homeCar2.Z;
						if (hcdx * hcdx + hcdz * hcdz < 6.25f)
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
						if (npc.TargetUserId == userId && wantedLevel > 0)
						{
							float sdx = npc.X - posX;
							float sdz = npc.Z - posZ;
							if (sdx * sdx + sdz * sdz < 625f)
								npc.StationaryTime += 1.0;
							else
								npc.StationaryTime = 0;
						}
						else
							npc.StationaryTime = 0;

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
									npc.TargetX = posX;
									npc.TargetZ = posZ;
								}
							}
							else if (npc.HomeVehicleId == 0)
							{
								GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out float sx, out float sz, rng);
								npc.TargetX = sx;
								npc.TargetZ = sz;
							}
						}
						else
						{
							float moveX = (tdx / distToTarget) * npc.Speed * 0.5f;
							float moveZ = (tdz / distToTarget) * npc.Speed * 0.5f;
							float nextX = npc.X + moveX;
							float nextZ = npc.Z + moveZ;
							if (!CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
						}

						npc.IsShootingAt = false;
						if (npc.TargetUserId == userId && wantedLevel > 0 && npc.StationaryTime >= 3.5)
						{
							float sdx = npc.X - posX;
							float sdz = npc.Z - posZ;
							float sdistSq = sdx * sdx + sdz * sdz;
							if (sdistSq < 625f)
							{
								var nowMs = now.Ticks / TimeSpan.TicksPerMillisecond;
								if (npc.LastShotTime == 0 || (nowMs - npc.LastShotTime) > 500)
								{
									npc.LastShotTime = nowMs;
									npc.IsShootingAt = true;
									if (_playerHealth.TryGetValue(userId, out var hp))
										_playerHealth[userId] = Math.Max(0, hp - 5);
									else
										_playerHealth[userId] = Math.Max(0, 100 - 5);
									_lastPoliceDamageTime[userId] = nowMs;
								}
							}
						}

						const float copModelOffset = -(float)Math.PI / 2f;
						if (npc.TargetUserId == userId && wantedLevel > 0)
							npc.Yaw = (float)Math.Atan2(posX - npc.X, posZ - npc.Z) + copModelOffset;
						else
							npc.Yaw = (float)Math.Atan2(tdx, tdz) + copModelOffset;
					}
				}
				else
				{
					// Pedestrian movement
					if (distToTarget < 2.0f)
					{
						GetRandomSidewalkPointNearPlayer(posX, posZ, out float targetX, out float targetZ, rng);
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
							if (sdx > 2f || sdx < -2f) continue;
							float sdz = npc.Z - otherKv.Value.Z;
							if (sdz > 2f || sdz < -2f) continue;
							float sDistSq = sdx * sdx + sdz * sdz;
							if (sDistSq < 4f && sDistSq > 0.01f)
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
						int pedCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
						int pedCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
						string pedBiome = CityLayout.GetBiome(pedCX, pedCZ);
						if (pedBiome != "ocean" && pedBiome != "beach" && !CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
						npc.Yaw = (float)Math.Atan2(moveX, moveZ);
					}
				}

				var entry = new { id = npc.Id, posX = npc.X, posY = npc.Y, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health, hasDriver = npc.HasDriver, passengerCount = npc.PassengerCount, isShootingAt = npc.IsShootingAt, isBurning = npc.OnFire };
				if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") pedestrians.Add(entry);
				else if (npc.Type == "helicopter" || npc.Type == "plane") aircraft.Add(entry);
				else cars.Add(entry);
			}
			foreach (var id in deadIds) npcs.TryRemove(id, out _);

			// Dead player bodies
			var expiredPlayers = new List<int>();
			foreach (var kv in _deadPlayerBodies)
			{
				if ((now - kv.Value.DiedAt).TotalSeconds > DEAD_BODY_TIMEOUT_SECONDS) { expiredPlayers.Add(kv.Key); continue; }
				float ddx = kv.Value.PosX - posX;
				float ddz = kv.Value.PosZ - posZ;
				if (ddx * ddx + ddz * ddz < 62500f)
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

			// Spawn cars
			while (nearbyCars < 20)
			{
				long id = GetNextNpcId();
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

			// Spawn pedestrians
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
					Health = 400,
					MaxHealth = 400,
					Cr = 0.1f,
					Cg = 0.1f,
					Cb = 0.2f,
					TargetUserId = userId,
					ApproachAngle = angle
				};
				nearbyPolice++;
			}

			// Spawn aircraft near airports
			int playerCX = (int)Math.Floor(posX / CityLayout.CHUNK_SIZE);
			int playerCZ = (int)Math.Floor(posZ / CityLayout.CHUNK_SIZE);
			bool nearAnyAeroport = false;
			foreach (var zone in CityLayout.AIRPORT_ZONES)
			{
				if (playerCX >= zone.minCx - 5 && playerCX <= zone.maxCx + 5 &&
					playerCZ >= zone.minCz - 5 && playerCZ <= zone.maxCz + 5) { nearAnyAeroport = true; break; }
			}
			int nearbyAircraft = 0;
			foreach (var kv in npcs) if (kv.Value.Type == "helicopter" || kv.Value.Type == "plane") nearbyAircraft++;
			while (nearAnyAeroport && nearbyAircraft < 12)
			{
				long id = GetNextNpcId();
				string acType = nearbyAircraft % 2 == 0 ? "helicopter" : "plane";
				CityLayout.GetRandomAeroportWorldPoint(rng, out float x, out float z);
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
					Health = 200,
					MaxHealth = 200,
					Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
					Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
					Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
					AircraftPhase = "flying",
					PhaseStartedAt = now,
				};
				nearbyAircraft++;
			}

			// Spawn parked boats near water — WITH ITERATION CAP to prevent infinite loop
			bool nearWater = false;
			for (int dxc = -2; dxc <= 2; dxc++)
			{
				for (int dzc = -2; dzc <= 2; dzc++)
				{
					string b = CityLayout.GetBiome(playerCX + dxc, playerCZ + dzc);
					if (b == "ocean" || b == "beach") { nearWater = true; break; }
				}
				if (nearWater) break;
			}
			if (nearWater)
			{
				int parkedBoats = 0;
				foreach (var kv in npcs) if (kv.Value.Type == "boat" && kv.Value.IsParked) parkedBoats++;
				int boatAttempts = 0;
				while (parkedBoats < 5 && boatAttempts < 50) // CAP to prevent infinite loop
				{
					boatAttempts++;
					long id = GetNextNpcId();
					float bx = posX + (float)(rng.NextDouble() - 0.5) * 200f;
					float bz = posZ + (float)(rng.NextDouble() - 0.5) * 200f;
					int bcx = (int)Math.Floor(bx / CityLayout.CHUNK_SIZE);
					int bcz = (int)Math.Floor(bz / CityLayout.CHUNK_SIZE);
					if (CityLayout.GetBiome(bcx, bcz) != "ocean") continue;

					npcs[id] = new NpcState
					{
						Id = id,
						Type = "boat",
						IsParked = true,
						X = bx,
						Y = 0f,
						Z = bz,
						Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
						Speed = 0f,
						Health = 200,
						MaxHealth = 200,
						Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
					};
					parkedBoats++;
				}
			}

			// Spawn parked aircraft at airports
			if (nearAnyAeroport)
			{
				int parkedAircraft = 0;
				foreach (var kv in npcs) if ((kv.Value.Type == "helicopter" || kv.Value.Type == "plane") && kv.Value.IsParked) parkedAircraft++;
				while (parkedAircraft < 25)
				{
					long id = GetNextNpcId();
					string acType = parkedAircraft % 2 == 0 ? "helicopter" : "plane";
					CityLayout.GetRandomAeroportWorldPoint(rng, out float x, out float z);
					npcs[id] = new NpcState
					{
						Id = id,
						Type = acType,
						IsParked = true,
						X = x,
						Y = 0f,
						Z = z,
						Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
						Speed = 0f,
						Health = 200,
						MaxHealth = 200,
						Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
						AircraftPhase = "parked",
						PhaseStartedAt = now,
					};
					parkedAircraft++;
				}
			}

			var dw = BuildDroppedWeapons();
			return Ok(new { cars, pedestrians, parkedCars, aircraft, deadBodies, droppedWeapons = dw });
		}


		[HttpGet("activeplayers")]
		public async Task<IActionResult> GetActivePlayers()
		{
			using var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			await connection.OpenAsync();

			var sql = @"SELECT gtps.user_id
 FROM maxhanna.grandtheft_player_state gtps 
 WHERE gtps.last_seen >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE);";

			using var command = new MySqlCommand(sql, connection);
			using var reader = await command.ExecuteReaderAsync();

			var activePlayers = new List<User>();
			while (await reader.ReadAsync())
			{
				activePlayers.Add(new User(reader.GetInt32("user_id")));
			}

			return Ok(activePlayers);
		}

		private List<object> BuildDroppedWeapons()
		{
			var now = DateTime.UtcNow;
			var result = new List<object>();

			// Clean up expired drops — manual loop instead of LINQ
			var expiredKeys = new List<long>();
			foreach (var kv in _droppedWeapons)
			{
				if ((now - kv.Value.DroppedAt).TotalSeconds > 30)
					expiredKeys.Add(kv.Key);
				else
					result.Add(new { id = kv.Key, posX = kv.Value.PosX, posZ = kv.Value.PosZ, weaponType = kv.Value.WeaponType });
			}
			foreach (var k in expiredKeys) _droppedWeapons.TryRemove(k, out _);

			for (int i = 1; i <= 4; i++)
			{
				if (HOME_BASE_WEAPON_X[i] == 0) continue;
				if (_homeBaseWeaponCollected[i] && now < _homeBaseWeaponRespawnAt[i]) continue;
				if (_homeBaseWeaponCollected[i] && now >= _homeBaseWeaponRespawnAt[i])
					_homeBaseWeaponCollected[i] = false;
				if (!_homeBaseWeaponCollected[i])
					result.Add(new { id = (long)(-i), posX = HOME_BASE_WEAPON_X[i], posZ = HOME_BASE_WEAPON_Z[i], weaponType = i });
			}
			return result;
		}

		private void SeedNPCs(int worldId, float posX = 0, float posZ = 0)
		{
			var dict = _worldNpcs[worldId];
			var rng = new Random();
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

			foreach (var zone in CityLayout.AIRPORT_ZONES)
			{
				// Parked aircraft on ground (will take off after a while)
				for (int i = 0; i < 6; i++)
				{
					long id = GetNextNpcId();
					string acType = i % 2 == 0 ? "helicopter" : "plane";
					int cx = zone.minCx + rng.Next(zone.maxCx - zone.minCx + 1);
					int cz = zone.minCz + rng.Next(zone.maxCz - zone.minCz + 1);
					float ax = cx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
					float az = cz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
					dict[id] = new NpcState
					{
						Id = id,
						Type = acType,
						X = ax,
						Y = 0f,
						Z = az,
						TargetX = ax,
						TargetZ = az,
						Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
						Speed = 0f,
						Health = 200,
						MaxHealth = 200,
						Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
						IsParked = true,
						AircraftPhase = "parked",
						PhaseStartedAt = DateTime.UtcNow,
					};
				}
				// Flying aircraft
				for (int i = 0; i < 3; i++)
				{
					long id = GetNextNpcId();
					string acType = i % 2 == 0 ? "helicopter" : "plane";
					int cx = zone.minCx + rng.Next(zone.maxCx - zone.minCx + 1);
					int cz = zone.minCz + rng.Next(zone.maxCz - zone.minCz + 1);
					float ax = cx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
					float az = cz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 40f;
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
						Health = 200,
						MaxHealth = 200,
						Cr = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cg = 0.5f + (float)rng.NextDouble() * 0.5f,
						Cb = 0.5f + (float)rng.NextDouble() * 0.5f,
						AircraftPhase = "flying",
						PhaseStartedAt = DateTime.UtcNow,
					};
				}
			}
		}

		private void GetRandomRoadPointNearPlayer(float px, float pz, out float x, out float z, Random rng, float minDist = 0f)
		{
			int gridRange = minDist > 0f ? Math.Max(6, (int)(minDist / 80f) + 2) : 3;
			int baseGx = (int)Math.Round(px / 80f);
			int baseGz = (int)Math.Round(pz / 80f);

			for (int attempt = 0; attempt < 100; attempt++)
			{
				int gx = baseGx + rng.Next(-gridRange, gridRange + 1);
				int gz = baseGz + rng.Next(-gridRange, gridRange + 1);

				if (rng.NextDouble() < 0.5) { x = gx * 80f; z = pz + (float)(rng.NextDouble() - 0.5) * 120f; }
				else { x = px + (float)(rng.NextDouble() - 0.5) * 120f; z = gz * 80f; }

				for (int b = 0; b < 5 && (CityLayout.IsBuildingAt(x, z) || !CityLayout.IsRoadAt(x, z)); b++)
				{
					x += (float)(rng.NextDouble() - 0.5) * 20f;
					z += (float)(rng.NextDouble() - 0.5) * 20f;
				}
				if (CityLayout.IsBuildingAt(x, z) || !CityLayout.IsRoadAt(x, z)) continue;

				int cx = (int)Math.Floor(x / 80f);
				int cz = (int)Math.Floor(z / 80f);
				string biome = CityLayout.GetBiome(cx, cz);
				if (biome == "ocean" || biome == "beach") continue;

				if (minDist > 0f)
				{
					float ddx = x - px;
					float ddz = z - pz;
					if (ddx * ddx + ddz * ddz < minDist * minDist) continue;
				}
				return;
			}

			for (int dr = 1; dr < 20; dr++)
			{
				for (int dgx = -dr; dgx <= dr; dgx++)
				{
					for (int dgz = -dr; dgz <= dr; dgz++)
					{
						if (Math.Abs(dgx) != dr && Math.Abs(dgz) != dr) continue;
						int gx = baseGx + dgx;
						int gz = baseGz + dgz;
						string biome = CityLayout.GetBiome(gx, gz);
						if (biome != "ocean" && biome != "beach")
						{
							x = gx * 80f + 40f;
							z = gz * 80f + 40f;
							return;
						}
					}
				}
			}
			x = px + (float)(rng.NextDouble() - 0.5) * 80f;
			z = pz + (float)(rng.NextDouble() - 0.5) * 80f;
		}

		private void GetRandomSidewalkPointNearPlayer(float px, float pz, out float x, out float z, Random rng, float minDist = 0f)
		{
			int gridRange = minDist > 0f ? Math.Max(6, (int)(minDist / 80f) + 2) : 3;
			int baseGx = (int)Math.Round((px - 40f) / 80f);
			int baseGz = (int)Math.Round((pz - 40f) / 80f);

			for (int attempt = 0; attempt < 100; attempt++)
			{
				int gx = baseGx + rng.Next(-gridRange, gridRange + 1);
				int gz = baseGz + rng.Next(-gridRange, gridRange + 1);
				float cx = gx * 80f + 40f;
				float cz = gz * 80f + 40f;
				string biome = CityLayout.GetBiome(gx, gz);
				if (biome == "ocean") continue;
				if (biome == "parking_lot")
				{
					x = gx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
					z = gz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
					return;
				}
				float sidewalkEdge = 18f;
				int edge = rng.Next(4);
				if (edge == 0) { x = cx; z = cz - sidewalkEdge; }
				else if (edge == 1) { x = cx; z = cz + sidewalkEdge; }
				else if (edge == 2) { x = cx - sidewalkEdge; z = cz; }
				else { x = cx + sidewalkEdge; z = cz; }
				if (edge < 2) x += (float)(rng.NextDouble() - 0.5) * 30f;
				else z += (float)(rng.NextDouble() - 0.5) * 30f;


				// Parking lots: spawn peds walking through the lot
				if (biome == "parking_lot")
				{
					x = gx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
					z = gz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
					return;
				}

				// STRICT: Must not be a road and must not be a building
				if (CityLayout.IsBuildingAt(x, z) || CityLayout.IsRoadAt(x, z)) continue;

				if (minDist > 0f)
				{
					float ddx = x - px;
					float ddz = z - pz;
					if (ddx * ddx + ddz * ddz < minDist * minDist) continue;
				}
				return;
			}
			x = px + (float)(rng.NextDouble() - 0.5) * 80f;
			z = pz + (float)(rng.NextDouble() - 0.5) * 80f;
		}

		private void SimulateAircraft(NpcState npc, DateTime now, Random rng)
		{
			if (npc.Type != "helicopter" && npc.Type != "plane") return;
			if (string.IsNullOrEmpty(npc.AircraftPhase)) npc.AircraftPhase = "flying";

			float targetAlt = npc.Type == "helicopter" ? 25f + (float)(rng.NextDouble() * 10f) : 45f + (float)(rng.NextDouble() * 15f);
			float speed = npc.Type == "helicopter" ? 8f : 15f;
			double elapsed = (now - npc.PhaseStartedAt).TotalSeconds;

			switch (npc.AircraftPhase)
			{
				case "parked":
					npc.Y = 0;
					npc.Speed = 0;
					npc.IsParked = true;
					if (elapsed > 10.0 + rng.NextDouble() * 30.0)
					{
						npc.AircraftPhase = "taxiing";
						npc.IsParked = false;
						npc.PhaseStartedAt = now;
						CityLayout.GetRandomAeroportWorldPoint(rng, out float tx, out float tz);
						npc.TargetX = tx;
						npc.TargetZ = tz;
						npc.Speed = speed * 0.4f;
					}
					break;

				case "taxiing":
					npc.Y = 0;
					{
						float dx = npc.TargetX - npc.X;
						float dz = npc.TargetZ - npc.Z;
						float dist = (float)Math.Sqrt(dx * dx + dz * dz);
						if (dist > 5f)
						{
							float ms = npc.Speed * 0.1f;
							npc.X += (dx / dist) * ms;
							npc.Z += (dz / dist) * ms;
							npc.Yaw = (float)Math.Atan2(dx, dz);
						}
						else
						{
							npc.AircraftPhase = "taking_off";
							npc.PhaseStartedAt = now;
							npc.Speed = speed;
							npc.TargetX = npc.X + (float)Math.Sin(npc.Yaw) * 500f;
							npc.TargetZ = npc.Z + (float)Math.Cos(npc.Yaw) * 500f;
						}
					}
					break;

				case "taking_off":
					{
						npc.Y = Math.Min(npc.Y + 0.5f, targetAlt);
						float dx = npc.TargetX - npc.X;
						float dz = npc.TargetZ - npc.Z;
						float dist = (float)Math.Sqrt(dx * dx + dz * dz);
						if (dist > 5f)
						{
							float ms = npc.Speed * 0.1f;
							npc.X += (dx / dist) * ms;
							npc.Z += (dz / dist) * ms;
							npc.Yaw = (float)Math.Atan2(dx, dz);
						}
						if (npc.Y >= targetAlt - 2f)
						{
							npc.AircraftPhase = "flying";
							npc.PhaseStartedAt = now;
							GetRandomAeroportOrDistantPoint(npc.X, npc.Z, out float tx, out float tz, rng);
							npc.TargetX = tx;
							npc.TargetZ = tz;
						}
					}
					break;

				case "flying":
					{
						npc.Y += (targetAlt - npc.Y) * 0.02f;
						npc.IsParked = false;
						float dx = npc.TargetX - npc.X;
						float dz = npc.TargetZ - npc.Z;
						float dist = (float)Math.Sqrt(dx * dx + dz * dz);
						if (dist > 10f)
						{
							float ms = npc.Speed * 0.1f;
							npc.X += (dx / dist) * ms;
							npc.Z += (dz / dist) * ms;
							npc.Yaw = (float)Math.Atan2(dx, dz);
						}
						else
						{
							GetRandomAeroportOrDistantPoint(npc.X, npc.Z, out float tx, out float tz, rng);
							npc.TargetX = tx;
							npc.TargetZ = tz;
						}
						if (elapsed > 20.0 + rng.NextDouble() * 40.0)
						{
							npc.AircraftPhase = "landing";
							npc.PhaseStartedAt = now;
							CityLayout.GetRandomAeroportWorldPoint(rng, out float lx, out float lz);
							npc.TargetX = lx;
							npc.TargetZ = lz;
						}
					}
					break;

				case "landing":
					{
						npc.Y = Math.Max(npc.Y - 0.3f, 0f);
						float dx = npc.TargetX - npc.X;
						float dz = npc.TargetZ - npc.Z;
						float dist = (float)Math.Sqrt(dx * dx + dz * dz);
						if (dist > 5f)
						{
							float landSpeed = (npc.Type == "helicopter" ? 6f : 10f) * 0.1f;
							npc.X += (dx / dist) * landSpeed;
							npc.Z += (dz / dist) * landSpeed;
							npc.Yaw = (float)Math.Atan2(dx, dz);
						}
						if (npc.Y <= 0.5f)
						{
							npc.Y = 0;
							npc.AircraftPhase = "parked";
							npc.PhaseStartedAt = now;
							npc.IsParked = true;
							npc.Speed = 0;
						}
					}
					break;
			}
		}

		private void GetRandomAeroportOrDistantPoint(float px, float pz, out float x, out float z, Random rng)
		{
			if (rng.NextDouble() < 0.5)
			{
				CityLayout.GetRandomAeroportWorldPoint(rng, out x, out z);
			}
			else
			{
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
			if (npcId < 0)
			{
				int targetUserId = (int)(-npcId);
				_evictedPlayers[targetUserId] = true;
				return Ok(new { ok = true, evictedNpcs = new List<object>() });
			}

			if (_worldNpcs.ContainsKey(req.WorldId) && _worldNpcs[req.WorldId].TryRemove(npcId, out var npc))
			{
				var rng = new Random();
				var evictedNpcs = new List<object>();
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
						Yaw = passYaw,
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
				Type = string.IsNullOrEmpty(req.VehicleType) ? "car" : req.VehicleType!,
				IsParked = true,
				X = req.PosX,
				Z = req.PosZ,
				Yaw = req.Yaw,
				Health = 400,
				MaxHealth = 400,
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
			int targetHealthResult = 0;

			if (_worldNpcs.ContainsKey(worldId))
			{
				var npcs = _worldNpcs[worldId];
				foreach (var kv in npcs)
				{
					if (kv.Key == req.TargetId && kv.Value.Health > 0 && kv.Value.DeadAt == null)
					{
						kv.Value.Health -= req.Damage;
						hitAnything = true;
						bool isVehicle = kv.Value.Type == "car" || kv.Value.Type == "bus" || kv.Value.Type == "taxi" || kv.Value.Type == "police" || kv.Value.Type == "bike" || kv.Value.Type == "motorcycle" || kv.Value.Type == "helicopter" || kv.Value.Type == "plane";
						if (kv.Value.Health <= 0)
						{
							if (isVehicle) { kv.Value.Health = 1; }
							else { kv.Value.DeadAt = DateTime.UtcNow; targetDied = true; }
							deathX = kv.Value.X;
							deathZ = kv.Value.Z;
							if (kv.Value.Type == "cop")
							{
								var drop = new DroppedWeapon { Id = GetNextDropId(), PosX = deathX, PosZ = deathZ, WeaponType = 1, Ammo = 15, DroppedAt = DateTime.UtcNow };
								_droppedWeapons[drop.Id] = drop;
							}
						}
						targetHealthResult = kv.Value.Health;
						kv.Value.PanicUntil = DateTime.UtcNow.AddSeconds(5);
						kv.Value.PanicFromX = req.AttackerX;
						kv.Value.PanicFromZ = req.AttackerZ;
						break;
					}
				}

				{
					float panicRadius = 15f;
					float panicRadiusSq = panicRadius * panicRadius;
					foreach (var kv in npcs)
					{
						if (kv.Value.DeadAt.HasValue || kv.Value.PanicUntil.HasValue) continue;
						float pdx = kv.Value.X - req.AttackerX;
						float pdz = kv.Value.Z - req.AttackerZ;
						if (pdx * pdx + pdz * pdz < panicRadiusSq)
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
				targetHealthResult = newHp;
				_lastPoliceDamageTime[playerTargetId] = DateTime.UtcNow.Ticks / TimeSpan.TicksPerMillisecond;

				if (newHp <= 0)
				{
					targetDied = true;
					_playerX.TryGetValue(playerTargetId, out deathX);
					_playerZ.TryGetValue(playerTargetId, out deathZ);

					_playerDeathBroadcasted[playerTargetId] = true;
					if (req.AttackerId <= 0)
					{
						string victimName = _playerUsername.GetOrAdd(playerTargetId, $"Player{playerTargetId}");
						BroadcastDeathMessage(req.WorldId, "An NPC", victimName, " with a weapon");
					}
					else if (req.AttackerId != playerTargetId)
					{
						string victimName = _playerUsername.GetOrAdd(playerTargetId, $"Player{playerTargetId}");
						string killerName = _playerUsername.GetOrAdd(req.AttackerId, $"Player{req.AttackerId}");
						BroadcastDeathMessage(req.WorldId, killerName, victimName, " with a weapon");
					}

					for (int i = 1; i <= 4; i++) _homeBaseWeaponCollected[i] = false;
					if (_playerWeapons.TryGetValue(playerTargetId, out var pw))
					{
						var ammoArr = _playerAmmo.TryGetValue(playerTargetId, out var pa) ? pa : new int[5];
						for (int wi = 1; wi <= 4; wi++)
						{
							if (pw[wi])
							{
								var drop = new DroppedWeapon { Id = GetNextDropId(), PosX = deathX, PosZ = deathZ, WeaponType = wi, Ammo = ammoArr[wi], DroppedAt = DateTime.UtcNow };
								_droppedWeapons[drop.Id] = drop;
							}
						}
					}
					_playerWeapons[playerTargetId] = new bool[5] { true, false, false, false, false };
					_playerAmmo[playerTargetId] = new int[5];
				}
			}

			if (hitAnything && req.AttackerId > 0)
			{
				if (_playerWantedLevels.TryGetValue(req.AttackerId, out var w))
					_playerWantedLevels[req.AttackerId] = Math.Min(5, w + 1);
				else
					_playerWantedLevels[req.AttackerId] = 1;
				_lastUndetectedTime[req.AttackerId] = DateTime.UtcNow;
			}

			return Ok(new { ok = true, hit = hitAnything, targetHealth = targetHealthResult, targetDied = targetDied });
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
					return Ok(new { ok = true, hasCar = true, vehicleType = rdr.GetString("vehicle_type"), colorR = rdr.GetFloat("color_r"), colorG = rdr.GetFloat("color_g"), colorB = rdr.GetFloat("color_b"), yaw = rdr.GetFloat("yaw") });
				}
				return Ok(new { ok = true, hasCar = false });
			}
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
		}

		[HttpPost("garage/store")]
		public async Task<IActionResult> StoreGarageCar([FromBody] GTGarageRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false });
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();
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
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
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
			catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
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