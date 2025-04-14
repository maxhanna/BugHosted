using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Collections.Concurrent;

namespace maxhanna.Server.Services
{
	public class NexusUnitUpgradeBackgroundService : BackgroundService
	{
		private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
		private readonly ConcurrentQueue<int> _upgradeQueue = new ConcurrentQueue<int>();
		private readonly IConfiguration _config;
		private readonly string _connectionString;

		private readonly Log _log;
		private Timer _processUpgradeQueueTimer;
		private Timer _checkForNewUnitUpgradesTimer;
		private const int TimedCheckEveryXSeconds = 60;
		private const int QueueProcessingInterval = 5;
		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(10); // limit to 10 concurrent connections

		public NexusUnitUpgradeBackgroundService(IConfiguration config, Log log)
		{
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? ""; 
			_log = log;
			_checkForNewUnitUpgradesTimer = new Timer(ProcessQueue, null, TimeSpan.Zero, TimeSpan.FromSeconds(QueueProcessingInterval));
		}
		 
		public void ScheduleUpgrade(int upgradeId, TimeSpan delay, Action<int> callback)
		{
			if (_timers.ContainsKey(upgradeId))
			{
				return;
			}
			var timer = new Timer(state =>
			{
				var id = (state != null ? (int)state : -1);
				callback(id);
				_timers.TryRemove(id, out _);
			}, upgradeId, delay, Timeout.InfiniteTimeSpan);


			if (!_timers.TryAdd(upgradeId, timer))
			{
				timer.Dispose(); // In case the upgradeId was added by another thread between the check and the add
			}
		}
		public void EnqueueUpgrade(int upgradeId)
		{
			if (_upgradeQueue.Contains(upgradeId)) return;
			_upgradeQueue.Enqueue(upgradeId);
		}
		private void ProcessQueue(object state)
		{
			if (_upgradeQueue.TryDequeue(out int upgradeId))
			{
				ProcessUnitUpgrade(upgradeId);
			}
		}
		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			_checkForNewUnitUpgradesTimer = new Timer(
					async _ => await CheckForNewUnitUpgrades(stoppingToken),
					null,
					TimeSpan.FromSeconds(TimedCheckEveryXSeconds),
					TimeSpan.FromSeconds(TimedCheckEveryXSeconds)
			);
		}

		private async Task CheckForNewUnitUpgrades(CancellationToken stoppingToken)
		{
			_checkForNewUnitUpgradesTimer?.Change(Timeout.Infinite, Timeout.Infinite); // Disable timer
			try
			{
				await LoadAndScheduleExistingUnitUpgrades(stoppingToken);
			}
			finally
			{
				if (!stoppingToken.IsCancellationRequested)
				{
					_checkForNewUnitUpgradesTimer?.Change(TimeSpan.FromSeconds(TimedCheckEveryXSeconds), TimeSpan.FromSeconds(TimedCheckEveryXSeconds)); // Re-enable timer
				}
			}
		}

		private async Task LoadAndScheduleExistingUnitUpgrades(CancellationToken stoppingToken)
		{
			await using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync(stoppingToken);

				string query = @"
                    SELECT 
                        p.id, 
                        p.timestamp, 
                        p.unit_id_upgraded,
                        (us.duration * s.duration) as total_duration
                    FROM 
                        nexus_unit_upgrades p
                    JOIN 
                        nexus_bases b ON p.coords_x = b.coords_x AND p.coords_y = b.coords_y
                    JOIN 
                        nexus_unit_upgrade_stats us ON (
                            (p.unit_id_upgraded = 6 AND us.unit_level = b.marine_level) OR
                            (p.unit_id_upgraded = 7 AND us.unit_level = b.goliath_level) OR
                            (p.unit_id_upgraded = 8 AND us.unit_level = b.battlecruiser_level) OR
                            (p.unit_id_upgraded = 9 AND us.unit_level = b.wraith_level) OR
                            (p.unit_id_upgraded = 10 AND us.unit_level = b.siege_tank_level) OR
                            (p.unit_id_upgraded = 11 AND us.unit_level = b.scout_level) OR
                            (p.unit_id_upgraded = 12 AND us.unit_level = b.glitcher_level)
                        )
                    JOIN 
                        nexus_unit_stats s ON p.unit_id_upgraded = s.unit_id;";

				await using var cmd = new MySqlCommand(query, conn);
				await using var reader = await cmd.ExecuteReaderAsync(stoppingToken);

				while (await reader.ReadAsync(stoppingToken))
				{
					int upgradeId = reader.GetInt32("id");
					DateTime timestamp = reader.GetDateTime("timestamp");
					int unitId = reader.GetInt32("unit_id_upgraded");
					int totalDuration = reader.GetInt32("total_duration");

					//Console.WriteLine($"upgradeId {upgradeId} totalDuration {totalDuration} timestamp {timestamp} ");

					TimeSpan delay = timestamp.AddSeconds(totalDuration) - DateTime.Now;
					if (delay > TimeSpan.Zero)
					{
						//Console.WriteLine($"ScheduleUpgrade {upgradeId} delay {delay} "); 
						ScheduleUpgrade(upgradeId, delay, EnqueueUpgrade);
					}
					else
					{
						//Console.WriteLine($"EnqueueUpgrade {upgradeId} delay {delay} ");
						EnqueueUpgrade(upgradeId);
					}
				}
			}
		}


		public async Task<NexusBase?> GetNexusBaseByUnitUpgradeId(int id)
		{
			NexusBase? tmpBase = null;
			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				string sqlBase =
						@"SELECT * FROM maxhanna.nexus_bases n
                      LEFT JOIN maxhanna.nexus_unit_upgrades a ON a.coords_x = n.coords_x AND a.coords_y = n.coords_y
                      WHERE a.id = @UpgradeId LIMIT 1;";

				await using var cmdBase = new MySqlCommand(sqlBase, conn);
				cmdBase.Parameters.AddWithValue("@UpgradeId", id);

				await using var readerBase = await cmdBase.ExecuteReaderAsync();
				if (await readerBase.ReadAsync())
				{
					tmpBase = new NexusBase
					{
						User = new User(readerBase.GetInt32("user_id"), "Anonymous"),
						Gold = readerBase.IsDBNull(readerBase.GetOrdinal("gold")) ? 0 : readerBase.GetDecimal("gold"),
						Supply = readerBase.IsDBNull(readerBase.GetOrdinal("supply")) ? 0 : readerBase.GetInt32("supply"),
						CoordsX = readerBase.IsDBNull(readerBase.GetOrdinal("coords_x")) ? 0 : readerBase.GetInt32("coords_x"),
						CoordsY = readerBase.IsDBNull(readerBase.GetOrdinal("coords_y")) ? 0 : readerBase.GetInt32("coords_y"),
						CommandCenterLevel = readerBase.IsDBNull(readerBase.GetOrdinal("command_center_level")) ? 0 : readerBase.GetInt32("command_center_level"),
						MinesLevel = readerBase.IsDBNull(readerBase.GetOrdinal("mines_level")) ? 0 : readerBase.GetInt32("mines_level"),
						SupplyDepotLevel = readerBase.IsDBNull(readerBase.GetOrdinal("supply_depot_level")) ? 0 : readerBase.GetInt32("supply_depot_level"),
						EngineeringBayLevel = readerBase.IsDBNull(readerBase.GetOrdinal("engineering_bay_level")) ? 0 : readerBase.GetInt32("engineering_bay_level"),
						WarehouseLevel = readerBase.IsDBNull(readerBase.GetOrdinal("warehouse_level")) ? 0 : readerBase.GetInt32("warehouse_level"),
						FactoryLevel = readerBase.IsDBNull(readerBase.GetOrdinal("factory_level")) ? 0 : readerBase.GetInt32("factory_level"),
						StarportLevel = readerBase.IsDBNull(readerBase.GetOrdinal("starport_level")) ? 0 : readerBase.GetInt32("starport_level"),
						Conquered = readerBase.IsDBNull(readerBase.GetOrdinal("conquered")) ? DateTime.MinValue : readerBase.GetDateTime("conquered"),
						Updated = readerBase.IsDBNull(readerBase.GetOrdinal("updated")) ? DateTime.MinValue : readerBase.GetDateTime("updated"),
					};
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("GetNexusBaseByUnitUpgradeId Query ERROR: " + ex.Message, null, "NUUS", true);
			}

			return tmpBase;
		}


		public async void ProcessUnitUpgrade(int unitUpgradeId)
		{
			await _semaphore.WaitAsync(); 
			try
			{
				NexusBase? nexus = await GetNexusBaseByUnitUpgradeId(unitUpgradeId);
				if (nexus != null)
				{
					var nexusController = new NexusController(_log, _config);
					await nexusController.UpdateNexusUnitUpgradesCompletes(nexus);
				}
				else
				{
					_ = _log.Db($"No NexusBase found for unitUpgradeId: {unitUpgradeId}", null, "NUUS", true);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db(ex.Message, null, "NUUS", true);
			}
			finally
			{
				_semaphore.Release();
			}

		}


		public override void Dispose()
		{
			foreach (var timer in _timers.Values)
			{
				timer.Dispose();
			}
			_checkForNewUnitUpgradesTimer?.Dispose();
			_processUpgradeQueueTimer?.Dispose();
			_semaphore.Dispose();
			base.Dispose();
		}
	}
}