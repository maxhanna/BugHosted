using System.Collections.Concurrent;
using System.Text.Json;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
namespace maxhanna.Server.Controllers
{
	internal static class CityLayout
	{
		public const int CHUNK_SIZE = 80;
		public const int GRID_PITCH = 80;
		public const int BLOCK_SIZE = 30;
		public const int SIDEWALK_SIZE = 48;
		public const float ROAD_HALF_WIDTH = 16.0f;
		public const float BRIDGE_DECK_Y = 12.0f;
		public const int BIOME_RADIUS_CITY = 18;
		public const int BIOME_RADIUS_MOUNTAIN = 30;
		public const int BIOME_RADIUS_SUBURB = 50;
		public const int BIOME_RADIUS_BEACH = 60;
		private static readonly int[][] EDGES = new int[][]
		{
			new int[] { 0, 1 }, new int[] { 0, -1 }, new int[] { 1, 0 }, new int[] { -1, 0 }
		};
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
			(0, 0, 2.5, 3.5, 3.5),
			(10, 0, 5, 7, 8),
			(24, 0, 3, 6, 8),
			(41, 0, 5, 8, 11),
			(-10, 0, 0, 0, 6),
			(61, 0, 0, 0, 11),
			(-18, 0, 0, 0, 5),
			(75, 0, 0, 0, 9),
		};
		private static readonly (int startCx, int endCx, int startCz, int endCz)[] BRIDGES = new[]
		{
	(4, 5, 0, 0),
	(16, 17, 0, 0),
	(31, 32, 0, 0),
};
		private static readonly (int cx, int cz)[] BRIDGE_CONNECTORS = InitBridgeConnectors();
		private static (int cx, int cz)[] InitBridgeConnectors()
		{
			var conn = new List<(int, int)>();
			foreach (var br in BRIDGES) { conn.Add((br.startCx - 1, br.startCz)); conn.Add((br.endCx + 1, br.endCz)); }
			return conn.ToArray();
		}
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
		private static int MountainBand(int cx, int cz)
		{
			if (cx < 41 || !IsInAnyIsland(cx, cz)) return 0;
			double centerZ = 6 + 2 * Math.Sin((cx - 41) * 0.38);
			int distance = Math.Abs(cz - (int)Math.Floor(centerZ + 0.5));
			return distance <= 2 ? 2 : distance <= 5 ? 1 : 0;
		}
		private static bool BridgeContains(int cx, int cz)
		{
			foreach (var br in BRIDGES)
				if (cx >= br.startCx && cx <= br.endCx && cz >= br.startCz && cz <= br.endCz) return true;
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
			foreach (var conn in BRIDGE_CONNECTORS)
				if (cx == conn.cx && cz == conn.cz) return "bridge_connector";
			if (BridgeContains(cx, cz + 1)) return "ocean";
			if (BridgeContains(cx, cz - 1)) return "ocean";
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
			int mountainBand = MountainBand(cx, cz);
			if (mountainBand == 2) return "rural_mountain";
			if (mountainBand == 1) return "rural_hills";
			if (distV < islV.cityR) return IsParkingPatch() ? "parking_lot" : "city";
			if (distV < islV.suburbR) return IsParkingPatch() ? "parking_lot" : "suburb";
			uint hr = (uint)((cx * 100003 + cz * 70001) & 0xFFFFFFFF);
			uint rv = hr % 5u;
			if (rv == 0u) return "rural_farm";
			if (rv == 1u) return "rural_hills";
			if (rv == 2u) return "rural_mountain";
			if (rv == 3u) return "rural_lakes";
			return "rural_desert";
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
		private static readonly (int gx, int gzStart, int gzEnd)[] AIRPORT_ENTRY_ROADS = new[]
		{
			(2, -1, -3),
			(12, -4, -6),
			(26, -7, -8),
			(41, -7, -11),
			(39, 7, 16),
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
				|| biome == "bridge" || biome == "bridge_connector"
				|| biome == "parking_lot"
				|| biome == "rural_mountain" || biome == "rural_lakes" || biome == "rural_desert") return false;
			if (biome == "aeroport" && !IsAeroportParkingChunk(cx, cz)) return true;
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
					float houseWidth = (SIDEWALK_SIZE - 12f) / numHouses;
					for (int i = 0; i < numHouses; i++)
					{
						if (RngNext(ref state) >= 0.7f) continue;
						float w = houseWidth;
						float d = 7f + RngNext(ref state) * (SIDEWALK_SIZE * 0.22f);
						float px, pz;
						if (edge[0] == 0)
						{
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
					float storeWidth = (SIDEWALK_SIZE - 8f) / numStores;
					for (int i = 0; i < numStores; i++)
					{
						if (RngNext(ref state) >= 0.78f) continue;
						float w = storeWidth;
						float d = 7f + RngNext(ref state) * (SIDEWALK_SIZE * 0.18f);
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
			int blocksPerChunk = CHUNK_SIZE / GRID_PITCH;
			int gx0 = cx * blocksPerChunk;
			int gz0 = cz * blocksPerChunk;
			for (int g = 0; g < 2; g++)
			{
				if (IsBoulevard(gx0 + g))
				{
					float worldX = (gx0 + g) * GRID_PITCH;
					if (Math.Abs(x - worldX) < 2f + margin && Math.Abs(z - blockCenterZ) < CHUNK_SIZE / 2f)
					{
						float dxNode = x % GRID_PITCH; if (dxNode < 0) dxNode += GRID_PITCH;
						float dzNode = z % GRID_PITCH; if (dzNode < 0) dzNode += GRID_PITCH;
						float distToGridX = Math.Min(dxNode, GRID_PITCH - dxNode);
						float distToGridZ = Math.Min(dzNode, GRID_PITCH - dzNode);
						if (distToGridX < ROAD_HALF_WIDTH + margin || distToGridZ < ROAD_HALF_WIDTH + margin) continue;
						return true;
					}
				}
				if (IsBoulevard(gz0 + g))
				{
					float worldZ = (gz0 + g) * GRID_PITCH;
					if (Math.Abs(z - worldZ) < 2f + margin && Math.Abs(x - blockCenterX) < CHUNK_SIZE / 2f)
					{
						float dxNode = x % GRID_PITCH; if (dxNode < 0) dxNode += GRID_PITCH;
						float dzNode = z % GRID_PITCH; if (dzNode < 0) dzNode += GRID_PITCH;
						float distToGridX = Math.Min(dxNode, GRID_PITCH - dxNode);
						float distToGridZ = Math.Min(dzNode, GRID_PITCH - dzNode);
						if (distToGridX < ROAD_HALF_WIDTH + margin || distToGridZ < ROAD_HALF_WIDTH + margin) continue;
						return true;
					}
				}
			}
			return false;
		}
		public static bool IsBridgeAtWorldPos(float x, float z)
		{
			foreach (var br in BRIDGES)
			{
				float roadCenterZ = br.startCz * GRID_PITCH;
				float bridgeW = (ROAD_HALF_WIDTH * 2) + 10.0f;
				if (Math.Abs(z - roadCenterZ) > bridgeW / 2) continue;
				float rampStartX = (br.startCx - 1) * GRID_PITCH;
				float rampEndX = (br.endCx + 2) * GRID_PITCH;
				if (x >= rampStartX && x <= rampEndX) return true;
			}
			return false;
		}
		public static bool IsRoadAt(float x, float z)
		{
			if (IsBridgeAtWorldPos(x, z)) return true;
			int cx = (int)Math.Floor(x / CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CHUNK_SIZE);
			string biome = GetBiome(cx, cz);
			if (biome == "ocean" || biome == "beach" || biome == "mountain") return false;
			if (biome == "aeroport")
			{
				int gx = (int)Math.Round(x / GRID_PITCH);
				int gz = (int)Math.Round(z / GRID_PITCH);
				foreach (var entry in AIRPORT_ENTRY_ROADS)
				{
					int minGz = Math.Min(entry.gzStart, entry.gzEnd);
					int maxGz = Math.Max(entry.gzStart, entry.gzEnd);
					if (entry.gx == gx && gz >= minGz && gz <= maxGz) return true;
				}
				return false;
			}
			if (biome == "bridge" || biome == "bridge_connector")
			{
				float bridgeW = (ROAD_HALF_WIDTH * 2) + 10.0f;
				float roadCenterZ = cz * CHUNK_SIZE;
				if (Math.Abs(z - roadCenterZ) > bridgeW / 2) return false;
				return true;
			}
			if (biome == "parking_lot" || biome == "rural_farm" || biome == "rural_hills" || biome == "rural_mountain" || biome == "rural_lakes" || biome == "rural_desert") return true;
			float dx = x % GRID_PITCH;
			if (dx < 0) dx += GRID_PITCH;
			float distToGridX = Math.Min(dx, GRID_PITCH - dx);
			float dz = z % GRID_PITCH;
			if (dz < 0) dz += GRID_PITCH;
			float distToGridZ = Math.Min(dz, GRID_PITCH - dz);
			return distToGridX < ROAD_HALF_WIDTH || distToGridZ < ROAD_HALF_WIDTH;
		}
		public static List<(float x, float z)> GetRoadNodes(int cx, int cz, int radius)
		{
			var nodes = new List<(float x, float z)>();
			var seen = new HashSet<(int, int)>();
			void AddNode(int gx, int gz)
			{
				if (!seen.Add((gx, gz))) return;
				nodes.Add((gx * GRID_PITCH, gz * GRID_PITCH));
			}
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
					bool isRoad = false;
					if (biome == "ocean" || biome == "beach" || biome == "mountain") isRoad = false;
					else if (biome == "aeroport")
					{
						foreach (var entry in AIRPORT_ENTRY_ROADS)
						{
							int minGz = Math.Min(entry.gzStart, entry.gzEnd);
							int maxGz = Math.Max(entry.gzStart, entry.gzEnd);
							if (entry.gx == gx && gz >= minGz && gz <= maxGz) { isRoad = true; break; }
						}
					}
					else isRoad = true;
					if (isRoad)
					{
						AddNode(gx, gz);
					}
					else
					{
						// Do not turn ocean cells beside a bridge into phantom road
						// nodes. Only the actual bridge centerline is traversable.
						bool isBridgeRoadNode = IsBridgeAtWorldPos(gx * GRID_PITCH, gz * GRID_PITCH);
						if (isBridgeRoadNode)
						{
							AddNode(gx, gz);
						}
					}
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
		public static RoadGraph GetRoadGraph(int cx, int cz)
		{
			var key = (cx, cz);
			if (_roadGraphCache.TryGetValue(key, out var existing)) return existing;
			var nodes = GetRoadNodes(cx, cz, ROAD_RADIUS);
			int n = nodes.Count;
			var adjLists = new List<int>[n];
			for (int i = 0; i < n; i++) adjLists[i] = new List<int>(4);
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
		// Wanted-level decay: after breaking sight, the heat burns off star by star.
		// Each star drops faster than the last (low wanted levels clear quickly),
		// so clean getaways reward staying hidden and unseen.
		private const double WANTED_DECAY_GRACE_SECONDS = 4.0;   // no decay right after breaking sight
		private static readonly double[] WANTED_STAR_SECONDS = { 3, 5, 8, 11, 15 }; // index = level-1: time for that star to drop
		// Arrest: a foot cop that catches an unarmed player up close grabs and
		// books them instead of shooting — a short hold (grab pose) while the
		// arrest plays out, then weapons are stripped and the player respawns
		// from the nearest police station.
		private const float ARREST_HOLD_SECONDS = 3.5f;          // grab hold before the player is booked
		private const float RESIST_REGRAB_DELAY_SECONDS = 30f;  // the same cop returns this long after a resist
		private const float RESIST_REGRAB_RANGE = 25f;          // must still be within this range to re-grab
		private const float RESIST_REGRAB_COOLDOWN_SECONDS = 8f; // base — same cop won't instantly re-grab after a resist
		private const float RESIST_REGRAB_COOLDOWN_STEP_SECONDS = 4f; // each resist lengthens the window by this much
		private const float RESIST_REGRAB_COOLDOWN_MAX_SECONDS = 16f; // ceiling for the escalating cooldown
		// Backup call: the fought-off cop radios for reinforcements during the
		// re-grab cooldown — a new unit pulls up at the scene every few seconds,
		// so the longer the player stalls, the more backup arrives (capped per
		// resist cycle; each fresh resist restarts the wave).
		private const float BACKUP_CALL_INTERVAL_SECONDS = 4f; // a new unit arrives every this long while stalling
		private const int BACKUP_CALL_MAX_UNITS = 4;           // cap per resist cycle
		// Lethal escalation: after the player has resisted twice, cops give up on
		// grabbing entirely and switch to lethal force — shots hit harder and
		// faster, so the escalation tops out in a shootout instead of another cuff.
		private const int RESIST_LETHAL_AFTER = 2;       // resists before the cops go lethal
		private const int COP_SHOT_DAMAGE = 5;           // normal officer shot
		private const int COP_LETHAL_DAMAGE = 15;        // lethal-force shot
		private const long COP_SHOT_INTERVAL_MS = 500;   // normal fire interval
		private const long COP_LETHAL_INTERVAL_MS = 350; // lethal-force fire interval
		private static readonly ConcurrentDictionary<int, ArrestState> _playerArrests = new();
		private static readonly ConcurrentDictionary<int, (long CopId, int Count, DateTime LastResistAt)> _playerResists = new();
		private static readonly ConcurrentDictionary<int, BackupCallState> _playerBackupCalls = new();
		private static readonly ConcurrentDictionary<int, bool> _arrestRegrabNotified = new();
		private static readonly ConcurrentDictionary<int, bool> _lethalForceNotified = new();
		// Police pursuit model: cops only chase what they can see and converge on
		// the player's last known sighting, so hiding behind buildings or outrunning
		// the search breaks pursuit instead of the cops telepathically homing in.
		private const float COP_VISION_RANGE = 60f;                  // max sight distance (clear line of sight)
		private const float COP_VISION_CLOSE = 15f;                  // within this, always spotted (peripheral/instinct)
		private const float COP_VISION_CONE_COS = 0.5f;              // ~120° forward cone (cos 60°): blind behind the cop
		private const float COP_MODEL_YAW_OFFSET = -(float)Math.PI / 2f; // visual yaw offset for cop models; vision undoes it
		private const float COP_SEARCH_RADIUS = 16f;                 // patrol radius around the last known spot
		private const int COP_SEARCH_STEPS = 12;                     // waypoints per search lap (alternating rim/center)
		private const float COP_SEARCH_TIMEOUT_SECONDS = 12f;        // searching a spot before giving up
		private const float COP_LINGER_PATROL_SECONDS = 20f;         // post-escape cruisers patrol the old scene this long
		private const float COP_LAST_KNOWN_MAX_AGE_SECONDS = 120f;   // how long a sighting stays dispatchable
		private const float FIGHT_JOIN_RADIUS = 14f;                 // bystanders within this range may pile on
		private const double FIGHT_JOIN_CHANCE = 0.35;               // per-bystander odds of joining the brawl
		private const int FIGHT_JOIN_MAX = 4;                        // cap per rally so streets don't empty
		private const long FIGHT_RALLY_COOLDOWN_MS = 2500;           // min gap between a fighter's crowd rallies
		private const double FIGHT_PED_TARGET_CHANCE = 0.5;          // rally joiners who take on a fellow brawler (ped-vs-ped) vs the player
		// Brawl intervention: patrol cops notice street fights, jog over ("pushing
		// through the crowd"), and scatter the fighters instead of walking past.
		// Cops already in a pursuit take priority and ignore brawls.
		private const float COP_BREAKUP_SCAN_RADIUS = 30f;           // cop responds to fights within this range
		private const float COP_BREAKUP_ARRIVE_DIST = 3.0f;          // within this of the fight, scatter everyone
		private const float COP_BREAKUP_SCATTER_RADIUS = 14f;        // fighters within this of the cop get scattered
		private const float COP_BREAKUP_JOG_SPEED = 3.0f;            // "push through the crowd" pace
		private const float COP_BREAKUP_DURATION_SECONDS = 12f;      // before the cop gives up and walks on
		private const int AMBIENT_PATROL_COPS = 2;                   // foot officers patrolling the streets
		// Search-helicopter pursuit: when ground units lose the player, a heli is
		// dispatched to sweep the last known area from above and can re-spot them.
		private const float HELI_SEARCH_RADIUS = 34f;                // orbit radius around the last known spot
		private const float HELI_SEARCH_TIMEOUT_SECONDS = 50f;       // sweeping (from arrival) before standing down
		private const float HELI_SPOT_RADIUS = 42f;                  // horizontal distance at which the heli re-spots from above
		private const float HELI_DISPATCH_DISTANCE = 150f;           // spawn offset so it visibly flies in
		private const long HELI_SHOT_INTERVAL_MS = 900;
		private const int HELI_SHOT_DAMAGE = 8;
		private const float HELI_DISPATCH_COOLDOWN_SECONDS = 75f;    // min gap between dispatches while heat remains
		private static readonly ConcurrentDictionary<int, DateTime> _lastHeliDispatch = new();
		private static readonly ConcurrentDictionary<int, (float X, float Z, long AtMs)> _playerLastKnown = new();
		private static readonly ConcurrentDictionary<int, double> _lastPoliceDamageTime = new();
		private static readonly ConcurrentDictionary<int, int> _playerMoney = new();
		private static readonly ConcurrentDictionary<int, int> _playerMoneyEarned = new();
		private static readonly ConcurrentDictionary<int, int> _lastReportedMoney = new();
		private static readonly ConcurrentDictionary<int, int> _playerMoneyPeak = new();
		private static readonly ConcurrentDictionary<int, int> _playerKills = new();
		private static readonly ConcurrentDictionary<int, int> _playerDeaths = new();
		private static readonly ConcurrentDictionary<int, int> _playerEscapes = new();   // clean getaways (wanted fully burned off)
		private static readonly ConcurrentDictionary<int, int> _playerBusted = new();    // arrest bookings (weapons stripped, station respawn)
		private static readonly ConcurrentDictionary<int, int> _playerResistsTotal = new();      // lifetime resisted-arrest attempts
		private static readonly ConcurrentDictionary<int, int> _playerWorstResistStreak = new(); // longest resist run before a chase resolved
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
		private static readonly ConcurrentDictionary<int, DateTime> _lastSeen = new();
		private static readonly ConcurrentDictionary<int, float> _playerPosY = new();
		private static readonly ConcurrentDictionary<int, float> _playerYaw = new();
		private static readonly ConcurrentDictionary<int, float> _playerPitch = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarYaw = new();
		private static readonly ConcurrentDictionary<int, float> _playerCarSpeed = new();

		// ── Carjack-back mechanic ──────────────────────────────────────────────
		// While you drive a stealable car slowly, a nearby thug may snatch it
		// back — pull you out and drive off, and with a chance also rip you out
		// and fight you. Tune here:
		private const double STEALBACK_CHANCE_PER_SEC = 0.12;   // per-second roll while eligible
		private const float STEALBACK_SPEED_CAP = 6f;           // car must be slower than this
		private const double STEALBACK_FIGHT_CHANCE = 0.45;     // of a successful theft, also fight
		private const float STEALBACK_RANGE = 3.1f;             // thug reach distance to the car
		private const int STEALBACK_COOLDOWN_MS = 45000;        // min gap between attempts
		private const int STEALBACK_CHASE_TIMEOUT_MS = 9000;    // give up after chasing this long
		private const double STEALBACK_FIGHT_S = 12f;           // how long the fight lasts
		private const float STEALBACK_THIEF_SPEED = 5.0f;
		private const float STEALBACK_MAX_DIST = 14f;           // only hunt a thug spawned within reach
		private static readonly ConcurrentDictionary<int, long> _stealBackNextMs = new();
		private static readonly ConcurrentDictionary<int, long> _stealBackThief = new();
		private static readonly ConcurrentDictionary<int, long> _stealBackChaseStartMs = new();
		private static readonly ConcurrentDictionary<int, int> _playerWorldId = new();
		private static Timer? _persistTimer;
		private static Timer? _cleanupTimer;
		private static readonly object _persistLock = new();
		private static readonly ConcurrentDictionary<long, DroppedWeapon> _droppedWeapons = new();
		private static readonly object _randomWeaponSpawnLock = new();
		private const int RANDOM_WEAPON_DROP_MAX = 8;
		private const float RANDOM_WEAPON_DROP_MIN_DISTANCE = 18f;
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
			public bool IsRandom { get; set; }
			public DateTime DroppedAt { get; set; }
		}
		// NOTE: must use properties, not public fields — System.Text.Json (the
		// default AddControllers serializer) ignores public fields, which made
		// every highscores row serialize as {} (blank leaderboard rows).
		private sealed class HighScoreEntry
		{
			public int PlayerId { get; set; }
			public string PlayerName { get; set; } = "";
			public int Kills { get; set; }
			public int Deaths { get; set; }
			public int Escapes { get; set; }
			public int Busted { get; set; }
			public int Resists { get; set; }
			public int WorstStreak { get; set; }
			public int Money { get; set; }
			public int MoneyEarned { get; set; }
			public int Score { get; set; }
		}
		private static readonly (int Id, string Name)[] JumpRamps = new[]
		{
			(1, "Beachfront Blast"),
			(2, "Harbor Hop"),
			(3, "Boardwalk Boost"),
			(4, "Country Mile"),
			(5, "Hill Country"),
			(6, "Mountain Mayhem")
		};
		// Properties (not fields) so any future direct serialization works.
		private sealed class JumpScore
		{
			public int UserId { get; set; }
			public int RampId { get; set; }
			public double BestDistance { get; set; }
			public double BestHeight { get; set; }
			public int RewardTotal { get; set; }
		}
		private static readonly ConcurrentDictionary<long, JumpScore> _jumpScores = new();
		private static long JumpKey(int userId, int rampId) => ((long)userId << 20) | (uint)rampId;
		private static readonly ConcurrentDictionary<int, bool[]> _playerWeapons = new();
		private static readonly ConcurrentDictionary<int, int[]> _playerAmmo = new();
		private static readonly ConcurrentDictionary<int, int> _playerCurrentWeapon = new();
		private static readonly bool[] _homeBaseWeaponCollected = new bool[5];
		private static readonly DateTime[] _homeBaseWeaponRespawnAt = new DateTime[5];
		private const int HOME_BASE_WEAPON_RESPAWN_SECONDS = 60;
		private static readonly float[] HOME_BASE_WEAPON_X = { 0, 114, 120, 117, 123 };
		private static readonly float[] HOME_BASE_WEAPON_Z = { 0, 48, 48, 48, 48 };
		private static long _nextNpcId = 1;
		private static long GetNextNpcId() => Interlocked.Increment(ref _nextNpcId);
		static GrandTheftController()
		{
			_persistTimer = new Timer(PersistAllToDb, null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
			// Periodic memory management: recycle world NPCs nobody can see and drop
			// per-user state for long-gone players so the server stays lean.
			_cleanupTimer = new Timer(RunMemoryCleanup, null, TimeSpan.FromMinutes(2), TimeSpan.FromMinutes(2));
 		} 
		private static bool _shutdownHooksRegistered;
		private static void RegisterShutdownDump(IHostApplicationLifetime? appLifetime)
		{
			if (_shutdownHooksRegistered) return;
			lock (_persistLock)
			{
				if (_shutdownHooksRegistered) return;
				_shutdownHooksRegistered = true;
				appLifetime?.ApplicationStopping.Register(() => PersistAllToDbBlocking());
				AppDomain.CurrentDomain.ProcessExit += (_, _) => PersistAllToDbBlocking();
				Console.CancelKeyPress += (_, _) => PersistAllToDbBlocking();
			}
		}
		private static void PersistAllToDb(object? state) => PersistAllToDbCore(false);
		private static void PersistAllToDbBlocking() => PersistAllToDbCore(true);
		private static void PersistAllToDbCore(bool force)
		{
			if (force) Monitor.Enter(_persistLock);
			else if (!Monitor.TryEnter(_persistLock)) return;
			try
			{
				var fiveMinAgo = DateTime.UtcNow.AddMinutes(-5);
				if (!force)
				{
					bool anyActive = false;
					foreach (var kv in _lastSeen) { if (kv.Value >= fiveMinAgo) { anyActive = true; break; } }
					if (!anyActive) return;
				}
				var connStr = new ConfigurationBuilder().AddJsonFile("appsettings.json").Build()
					.GetValue<string>("ConnectionStrings:maxhanna");
				if (string.IsNullOrEmpty(connStr)) return;
				using var conn = new MySqlConnection(connStr);
				conn.Open();
				  
				foreach (var uid in _playerX.Keys)
				{
					if (!force && (!_lastSeen.TryGetValue(uid, out var seen) || (DateTime.UtcNow - seen).TotalMinutes > 5)) continue;
					_playerPosY.TryGetValue(uid, out var py);
					_playerYaw.TryGetValue(uid, out var y);
					_playerPitch.TryGetValue(uid, out var p);
					_playerCarYaw.TryGetValue(uid, out var cy);
					_playerCarSpeed.TryGetValue(uid, out var cs);
					_playerHealth.TryGetValue(uid, out var hp);
					_playerMoney.TryGetValue(uid, out var money);
					var wid = _playerWorldId.GetOrAdd(uid, 1);
					_playerX.TryGetValue(uid, out var px);
					_playerZ.TryGetValue(uid, out var pz);
					_playerInCar.TryGetValue(uid, out var inCar);
					int weapon = 0;
					if (_playerWeapons.TryGetValue(uid, out var wp) && wp != null)
						for (int i = 0; i < wp.Length; i++) if (wp[i]) { weapon = i; break; }
					string weaponsJson = "[]";
					if (_playerWeapons.TryGetValue(uid, out var wpj) && wpj != null)
						weaponsJson = JsonSerializer.Serialize((bool[])wpj.Clone());
					string ammoJson = "[]";
					if (_playerAmmo.TryGetValue(uid, out var paj) && paj != null)
						ammoJson = JsonSerializer.Serialize((int[])paj.Clone());
					using var cmd = new MySqlCommand(@"
					INSERT INTO maxhanna.grandtheft_player_state (user_id, world_id, pos_x, pos_y, pos_z, yaw, pitch, car_yaw, car_speed, health, weapon, weapons_json, ammo_json, money, money_earned, money_peak, kills, deaths, escapes, busted, resists, worst_streak, last_seen)
					VALUES (@uid, @wid, @px, @py, @pz, @y, @p, @cy, @cs, @h, @w, @weaponsJson, @ammoJson, @money, @earned, @peak, @kills, @deaths, @escapes, @busted, @resists, @worstStreak, UTC_TIMESTAMP())
					ON DUPLICATE KEY UPDATE pos_x = @px, pos_y = @py, pos_z = @pz, yaw = @y, pitch = @p, car_yaw = @cy, car_speed = @cs, health = @h, weapon = @w, weapons_json = @weaponsJson, ammo_json = @ammoJson, money = @money, money_earned = @earned, money_peak = @peak, kills = @kills, deaths = @deaths, escapes = @escapes, busted = @busted, resists = @resists, worst_streak = @worstStreak, last_seen = UTC_TIMESTAMP()", conn);
					cmd.Parameters.AddWithValue("@uid", uid);
					cmd.Parameters.AddWithValue("@wid", wid);
					cmd.Parameters.AddWithValue("@px", px);
					cmd.Parameters.AddWithValue("@py", py);
					cmd.Parameters.AddWithValue("@pz", pz);
					cmd.Parameters.AddWithValue("@y", y);
					cmd.Parameters.AddWithValue("@p", p);
					cmd.Parameters.AddWithValue("@cy", cy);
					cmd.Parameters.AddWithValue("@cs", cs);
					cmd.Parameters.AddWithValue("@h", hp > 0 ? hp : 100);
					cmd.Parameters.AddWithValue("@w", weapon);
					cmd.Parameters.AddWithValue("@weaponsJson", weaponsJson);
					cmd.Parameters.AddWithValue("@ammoJson", ammoJson);
					cmd.Parameters.AddWithValue("@money", money);
					_playerMoneyEarned.TryGetValue(uid, out var earnedMoney);
					cmd.Parameters.AddWithValue("@earned", earnedMoney);
					_playerMoneyPeak.TryGetValue(uid, out var peakMoney);
					cmd.Parameters.AddWithValue("@peak", peakMoney);
					_playerKills.TryGetValue(uid, out var kills);
					_playerDeaths.TryGetValue(uid, out var deaths);
					_playerEscapes.TryGetValue(uid, out var escapes);
					_playerBusted.TryGetValue(uid, out var busted);
					_playerResistsTotal.TryGetValue(uid, out var resistsTotal);
					_playerWorstResistStreak.TryGetValue(uid, out var worstStreak);
					cmd.Parameters.AddWithValue("@kills", kills);
					cmd.Parameters.AddWithValue("@deaths", deaths);
					cmd.Parameters.AddWithValue("@escapes", escapes);
					cmd.Parameters.AddWithValue("@busted", busted);
					cmd.Parameters.AddWithValue("@resists", resistsTotal);
					cmd.Parameters.AddWithValue("@worstStreak", worstStreak);
					cmd.ExecuteNonQuery();
				}
			}
			catch { }
			finally { Monitor.Exit(_persistLock); }
		}
		// Cull radius for world NPCs: beyond this distance from every active player
		// an NPC is invisible to everyone, so it's safe to recycle. Matches the
		// client's max view distance (~4 chunks = 320 units per axis, ~450
		// diagonal; 650 keeps the whole revealed area populated).
		private const float WORLD_NPC_CULL_DIST = 650f;
		private static bool IsNearAnyPlayer(List<(float X, float Z)> activePlayers, float x, float z)
		{
			foreach (var (px, pz) in activePlayers)
			{
				float dx = px - x, dz = pz - z;
				if (dx * dx + dz * dz < WORLD_NPC_CULL_DIST * WORLD_NPC_CULL_DIST) return true;
			}
			return false;
		}
		// Periodic memory management (every 2 minutes): anything outside every
		// active player's field of vision is recycled, and per-user state for
		// long-gone players is dropped (their progress is already in the DB via
		// the 30s persist timer, which saves everyone seen within 5 minutes).
		private static void RunMemoryCleanup(object? state)
		{
			try
			{
				var now = DateTime.UtcNow;
				var activeCutoff = now.AddSeconds(-60);
				var emptyWorldCutoff = now.AddMinutes(-10);
				foreach (var worldKv in _worldNpcs)
				{
					int worldId = worldKv.Key;
					var npcs = worldKv.Value;
					var players = new List<(float X, float Z)>();
					bool anyRecent = false;
					foreach (var pkv in _playerWorldId)
					{
						if (pkv.Value != worldId) continue;
						if (!_lastSeen.TryGetValue(pkv.Key, out var seen)) continue;
						if (seen >= emptyWorldCutoff) anyRecent = true;
						if (seen < activeCutoff) continue;
						if (!_playerX.TryGetValue(pkv.Key, out var px) || !_playerZ.TryGetValue(pkv.Key, out var pz)) continue;
						players.Add((px, pz));
					}
					if (!anyRecent)
					{
						// Nobody has touched this world in 10 minutes — drop the whole
						// thing (NPCs + chat). It re-creates and re-seeds on the next
						// player's first poll, so nothing is permanently lost.
						_worldNpcs.TryRemove(worldId, out _);
						_worldChatMessages.TryRemove(worldId, out _);
						continue;
					}
					var toRemove = new List<long>();
					foreach (var kv in npcs)
					{
						var npc = kv.Value;
						// Dead NPCs are aged out by polls too, but sweep here so bodies
						// can't linger when nobody is polling nearby.
						if (npc.DeadAt != null)
						{
							if ((now - npc.DeadAt.Value).TotalSeconds > DEAD_BODY_TIMEOUT_SECONDS) toRemove.Add(kv.Key);
							continue;
						}
						if (npc.IsParked) continue; // player-parked fixtures persist
						if (!IsNearAnyPlayer(players, npc.X, npc.Z)) toRemove.Add(kv.Key);
					}
					foreach (var id in toRemove) npcs.TryRemove(id, out _);
				}
				// Per-user state for players who've been gone long enough that the
				// persist timer has their progress safely in the DB — the next connect
				// reloads it via EnsurePlayerLoaded.
				var userCutoff = now.AddMinutes(-10);
				var staleUsers = new List<int>();
				foreach (var kv in _lastSeen) if (kv.Value < userCutoff) staleUsers.Add(kv.Key);
				foreach (var uid in staleUsers) RemoveUserState(uid);
				// The jump-score cache is keyed by a (user, ramp) composite, so
				// RemoveUserState can't reach it — evict stale users' entries here
				// (DB-backed; reloaded on demand in SubmitJump).
				if (staleUsers.Count > 0)
				{
					var staleSet = new HashSet<int>(staleUsers);
					var staleJumpKeys = new List<long>();
					foreach (var kv in _jumpScores) if (staleSet.Contains(kv.Value.UserId)) staleJumpKeys.Add(kv.Key);
					foreach (var k in staleJumpKeys) _jumpScores.TryRemove(k, out _);
				}
				// Ephemeral world objects (mirrors the per-poll prunes, guaranteed to
				// run even when no one is actively polling).
				var deadBodies = new List<int>();
				foreach (var kv in _deadPlayerBodies) if ((now - kv.Value.DiedAt).TotalSeconds > DEAD_BODY_TIMEOUT_SECONDS) deadBodies.Add(kv.Key);
				foreach (var pid in deadBodies) _deadPlayerBodies.TryRemove(pid, out _);
				var dropped = new List<long>();
				foreach (var kv in _droppedWeapons) if ((now - kv.Value.DroppedAt).TotalSeconds > 30) dropped.Add(kv.Key);
				foreach (var k in dropped) _droppedWeapons.TryRemove(k, out _);
				var shooters = new List<int>();
				foreach (var kv in _shootingPlayers) if ((now - kv.Value.LastUpdated).TotalSeconds > 10) shooters.Add(kv.Key);
				foreach (var s in shooters) _shootingPlayers.TryRemove(s, out _);
			}
			catch { }
		}
		// Drops every per-user in-memory entry for a userId. Safe because the
		// 30s persist timer upserts each active player's full state (position,
		// money, weapons, kills...) to the DB within 5 minutes of last activity.
		private static void RemoveUserState(int userId)
		{
			_playerHealth.TryRemove(userId, out _);
			_lastClientHealth.TryRemove(userId, out _);
			_playerX.TryRemove(userId, out _);
			_playerZ.TryRemove(userId, out _);
			_playerPosY.TryRemove(userId, out _);
			_playerYaw.TryRemove(userId, out _);
			_playerPitch.TryRemove(userId, out _);
			_playerCarYaw.TryRemove(userId, out _);
			_playerCarSpeed.TryRemove(userId, out _);
			_playerModelUrls.TryRemove(userId, out _);
			_lastDamageTime.TryRemove(userId, out _);
			_playerWantedLevels.TryRemove(userId, out _);
			_lastUndetectedTime.TryRemove(userId, out _);
			_lastHeliDispatch.TryRemove(userId, out _);
			ResolveResistStreak(userId);
			_playerResists.TryRemove(userId, out _);
			_playerBackupCalls.TryRemove(userId, out _);
			_arrestRegrabNotified.TryRemove(userId, out _);
			_lethalForceNotified.TryRemove(userId, out _);
			_playerLastKnown.TryRemove(userId, out _);
			_lastPoliceDamageTime.TryRemove(userId, out _);
			_playerMoney.TryRemove(userId, out _);
			_playerMoneyEarned.TryRemove(userId, out _);
			_lastReportedMoney.TryRemove(userId, out _);
			_playerMoneyPeak.TryRemove(userId, out _);
			_playerKills.TryRemove(userId, out _);
			_playerDeaths.TryRemove(userId, out _);				_playerEscapes.TryRemove(userId, out _);
				_playerBusted.TryRemove(userId, out _);
				_playerResistsTotal.TryRemove(userId, out _);
				_playerWorstResistStreak.TryRemove(userId, out _);
			_playerInCar.TryRemove(userId, out _);
			_playerInCarTime.TryRemove(userId, out _);
			_evictedPlayers.TryRemove(userId, out _);
			_playerVehicleType.TryRemove(userId, out _);
			_playerCarColorR.TryRemove(userId, out _);
			_playerCarColorG.TryRemove(userId, out _);
			_playerCarColorB.TryRemove(userId, out _);
			_playerPassengerOf.TryRemove(userId, out _);
			_deadPlayerBodies.TryRemove(userId, out _);
			_playerUsername.TryRemove(userId, out _);
			_playerDeathBroadcasted.TryRemove(userId, out _);
			_lastSeen.TryRemove(userId, out _);
			_playerWorldId.TryRemove(userId, out _);
			_playerWeapons.TryRemove(userId, out _);
			_playerAmmo.TryRemove(userId, out _);
			_shootingPlayers.TryRemove(userId, out _);
		}
		private void EnsurePlayerLoaded(int userId)
		{
			if (_lastSeen.ContainsKey(userId)) return;
			try
			{ 
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				conn.Open();
				using var cmd = new MySqlCommand("SELECT s.user_id, s.world_id, s.pos_x, s.pos_y, s.pos_z, s.yaw, s.pitch, s.car_yaw, s.car_speed, s.health, s.weapon, s.weapons_json, s.ammo_json, s.money, s.money_earned, s.money_peak, s.kills, s.deaths, s.escapes, s.busted, s.resists, s.worst_streak, s.last_seen, u.username FROM maxhanna.grandtheft_player_state s JOIN maxhanna.users u ON s.user_id = u.id WHERE s.user_id = @uid", conn);
				cmd.Parameters.AddWithValue("@uid", userId);
				using var rdr = cmd.ExecuteReader();
				if (rdr.Read())
				{
					_lastSeen[userId] = rdr.GetDateTime("last_seen");
					_playerX[userId] = rdr.GetFloat("pos_x");
					_playerZ[userId] = rdr.GetFloat("pos_z");
					_playerPosY[userId] = rdr.GetFloat("pos_y");
					_playerYaw[userId] = rdr.GetFloat("yaw");
					_playerPitch[userId] = rdr.GetFloat("pitch");
					_playerCarYaw[userId] = rdr.GetFloat("car_yaw");
					_playerCarSpeed[userId] = rdr.GetFloat("car_speed");
					_playerHealth[userId] = rdr.GetInt32("health");
					_playerMoney[userId] = rdr.GetInt32("money");
					_playerMoneyEarned[userId] = rdr.IsDBNull(rdr.GetOrdinal("money_earned")) ? 0 : rdr.GetInt32("money_earned");
					_playerMoneyPeak[userId] = rdr.IsDBNull(rdr.GetOrdinal("money_peak")) ? 0 : rdr.GetInt32("money_peak");
					_lastReportedMoney[userId] = _playerMoney[userId];
					_playerKills[userId] = rdr.IsDBNull(rdr.GetOrdinal("kills")) ? 0 : rdr.GetInt32("kills");
					_playerDeaths[userId] = rdr.IsDBNull(rdr.GetOrdinal("deaths")) ? 0 : rdr.GetInt32("deaths");
					_playerEscapes[userId] = rdr.IsDBNull(rdr.GetOrdinal("escapes")) ? 0 : rdr.GetInt32("escapes");
					_playerBusted[userId] = rdr.IsDBNull(rdr.GetOrdinal("busted")) ? 0 : rdr.GetInt32("busted");
					_playerResistsTotal[userId] = rdr.IsDBNull(rdr.GetOrdinal("resists")) ? 0 : rdr.GetInt32("resists");
					_playerWorstResistStreak[userId] = rdr.IsDBNull(rdr.GetOrdinal("worst_streak")) ? 0 : rdr.GetInt32("worst_streak");
					_playerWorldId[userId] = rdr.GetInt32("world_id");
					_playerUsername[userId] = rdr.GetString("username");
					if (!_playerWeapons.ContainsKey(userId))
					{
						var wp = new bool[5];
						var pa = new int[5];
						if (!rdr.IsDBNull(rdr.GetOrdinal("weapons_json")))
						{
							try
							{
								var parsedW = JsonSerializer.Deserialize<bool[]>(rdr.GetString("weapons_json"));
								if (parsedW != null && parsedW.Length == 5) wp = parsedW;
							}
							catch { }
						}
						else
						{
							int weapon = rdr.GetInt32("weapon");
							if (weapon >= 0 && weapon < 5) wp[weapon] = true;
						}
						if (!rdr.IsDBNull(rdr.GetOrdinal("ammo_json")))
						{
							try
							{
								var parsedA = JsonSerializer.Deserialize<int[]>(rdr.GetString("ammo_json"));
								if (parsedA != null && parsedA.Length == 5) pa = parsedA;
							}
							catch { }
						}
						_playerWeapons[userId] = wp;
						_playerAmmo[userId] = pa;
					}
				}
			}
			catch { }
		}
		private void BroadcastDeathMessage(int playerId, float posX, float posZ, float? carYaw, int worldId, string killerName, string victimName, string cause)
		{
			if (_playerDeathBroadcasted.TryGetValue(playerId, out bool alreadyBroadcasted) && alreadyBroadcasted) return;
			var messages = _worldChatMessages.GetOrAdd(worldId, _ => new List<ChatMessageEntry>());
			_playerDeathBroadcasted[playerId] = true;
			_playerDeaths[playerId] = (_playerDeaths.TryGetValue(playerId, out var deathCount) ? deathCount : 0) + 1;
			lock (messages)
			{
				string msg = $"{killerName} killed {victimName} {cause}";
				messages.Add(new ChatMessageEntry { UserId = 0, Username = "SYSTEM", Message = msg, Timestamp = DateTime.UtcNow });
				var pruneCutoff = DateTime.UtcNow.AddSeconds(-120);
				messages.RemoveAll(m => m.Timestamp < pruneCutoff);
				while (messages.Count > 100) messages.RemoveAt(0);
			}
			_deadPlayerBodies[playerId] = new DeadPlayerBody
			{
				UserId = playerId,
				PosX = posX,
				PosZ = posZ,
				Yaw = carYaw ?? 0,
				DiedAt = DateTime.UtcNow
			};
			_playerWantedLevels[playerId] = 0;
			_playerMoney[playerId] = 0;
			for (int i = 1; i <= 4; i++) _homeBaseWeaponCollected[i] = false;
			if (_playerWeapons.TryGetValue(playerId, out var pw))
			{
				var ammoArr = _playerAmmo.TryGetValue(playerId, out var pa) ? pa : new int[5];
				for (int wi = 1; wi <= 4; wi++)
				{
					if (pw[wi])
					{
						var drop = new DroppedWeapon { Id = GetNextDropId(), PosX = posX, PosZ = posZ, WeaponType = wi, Ammo = ammoArr[wi], DroppedAt = DateTime.UtcNow };
						_droppedWeapons[drop.Id] = drop;
					}
				}
			}
			_playerWeapons[playerId] = new bool[5] { true, false, false, false, false };
			_playerAmmo[playerId] = new int[5];
			_playerHealth[playerId] = 0;
		}
		// Vision check for a cop: the player is spotted if within the always-seen
		// close radius, or if they're inside the cop's ~120° forward-facing cone
		// (so sneaking past from behind works) and no building footprint blocks
		// the line of sight (sampled along the segment).
		private static bool CopSeesPlayer(NpcState npc, float playerX, float playerZ)
		{
			float dx = npc.X - playerX;
			float dz = npc.Z - playerZ;
			float distSq = dx * dx + dz * dz;
			if (distSq < COP_VISION_CLOSE * COP_VISION_CLOSE) return true;
			if (distSq > COP_VISION_RANGE * COP_VISION_RANGE) return false;
			float dist = (float)Math.Sqrt(distSq);
			// Facing = where the cop is heading (its target); fall back to the model
			// yaw (undoing the -90° offset) when it's standing still.
			float fwdX, fwdZ;
			float tx = npc.TargetX - npc.X;
			float tz = npc.TargetZ - npc.Z;
			float tLenSq = tx * tx + tz * tz;
			if (tLenSq > 0.25f)
			{
				float tLen = (float)Math.Sqrt(tLenSq);
				fwdX = tx / tLen;
				fwdZ = tz / tLen;
			}
			else
			{
				// npc.Yaw carries COP_MODEL_YAW_OFFSET for simulated cops — undo it for the world-facing yaw.
				float facing = npc.Yaw - COP_MODEL_YAW_OFFSET;
				fwdX = (float)Math.Sin(facing);
				fwdZ = (float)Math.Cos(facing);
			}
			float toX = (playerX - npc.X) / dist;
			float toZ = (playerZ - npc.Z) / dist;
			if (toX * fwdX + toZ * fwdZ < COP_VISION_CONE_COS) return false;
			int steps = Math.Max(2, (int)(dist / 5f));
			for (int i = 1; i < steps; i++)
			{
				float t = i / (float)steps;
				float sx = npc.X + (playerX - npc.X) * t;
				float sz = npc.Z + (playerZ - npc.Z) * t;
				if (CityLayout.IsBuildingAt(sx, sz)) return false;
			}
			return true;
		}

		// Does any police unit (foot officer, or a patrol car with a driver) have a
		// clear view of the given world position? Used to decide whether an assault
		// was *witnessed*: attacking a pedestrian in front of an officer draws heat
		// even though a bare-fisted brawl otherwise doesn't. Reuses the cop vision
		// cone/range/line-of-sight logic (the officer must be facing the scene
		// unless the crime happens inside the always-spotted close radius).
		private static bool AnyCopSeesPosition(ConcurrentDictionary<long, NpcState> npcs, float posX, float posZ)
		{
			foreach (var kv in npcs)
			{
				var npc = kv.Value;
				if (npc.DeadAt.HasValue) continue;
				if (npc.Type != "cop" && npc.Type != "police") continue;
				if (npc.Type == "police" && !npc.HasDriver) continue; // an empty cruiser doesn't witness
				if (CopSeesPlayer(npc, posX, posZ)) return true;
			}
			return false;
		}

		// On fists = the player's currently drawn weapon is 0 (Unarmed). This is
		// the arrest gate: a cop only grabs someone who can't shoot right now —
		// but a player with a holstered weapon can draw it mid-hold and resist,
		// which aborts the booking and jumps the wanted level instead.
		private static bool IsPlayerOnFists(int userId)
		{
			return !_playerCurrentWeapon.TryGetValue(userId, out var w) || w == 0;
		}
		// Records a resisted arrest: bumps the player's attempt count, remembers
		// the arresting cop (the SAME cop returns for another grab ~30s later),
		// and escalates the wanted-level jump with each subsequent resist.
		private static void RecordResist(int userId, long copId)
		{
			int count = 1;
			long keepCopId = copId;
			if (_playerResists.TryGetValue(userId, out var prev))
			{
				count = prev.Count + 1;
				keepCopId = prev.CopId;
			}
			_playerResists[userId] = (keepCopId, count, DateTime.UtcNow);
			// Lifetime resisted-arrest counter — persisted chase stat.
			_playerResistsTotal[userId] = (_playerResistsTotal.TryGetValue(userId, out var rt) ? rt : 0) + 1;
			// A fresh resist restarts the backup wave — the new (longer) cooldown
			// begins with a clean call timer so each escape cycle accrues its own
			// reinforcements.
			_playerBackupCalls[userId] = new BackupCallState { CopId = keepCopId, Units = 0, LastUnitAt = DateTime.UtcNow };
			// Crossing the lethal threshold: one-shot heads-up that the cops have
			// stopped trying to arrest and switched to lethal force.
			if (count == RESIST_LETHAL_AFTER) _lethalForceNotified[userId] = true;
			int rw = _playerWantedLevels.TryGetValue(userId, out var rwv) ? rwv : 0;
			// +2 on the first resist, +3 on the second, +4 on the third…
			_playerWantedLevels[userId] = Math.Min(5, rw + Math.Min(4, 1 + count));
		}
		// Escalating re-grab cooldown: 8s after the first resist, +4s per
		// additional resist, capped at 16s — repeated escapes give the player
		// longer windows to flee before the same cop can grab them again.
		private static float ResistRegrabCooldown(int resistCount) =>
			Math.Min(RESIST_REGRAB_COOLDOWN_MAX_SECONDS,
				RESIST_REGRAB_COOLDOWN_SECONDS + Math.Max(0, resistCount - 1) * RESIST_REGRAB_COOLDOWN_STEP_SECONDS);
		// After RESIST_LETHAL_AFTER resists the player is a lost cause for arrest —
		// cops stop trying to grab and go straight to lethal force.
		private static bool IsLethalForce(int userId) =>
			_playerResists.TryGetValue(userId, out var r) && r.Count >= RESIST_LETHAL_AFTER;
		// Chase resolved (escape, booking, or death respawn): fold the run of
		// consecutive resists into the lifetime worst-streak stat. The current
		// streak IS _playerResists.Count, which resets when the chase resolves.
		private static void ResolveResistStreak(int userId)
		{
			if (_playerResists.TryGetValue(userId, out var rs) && rs.Count > 0)
			{
				int worst = _playerWorstResistStreak.TryGetValue(userId, out var ws) ? ws : 0;
				if (rs.Count > worst) _playerWorstResistStreak[userId] = rs.Count;
			}
		}
		// The fought-off cop radios for backup during the re-grab cooldown: every
		// BACKUP_CALL_INTERVAL_SECONDS another cruiser keys onto the player and
		// pulls up at the scene (a road point near the fight — never the player's
		// live position), so stalling in the fight zone steadily brings more heat.
		// The cadence resets on each resist; the wave is capped per cycle.
		private void MaybeCallBackup(int userId, int worldId, long copId, float sceneX, float sceneZ, DateTime now, Random rng)
		{
			if (!_worldNpcs.TryGetValue(worldId, out var npcs)) return;
			if (!_playerBackupCalls.TryGetValue(userId, out var st) || st.CopId != copId)
			{
				st = new BackupCallState { CopId = copId, Units = 0, LastUnitAt = now };
				_playerBackupCalls[userId] = st;
			}
			if (st.Units >= BACKUP_CALL_MAX_UNITS) return;
			if ((now - st.LastUnitAt).TotalSeconds < BACKUP_CALL_INTERVAL_SECONDS) return;
			st.LastUnitAt = now;
			st.Units++;
			long id = GetNextNpcId();
			GetRandomRoadPointNearPlayer(sceneX, sceneZ, out float x, out float z, rng, minDist: 80f);
			float angle = (float)(rng.NextDouble() * Math.PI * 2.0);
			npcs[id] = new NpcState
			{
				Id = id,
				Type = "police",
				X = x,
				Z = z,
				TargetX = x,
				TargetZ = z,
				Yaw = angle,
				Speed = 17f,
				Health = 200,
				MaxHealth = 200,
				Cr = 0.1f,
				Cg = 0.1f,
				Cb = 0.2f,
				TargetUserId = userId,
				ApproachAngle = angle,
				LastKnownX = sceneX,
				LastKnownZ = sceneZ
			};
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
			public float PrePanicSpeed { get; set; } = 0f;
			public float TargetX { get; set; }
			public float TargetZ { get; set; }
			public float Cr { get; set; }
			public float Cg { get; set; }
			public float Cb { get; set; }
			public int Health { get; set; } = 100;
			public int MaxHealth { get; set; } = 100;
			public bool OnFire { get; set; } = false;
			public DateTime? FireStartedAt { get; set; } = null;
			public bool IsSmoking { get; set; } = false;
			public bool IsFleeing { get; set; } = false;
			public DateTime LastUpdate { get; set; }
			public int TargetUserId { get; set; } = 0;
			public long TargetNpcId { get; set; } = 0;   // FightBackUntil target when it's another NPC (ped-vs-ped brawls)
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
			public long LastRallyTime { get; set; } = 0;
			public bool IsShootingAt { get; set; } = false;
			// Foot cop holding a caught player in the arrest grab pose.
			public bool IsArresting { get; set; } = false;
			public long ArrestTargetId { get; set; } = 0;
			public bool IsParked { get; set; } = false;
			public bool IsSwimming { get; set; } = false;
			public DateTime? PanicUntil { get; set; } = null;
			public float PanicFromX { get; set; } = 0f;
			public float PanicFromZ { get; set; } = 0f;
			// Gunfire reaction: instead of always fleeing, a bystander may duck —
			// freeze in place at reduced height until the coast is clear.
			public bool IsDucking { get; set; } = false;
			public DateTime? DuckUntil { get; set; } = null;
			public float PreDuckSpeed { get; set; } = 1.5f;
			public DateTime? FightBackUntil { get; set; } = null;
			// Brawl intervention: a foot cop jogging in to break up a street fight.
			public bool IsBreakingUpFight { get; set; } = false;
			public DateTime? BreakUpUntil { get; set; } = null;
			public float LastKnownX { get; set; }
			public float LastKnownZ { get; set; }
			public DateTime? LastSeenAt { get; set; } = null;
			public DateTime? SearchStartedAt { get; set; } = null;
			public int SearchStep { get; set; } = 0;
			public bool IsSearching { get; set; } = false;
			// Post-escape linger: patrol the old crime scene until this time
			// after the player gets away, then stand down to normal duties.
			public DateTime? LingerUntil { get; set; } = null;
			public bool IsPoliceHeli { get; set; } = false;   // pursuit heli sweeping a player's last known spot
			public string AircraftPhase { get; set; } = "flying";
			public DateTime PhaseStartedAt { get; set; } = DateTime.UtcNow;
		}
		private class ArrestState
		{
			public DateTime Until { get; set; }
			public float X { get; set; }
			public float Z { get; set; }
			public long CopId { get; set; }
			public bool Respawned { get; set; }
		}
		private class BackupCallState
		{
			public long CopId { get; set; }
			public int Units { get; set; }
			public DateTime LastUnitAt { get; set; }
		}
		private class DeadPlayerBody
		{
			public int UserId { get; set; }
			public float PosX { get; set; }
			public float PosZ { get; set; }
			public float Yaw { get; set; }
			public DateTime DiedAt { get; set; }
		}
		public GrandTheftController(IConfiguration config, IHostApplicationLifetime? appLifetime)
		{
			_config = config;
			RegisterShutdownDump(appLifetime);
		}
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
				EnsurePlayerLoaded(req.UserId);
				bool respawnAtHome = false;
				// Arrest: while a cop holds this player the position is server-pinned
				// so they can't run (the client also freezes input on `arrested`).
				// When the hold expires the booking happens — weapons stripped, wanted
				// cleared — and the client respawns the player at a police station.
				bool arrested = false;
				bool arrestRespawn = false;
				bool arrestResisted = false;
				if (_playerArrests.TryGetValue(req.UserId, out var arrest))
				{
					// Resisting arrest: drawing a weapon (or attacking) mid-hold
					// aborts the booking — the cop releases the grab and opens
					// fire instead, and the wanted level jumps by 2.
					if (req.Weapon != 0 || req.IsShooting)
					{
						_playerArrests.TryRemove(req.UserId, out _);
						// Escalation: record the resist (same cop, attempt count) so the
						// wanted jump grows each time and the cop returns for more.
						RecordResist(req.UserId, arrest.CopId);
						_lastUndetectedTime[req.UserId] = DateTime.UtcNow;
						_playerLastKnown[req.UserId] = (req.PosX, req.PosZ, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
						arrestResisted = true;
					}
					else if (DateTime.UtcNow >= arrest.Until)
					{
						_playerArrests.TryRemove(req.UserId, out _);
						ResolveResistStreak(req.UserId);
						_playerResists.TryRemove(req.UserId, out _);
						_playerBackupCalls.TryRemove(req.UserId, out _);
						_lethalForceNotified.TryRemove(req.UserId, out _);
						_playerWeapons[req.UserId] = new bool[5] { true, false, false, false, false };
						_playerAmmo[req.UserId] = new int[5];
						_playerWantedLevels[req.UserId] = 0;
						// A completed booking is a bust — count it for the stats.
						_playerBusted[req.UserId] = (_playerBusted.TryGetValue(req.UserId, out var pb) ? pb : 0) + 1;
						// Booking closes the case — forget the crime and stand the
						// pursuit down so no unit lingers on a resolved bust.
						ForgetPlayerCrime(req.UserId, req.WorldId);
						arrestRespawn = true;
					}
					else
					{
						req.PosX = arrest.X;
						req.PosZ = arrest.Z;
						req.CarSpeed = 0;
						req.IsInCar = false;
						arrested = true;
					}
				}
				if (_lastSeen.TryGetValue(req.UserId, out var lastSeenDt))
				{
					var inactiveMinutes = (DateTime.UtcNow - lastSeenDt.ToUniversalTime()).TotalMinutes;
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
				_playerX[req.UserId] = req.PosX;
				_playerZ[req.UserId] = req.PosZ;
				_playerPosY[req.UserId] = req.PosY;
				_playerYaw[req.UserId] = req.Yaw;
				_playerPitch[req.UserId] = req.Pitch;
				_playerCarYaw[req.UserId] = req.CarYaw;
				_playerCarSpeed[req.UserId] = req.CarSpeed;
				_playerWorldId[req.UserId] = req.WorldId;
				_lastSeen[req.UserId] = DateTime.UtcNow;
				_playerMoney[req.UserId] = Math.Max(0, req.Money);
				// The client persists its wanted level locally and reports it here, so
				// a server restart doesn't wipe the session's heat. Only adopt it on
				// first contact (no server record yet); once present the server stays
				// authoritative so decay and re-crime keep working as before.
				if (!_playerWantedLevels.ContainsKey(req.UserId) && req.WantedLevel > 0)
				{
					_playerWantedLevels[req.UserId] = Math.Min(5, req.WantedLevel);
				}
				int reportedMoney = Math.Max(0, req.Money);
				bool firstMoneyReport = !_lastReportedMoney.ContainsKey(req.UserId);
				int prevReported = _lastReportedMoney.GetOrAdd(req.UserId, reportedMoney);
				bool moneyRecord = false;
				if (reportedMoney > prevReported)
				{
					_playerMoneyEarned[req.UserId] = Math.Min(
						_playerMoneyEarned.GetOrAdd(req.UserId, 0) + (reportedMoney - prevReported),
						2_000_000_000);
					if (reportedMoney > _playerMoneyPeak.GetOrAdd(req.UserId, reportedMoney))
					{
						_playerMoneyPeak[req.UserId] = reportedMoney;
						moneyRecord = !firstMoneyReport;
					}
				}
				_lastReportedMoney[req.UserId] = reportedMoney;
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
				_playerCurrentWeapon[req.UserId] = req.Weapon;
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
				if (req.OwnedWeapons != null && req.OwnedWeapons.Length == 5 &&
					req.Ammo != null && req.Ammo.Length == 5)
				{
					_playerWeapons[req.UserId] = (bool[])req.OwnedWeapons.Clone();
					_playerAmmo[req.UserId] = (int[])req.Ammo.Clone();
				}
				if (req.Health <= 0)
				{
					if (!_deadPlayerBodies.ContainsKey(req.UserId))
					{
						if (!_playerDeathBroadcasted.TryGetValue(req.UserId, out _))
						{
							string victimName = _playerUsername.GetOrAdd(req.UserId, $"Player{req.UserId}");
							BroadcastDeathMessage(req.UserId, req.PosX, req.PosZ, req.CarYaw, req.WorldId, "the world", victimName, "");
						}
					}
				}
				else if (req.Respawned)
				{
					// Genuine hospital respawn — clear the death guard so a future
					// death can broadcast again. Never clear it on plain positive
					// health reports: the police sim would otherwise re-broadcast
					// the same kill on every poll ("police killed player x10").
					_deadPlayerBodies.TryRemove(req.UserId, out _);
					_playerDeathBroadcasted.TryRemove(req.UserId, out _);
				}
				if (req.Respawned)
				{
					_playerWeapons[req.UserId] = new bool[5] { true, false, false, false, false };
					_playerAmmo[req.UserId] = new int[5];
				}
				if (!string.IsNullOrEmpty(req.ModelUrl)) _playerModelUrls[req.UserId] = req.ModelUrl!;
				if (req.IsShooting)
				{
					_shootingPlayers[req.UserId] = new PlayerShootState { DirX = (float)(Math.Sin(req.Yaw) * Math.Cos(req.Pitch)), DirY = (float)(-Math.Sin(req.Pitch)), DirZ = (float)(Math.Cos(req.Yaw) * Math.Cos(req.Pitch)), Weapon = req.Weapon, LastUpdated = DateTime.UtcNow };
					SimulateDamage(req);
				}
				else if (_shootingPlayers.TryGetValue(req.UserId, out var ps))
				{
					ps.LastUpdated = DateTime.UtcNow;
				}
				var cutoff = DateTime.UtcNow.AddMilliseconds(-500);
				foreach (var kv in _shootingPlayers) if (kv.Value.LastUpdated < cutoff) _shootingPlayers.TryRemove(kv.Key, out _);
				var chatMessages = new List<object>();
				if (!string.IsNullOrEmpty(req.ChatMessage))
				{
					if (!_playerUsername.ContainsKey(req.UserId))
						_playerUsername[req.UserId] = $"Player{req.UserId}";
					string senderUsername = _playerUsername[req.UserId];
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
					bool detected = false;
					if (_worldNpcs.TryGetValue(req.WorldId, out var npcs))
					{
						float px = req.PosX, pz = req.PosZ;
						foreach (var kv in npcs)
						{
							var npc = kv.Value;
							if (npc.DeadAt != null || npc.Health <= 0) continue;
							if (npc.TargetUserId != req.UserId) continue;
							if (npc.Type == "helicopter")
							{
								// A search heli re-spots the player from above within its sweep
								// radius — altitude line of sight is effectively unobstructed —
								// and radios the live position so ground units re-converge.
								if (npc.IsPoliceHeli && npc.IsSearching &&
									wantedLevel >= 3 &&
									(npc.X - px) * (npc.X - px) + (npc.Z - pz) * (npc.Z - pz) < HELI_SPOT_RADIUS * HELI_SPOT_RADIUS)
								{
									detected = true;
									_playerLastKnown[req.UserId] = (px, pz, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
								}
								continue;
							}
							if (npc.Type != "police" && npc.Type != "cop") continue;
							// A cop only counts as "detected" if it can actually see the player
							// (vision cone + line of sight), so sneaking behind a cop starts
							// the hidden clock instead of a telepathic 25-unit radius.
							if (CopSeesPlayer(npc, px, pz)) { detected = true; break; }
						}
					}
					if (detected)
					{
						_lastUndetectedTime[req.UserId] = DateTime.UtcNow;
					}
					else if (_lastUndetectedTime.TryGetValue(req.UserId, out var last))
					{
						// Accelerating decay: the longer the player stays hidden and
						// unseen, the faster each remaining star ticks down.
						double hidden = (DateTime.UtcNow - last).TotalSeconds - WANTED_DECAY_GRACE_SECONDS;
						if (hidden > 0)
						{
							int lvl = wantedLevel;
							double need = 0;
							int drops = 0;
							while (lvl > 0)
							{
								need += WANTED_STAR_SECONDS[lvl - 1];
								if (hidden < need) break;
								drops++;
								lvl--;
							}
							if (drops > 0)
							{
								int newWanted = Math.Max(0, wantedLevel - drops);
								_playerWantedLevels[req.UserId] = newWanted;
								// Fully clean — drop the hidden-time anchor so a later crime
								// never inherits this episode's hidden seconds, and stand down
								// any search heli still sweeping the area.
							if (newWanted == 0)
							{
								// Full escape: line of sight broken and the last star burned
								// off — the assault is forgotten. Drop the last-known anchor
								// so nothing re-dispatches to the old scene and release any
								// search heli; dispatched cruisers linger and patrol the old
							// scene for a short while before standing down to patrol.
							// Getting the heat to burn all the way off = a clean escape.
							_playerEscapes[req.UserId] = (_playerEscapes.TryGetValue(req.UserId, out var pe) ? pe : 0) + 1;
							ForgetPlayerCrime(req.UserId, req.WorldId, linger: true);
							}
							}
						}
					}
					else
					{
						_lastUndetectedTime[req.UserId] = DateTime.UtcNow;
					}
					// When ground pursuit is broken, a heli is dispatched to sweep the
					// last known area from above — it can still re-spot the player.
					if (!detected) MaybeDispatchSearchHelicopter(req.UserId, req.WorldId, DateTime.UtcNow);
					// Reflect any decayed value in this poll's response so the client's
					// HUD stars tick down immediately rather than a poll later.
					if (_playerWantedLevels.TryGetValue(req.UserId, out var w2)) wantedLevel = w2;
				}
				var players = new List<object>();
				var cutoffTime = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
				foreach (var kv in _lastSeen)
				{
					int otherUserId = kv.Key;
					if (otherUserId == req.UserId) continue;
					if (kv.Value < cutoffTime) continue;
					if (_playerWorldId.TryGetValue(otherUserId, out var owid) && owid != req.WorldId) continue;
					if (!_playerX.TryGetValue(otherUserId, out var ox)) continue;
					if (!_playerZ.TryGetValue(otherUserId, out var oz)) continue;
					if (!_playerUsername.TryGetValue(otherUserId, out var oName))
						oName = $"Player{otherUserId}";
					_playerPosY.TryGetValue(otherUserId, out var oy);
					_playerYaw.TryGetValue(otherUserId, out var oYaw);
					_playerPitch.TryGetValue(otherUserId, out var oPitch);
					_playerCarYaw.TryGetValue(otherUserId, out var oCarYaw);
					_playerCarSpeed.TryGetValue(otherUserId, out var oCarSpeed);
					_playerHealth.TryGetValue(otherUserId, out var oHealth);
					_playerMoney.TryGetValue(otherUserId, out var oMoney);
					players.Add(new
					{
						UserId = otherUserId,
						PosX = ox,
						PosY = oy,
						PosZ = oz,
						Yaw = oYaw,
						Pitch = oPitch,
						CarYaw = oCarYaw,
						CarSpeed = oCarSpeed,
						Health = oHealth,
						Weapon = 0,
						Money = oMoney,
						Username = oName,
						IsShooting = _shootingPlayers.ContainsKey(otherUserId),
						IsInCar = _playerInCar.TryGetValue(otherUserId, out var inCar) && inCar,
						VehicleType = _playerVehicleType.TryGetValue(otherUserId, out var vt) ? vt : "car",
						CarColorR = _playerCarColorR.TryGetValue(otherUserId, out var cr) ? cr : 1f,
						CarColorG = _playerCarColorG.TryGetValue(otherUserId, out var cg) ? cg : 1f,
						CarColorB = _playerCarColorB.TryGetValue(otherUserId, out var cb) ? cb : 1f,
						PassengerOfUserId = _playerPassengerOf.TryGetValue(otherUserId, out var pof) ? pof : 0
					});
				}
				if (_worldNpcs.ContainsKey(req.WorldId))
				{
					var npcs = _worldNpcs[req.WorldId];
					var now = DateTime.UtcNow;
					var simRng = new Random();
					const float simRadiusSq = 300f * 300f;
					foreach (var npc in npcs.Values)
					{
						if (npc.DeadAt.HasValue) continue;
						float sfdx = npc.X - req.PosX;
						float sfdz = npc.Z - req.PosZ;
						if (sfdx * sfdx + sfdz * sfdz > simRadiusSq) continue;
						float sepX = 0f, sepZ = 0f;
						float minSep = npc.Type == "cop" ? 3.5f : 2.0f;
						float minSepSq = minSep * minSep;
						foreach (var otherNpc in npcs.Values)
						{
							if (otherNpc.Id == npc.Id || otherNpc.DeadAt.HasValue) continue;
							float sdx = npc.X - otherNpc.X;
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
								// Ducking (gunfire reaction): hold position — no walking,
								// no new destination — until the duck timer expires.
								if (npc.IsDucking)
								{
									if (npc.DuckUntil.HasValue && now < npc.DuckUntil.Value)
									{
										npc.Speed = 0;
									}
									else
									{
										npc.IsDucking = false;
										npc.DuckUntil = null;
										npc.Speed = npc.PreDuckSpeed;
									}
								}
								if (!npc.IsDucking)
								{
								float dx = npc.TargetX - npc.X;
								float dz = npc.TargetZ - npc.Z;
								float dist = (float)Math.Sqrt(dx * dx + dz * dz);
								if (dist > 0.5f)
								{
									float moveX = (dx / dist) * npc.Speed * 0.1f;
									float moveZ = (dz / dist) * npc.Speed * 0.1f;
									float nextX = npc.X + moveX;
									float nextZ = npc.Z + moveZ;
									int simCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
									int simCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
									string simBiome = CityLayout.GetBiome(simCX, simCZ);
									bool simIsOcean = (simBiome == "ocean" || simBiome == "beach")
										&& !CityLayout.IsBridgeAtWorldPos(nextX, nextZ);
									bool isSimVehicle = npc.Type == "car" || npc.Type == "bus" || npc.Type == "taxi" || npc.Type == "police" || npc.Type == "bike" || npc.Type == "motorcycle";
									if (!simIsOcean && !CityLayout.IsBuildingAt(nextX, nextZ))
									{
										if (!isSimVehicle || CityLayout.IsRoadAt(nextX, nextZ))
										{
											npc.X = nextX;
											npc.Z = nextZ;
										}
									}
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
					}
					if (!npc.IsParked && (npc.Type == "helicopter" || npc.Type == "plane"))
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
							npc.IsSmoking = npc.Health > 0 && npc.Health <= npc.MaxHealth * 0.35;
							int fireThreshold = Math.Max(2, npc.MaxHealth / 100);
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
					if (serverHp <= 0)
					{
						bool hasDeadBody = _deadPlayerBodies.ContainsKey(req.UserId);
						if (req.Respawned || !hasDeadBody)
						{
							// Player is back (hospital respawn) or the stale death
							// state was cleaned up — restore them fully.										_playerHealth[req.UserId] = 100;
										_playerWantedLevels[req.UserId] = 0;
										// The death was the end of the chase — forget the crime
										// and stand the pursuit down along with the respawn.
										ForgetPlayerCrime(req.UserId, req.WorldId);
										_deadPlayerBodies.TryRemove(req.UserId, out _);
										yourHealth = 100;
						}
						else
						{
							// Dead server-side: report the truth so the client runs
							// its death sequence and hospital respawn. Reviving on
							// any positive report hid the death from the client AND
							// let the police re-broadcast the same kill each poll.
							yourHealth = 0;
						}
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
				int yourKills = _playerKills.TryGetValue(req.UserId, out var yk) ? yk : 0;
				bool arrestRegrabbed = _arrestRegrabNotified.TryRemove(req.UserId, out _);
				bool lethalForce = _lethalForceNotified.TryRemove(req.UserId, out _);
				return Ok(new { ok = true, players, wantedLevel, evicted, yourHealth, respawnAtHome, chatMessages, droppedWeapons = dw, ownedWeapons = pwArr, ammo = paArr, yourKills, newMoneyRecord = moneyRecord, arrested, arrestRespawn, arrestResisted, arrestRegrabbed, lethalForce });
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
			// Positions of active players in this world — culling must consider ALL
			// of them, not just the requesting player, so two players far apart
			// don't wipe each other's NPCs (shared world consistency).
			var activeCutoff = now.AddSeconds(-60);
			var activePlayers = new List<(float X, float Z)>();
			foreach (var pkv in _playerWorldId)
			{
				if (pkv.Value != worldId) continue;
				if (!_lastSeen.TryGetValue(pkv.Key, out var pseen) || pseen < activeCutoff) continue;
				if (!_playerX.TryGetValue(pkv.Key, out var apx) || !_playerZ.TryGetValue(pkv.Key, out var apz)) continue;
				activePlayers.Add((apx, apz));
			}
			foreach (var kv in npcs)
			{
				var npc = kv.Value;
				if (IsOpenOcean(npc.X, npc.Z) && npc.Type != "boat")
				{
					bool isPedestrian = npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop";
					bool isInvalidGroundEntity = npc.IsParked || IsGroundVehicle(npc.Type) || isPedestrian;
					if (isInvalidGroundEntity)
					{
						// Only a non-parked pedestrian in the shallow beach band may
						// remain in water; render it as swimming below the surface.
						if (!isPedestrian || npc.IsParked || !IsBeachAdjacentOcean(npc.X, npc.Z))
						{
							deadIds.Add(kv.Key);
							continue;
						}
						npc.IsSwimming = true;
					}
				}
				else if (!IsOpenOcean(npc.X, npc.Z))
				{
					npc.IsSwimming = false;
				}
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
					// A wanted cop must continue pursuing the player even when line of
					// sight is temporarily blocked by a building or a poll arrives at
					// a stale position. Keep the last-known target active; visibility
					// only controls whether the cop switches to search behavior.
					bool seesPlayer = CopSeesPlayer(npc, posX, posZ);
						if (seesPlayer)
						{
							// Spotted — refresh this cop's last-known and the shared
							// sighting, then chase the live position as before.
							npc.LastKnownX = posX;
							npc.LastKnownZ = posZ;
							npc.LastSeenAt = now;
							npc.IsSearching = false;
							npc.SearchStartedAt = null;
							_playerLastKnown[userId] = (posX, posZ, ((DateTimeOffset)now).ToUnixTimeMilliseconds());
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
										Health = 200,
										MaxHealth = 200,
										Cr = 0.1f,
										Cg = 0.1f,
										Cb = 0.2f,
									};
									npc.Type = "cop";
									npc.Speed = 5.0f;
									npc.ApproachAngle = (float)Math.Atan2(npc.X - posX, npc.Z - posZ);
									npc.HomeVehicleId = parkedId;
								}							}
							npc.TargetX = posX + (float)Math.Cos(npc.ApproachAngle) * COP_APPROACH_RADIUS;
							npc.TargetZ = posZ + (float)Math.Sin(npc.ApproachAngle) * COP_APPROACH_RADIUS;
						}
						else if (npc.LastSeenAt.HasValue)
						{
							// Lost sight — search the last known spot, but retain the
							// pursuit target so this unit can reacquire the player.

							if (!npc.IsSearching)
							{
								npc.IsSearching = true;
								npc.SearchStartedAt = now;
								npc.SearchStep = 0;
							}
							if ((now - (npc.SearchStartedAt ?? now)).TotalSeconds > COP_SEARCH_TIMEOUT_SECONDS)
							{
								// Gave up the search — release back to patrol instead of
								// telepathically homing in on the player.
								npc.TargetUserId = 0;
								npc.IsSearching = false;
								npc.LastSeenAt = null;
								npc.SearchStartedAt = null;
							}
							else
							{
								float ang = npc.SearchStep * (float)(Math.PI / 3.0);
								float rad = (npc.SearchStep % 2 == 0) ? COP_SEARCH_RADIUS : 0f;
								npc.TargetX = npc.LastKnownX + (float)Math.Cos(ang) * rad;
								npc.TargetZ = npc.LastKnownZ + (float)Math.Sin(ang) * rad;
							}
						}
						else if (npc.Type == "police")
						{
							// Dispatched but never saw the player — drive to the latest
							// sighting and search it once arrived.
							long nowMs = ((DateTimeOffset)now).ToUnixTimeMilliseconds();
							if (_playerLastKnown.TryGetValue(userId, out var sighting) && nowMs - sighting.AtMs < COP_LAST_KNOWN_MAX_AGE_SECONDS * 1000)
							{
								npc.LastKnownX = sighting.X;
								npc.LastKnownZ = sighting.Z;
								float ddx = npc.X - sighting.X;
								float ddz = npc.Z - sighting.Z;
								if (!npc.IsSearching && ddx * ddx + ddz * ddz < (COP_SEARCH_RADIUS * 1.5f) * (COP_SEARCH_RADIUS * 1.5f))
								{
									npc.IsSearching = true;
									npc.SearchStartedAt = now;
									npc.SearchStep = 0;
								}
								if (npc.IsSearching)
								{
									float ang = npc.SearchStep * (float)(Math.PI / 3.0);
									float rad = (npc.SearchStep % 2 == 0) ? COP_SEARCH_RADIUS : 0f;
									npc.TargetX = npc.LastKnownX + (float)Math.Cos(ang) * rad;
									npc.TargetZ = npc.LastKnownZ + (float)Math.Sin(ang) * rad;
									if ((now - (npc.SearchStartedAt ?? now)).TotalSeconds > COP_SEARCH_TIMEOUT_SECONDS)
									{
										npc.TargetUserId = 0;
										npc.IsSearching = false;
										npc.SearchStartedAt = null;
									}
								}
								else
								{
									npc.TargetX = sighting.X;
									npc.TargetZ = sighting.Z;
								}
							}
							else
							{
								npc.TargetX = posX;
								npc.TargetZ = posZ;
							}
						}
					}
					// Second attempt: if the player resisted this cop's grab and is still
					// wanted ~30s later, the same cop lunges for another grab — each
					// attempt books faster and the next resist costs more wanted stars.
					if (_playerResists.TryGetValue(userId, out var resist) && npc.Id == resist.CopId &&
						npc.TargetUserId == userId && wantedLevel > 0 && !_playerArrests.ContainsKey(userId) &&
						!IsLethalForce(userId) &&
						(now - resist.LastResistAt).TotalSeconds >= RESIST_REGRAB_DELAY_SECONDS)
					{
						float rdx = npc.X - posX;
						float rdz = npc.Z - posZ;
						if (rdx * rdx + rdz * rdz < RESIST_REGRAB_RANGE * RESIST_REGRAB_RANGE && IsPlayerOnFists(userId))
						{
							// Re-grab: shorter hold per escalation (the cop is done playing
							// nice), and the client gets a heads-up for the drama beat.
							float hold = Math.Max(1.5f, ARREST_HOLD_SECONDS - resist.Count);
							_playerArrests[userId] = new ArrestState { Until = now.AddSeconds(hold), X = posX, Z = posZ, CopId = npc.Id };
							npc.IsArresting = true;
							npc.ArrestTargetId = userId;
							npc.TargetX = posX;
							npc.TargetZ = posZ;
							_arrestRegrabNotified[userId] = true;
						}
					}
					// Post-escape linger: cruisers dispatched to the old crime scene
					// stay and patrol it for a short while after the player gets away,
					// so the stand-down reads gradual instead of the whole fleet
					// vanishing the instant the heat clears.
					if (npc.LingerUntil.HasValue && npc.TargetUserId == 0)
					{
						if (now >= npc.LingerUntil.Value)
						{
							// Linger window over — stand down to normal duties.
							npc.LingerUntil = null;
							StandDownPoliceUnit(npc, npcs, rng);
						}
						else
						{
							// Still warm: walk the same search laps a live hunt would
							// around the old last-known spot, stepping to the next
							// waypoint as the current one is reached.
							float ldx = npc.TargetX - npc.X;
							float ldz = npc.TargetZ - npc.Z;
							if (ldx * ldx + ldz * ldz < 4.0f)
							{
								npc.SearchStep = (npc.SearchStep + 1) % COP_SEARCH_STEPS;
							}
							float ang = npc.SearchStep * (float)(Math.PI / 3.0);
							float rad = (npc.SearchStep % 2 == 0) ? COP_SEARCH_RADIUS : 0f;
							npc.TargetX = npc.LastKnownX + (float)Math.Cos(ang) * rad;
							npc.TargetZ = npc.LastKnownZ + (float)Math.Sin(ang) * rad;
						}
					}
				}
				float dx = npc.X - posX;
				float dz = npc.Z - posZ;
				float distSq = dx * dx + dz * dz;
				// Cull only NPCs nobody in the world is near — removing based on the
				// requesting player alone would delete the scenery around other players.
				if (!npc.IsParked && !IsNearAnyPlayer(activePlayers, npc.X, npc.Z))
				{
					deadIds.Add(kv.Key);
					continue;
				}
				// Replenishment counts over the populated band (out to ~450 units),
				// not just the immediate ring, so distant roads stay alive.
				if (distSq < 202500f)
				{
					if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") nearbyPeds++;
					else if (npc.Type == "helicopter" || npc.Type == "plane") { }
					else if (!npc.IsParked) nearbyCars++;
				}
				// Send everything within the client's view distance (650 units) so
				// distant roads carry cars and pedestrians, not just empty mesh.
				if (distSq > 422500f) continue;
				if (npc.IsParked) { parkedCars.Add(new { id = npc.Id, posX = npc.X, posY = npc.Y, posZ = npc.Z, yaw = npc.Yaw, speed = 0f, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, health = npc.Health, isBurning = npc.OnFire, maxHealth = npc.MaxHealth, isSmoking = npc.IsSmoking }); continue; }
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
						npc.IsSmoking = npc.Health > 0 && npc.Health <= npc.MaxHealth * 0.35;
						int fireThreshold = Math.Max(2, npc.MaxHealth / 100);
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
							if (panicBiome != "ocean" && panicBiome != "beach" && !CityLayout.IsBuildingAt(fnextX, fnextZ) && CityLayout.IsRoadAt(fnextX, fnextZ)) { npc.X = fnextX; npc.Z = fnextZ; }
							npc.Yaw = (float)Math.Atan2(fmoveX, fmoveZ);
						}
					}
					else
					{
						npc.IsFleeing = false;
						if (npc.PrePanicSpeed > 0)
						{
							npc.Speed = npc.PrePanicSpeed;
							npc.PrePanicSpeed = 0;
						}
						int npcCX = (int)Math.Floor(npc.X / CityLayout.CHUNK_SIZE);
						int npcCZ = (int)Math.Floor(npc.Z / CityLayout.CHUNK_SIZE);
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
							if (fallbackBiome != "ocean" && fallbackBiome != "beach" && !CityLayout.IsBuildingAt(nextX, nextZ) && CityLayout.IsRoadAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
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
								// Post-escape linger: route toward the old scene so a lingering
								// cruiser patrols the area instead of a random route.
								int endIdx = npc.LingerUntil.HasValue
									? CityLayout.ClosestNodeArr(nodes, npc.TargetX, npc.TargetZ)
									: rng.Next(nodes.Length);
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
								bool lightStop = false;
								if (nextIdx != currIdx && distToTarget2 < INTERSECTION_RADIUS)
								{
									float nodeDx = nextNode.x - currNode.x;
									float nodeDz = nextNode.z - currNode.z;
									bool isHorizontal = Math.Abs(nodeDx) > Math.Abs(nodeDz);
									if (CityLayout.IsLightRedForX() == isHorizontal) lightStop = true;
								}
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
									if (npc.PathIdx + 1 >= npc.PathIndices.Count && CityLayout.GetAirportParkingPositions().Contains((currNode.x, currNode.z)))
									{
										npc.IsParked = true;
										npc.HasDriver = false;
										npc.Speed = 0;
										npc.PathIndices = null;
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
										// Post-escape linger: keep routed toward the old scene so
										// the cruiser patrols the area instead of wandering off.
										int newEnd = npc.LingerUntil.HasValue
											? CityLayout.ClosestNodeArr(nodes, npc.TargetX, npc.TargetZ)
											: rng.Next(nodes.Length);
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
									int nextCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
									int nextCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
									string nextBiome = CityLayout.GetBiome(nextCX, nextCZ);
									bool isOcean = (nextBiome == "ocean" || nextBiome == "beach") && !CityLayout.IsBridgeAtWorldPos(nextX, nextZ);
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
					// Drop the arrest grab pose once the booking is done (or the
					// player escaped the hold) — the cop returns to normal duty.
					if (npc.IsArresting && (!_playerArrests.ContainsKey((int)npc.ArrestTargetId) || wantedLevel == 0))
					{
						npc.IsArresting = false;
						npc.ArrestTargetId = 0;
					}
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
					// Brawl intervention: a free foot cop hears a fight nearby and jogs
					// over — pushing straight through the crowd, no road checks — then
					// scatters the fighters when it arrives. Pursuits take priority.
					bool copChasing = npc.TargetUserId == userId && wantedLevel > 0;
					bool breakingUp = npc.IsBreakingUpFight && npc.BreakUpUntil.HasValue && now < npc.BreakUpUntil.Value;
					if (!copChasing && !breakingUp && npc.HomeVehicleId == 0)
					{
						int fighters = 0;
						float fx = 0f, fz = 0f;
						float scanSq = COP_BREAKUP_SCAN_RADIUS * COP_BREAKUP_SCAN_RADIUS;
						foreach (var other in npcs.Values)
						{
							if (other.Id == npc.Id || other.DeadAt.HasValue) continue;
							if (other.Type != "ped_male" && other.Type != "ped_female") continue;
							if (!other.FightBackUntil.HasValue || !(now < other.FightBackUntil.Value)) continue;
							float fdx = other.X - npc.X;
							float fdz = other.Z - npc.Z;
							if (fdx * fdx + fdz * fdz > scanSq) continue;
							fighters++;
							fx += other.X;
							fz += other.Z;
						}
						if (fighters > 0)
						{
							npc.IsBreakingUpFight = true;
							npc.BreakUpUntil = now.AddSeconds(COP_BREAKUP_DURATION_SECONDS);
							npc.TargetX = fx / fighters;
							npc.TargetZ = fz / fighters;
							npc.Speed = COP_BREAKUP_JOG_SPEED;
						}
					}
					else if (!copChasing && breakingUp)
					{
						float bdx = npc.TargetX - npc.X;
						float bdz = npc.TargetZ - npc.Z;
						if (bdx * bdx + bdz * bdz < COP_BREAKUP_ARRIVE_DIST * COP_BREAKUP_ARRIVE_DIST)
						{
							// On the scene — every fighter in reach panics and sprints
							// away from the officer, ending the fight.
							float scatterSq = COP_BREAKUP_SCATTER_RADIUS * COP_BREAKUP_SCATTER_RADIUS;
							foreach (var other in npcs.Values)
							{
								if (other.DeadAt.HasValue) continue;
								if (other.Type != "ped_male" && other.Type != "ped_female") continue;
								if (!other.FightBackUntil.HasValue || !(now < other.FightBackUntil.Value)) continue;
								float fdx = other.X - npc.X;
								float fdz = other.Z - npc.Z;
								if (fdx * fdx + fdz * fdz > scatterSq) continue;
								other.FightBackUntil = null;
								other.TargetNpcId = 0;
								other.TargetUserId = 0;
								other.IsDucking = false;
								other.DuckUntil = null;
								other.PrePanicSpeed = other.Speed;
								other.PanicUntil = now.AddSeconds(6);
								other.PanicFromX = npc.X;
								other.PanicFromZ = npc.Z;
								other.Speed = Math.Max(other.Speed, 2.5f);
							}
							npc.IsBreakingUpFight = false;
							npc.BreakUpUntil = null;
							npc.Speed = 1.5f;
						}
						else if (npc.BreakUpUntil.HasValue && now >= npc.BreakUpUntil.Value)
						{
							// Never arrived (or the fight fizzled) — resume patrol.
							npc.IsBreakingUpFight = false;
							npc.BreakUpUntil = null;
							npc.Speed = 1.5f;
						}
					}
					if (distToTarget < 2.0f)
					{
						bool copSees = CopSeesPlayer(npc, posX, posZ);
							if (npc.TargetUserId == userId && wantedLevel > 0 && copSees)
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
							else if (npc.TargetUserId == userId && wantedLevel > 0 && npc.IsSearching)
							{
								// Reached a search waypoint — advance the patrol around
								// the last known spot (never the player's live position).
								npc.SearchStep = (npc.SearchStep + 1) % COP_SEARCH_STEPS;
								float ang = npc.SearchStep * (float)(Math.PI / 3.0);
								float rad = (npc.SearchStep % 2 == 0) ? COP_SEARCH_RADIUS : 0f;
								npc.TargetX = npc.LastKnownX + (float)Math.Cos(ang) * rad;
								npc.TargetZ = npc.LastKnownZ + (float)Math.Sin(ang) * rad;
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
							int copCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
							int copCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
							string copBiome = CityLayout.GetBiome(copCX, copCZ);
							if (copBiome != "ocean" && copBiome != "beach" && !CityLayout.IsBuildingAt(nextX, nextZ))
							{
								npc.X = nextX;
								npc.Z = nextZ;
							}
						}
						npc.IsShootingAt = false;
						if (npc.TargetUserId == userId && wantedLevel > 0 && npc.StationaryTime >= 3.5)
						{
							float sdx = npc.X - posX;
							float sdz = npc.Z - posZ;
							float sdistSq = sdx * sdx + sdz * sdz;
							if (sdistSq < 625f)
							{
								// Caught up close with fists drawn: the cop grabs and
								// arrests (a short grab-hold, then booked — weapons
								// stripped and respawn at the nearest police station).
								// Anyone holding a gun, or already being held, gets
								// shot. Drawing a weapon mid-hold resists the arrest
								// instead (wanted +2, cop opens fire).
								bool arrestActive = _playerArrests.ContainsKey(userId);
								// Short cooldown after a resist: the cop that just got fought off
								// can't instantly re-grab a player who holsters a second later —
								// he keeps shooting until the cooldown passes (the deterministic
								// second attempt still fires via the 30s re-grab).
								// Cooldown grows with each resist (8s → 12s → 16s), so repeated
								// escapes buy the player increasingly longer windows to flee
								// before the same cop can grab them again.
								bool resistCooldown = _playerResists.TryGetValue(userId, out var r2) && npc.Id == r2.CopId &&
									(now - r2.LastResistAt).TotalSeconds < ResistRegrabCooldown(r2.Count);
								if (resistCooldown)
								{
									// While the fought-off cop cools down he calls for backup —
									// units pull up at the scene the longer the player stalls.
									MaybeCallBackup(userId, worldId, npc.Id, npc.X, npc.Z, now, rng);
								}
								// After two resists the cops stop attempting arrests altogether —
								// no grab, no re-grab; the player is a lethal-force target.
								bool lethalForce = IsLethalForce(userId);
								if (!arrestActive && !resistCooldown && !lethalForce && IsPlayerOnFists(userId))
								{
									_playerArrests[userId] = new ArrestState { Until = now.AddSeconds(ARREST_HOLD_SECONDS), X = posX, Z = posZ, CopId = npc.Id };
									npc.IsArresting = true;
									npc.ArrestTargetId = userId;
									npc.TargetX = posX;
									npc.TargetZ = posZ;
								}
								else if (!arrestActive)
								{
									var nowMs = now.Ticks / TimeSpan.TicksPerMillisecond;
									// Lethal force: deadlier shots at a faster cadence.
									long shotInterval = lethalForce ? COP_LETHAL_INTERVAL_MS : COP_SHOT_INTERVAL_MS;										if (npc.LastShotTime == 0 || (nowMs - npc.LastShotTime) > shotInterval)
										{
											npc.LastShotTime = nowMs;
											npc.IsShootingAt = true;
										var damageDealt = lethalForce ? COP_LETHAL_DAMAGE : COP_SHOT_DAMAGE;
										if (_playerHealth.TryGetValue(userId, out var hp))
										{
											_playerHealth[userId] = (hp - damageDealt) >= 0 ? (hp - damageDealt) : 0;
										}
										else
										{
											_playerHealth[userId] = Math.Max(0, 100 - damageDealt);
										}
										if (_playerHealth[userId] <= 0)
										{
											BroadcastDeathMessage(userId, _playerX[userId], _playerZ[userId], null, 1, "police", _playerUsername[userId], "");
										}
										_lastPoliceDamageTime[userId] = nowMs;
									}									}
								}
							}
							else if (npc.Type == "helicopter" && npc.IsPoliceHeli && npc.TargetUserId == userId && wantedLevel >= 3)
							{
								var nowMs = now.Ticks / TimeSpan.TicksPerMillisecond;
								float hx = _playerX.TryGetValue(userId, out var hpx) ? hpx : posX;
								float hz = _playerZ.TryGetValue(userId, out var hpz) ? hpz : posZ;
								float hdx = hx - npc.X;
								float hdz = hz - npc.Z;
								float hdy = ( _playerPosY.TryGetValue(userId, out var hpy) ? hpy : 0f) + 1.0f - npc.Y;
								float hdist = (float)Math.Sqrt(hdx * hdx + hdy * hdy + hdz * hdz);
								if (hdist > 0.01f && (npc.LastShotTime == 0 || nowMs - npc.LastShotTime > HELI_SHOT_INTERVAL_MS))
								{
									npc.LastShotTime = nowMs;
									npc.IsShootingAt = true;
									if (_playerHealth.TryGetValue(userId, out var hp))
										_playerHealth[userId] = Math.Max(0, hp - HELI_SHOT_DAMAGE);
									_lastPoliceDamageTime[userId] = nowMs;
								}
							}
							const float copModelOffset = COP_MODEL_YAW_OFFSET;
							if (npc.TargetUserId == userId && wantedLevel > 0 && CopSeesPlayer(npc, posX, posZ))
								npc.Yaw = (float)Math.Atan2(posX - npc.X, posZ - npc.Z) + copModelOffset;
							else
								npc.Yaw = (float)Math.Atan2(tdx, tdz) + copModelOffset;
					}
				}
				else
				{
					if (npc.FightBackUntil.HasValue && now < npc.FightBackUntil.Value && npc.TargetUserId > 0 && _playerX.TryGetValue(npc.TargetUserId, out var fbx) && _playerZ.TryGetValue(npc.TargetUserId, out var fbz))
					{
						npc.IsShootingAt = false;
						float fdx = fbx - npc.X;
						float fdz = fbz - npc.Z;
						float fdist = (float)Math.Sqrt(fdx * fdx + fdz * fdz);
						const float PUNCH_RANGE = 1.7f;
						if (fdist > PUNCH_RANGE)
						{
							float chaseSpeed = npc.Speed * 1.6f;
							float mX = (fdx / fdist) * chaseSpeed * 0.5f;
							float mZ = (fdz / fdist) * chaseSpeed * 0.5f;
							float nX = npc.X + mX;
							float nZ = npc.Z + mZ;
							int fcX = (int)Math.Floor(nX / CityLayout.CHUNK_SIZE);
							int fcZ = (int)Math.Floor(nZ / CityLayout.CHUNK_SIZE);
							string fb = CityLayout.GetBiome(fcX, fcZ);
							if (fb != "ocean" && fb != "beach" && !CityLayout.IsBuildingAt(nX, nZ)) { npc.X = nX; npc.Z = nZ; }
							npc.Yaw = (float)Math.Atan2(mX, mZ);
						}
						else
						{
							npc.Yaw = (float)Math.Atan2(fdx, fdz);
							var nowMs = now.Ticks / TimeSpan.TicksPerMillisecond;
							if (npc.LastShotTime == 0 || (nowMs - npc.LastShotTime) > 700)
							{
								npc.LastShotTime = nowMs;
								npc.IsShootingAt = true;
							if (_playerHealth.TryGetValue(npc.TargetUserId, out var ph))
							{
								int nh = Math.Max(0, ph - 4);
								_playerHealth[npc.TargetUserId] = nh;
								if (nh <= 0)
									BroadcastDeathMessage(npc.TargetUserId, _playerX[npc.TargetUserId], _playerZ[npc.TargetUserId], null, 1, "ped", _playerUsername[npc.TargetUserId], "");
							}
							// A pedestrian is attacking — bystanders may pile onto the
							// fight's target (throttled so a brawl escalates gradually).
							if (npc.LastRallyTime == 0 || (nowMs - npc.LastRallyTime) > FIGHT_RALLY_COOLDOWN_MS)
							{
								npc.LastRallyTime = nowMs;
								RallyPedestriansAgainst(npcs, npc.TargetUserId, npc.X, npc.Z, now, npc.Id);
							}
						}
						}
					}
					else if (npc.FightBackUntil.HasValue && now < npc.FightBackUntil.Value && npc.TargetNpcId > 0
						&& npcs.TryGetValue(npc.TargetNpcId, out var targetNpc) && targetNpc.DeadAt == null && targetNpc.Health > 0)
					{
						// Ped-on-ped: this ped is swinging at another ped, not the
						// player. Same 1.7 range and 700ms cadence as the player
						// fight-back; the victim fights back at the attacker, so
						// brawls become genuine ped-vs-ped scuffles.
						npc.IsShootingAt = false;
						float fdx = targetNpc.X - npc.X;
						float fdz = targetNpc.Z - npc.Z;
						float fdist = (float)Math.Sqrt(fdx * fdx + fdz * fdz);
						const float PUNCH_RANGE = 1.7f;
						if (fdist > PUNCH_RANGE)
						{
							float chaseSpeed = npc.Speed * 1.6f;
							float mX = (fdx / fdist) * chaseSpeed * 0.5f;
							float mZ = (fdz / fdist) * chaseSpeed * 0.5f;
							float nX = npc.X + mX;
							float nZ = npc.Z + mZ;
							int fcX = (int)Math.Floor(nX / CityLayout.CHUNK_SIZE);
							int fcZ = (int)Math.Floor(nZ / CityLayout.CHUNK_SIZE);
							string fb = CityLayout.GetBiome(fcX, fcZ);
							if (fb != "ocean" && fb != "beach" && !CityLayout.IsBuildingAt(nX, nZ)) { npc.X = nX; npc.Z = nZ; }
							npc.Yaw = (float)Math.Atan2(mX, mZ);
						}
						else
						{
							npc.Yaw = (float)Math.Atan2(fdx, fdz);
							var nowMs = now.Ticks / TimeSpan.TicksPerMillisecond;
							if (npc.LastShotTime == 0 || (nowMs - npc.LastShotTime) > 700)
							{
								npc.LastShotTime = nowMs;
								npc.IsShootingAt = true;
								targetNpc.Health = Math.Max(0, targetNpc.Health - 4);
								if (targetNpc.Health <= 0)
								{
									targetNpc.DeadAt = now;
									targetNpc.FightBackUntil = null;
									targetNpc.TargetNpcId = 0;
									targetNpc.TargetUserId = 0;
									targetNpc.IsShootingAt = false;
									// The winner stands down and resumes its sidewalk routine.
									npc.FightBackUntil = null;
									npc.TargetNpcId = 0;
									npc.TargetUserId = 0;
									npc.IsShootingAt = false;
								}
								else if (!targetNpc.IsDucking)
								{
									// The victim fights back at whoever just hit it (a
									// ducking bystander stays down instead of swinging).
									targetNpc.FightBackUntil = now.AddSeconds(10);
									targetNpc.TargetNpcId = npc.Id;
									targetNpc.TargetUserId = 0;
								}
								// A ped brawling with another ped pulls more bystanders
								// into the scrum (throttled like the player rally).
								if (npc.LastRallyTime == 0 || (nowMs - npc.LastRallyTime) > FIGHT_RALLY_COOLDOWN_MS)
								{
									npc.LastRallyTime = nowMs;
									RallyPedestriansAgainstNpc(npcs, npc.Id, npc.X, npc.Z, now);
								}
							}
						}
					}
					else
					{
						if (npc.FightBackUntil.HasValue && now >= npc.FightBackUntil.Value)
						{
							npc.FightBackUntil = null;
							npc.TargetNpcId = 0;
							npc.TargetUserId = 0;
							npc.IsShootingAt = false;
						}
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
							float minSep = npc.Type == "cop" ? 3.5f : 2.0f;
							float minSepSq = minSep * minSep;
							foreach (var otherNpc in npcs.Values)
							{
								if (otherNpc.Id == npc.Id || otherNpc.DeadAt.HasValue) continue;
								float sdx = npc.X - otherNpc.X;
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
							float sepTargetX = npc.X + sepX * 0.05f;
							float sepTargetZ = npc.Z + sepZ * 0.05f;
							int sepCX = (int)Math.Floor(sepTargetX / CityLayout.CHUNK_SIZE);
							int sepCZ = (int)Math.Floor(sepTargetZ / CityLayout.CHUNK_SIZE);
							string sepBiome = CityLayout.GetBiome(sepCX, sepCZ);
							bool sepIsOcean = (sepBiome == "ocean" || sepBiome == "beach")
								&& !CityLayout.IsBridgeAtWorldPos(sepTargetX, sepTargetZ);
							if (!sepIsOcean && !CityLayout.IsBuildingAt(sepTargetX, sepTargetZ) && CityLayout.IsRoadAt(sepTargetX, sepTargetZ))
							{
								npc.X = sepTargetX;
								npc.Z = sepTargetZ;
							}
							moveX += sepX * 0.5f;
							moveZ += sepZ * 0.5f;
							float nextX = npc.X + moveX;
							float nextZ = npc.Z + moveZ;
							int pedCX = (int)Math.Floor(nextX / CityLayout.CHUNK_SIZE);
							int pedCZ = (int)Math.Floor(nextZ / CityLayout.CHUNK_SIZE);
							string pedBiome = CityLayout.GetBiome(pedCX, pedCZ);
							bool pedIsOcean = (pedBiome == "ocean" || pedBiome == "beach")
								&& !CityLayout.IsBridgeAtWorldPos(nextX, nextZ);
							if (!pedIsOcean && !CityLayout.IsBuildingAt(nextX, nextZ)) { npc.X = nextX; npc.Z = nextZ; }
							npc.Yaw = (float)Math.Atan2(moveX, moveZ);
						}
					}
				}
				var entry = new { id = npc.Id, posX = npc.X, posY = npc.Y, posZ = npc.Z, yaw = npc.Yaw, speed = npc.Speed, colorR = npc.Cr, colorG = npc.Cg, colorB = npc.Cb, type = npc.Type, gender = npc.Gender, health = npc.Health, hasDriver = npc.HasDriver, passengerCount = npc.PassengerCount, isShootingAt = npc.IsShootingAt, isBurning = npc.OnFire, maxHealth = npc.MaxHealth, isSmoking = npc.IsSmoking, isFleeing = npc.IsFleeing, isDucking = npc.IsDucking, isArresting = npc.IsArresting, isSwimming = npc.IsSwimming, targetNpcId = npc.TargetNpcId };
				if (npc.Type == "ped_male" || npc.Type == "ped_female" || npc.Type == "cop") pedestrians.Add(entry);
				else if (npc.Type == "helicopter" || npc.Type == "plane") aircraft.Add(entry);
				else cars.Add(entry);
			}
			foreach (var id in deadIds) npcs.TryRemove(id, out _);
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
			while (nearbyCars < 22)
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
					Health = type == "bike" || type == "motorcycle" ? 100 : 200,
					MaxHealth = type == "bike" || type == "motorcycle" ? 200 : 200,
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
			// Street patrol: a couple of foot officers wander the city so there's
			// always a cop nearby to break up brawls. They're pure patrol — they
			// never chase (dispatched units handle pursuits) — but they do keep
			// the player's heat from decaying while watching, like any cop.
			int ambientCops = 0;
			foreach (var kv in npcs) if (kv.Value.Type == "cop" && !kv.Value.DeadAt.HasValue && kv.Value.HomeVehicleId == 0) ambientCops++;
			while (ambientCops < AMBIENT_PATROL_COPS)
			{
				long id = GetNextNpcId();
				GetRandomSidewalkPointNearPlayer(posX, posZ, out float x, out float z, rng, minDist: 60f);
				npcs[id] = new NpcState
				{
					Id = id,
					Type = "cop",
					Gender = "male",
					X = x,
					Z = z,
					TargetX = x,
					TargetZ = z,
					Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
					Speed = 1.5f,
					Health = 100,
					MaxHealth = 100,
					Cr = 0.15f,
					Cg = 0.15f,
					Cb = 0.45f
				};
				ambientCops++;
			}
			int nearbyPolice = 0;
			foreach (var kv in npcs) if ((kv.Value.Type == "police" || kv.Value.Type == "cop") && kv.Value.TargetUserId == userId) nearbyPolice++;
			// Keep a meaningful pursuit force active after a pedestrian kill. The
			// requested player's wanted level can briefly lag the hit response, so
			// use the authoritative level and ensure at least one foot unit is
			// available for close interaction.
			int totalDesired = wantedLevel > 0 ? Math.Max(2, wantedLevel * 2) : 0;
			// Dispatch units to the last known sighting (the crime scene), never
			// the player's live position — no telepathic spawns on the hideout.
			float dispatchX = posX, dispatchZ = posZ;
			long dispatchMs = ((DateTimeOffset)now).ToUnixTimeMilliseconds();
			if (_playerLastKnown.TryGetValue(userId, out var lk) && dispatchMs - lk.AtMs < COP_LAST_KNOWN_MAX_AGE_SECONDS * 1000)
			{
				dispatchX = lk.X;
				dispatchZ = lk.Z;
			}
			while (wantedLevel > 0 && nearbyPolice < totalDesired)
			{
				long id = GetNextNpcId();
				GetRandomRoadPointNearPlayer(dispatchX, dispatchZ, out float x, out float z, rng, minDist: 150f);
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
					Health = 200,
					MaxHealth = 200,
					Cr = 0.1f,
					Cg = 0.1f,
					Cb = 0.2f,
					TargetUserId = userId,
					ApproachAngle = angle,
					LastKnownX = dispatchX,
					LastKnownZ = dispatchZ
				};
				nearbyPolice++;
			}
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
				while (parkedBoats < 5 && boatAttempts < 50)
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
			// Chance an NPC steals your car back (and sometimes rips you out and
			// fights). Runs after the per-NPC sim so it can spawn/hone a thug.
			MaybeStealBackCar(worldId, npcs, userId, posX, posZ, rng, now);
			var dw = BuildDroppedWeapons();
			return Ok(new { cars, pedestrians, parkedCars, aircraft, deadBodies, droppedWeapons = dw });
		}
		private static bool IsStealableCar(string? type)
		{
			switch (type)
			{
				case "taxi":
				case "police":
				case "boat":
				case "jet":
				case "plane":
				case "helicopter":
				case "bike":
				case "bicycle":
					return false;
				default:
					return type != null;
			}
		}

		private void ClearCarjackThief(int userId)
		{
			_stealBackThief.TryRemove(userId, out _);
			_stealBackChaseStartMs.TryRemove(userId, out _);
		}

		/// Spawn the player's stolen car back as a drivable NPC that drives off
		/// after a carjack — so the victim loses the car, not just the seat.
		private void SpawnCarjackedCar(int worldId, ConcurrentDictionary<long, NpcState> npcs, int userId, float px, float pz, Random rng)
		{
			_playerVehicleType.TryGetValue(userId, out var vt);
			_playerCarColorR.TryGetValue(userId, out var cr);
			_playerCarColorG.TryGetValue(userId, out var cg);
			_playerCarColorB.TryGetValue(userId, out var cb);
			GetRandomSidewalkPointNearPlayer(px, pz, out float tx, out float tz, rng, minDist: 28f);
			float dirX = tx - px, dirZ = tz - pz;
			long id = GetNextNpcId();
			npcs[id] = new NpcState
			{
				Id = id,
				Type = string.IsNullOrEmpty(vt) ? "car" : vt,
				IsParked = false,
				X = px,
				Y = 0f,
				Z = pz,
				TargetX = tx,
				TargetZ = tz,
				Yaw = (float)Math.Atan2(dirX, dirZ),
				Speed = 14f,
				Health = 200,
				MaxHealth = 200,
				Cr = cr,
				Cg = cg,
				Cb = cb,
				HasDriver = true,
				PassengerCount = 0,
				Gender = "male",
			};
		}

		/// Roll + drive the "NPC steals your car back" mechanic for one player on
		/// one NPC tick. Called from GetNPCs.
		private void MaybeStealBackCar(int worldId, ConcurrentDictionary<long, NpcState> npcs, int userId, float posX, float posZ, Random rng, DateTime now)
		{
			_playerInCar.TryGetValue(userId, out var inCar);
			if (!inCar) { ClearCarjackThief(userId); return; }
			_playerVehicleType.TryGetValue(userId, out var vehType);
			_playerCarSpeed.TryGetValue(userId, out var carSpeed);
			if (!IsStealableCar(vehType)) { ClearCarjackThief(userId); return; }

			long nowMs = now.Ticks / TimeSpan.TicksPerMillisecond;
			long thiefId = _stealBackThief.TryGetValue(userId, out var tid) ? tid : 0;

			if (thiefId != 0)
			{
				// Active thug: keep it homing on the (slow) car, or give up if the
				// chase drags on (player sped off or left the car).
				long chaseStart = _stealBackChaseStartMs.TryGetValue(userId, out var cs) ? cs : nowMs;
				if (!npcs.ContainsKey(thiefId) || carSpeed >= STEALBACK_SPEED_CAP || (nowMs - chaseStart) > STEALBACK_CHASE_TIMEOUT_MS)
				{
					ClearCarjackThief(userId);
					_stealBackNextMs[userId] = nowMs + STEALBACK_COOLDOWN_MS;
					return;
				}
				if (npcs.TryGetValue(thiefId, out var thief))
				{
					thief.TargetX = posX;
					thief.TargetZ = posZ;
					thief.Speed = STEALBACK_THIEF_SPEED;
					float tdx = posX - thief.X, tdz = posZ - thief.Z;
					float tdist = (float)Math.Sqrt(tdx * tdx + tdz * tdz);
					if (tdist <= STEALBACK_RANGE)
					{
						// Got you: pull the player out, take the car, and with a chance
						// rip them out and fight them too.
						_evictedPlayers[userId] = true;
						SpawnCarjackedCar(worldId, npcs, userId, posX, posZ, rng);
						if (rng.NextDouble() < STEALBACK_FIGHT_CHANCE)
						{
							// The thug also fights the now-on-foot player.
							thief.FightBackUntil = now.AddSeconds(STEALBACK_FIGHT_S);
							thief.TargetUserId = userId;
							thief.IsShootingAt = false;
						}
						else
						{
							// Just took the car — the thug strides off a normal ped.
							thief.FightBackUntil = null;
							thief.TargetUserId = 0;
							thief.IsShootingAt = false;
							GetRandomSidewalkPointNearPlayer(thief.X, thief.Z, out float wx, out float wz, rng);
							thief.TargetX = wx;
							thief.TargetZ = wz;
							thief.Speed = 2f;
						}
						ClearCarjackThief(userId);
						_stealBackNextMs[userId] = nowMs + STEALBACK_COOLDOWN_MS;
					}
				}
				else
				{
					ClearCarjackThief(userId);
				}
				return;
			}

			// No active thug: only carjack while the car is slow, and only roll
			// once the cooldown has passed.
			if (carSpeed >= STEALBACK_SPEED_CAP) return;
			if (_stealBackNextMs.TryGetValue(userId, out var next) && nowMs < next) return;
			if (rng.NextDouble() >= STEALBACK_CHANCE_PER_SEC) return;

			// Spawn a thug near the car and send it running over.
			float ang = (float)(rng.NextDouble() * Math.PI * 2);
			float dist = 4f + (float)rng.NextDouble() * 3f;
			float sx = posX + (float)Math.Cos(ang) * dist;
			float sz = posZ + (float)Math.Sin(ang) * dist;
			if (Math.Abs(sx - posX) > STEALBACK_MAX_DIST || Math.Abs(sz - posZ) > STEALBACK_MAX_DIST) return;
			string gen = rng.Next(2) == 0 ? "male" : "female";
			long id = GetNextNpcId();
			npcs[id] = new NpcState
			{
				Id = id,
				Type = "ped_" + gen,
				Gender = gen,
				X = sx,
				Y = 0f,
				Z = sz,
				TargetX = posX,
				TargetZ = posZ,
				Yaw = (float)Math.Atan2(posX - sx, posZ - sz),
				Speed = STEALBACK_THIEF_SPEED,
				Health = 100,
				Cr = 0.2f + (float)rng.NextDouble() * 0.5f,
				Cg = 0.2f + (float)rng.NextDouble() * 0.5f,
				Cb = 0.2f + (float)rng.NextDouble() * 0.5f,
			};
			_stealBackThief[userId] = id;
			_stealBackChaseStartMs[userId] = nowMs;
		}

		[HttpGet("activeplayers")]
		public IActionResult GetActivePlayers()
		{
			var cutoff = DateTime.UtcNow.AddMinutes(-5);
			var activePlayers = new List<User>();
			foreach (var kv in _lastSeen)
			{
				if (kv.Value >= cutoff)
					activePlayers.Add(new User(kv.Key));
			}
			return Ok(activePlayers);
		}
		[HttpGet("highscores")]
		public async Task<IActionResult> GetHighScores([FromQuery] string sort = "score", [FromQuery] int limit = 50, [FromQuery] int userId = 0)
		{
			string key = sort == "deaths" ? "deaths" : sort == "money" ? "money" : sort == "earned" ? "money_earned" : sort == "escapes" ? "escapes" : sort == "busted" ? "busted" : sort == "resists" ? "resists" : sort == "worst_streak" ? "worst_streak" : sort == "score" ? "score" : "kills";
			string sqlOrder = key == "score" ? "(s.kills * 100 + s.money)" : $"s.{key}";
			try
			{
				var rows = new List<HighScoreEntry>();
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				if (!string.IsNullOrEmpty(connStr))
				{
					using var conn = new MySqlConnection(connStr);
					await conn.OpenAsync();
					using var cmd = new MySqlCommand($@"
						SELECT s.user_id, COALESCE(u.username, 'Unknown') AS player_name, s.kills, s.deaths, s.money, s.money_earned, (s.kills * 100 + s.money) AS score, s.escapes, s.busted, s.resists, s.worst_streak
						FROM maxhanna.grandtheft_player_state s
						LEFT JOIN maxhanna.users u ON s.user_id = u.id
						WHERE s.kills > 0 OR s.deaths > 0 OR s.money > 0 OR s.money_earned > 0 OR s.escapes > 0 OR s.busted > 0 OR s.resists > 0 OR s.worst_streak > 0
						ORDER BY {sqlOrder} DESC, s.kills DESC
						LIMIT 1000", conn);
					using var rdr = await cmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						rows.Add(new HighScoreEntry
						{
							PlayerId = rdr.GetInt32(0),
							PlayerName = rdr.GetString(1),
							Kills = rdr.GetInt32(2),
							Deaths = rdr.GetInt32(3),
							Money = rdr.GetInt32(4),
							MoneyEarned = rdr.IsDBNull(5) ? 0 : rdr.GetInt32(5),
							Score = rdr.IsDBNull(6) ? 0 : (int)Math.Min(2_000_000_000, rdr.GetInt64(6)),
							Escapes = rdr.IsDBNull(7) ? 0 : rdr.GetInt32(7),
							Busted = rdr.IsDBNull(8) ? 0 : rdr.GetInt32(8),
							Resists = rdr.IsDBNull(9) ? 0 : rdr.GetInt32(9),
							WorstStreak = rdr.IsDBNull(10) ? 0 : rdr.GetInt32(10)
						});
					}
				}
				foreach (var r in rows)
				{
					if (_playerKills.TryGetValue(r.PlayerId, out var k)) r.Kills = k;
					if (_playerDeaths.TryGetValue(r.PlayerId, out var d)) r.Deaths = d;
					if (_playerEscapes.TryGetValue(r.PlayerId, out var e)) r.Escapes = e;
					if (_playerBusted.TryGetValue(r.PlayerId, out var b)) r.Busted = b;
					if (_playerResistsTotal.TryGetValue(r.PlayerId, out var rt)) r.Resists = rt;
					if (_playerWorstResistStreak.TryGetValue(r.PlayerId, out var ws)) r.WorstStreak = ws;
					if (_playerMoney.TryGetValue(r.PlayerId, out var m)) r.Money = m;
					if (_playerMoneyEarned.TryGetValue(r.PlayerId, out var me)) r.MoneyEarned = me;
				}
				foreach (var r in rows) r.Score = (int)Math.Min(2_000_000_000, (long)r.Kills * 100 + r.Money);
				int totalCount = rows.Count;
				rows = rows.OrderByDescending(r => key == "deaths" ? r.Deaths : key == "money" ? r.Money : key == "money_earned" ? r.MoneyEarned : key == "escapes" ? r.Escapes : key == "busted" ? r.Busted : key == "resists" ? r.Resists : key == "worst_streak" ? r.WorstStreak : key == "score" ? r.Score : r.Kills).ToList();
				int userRank = 0;
				if (userId > 0)
				{
					for (int i = 0; i < rows.Count; i++)
						if (rows[i].PlayerId == userId) { userRank = i + 1; break; }
				}
				rows = rows.Take(Math.Min(Math.Max(1, limit), 100)).ToList();
				return Ok(new { results = rows, totalCount, userRank, sort = key });
			}
			catch
			{
				return Ok(new { results = new List<HighScoreEntry>(), totalCount = 0, userRank = 0, sort = key });
			}
		}
		[HttpGet("jumps")]
		public async Task<IActionResult> GetJumps([FromQuery] int userId = 0)
		{
			try
			{
				var ramps = new List<object>();
				var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
				foreach (var r in JumpRamps)
				{
					double globalBest = 0; string globalHolder = "";
					double userBest = 0, userHeight = 0; int userReward = 0;
					if (!string.IsNullOrEmpty(connStr))
					{
						using var conn = new MySqlConnection(connStr);
						await conn.OpenAsync();
						using (var cmd = new MySqlCommand(@"
							SELECT s.best_distance, COALESCE(u.username, 'Unknown')
							FROM maxhanna.grandtheft_jump_scores s
							LEFT JOIN maxhanna.users u ON s.user_id = u.id
							WHERE s.ramp_id = @rid
							ORDER BY s.best_distance DESC LIMIT 1", conn))
						{
							cmd.Parameters.AddWithValue("@rid", r.Id);
							using var rdr = await cmd.ExecuteReaderAsync();
							if (await rdr.ReadAsync()) { globalBest = rdr.GetDouble(0); globalHolder = rdr.GetString(1); }
						}
						if (userId > 0)
						{
							using (var cmd2 = new MySqlCommand(@"
								SELECT best_distance, best_height, reward_total
								FROM maxhanna.grandtheft_jump_scores
								WHERE user_id = @uid AND ramp_id = @rid", conn))
							{
								cmd2.Parameters.AddWithValue("@uid", userId);
								cmd2.Parameters.AddWithValue("@rid", r.Id);
								using var rdr2 = await cmd2.ExecuteReaderAsync();
								if (await rdr2.ReadAsync()) { userBest = rdr2.GetDouble(0); userHeight = rdr2.GetDouble(1); userReward = rdr2.GetInt32(2); }
							}
						}
					}
					ramps.Add(new { id = r.Id, name = r.Name, globalBest = Math.Round(globalBest, 1), globalHolder, userBest = Math.Round(userBest, 1), userHeight = Math.Round(userHeight, 1), userReward });
				}
				return Ok(new { ramps });
			}
			catch { return Ok(new { ramps = new List<object>() }); }
		}
		[HttpPost("jump")]
		public async Task<IActionResult> SubmitJump([FromBody] GTJumpRequest req)
		{
			if (req.UserId <= 0 || req.RampId <= 0 || !JumpRamps.Any(r => r.Id == req.RampId) || req.Distance < 8 || req.Distance > 2000) return Ok(new { ok = false });
			try
			{
				var key = JumpKey(req.UserId, req.RampId);
				if (!_jumpScores.TryGetValue(key, out var score))
				{
					score = new JumpScore { UserId = req.UserId, RampId = req.RampId };
					var connStr0 = _config.GetValue<string>("ConnectionStrings:maxhanna");
					if (!string.IsNullOrEmpty(connStr0))
					{
						using var conn = new MySqlConnection(connStr0);
						await conn.OpenAsync();
						using var cmd = new MySqlCommand("SELECT best_distance, best_height, reward_total FROM maxhanna.grandtheft_jump_scores WHERE user_id = @uid AND ramp_id = @rid", conn);
						cmd.Parameters.AddWithValue("@uid", req.UserId);
						cmd.Parameters.AddWithValue("@rid", req.RampId);
						using var rdr = await cmd.ExecuteReaderAsync();
						if (await rdr.ReadAsync()) { score.BestDistance = rdr.GetDouble(0); score.BestHeight = rdr.GetDouble(1); score.RewardTotal = rdr.GetInt32(2); }
					}
					_jumpScores[key] = score;
				}
				double prevBest = score.BestDistance;
				bool isRecord = req.Distance > prevBest;
				int reward = 0;
				if (isRecord)
				{
					score.BestDistance = req.Distance;
					if (req.Height > score.BestHeight) score.BestHeight = req.Height;
					reward = Math.Min(50 + (int)(req.Distance * 3), 1000);
					score.RewardTotal += reward;
					var connStr = _config.GetValue<string>("ConnectionStrings:maxhanna");
					if (!string.IsNullOrEmpty(connStr))
					{
						using var conn = new MySqlConnection(connStr);
						await conn.OpenAsync();
						using var cmd = new MySqlCommand(@"
							INSERT INTO maxhanna.grandtheft_jump_scores (user_id, ramp_id, best_distance, best_height, reward_total, updated_at)
							VALUES (@uid, @rid, @dist, @hgt, @rew, UTC_TIMESTAMP())
							ON DUPLICATE KEY UPDATE best_distance = @dist, best_height = @hgt, reward_total = @rew, updated_at = UTC_TIMESTAMP()", conn);
						cmd.Parameters.AddWithValue("@uid", req.UserId);
						cmd.Parameters.AddWithValue("@rid", req.RampId);
						cmd.Parameters.AddWithValue("@dist", req.Distance);
						cmd.Parameters.AddWithValue("@hgt", req.Height);
						cmd.Parameters.AddWithValue("@rew", score.RewardTotal);
						await cmd.ExecuteNonQueryAsync();
					}
				}
				return Ok(new { ok = true, isRecord, reward, distance = req.Distance, height = req.Height, prevBest = Math.Round(prevBest, 1), bestDistance = Math.Round(score.BestDistance, 1) });
			}
			catch { return Ok(new { ok = false }); }
		}
		private List<object> BuildDroppedWeapons()
		{
			EnsureRandomWeaponDrops();
			var now = DateTime.UtcNow;
			var result = new List<object>();
			var expiredKeys = new List<long>();
			foreach (var kv in _droppedWeapons)
			{
				if ((now - kv.Value.DroppedAt).TotalSeconds > 30)
					expiredKeys.Add(kv.Key);
				else
					result.Add(new { id = kv.Key, posX = kv.Value.PosX, posZ = kv.Value.PosZ, weaponType = kv.Value.WeaponType, isRandom = kv.Value.IsRandom });
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
		private static void EnsureRandomWeaponDrops()
		{
			var activePlayers = new List<(float X, float Z)>();
			var activeCutoff = DateTime.UtcNow.AddMinutes(-5);
			foreach (var kv in _lastSeen)
			{
				if (kv.Value < activeCutoff) continue;
				if (!_playerX.TryGetValue(kv.Key, out var x) || !_playerZ.TryGetValue(kv.Key, out var z)) continue;
				activePlayers.Add((x, z));
			}
			if (activePlayers.Count == 0) return;

			lock (_randomWeaponSpawnLock)
			{
				int randomCount = _droppedWeapons.Values.Count(d => d.IsRandom);
				int targetCount = Math.Min(RANDOM_WEAPON_DROP_MAX, Math.Max(3, activePlayers.Count * 2));
				if (randomCount >= targetCount) return;
				var rng = Random.Shared;
				var existing = _droppedWeapons.Values.ToArray();
				int attempts = 0;
				while (randomCount < targetCount && attempts++ < 160)
				{
					var anchor = activePlayers[rng.Next(activePlayers.Count)];
					double angle = rng.NextDouble() * Math.PI * 2.0;
					float distance = 90f + (float)rng.NextDouble() * 230f;
					float x = anchor.X + (float)Math.Sin(angle) * distance;
					float z = anchor.Z + (float)Math.Cos(angle) * distance;
					if (IsWaterPosition(x, z) || CityLayout.IsBuildingAt(x, z, 3f)) continue;
					if (existing.Any(d =>
					{
						float dx = d.PosX - x;
						float dz = d.PosZ - z;
						return dx * dx + dz * dz < RANDOM_WEAPON_DROP_MIN_DISTANCE * RANDOM_WEAPON_DROP_MIN_DISTANCE;
					})) continue;
					int weaponType = 1 + rng.Next(4);
					int ammo = weaponType == 1 ? 15 : weaponType == 2 ? 30 : weaponType == 3 ? 10 : 5;
					var drop = new DroppedWeapon
					{
						Id = GetNextDropId(), PosX = x, PosZ = z,
						WeaponType = weaponType, Ammo = ammo,
						IsRandom = true, DroppedAt = DateTime.UtcNow
					};
					_droppedWeapons[drop.Id] = drop;
					existing = existing.Append(drop).ToArray();
					randomCount++;
				}
			}
		}
		private static bool IsWaterPosition(float x, float z)
		{
			int cx = (int)Math.Floor(x / CityLayout.CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CityLayout.CHUNK_SIZE);
			string biome = CityLayout.GetBiome(cx, cz);
			if (biome == "ocean") return true;
			if (biome != "rural_lakes") return false;
			float localX = x - cx * CityLayout.CHUNK_SIZE;
			float localZ = z - cz * CityLayout.CHUNK_SIZE;
			return Math.Abs(localX - 40f) <= 20f && Math.Abs(localZ - 40f) <= 20f;
		}
		private static bool IsOpenOcean(float x, float z)
			=> CityLayout.GetBiome((int)Math.Floor(x / CityLayout.CHUNK_SIZE), (int)Math.Floor(z / CityLayout.CHUNK_SIZE)) == "ocean";

		private static bool IsBeachAdjacentOcean(float x, float z)
		{
			int cx = (int)Math.Floor(x / CityLayout.CHUNK_SIZE);
			int cz = (int)Math.Floor(z / CityLayout.CHUNK_SIZE);
			if (!IsOpenOcean(x, z)) return false;
			float localX = x - cx * CityLayout.CHUNK_SIZE;
			float localZ = z - cz * CityLayout.CHUNK_SIZE;
			const float SWIM_BAND = 28f;
			return (CityLayout.GetBiome(cx - 1, cz) == "beach" && localX <= SWIM_BAND)
				|| (CityLayout.GetBiome(cx + 1, cz) == "beach" && localX >= CityLayout.CHUNK_SIZE - SWIM_BAND)
				|| (CityLayout.GetBiome(cx, cz - 1) == "beach" && localZ <= SWIM_BAND)
				|| (CityLayout.GetBiome(cx, cz + 1) == "beach" && localZ >= CityLayout.CHUNK_SIZE - SWIM_BAND);
		}

		private static bool IsGroundVehicle(string type)
			=> type == "car" || type == "bus" || type == "bike" || type == "motorcycle"
				|| type == "taxi" || type == "police";

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
					Health = type == "bike" || type == "motorcycle" ? 100 : 200,
					MaxHealth = type == "bike" || type == "motorcycle" ? 100 : 200,
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
		private void GetSafeGroundFallback(float px, float pz, Random rng, bool roadOnly, out float x, out float z)
		{
			int baseGx = (int)Math.Round(px / CityLayout.GRID_PITCH);
			int baseGz = (int)Math.Round(pz / CityLayout.GRID_PITCH);
			for (int radius = 0; radius < 30; radius++)
			{
				for (int gx = baseGx - radius; gx <= baseGx + radius; gx++)
				{
					for (int gz = baseGz - radius; gz <= baseGz + radius; gz++)
					{
						if (radius > 0 && Math.Abs(gx - baseGx) != radius && Math.Abs(gz - baseGz) != radius) continue;
						float candidateX = gx * CityLayout.GRID_PITCH;
						float candidateZ = gz * CityLayout.GRID_PITCH;
						string biome = CityLayout.GetBiome(gx, gz);
						if (biome == "ocean" || biome == "beach" || CityLayout.IsBuildingAt(candidateX, candidateZ)) continue;
						if (roadOnly && !CityLayout.IsRoadAt(candidateX, candidateZ)) continue;
						x = candidateX;
						z = candidateZ;
						return;
					}
				}
			}
			x = 120f;
			z = 40f;
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
			GetSafeGroundFallback(px, pz, rng, roadOnly: true, out x, out z);
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
				if (biome == "parking_lot")
				{
					x = gx * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
					z = gz * 80f + 40f + (float)(rng.NextDouble() - 0.5) * 60f;
					return;
				}
				if (CityLayout.IsBuildingAt(x, z) || CityLayout.IsRoadAt(x, z)) continue;
				if (minDist > 0f)
				{
					float ddx = x - px;
					float ddz = z - pz;
					if (ddx * ddx + ddz * ddz < minDist * minDist) continue;
				}
				return;
			}
			GetSafeGroundFallback(px, pz, rng, roadOnly: false, out x, out z);
		}
		private void SimulateAircraft(NpcState npc, DateTime now, Random rng)
		{
			if (npc.Type != "helicopter" && npc.Type != "plane") return;
			if (npc.IsParked) return;
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
						}				}
				break;
				case "search":
					{
						// Pursuit heli sweeping the player's last known spot: hold
						// altitude, fly in, then orbit with a sawtooth radius.
						npc.Y += (30f - npc.Y) * 0.03f;
						npc.IsParked = false;
						float sdx = npc.TargetX - npc.X;
						float sdz = npc.TargetZ - npc.Z;
						float sDist = (float)Math.Sqrt(sdx * sdx + sdz * sdz);
						if (sDist > 8f)
						{
							float ms = npc.Speed * 0.1f;
							npc.X += (sdx / sDist) * ms;
							npc.Z += (sdz / sDist) * ms;
							npc.Yaw = (float)Math.Atan2(sdx, sdz);
						}
						else
						{
							// Arrived over the search area — start the orbit clock and
							// hop between rim/center waypoints for a full sweep.
							if (!npc.SearchStartedAt.HasValue)
							{
								npc.SearchStartedAt = now;
								npc.PhaseStartedAt = now;
							}
							float ang = npc.SearchStep * (float)(Math.PI / 3.0);
							float rad = (npc.SearchStep % 2 == 0) ? HELI_SEARCH_RADIUS : HELI_SEARCH_RADIUS * 0.45f;
							npc.TargetX = npc.LastKnownX + (float)Math.Cos(ang) * rad;
							npc.TargetZ = npc.LastKnownZ + (float)Math.Sin(ang) * rad;
							npc.SearchStep = (npc.SearchStep + 1) % 12;
						}
						// Sweep finished — stand down and fly off as a regular heli.
						if (npc.SearchStartedAt.HasValue && (now - npc.PhaseStartedAt).TotalSeconds > HELI_SEARCH_TIMEOUT_SECONDS)
						{
							npc.AircraftPhase = "flying";
							npc.PhaseStartedAt = now;
							npc.IsPoliceHeli = false;
							npc.IsSearching = false;
							npc.TargetUserId = 0;
							npc.SearchStartedAt = null;
							GetRandomAeroportOrDistantPoint(npc.X, npc.Z, out float tx, out float tz, rng);
							npc.TargetX = tx;
							npc.TargetZ = tz;
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
		// Dispatches a pursuit helicopter when the player has broken ground pursuit
		// while still wanted. The heli sweeps the last known sighting from above and
		// can re-spot the player (and radio the live position to ground units).
		private static void MaybeDispatchSearchHelicopter(int userId, int worldId, DateTime now)
		{
			if (!_playerWantedLevels.TryGetValue(userId, out var wanted) || wanted < 3) return;
			if (!_worldNpcs.TryGetValue(worldId, out var npcs)) return;
			// A search heli is already on station for this user (only a live one —
			// a shot-down heli must not block re-dispatch).
			foreach (var kv in npcs)
			{
				if (kv.Value.Type == "helicopter" && kv.Value.IsPoliceHeli && kv.Value.TargetUserId == userId &&
					kv.Value.DeadAt == null && kv.Value.Health > 0) return;
			}
			// Respect the re-dispatch cooldown so a long hideout doesn't get a fresh
			// heli every poll after the previous one stands down.
			if (_lastHeliDispatch.TryGetValue(userId, out var lastDispatch) &&
				(now - lastDispatch).TotalSeconds < HELI_DISPATCH_COOLDOWN_SECONDS) return;
			_lastHeliDispatch[userId] = now;
			// Search the last known sighting, never the live position — no telepathic
			// spawns on the hideout.
			float sx, sz;
			if (!_playerX.TryGetValue(userId, out var px) || !_playerZ.TryGetValue(userId, out var pz)) return;
			sx = px; sz = pz;
			if (_playerLastKnown.TryGetValue(userId, out var lk))
			{
				long nowMs = ((DateTimeOffset)now).ToUnixTimeMilliseconds();
				if (nowMs - lk.AtMs < COP_LAST_KNOWN_MAX_AGE_SECONDS * 1000) { sx = lk.X; sz = lk.Z; }
			}
			var rng = new Random();
			float ang = (float)(rng.NextDouble() * Math.PI * 2.0);
			float hx = sx + (float)Math.Cos(ang) * HELI_DISPATCH_DISTANCE;
			float hz = sz + (float)Math.Sin(ang) * HELI_DISPATCH_DISTANCE;
			long id = GetNextNpcId();
			npcs[id] = new NpcState
			{
				Id = id,
				Type = "helicopter",
				X = hx,
				Y = 35f,
				Z = hz,
				TargetX = sx,
				TargetZ = sz,
				Yaw = (float)Math.Atan2(sx - hx, sz - hz),
				Speed = 12f,
				Health = 300,
				MaxHealth = 300,
				Cr = 0.35f,
				Cg = 0.4f,
				Cb = 0.55f,
				AircraftPhase = "search",
				PhaseStartedAt = now,
				TargetUserId = userId,
				IsPoliceHeli = true,
				IsSearching = true,
				SearchStep = 0,
				LastKnownX = sx,											LastKnownZ = sz
							};
		}
		// Releases any search heli sweeping for a user (e.g. heat fully cleared),
		// so it returns to normal flight and flies off instead of hovering forever.
		private static void ReleaseSearchHelicopters(int userId, int worldId)
		{
			if (!_worldNpcs.TryGetValue(worldId, out var npcs)) return;
			foreach (var kv in npcs)
			{
				var h = kv.Value;
				if (h.Type != "helicopter" || !h.IsPoliceHeli || h.TargetUserId != userId) continue;
				h.AircraftPhase = "flying";
				h.PhaseStartedAt = DateTime.UtcNow;
				h.IsPoliceHeli = false;
				h.IsSearching = false;
				h.TargetUserId = 0;
				h.SearchStartedAt = null;
			}
		}
		// Cop-witnessed crime escape: once the player has broken line of sight and
		// the wanted heat has fully decayed, the assault is forgotten. The
		// last-known sighting anchor is dropped (so nothing re-dispatches to the
		// old crime scene — no fresh cruisers or search helis for a stale crime),
		// the heli-dispatch cooldown resets for a future crime, and every police
		// unit still keyed to the player stands down. With `linger`, dispatched
		// cruisers don't vanish instantly — they stay and patrol the old scene for
		// a short while first, so the escape reads gradual instead of abrupt.
		private void ForgetPlayerCrime(int userId, int worldId, bool linger = false)
		{
			// Remember the old scene before dropping the anchor: lingering cruisers
			// patrol this spot while they stand down.
			_playerLastKnown.TryGetValue(userId, out var scene);
			_playerLastKnown.TryRemove(userId, out _);
			_lastUndetectedTime.TryRemove(userId, out _);
			_lastHeliDispatch.TryRemove(userId, out _);
			ResolveResistStreak(userId);
			_playerResists.TryRemove(userId, out _);
			_playerBackupCalls.TryRemove(userId, out _);
			_arrestRegrabNotified.TryRemove(userId, out _);
			_lethalForceNotified.TryRemove(userId, out _);
			if (!_worldNpcs.TryGetValue(worldId, out var npcs)) return;
			var lingerUntil = linger ? DateTime.UtcNow.AddSeconds(COP_LINGER_PATROL_SECONDS) : (DateTime?)null;
			var rng = new Random();
			foreach (var kv in npcs)
			{
				var npc = kv.Value;
				if (npc.Type == "helicopter" && npc.IsPoliceHeli && npc.TargetUserId == userId)
				{
					npc.AircraftPhase = "flying";
					npc.PhaseStartedAt = DateTime.UtcNow;
					npc.IsPoliceHeli = false;
					npc.IsSearching = false;
					npc.TargetUserId = 0;
					npc.SearchStartedAt = null;
					continue;
				}
				if ((npc.Type != "police" && npc.Type != "cop") || npc.TargetUserId != userId) continue;
				if (linger)
				{
					// The escape is real but the scene is still warm: drop the hot
					// pursuit yet keep the unit on scene, patrolling the old last-known
					// spot with search laps until the linger window elapses (the
					// GetNPCs poll stands it fully down then).
					npc.TargetUserId = 0;
					npc.LingerUntil = lingerUntil;
					npc.LastSeenAt = null;
					npc.IsSearching = true;
					npc.SearchStartedAt = DateTime.UtcNow;
					npc.SearchStep = 0;
					npc.LastKnownX = scene.X;
					npc.LastKnownZ = scene.Z;
					continue;
				}
				// Scrub every piece of chase state so the unit fully forgets the
				// player: no targeting, no search lap, no last-known spot, no sighting.
				StandDownPoliceUnit(npc, npcs, rng);
			}
		}
		// Send a police unit back to normal duties: a cruiser with a home car
		// heads back to it; a foot officer reverts to a civilian sidewalk
		// stroll; a stray cruiser picks a fresh road point to cruise on to.
		private void StandDownPoliceUnit(NpcState npc, ConcurrentDictionary<long, NpcState> npcs, Random rng)
		{
			npc.TargetUserId = 0;
			npc.IsSearching = false;
			npc.SearchStartedAt = null;
			npc.SearchStep = 0;
			npc.LastSeenAt = null;
			npc.LastKnownX = 0;
			npc.LastKnownZ = 0;
			if (npc.HomeVehicleId != 0 && npcs.TryGetValue(npc.HomeVehicleId, out var homeCar) && homeCar.IsParked)
			{
				npc.TargetX = homeCar.X;
				npc.TargetZ = homeCar.Z;
			}
			else
			{
				npc.HomeVehicleId = 0;
				if (npc.Type == "cop")
				{
					npc.Type = "ped_" + npc.Gender;
					GetRandomSidewalkPointNearPlayer(npc.X, npc.Z, out float sx, out float sz, rng);
					npc.TargetX = sx;
					npc.TargetZ = sz;
					npc.Speed = 2.0f;
				}
				else
				{
					GetRandomRoadPointNearPlayer(npc.X, npc.Z, out float rx, out float rz, rng, minDist: 60f);
					npc.TargetX = rx;
					npc.TargetZ = rz;
					npc.Speed = 10f;
				}
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
				Health = 200,
				MaxHealth = 200,
				Cr = req.ColorR,
				Cg = req.ColorG,
				Cb = req.ColorB,
				HasDriver = false,
				PassengerCount = 0
			};
			return Ok(new { ok = true, id });
		}
		[HttpPost("spawntaxi")]
		public IActionResult SpawnTaxi([FromBody] GTSpawnTaxiRequest req)
		{
			if (!_worldNpcs.ContainsKey(req.WorldId)) _worldNpcs[req.WorldId] = new ConcurrentDictionary<long, NpcState>();
			var npcs = _worldNpcs[req.WorldId];
			long id = GetNextNpcId();
			npcs[id] = new NpcState
			{
				Id = id,
				Type = "taxi",
				IsParked = false,
				X = req.PosX,
				Z = req.PosZ,
				Yaw = req.Yaw,
				TargetX = req.PosX,
				TargetZ = req.PosZ,
				Speed = 8f,
				Health = 200,
				MaxHealth = 200,
				Cr = 1f,
				Cg = 0.85f,
				Cb = 0.1f,
				HasDriver = true,
				PassengerCount = 0,
				Gender = "male"
			};
			return Ok(new { ok = true, id });
		}
		// Crowd combat: pedestrians near a fight may join in against the attacker.
		// The attacker is always a player id (peds only ever target players), so this
		// turns a single punch into an escalating street brawl — some witnesses flee,
		// some turn around and pile on.
		private static void RallyPedestriansAgainst(ConcurrentDictionary<long, NpcState> npcs, int attackerUserId, float attackerX, float attackerZ, DateTime now, long? excludeId = null)
		{
			if (attackerUserId <= 0) return;
			float radiusSq = FIGHT_JOIN_RADIUS * FIGHT_JOIN_RADIUS;
			int joined = 0;
			foreach (var kv in npcs)
			{
				if (joined >= FIGHT_JOIN_MAX) break;
				var ped = kv.Value;
				if (ped.Id == excludeId || ped.DeadAt.HasValue || ped.FightBackUntil.HasValue) continue;
				if (ped.Type != "ped_male" && ped.Type != "ped_female") continue;
				float dx = ped.X - attackerX;
				float dz = ped.Z - attackerZ;
				if (dx * dx + dz * dz > radiusSq) continue;
				if (Random.Shared.NextDouble() >= FIGHT_JOIN_CHANCE) continue;
				ped.PanicUntil = null;
				ped.PanicFromX = 0f;
				ped.PanicFromZ = 0f;
				ped.IsDucking = false; // a ducking bystander gets up to throw down
				ped.DuckUntil = null;
				ped.Speed = ped.PreDuckSpeed;
				// Genuine ped-on-ped brawls: roughly half the joiners square off
				// against a fellow brawler already in the fight instead of piling
				// onto the player, so a brawl spreads into a scrum of peds rather
				// than a single-target pile-on. Falls back to the player target
				// when no other brawler is in range yet.
				if (Random.Shared.NextDouble() < FIGHT_PED_TARGET_CHANCE)
				{
					long victimNpcId = PickBrawlVictim(npcs, ped.X, ped.Z, excludeId);
					if (victimNpcId > 0)
					{
						ped.TargetNpcId = victimNpcId;
						ped.TargetUserId = 0;
						ped.FightBackUntil = now.AddSeconds(10);
						joined++;
						continue;
					}
				}
				ped.TargetNpcId = 0;
				ped.TargetUserId = attackerUserId;
				ped.FightBackUntil = now.AddSeconds(10);
				joined++;
			}
		}

		// Same rally, but the target is another *ped* — a ped throwing punches
		// pulls bystanders into the scrum against the attacker, so ped-on-ped
		// fights spread just like fights against the player.
		private static void RallyPedestriansAgainstNpc(ConcurrentDictionary<long, NpcState> npcs, long attackerNpcId, float attackerX, float attackerZ, DateTime now)
		{
			if (attackerNpcId <= 0) return;
			float radiusSq = FIGHT_JOIN_RADIUS * FIGHT_JOIN_RADIUS;
			int joined = 0;
			foreach (var kv in npcs)
			{
				if (joined >= FIGHT_JOIN_MAX) break;
				var ped = kv.Value;
				if (ped.Id == attackerNpcId || ped.DeadAt.HasValue || ped.FightBackUntil.HasValue) continue;
				if (ped.Type != "ped_male" && ped.Type != "ped_female") continue;
				float dx = ped.X - attackerX;
				float dz = ped.Z - attackerZ;
				if (dx * dx + dz * dz > radiusSq) continue;
				if (Random.Shared.NextDouble() >= FIGHT_JOIN_CHANCE) continue;
				ped.PanicUntil = null;
				ped.PanicFromX = 0f;
				ped.PanicFromZ = 0f;
				ped.IsDucking = false;
				ped.DuckUntil = null;
				ped.Speed = ped.PreDuckSpeed;
				ped.TargetNpcId = attackerNpcId;
				ped.TargetUserId = 0;
				ped.FightBackUntil = now.AddSeconds(10);
				joined++;
			}
		}

		// A random brawling ped (an active FightBackUntil) within the rally radius
		// for a joiner to take on — the seed of a genuine ped-on-ped fight.
		private static long PickBrawlVictim(ConcurrentDictionary<long, NpcState> npcs, float fromX, float fromZ, long? excludeId)
		{
			float radiusSq = FIGHT_JOIN_RADIUS * FIGHT_JOIN_RADIUS;
			long[] candidates = npcs.Values
				.Where(p => p.Id != excludeId && !p.DeadAt.HasValue && p.FightBackUntil.HasValue
					&& (p.Type == "ped_male" || p.Type == "ped_female")
					&& (p.X - fromX) * (p.X - fromX) + (p.Z - fromZ) * (p.Z - fromZ) < radiusSq)
				.Select(p => p.Id)
				.ToArray();
			return candidates.Length == 0 ? 0 : candidates[Random.Shared.Next(candidates.Length)];
		}
		[HttpPost("hit")]
		public IActionResult Hit([FromBody] GTHitRequest req)
		{
			if (req.TargetId <= 0) return BadRequest(new { ok = false });
			var worldId = req.WorldId;
			// Resisting arrest: attacking anyone while a cop holds you aborts
			// the booking — the cop switches to shooting and the wanted level
			// jumps by 2 (the client unfreezes on the next poll's arrested=false).
			if (req.AttackerId > 0 && _playerArrests.TryGetValue(req.AttackerId, out var resistArrest))
			{
				_playerArrests.TryRemove(req.AttackerId, out _);
				// Escalation: same as the poll-side resist — recorded so the same cop
				// returns for another attempt, and the wanted jump grows each time.
				RecordResist(req.AttackerId, resistArrest.CopId);
				_lastUndetectedTime[req.AttackerId] = DateTime.UtcNow;
				_playerLastKnown[req.AttackerId] = (req.AttackerX, req.AttackerZ, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
			}
			var hitAnything = false;
			bool hitNpc = false;
			bool targetDied = false;
			float deathX = 0, deathZ = 0;
			int targetHealthResult = 0;
			if (_worldNpcs.ContainsKey(worldId))
			{
				var npcs = _worldNpcs[worldId];
				bool victimIsPed = false;
				foreach (var kv in npcs)
				{
					if (kv.Key == req.TargetId && kv.Value.Health > 0 && kv.Value.DeadAt == null)
					{
						kv.Value.Health -= req.Damage;
						hitAnything = true;
						hitNpc = true;
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
						if (targetDied && req.AttackerId > 0)
							_playerKills[req.AttackerId] = (_playerKills.TryGetValue(req.AttackerId, out var npcKills) ? npcKills : 0) + 1;
						bool isPedTarget = kv.Value.Type == "ped_male" || kv.Value.Type == "ped_female";
						victimIsPed = isPedTarget;
						bool isCopTarget = kv.Value.Type == "cop" || kv.Value.Type == "police";
						bool isAircraftTarget = kv.Value.Type == "helicopter" || kv.Value.Type == "plane";
						if (req.Weapon == 0 && isPedTarget && !isCopTarget && req.AttackerId > 0)
						{
							kv.Value.TargetUserId = req.AttackerId;
							kv.Value.TargetNpcId = 0; // the punched ped now fights the player, not another ped
							kv.Value.FightBackUntil = DateTime.UtcNow.AddSeconds(8);
							kv.Value.PanicUntil = null;
							kv.Value.IsDucking = false; // punched peds spring up and swing back
							kv.Value.DuckUntil = null;
						}
						else if (isVehicle && !isAircraftTarget && !isCopTarget && !kv.Value.IsParked && kv.Value.HasDriver && kv.Value.Speed <= 5.0f && req.AttackerId > 0)
						{
							bool attackerOnFoot = !(_playerInCar.TryGetValue(req.AttackerId, out var attackerInCar) && attackerInCar);
							if (!attackerOnFoot || Random.Shared.NextDouble() < 0.5)
							{
								kv.Value.PrePanicSpeed = kv.Value.Speed;
								kv.Value.PanicUntil = DateTime.UtcNow.AddSeconds(8);
								kv.Value.PanicFromX = req.AttackerX;
								kv.Value.PanicFromZ = req.AttackerZ;
								kv.Value.Speed = Math.Max(kv.Value.Speed, 14f);
								kv.Value.PathIndices = null;
								kv.Value.IsFleeing = true;
							}
							else
							{
								kv.Value.IsParked = true;
								kv.Value.HasDriver = false;
								kv.Value.Speed = 0;
								kv.Value.PathIndices = null;
								kv.Value.PanicUntil = null;
								kv.Value.IsFleeing = false;
								float bailX = kv.Value.X - (float)Math.Cos(kv.Value.Yaw) * 2.5f;
								float bailZ = kv.Value.Z - (float)Math.Sin(kv.Value.Yaw) * 2.5f;
								long bailerId = GetNextNpcId();
								string bailerGender = string.IsNullOrEmpty(kv.Value.Gender) ? "male" : kv.Value.Gender!;
								npcs[bailerId] = new NpcState
								{
									Id = bailerId,
									Type = "ped_" + bailerGender,
									Gender = bailerGender,
									X = bailX,
									Z = bailZ,
									TargetX = req.AttackerX,
									TargetZ = req.AttackerZ,
									Yaw = (float)Math.Atan2(req.AttackerX - bailX, req.AttackerZ - bailZ),
									Speed = 2.0f,
									Health = 50,
									MaxHealth = 50,
									Cr = 0.4f,
									Cg = 0.4f,
									Cb = 0.4f,
									TargetUserId = req.AttackerId,
									FightBackUntil = DateTime.UtcNow.AddSeconds(10)
								};
							}
						}
						else
						{
							kv.Value.PanicUntil = DateTime.UtcNow.AddSeconds(5);
							kv.Value.PanicFromX = req.AttackerX;
							kv.Value.PanicFromZ = req.AttackerZ;
						}
						break;
					}
				}
				{
					float panicRadius = 15f;
					float panicRadiusSq = panicRadius * panicRadius;
					bool gunfire = req.Weapon != 0;
					foreach (var kv in npcs)
					{
						if (kv.Value.DeadAt.HasValue || kv.Value.PanicUntil.HasValue || kv.Value.FightBackUntil.HasValue || kv.Value.IsParked || kv.Value.IsDucking) continue;
						float pdx = kv.Value.X - req.AttackerX;
						float pdz = kv.Value.Z - req.AttackerZ;
						if (pdx * pdx + pdz * pdz < panicRadiusSq)
						{
							// Weapon differentiation: gunfire scatters the crowd — some
							// sprint away, some duck and hold position instead. Fists
							// keep the all-flee panic (bystanders then pile into the
							// brawl via RallyPedestriansAgainst).
							bool isPed = kv.Value.Type == "ped_male" || kv.Value.Type == "ped_female";
							if (gunfire && isPed && Random.Shared.NextDouble() < 0.35)
							{
								kv.Value.IsDucking = true;
								kv.Value.DuckUntil = DateTime.UtcNow.AddSeconds(3.0 + Random.Shared.NextDouble() * 3.0);
								kv.Value.PreDuckSpeed = kv.Value.Speed;
								kv.Value.Speed = 0;
								kv.Value.PanicUntil = null;
								kv.Value.PanicFromX = 0f;
								kv.Value.PanicFromZ = 0f;
								kv.Value.IsFleeing = false;
							}
							else
							{
								kv.Value.PanicUntil = DateTime.UtcNow.AddSeconds(5);
								kv.Value.PanicFromX = req.AttackerX;
								kv.Value.PanicFromZ = req.AttackerZ;
							}
					}
				}
				// A fistfight draws a crowd: bystanders may pile on the attacker
				// instead of just fleeing (gunfire keeps the panic behavior).
				if (victimIsPed && req.AttackerId > 0 && req.Weapon == 0)
				{
					RallyPedestriansAgainst(npcs, req.AttackerId, req.AttackerX, req.AttackerZ, DateTime.UtcNow);
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
					if (req.AttackerId <= 0)
					{
						string victimName = _playerUsername.GetOrAdd(playerTargetId, $"Player{playerTargetId}");
						BroadcastDeathMessage(playerTargetId, deathX, deathZ, null, req.WorldId, "An NPC", victimName, " with a weapon");
					}
					else if (req.AttackerId != playerTargetId)
					{
						string victimName = _playerUsername.GetOrAdd(playerTargetId, $"Player{playerTargetId}");
						string killerName = _playerUsername.GetOrAdd(req.AttackerId, $"Player{req.AttackerId}");
						BroadcastDeathMessage(playerTargetId, deathX, deathZ, null, req.WorldId, killerName, victimName, " with a weapon");
						_playerKills[req.AttackerId] = (_playerKills.TryGetValue(req.AttackerId, out var pvpKills) ? pvpKills : 0) + 1;
					}
				}
			}
			// Client-local NPCs (ids the server never registered) report their own
			// killing blows here, so a murder still draws heat and counts toward
			// kill stats even though the server never saw the victim.
			if (!hitAnything && req.NpcKill && req.AttackerId > 0 && req.AttackerId != req.TargetId)
			{
				hitAnything = true;
				targetDied = true;
				_playerKills[req.AttackerId] = (_playerKills.TryGetValue(req.AttackerId, out var localKills) ? localKills : 0) + 1;
			}
			// A brawl with bare fists doesn't attract police attention — only the
			// killing blow does. Weapon fire is a witnessed event that moves the
			// dispatch point (last known sighting) to the shooter. PvP and
			// local-NPC kills (NpcKill sets targetDied) still draw heat. An
			// assault in plain sight of an officer is also witnessed: even a
			// bare-fisted non-lethal hit earns a wanted star when a cop has a
			// clear view of the scene (melee keeps attacker and victim adjacent,
			// so the attacker's position probes the cop's vision cone).
			bool witnessedByCop = hitAnything && req.AttackerId > 0 && req.Weapon == 0 && !targetDied
				&& _worldNpcs.TryGetValue(worldId, out var witnessNpcs)
				&& witnessNpcs.TryGetValue(req.TargetId, out var witnessVictim)
				&& (witnessVictim.Type == "ped_male" || witnessVictim.Type == "ped_female")
				&& AnyCopSeesPosition(witnessNpcs, req.AttackerX, req.AttackerZ);
			if (hitAnything && req.AttackerId > 0 && (req.Weapon != 0 || !hitNpc || targetDied || witnessedByCop))
			{
				if (_playerWantedLevels.TryGetValue(req.AttackerId, out var w))
					_playerWantedLevels[req.AttackerId] = Math.Min(5, w + 1);
				else
					_playerWantedLevels[req.AttackerId] = 1;
				_lastUndetectedTime[req.AttackerId] = DateTime.UtcNow;
				_playerLastKnown[req.AttackerId] = (req.AttackerX, req.AttackerZ, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
			}
			return Ok(new { ok = true, hit = hitAnything, targetHealth = targetHealthResult, targetDied = targetDied });
		}
		[HttpPost("robbery")]
		public IActionResult Robbery([FromBody] GTRobberyRequest req)
		{
			if (req.UserId <= 0) return BadRequest(new { ok = false, message = "invalid user" });
			// An armed stick-up is a witnessed crime: raise the wanted level and
			// record the store as the last known sighting so dispatched units
			// roll up on the scene (same dispatch path as any other heat).
			if (_playerWantedLevels.TryGetValue(req.UserId, out var w))
				_playerWantedLevels[req.UserId] = Math.Min(5, w + 2);
			else
				_playerWantedLevels[req.UserId] = 2;
			_lastUndetectedTime[req.UserId] = DateTime.UtcNow;
			_playerLastKnown[req.UserId] = (req.PosX, req.PosZ, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
			return Ok(new { ok = true, wantedLevel = _playerWantedLevels[req.UserId] });
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
	public class GrandTheftScoreRequest { public int UserId { get; set; } public int Score { get; set; } }		public class GTUpdatePositionRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public float PosX { get; set; } public float PosY { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float Pitch { get; set; } public float CarYaw { get; set; } public float CarSpeed { get; set; } public int Health { get; set; } = 100; public int Weapon { get; set; } = 0; public bool IsShooting { get; set; } public string? ModelUrl { get; set; } public int Money { get; set; } = 0; public bool IsInCar { get; set; } public string? VehicleType { get; set; } public float CarColorR { get; set; } = 1f; public float CarColorG { get; set; } = 1f; public float CarColorB { get; set; } = 1f; public int PassengerOfUserId { get; set; } = 0; public string? ChatMessage { get; set; } public bool Respawned { get; set; } public bool[]? OwnedWeapons { get; set; } public int[]? Ammo { get; set; } public int WantedLevel { get; set; } = 0; }
	public class GTShootRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; public int Weapon { get; set; } = 0; public float OriginX { get; set; } public float OriginY { get; set; } public float OriginZ { get; set; } public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } }
	public class GTHitRequest { public int AttackerId { get; set; } public long TargetId { get; set; } public int WorldId { get; set; } = 1; public int Damage { get; set; } = 10; public int Weapon { get; set; } = -1; public float AttackerX { get; set; } public float AttackerZ { get; set; } public bool NpcKill { get; set; } = false; }
	public class GTRobberyRequest { public int UserId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } }
	public class GTSpawnTaxiRequest { public int WorldId { get; set; } = 1; public float PosX { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } }
	public class GTJumpRequest { public int UserId { get; set; } public int RampId { get; set; } public double Distance { get; set; } public double Height { get; set; } }
	public class GTStealCarRequest { public int UserId { get; set; } public int WorldId { get; set; } = 1; }
	public class GTParkCarRequest { public int WorldId { get; set; } public float PosX { get; set; } public float PosZ { get; set; } public float Yaw { get; set; } public float ColorR { get; set; } public float ColorG { get; set; } public float ColorB { get; set; } public string? VehicleType { get; set; } }
	public class GTGarageRequest { public int UserId { get; set; } public string? VehicleType { get; set; } public float ColorR { get; set; } = 1f; public float ColorG { get; set; } = 1f; public float ColorB { get; set; } = 1f; public float Yaw { get; set; } = 0f; }
	public class GTGarageRemoveRequest { public int UserId { get; set; } }
	public class PlayerShootState { public float DirX { get; set; } public float DirY { get; set; } public float DirZ { get; set; } public int Weapon { get; set; } public DateTime LastUpdated { get; set; } }
	public class GTPickupRequest { public int UserId { get; set; } public long DropId { get; set; } }
}