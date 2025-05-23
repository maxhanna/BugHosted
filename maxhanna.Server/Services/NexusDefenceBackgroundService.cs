﻿using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Collections.Concurrent;

namespace maxhanna.Server.Services
{
	public class NexusDefenceBackgroundService : BackgroundService
	{
		private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
		private readonly ConcurrentQueue<int> _defenceQueue = new ConcurrentQueue<int>();

		private readonly string _connectionString;
		private readonly IConfiguration _config;
		// private readonly IServiceProvider? _serviceProvider;
		private readonly Log _log;
		private Timer? _checkForNewDefencesTimer;
		private Timer _processDefenceQueueTimer;

		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(10);

		public NexusDefenceBackgroundService(IConfiguration config, Log log)
		{
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			_config = config; 
			_log = log;
			_processDefenceQueueTimer = new Timer(ProcessDefenceQueue, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(100)); // Process queue every 0.1 seconds

		}
		// private void ConfigureServices(IServiceCollection services)
		// {
		// 	// Configure logging
		// 	services.AddLogging(configure => configure.AddConsole())
		// 					.Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Information);

		// 	// Configure configuration
		// 	services.AddSingleton<IConfiguration>(new ConfigurationBuilder()
		// 			.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
		// 			.Build());
		// }


		public void AddDefenceToQueue(int defenceId)
		{
			if (_defenceQueue.Contains(defenceId)) return;
			_defenceQueue.Enqueue(defenceId);
		}

		private async void ProcessDefenceQueue(object? state)
		{
			if (_defenceQueue.TryDequeue(out var defenceId))
			{
				await ProcessDefence(defenceId);
			}
		}

		public void ScheduleDefence(int defenceId, TimeSpan delay, Action<int> callback)
		{
			if (_timers.ContainsKey(defenceId))
			{
				return;
			}
			var timer = new Timer(state =>
			{
				var id = (state != null ? (int)state : -1);
				callback(id);
				_timers.TryRemove(id, out _);
			}, defenceId, delay, Timeout.InfiniteTimeSpan);

			//Console.WriteLine($"Defence scheduled for: {delay}");

			if (!_timers.TryAdd(defenceId, timer))
			{
				timer.Dispose(); // In case the upgradeId was added by another thread between the check and the add
			}
		}

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			await LoadAndScheduleExistingDefences();

			_checkForNewDefencesTimer = new Timer(
					async _ => await CheckForNewDefences(stoppingToken),
					null,
					TimeSpan.FromSeconds(20),
					TimeSpan.FromSeconds(20)
			);
		}


		private async Task CheckForNewDefences(CancellationToken stoppingToken)
		{
			_checkForNewDefencesTimer?.Change(Timeout.Infinite, Timeout.Infinite); // Disable timer
			try
			{
				await LoadAndScheduleExistingDefences();
			}
			finally
			{
				if (!stoppingToken.IsCancellationRequested)
				{
					_checkForNewDefencesTimer?.Change(TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(20)); // Re-enable timer
				}
			}
		}

		private async Task LoadAndScheduleExistingDefences()
		{
			await using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			const string query = "SELECT id, timestamp, duration FROM nexus_defences_sent WHERE arrived = 0";
			await using var cmd = new MySqlCommand(query, conn);
			await using var reader = await cmd.ExecuteReaderAsync();

			// Create a list to hold defence IDs and their delays
			var defences = new List<(int defenceId, TimeSpan delay)>();

			while (await reader.ReadAsync())
			{
				int defenceId = reader.GetInt32("id");
				DateTime timestamp = reader.GetDateTime("timestamp");
				int duration = reader.GetInt32("duration");

				TimeSpan delay = timestamp.AddSeconds(duration) - DateTime.Now;

				defences.Add((defenceId, delay));
			}
			await reader.CloseAsync();
			await conn.CloseAsync();

			// Process each defence based on its delay
			foreach (var (defenceId, delay) in defences)
			{
				if (delay > TimeSpan.Zero)
				{
					ScheduleDefence(defenceId, delay, AddDefenceToQueue);
				}
				else
				{

					AddDefenceToQueue(defenceId);
				}
			}
		}

		public async Task<NexusBase?> GetNexusBaseByDefenceId(int id)
		{
			NexusBase? tmpBase = null;

			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				const string sqlBase = @"
                    SELECT * FROM maxhanna.nexus_bases n
                    LEFT JOIN maxhanna.nexus_defences_sent a ON a.origin_coords_x = n.coords_x AND a.origin_coords_y = n.coords_y
                    LEFT JOIN maxhanna.nexus_defences_sent b ON b.destination_coords_x = n.coords_x AND b.destination_coords_y = n.coords_y
                    WHERE a.id = @DefenceId OR b.id = @DefenceId AND user_id IS NOT NULL LIMIT 1;";

				using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn))
				{
					cmdBase.Parameters.AddWithValue("@DefenceId", id);

					using (var readerBase = await cmdBase.ExecuteReaderAsync())
					{
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
				}
			}
			catch (Exception ex)
			{
				Console.WriteLine("GetNexusBaseByDefenceId Query ERROR: " + ex.Message);
			}

			return tmpBase;
		}
		public async Task ProcessDefence(int defenceId)
		{
			await _semaphore.WaitAsync(); 
			try
			{
				NexusBase? nexus = await GetNexusBaseByDefenceId(defenceId);
				if (nexus != null)
				{
					await ProcessUpdateNexusDefences(nexus);
				} 
			}
			catch (Exception ex)
			{
				_=_log.Db("Error processing defence." +ex.Message, null, "NDBS", true);
			}
			finally
			{
				_semaphore.Release();
			}
		}

		private async Task ProcessUpdateNexusDefences(NexusBase nexus)
		{ 
			var nexusController = new NexusController(_log, _config);
			await nexusController.UpdateNexusDefences(nexus);
		}

		public override void Dispose()
		{
			foreach (var timer in _timers.Values)
			{
				timer.Dispose();
			}
			_semaphore.Dispose();
			_checkForNewDefencesTimer?.Dispose();
			_processDefenceQueueTimer?.Dispose();
			base.Dispose();
		}
	}
}