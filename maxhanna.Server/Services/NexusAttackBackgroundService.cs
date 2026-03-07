using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Collections.Concurrent;
using System.Threading.Channels;

namespace maxhanna.Server.Services
{
	public class NexusAttackBackgroundService : BackgroundService
	{
		private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
		private readonly ConcurrentDictionary<int, byte> _queuedAttacks = new ConcurrentDictionary<int, byte>();
		private readonly Channel<int> _attackChannel = Channel.CreateUnbounded<int>(new UnboundedChannelOptions { SingleReader = true });
		private readonly IConfiguration _config;
		private readonly string _connectionString; 
		private readonly Log _log;
		private Timer? _checkForNewAttacksTimer;

		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1);
		private static readonly SemaphoreSlim _loadLock = new SemaphoreSlim(1, 1);

		public NexusAttackBackgroundService(IConfiguration config, Log log)
		{
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? ""; 
			_log = log;
			// Use a channel to queue attacks and a single reader to avoid overlapping timer callbacks.
			// The channel reader is started in ExecuteAsync.
		}

		public void ScheduleAttack(int attackId, TimeSpan delay, Action<int> callback)
		{
			if (_timers.ContainsKey(attackId))
			{
				return;
			}

			// Cap delay to prevent Timer overflow (max ~24.8 days)
			if (delay > TimeSpan.FromMilliseconds(int.MaxValue - 1))
			{
				delay = TimeSpan.FromMilliseconds(int.MaxValue - 1);
			}

			var timer = new Timer(state =>
			{
				var id = state != null ? (int)state : -1;
				callback(id);
				_timers.TryRemove(id, out _);
			}, attackId, delay, Timeout.InfiniteTimeSpan);


			if (!_timers.TryAdd(attackId, timer))
			{
				// In case the upgradeId was added by another thread between the check and the add
				timer.Dispose();
			}
		}

		public void AddAttackToQueue(int attackId)
		{
			if (!_queuedAttacks.TryAdd(attackId, 0)) return;
			// Push into channel for processing; TryWrite avoids awaiting from timer callbacks
			_ = _attackChannel.Writer.TryWrite(attackId);
		}

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			try
			{
				await LoadAndScheduleExistingAttacks();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️NexusAttackBackgroundService initial load failed: {ex.Message}", null, "NABS", true);
			}

			_checkForNewAttacksTimer = new Timer(
					async _ => await CheckForNewAttacks(stoppingToken),
					null,
					TimeSpan.FromSeconds(20),
					TimeSpan.FromSeconds(20)
			);

			// Start channel reader to process queued attacks. Single reader prevents overlapping timer callbacks.
			_ = Task.Run(async () =>
			{
				var reader = _attackChannel.Reader;
				try
				{
					while (await reader.WaitToReadAsync(stoppingToken))
					{
						while (reader.TryRead(out var attackId))
						{
							// Run processing in background task; ProcessAttack itself uses semaphore to limit concurrency
							_ = Task.Run(async () =>
							{
								try
								{
									await ProcessAttack(attackId);
								}
								catch (Exception ex)
								{
									Console.WriteLine("Attack processing worker exception: " + ex.Message);
								}
							});
						}
					}
				}
				catch (OperationCanceledException) { }
			}, stoppingToken);
		}

		private async Task CheckForNewAttacks(CancellationToken stoppingToken)
		{
			_checkForNewAttacksTimer?.Change(Timeout.Infinite, Timeout.Infinite); // Disable timer
			try
			{
				await LoadAndScheduleExistingAttacks();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️NexusAttackBackgroundService CheckForNewAttacks failed: {ex.Message}", null, "NABS", true);
			}
			finally
			{
				if (!stoppingToken.IsCancellationRequested)
				{
					_checkForNewAttacksTimer?.Change(TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(20)); // Re-enable timer
				}
			}
		}

		private async Task LoadAndScheduleExistingAttacks()
		{
			if (!await _loadLock.WaitAsync(0)) return; // Skip if already loading
			try
			{
				var attacks = new List<(int attackId, TimeSpan delay)>();

				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				string query = "SELECT id, timestamp, duration FROM nexus_attacks_sent";
				await using var cmd = new MySqlCommand(query, conn);
				await using var reader = await cmd.ExecuteReaderAsync();

				while (await reader.ReadAsync())
				{
					int attackId = reader.GetInt32("id");
					DateTime timestamp = reader.GetDateTime("timestamp");
					int duration = reader.GetInt32("duration");

					TimeSpan delay = timestamp.AddSeconds(duration) - DateTime.Now;

					attacks.Add((attackId, delay));
				}
				await reader.CloseAsync();
				await conn.CloseAsync();
				foreach (var (attackId, delay) in attacks)
				{
					if (delay > TimeSpan.Zero)
					{
						ScheduleAttack(attackId, delay, AddAttackToQueue);
					}
					else
					{
						AddAttackToQueue(attackId);
					}
				}
			}
			finally
			{
				_loadLock.Release();
			}
		}

		public async Task<NexusBase?> GetNexusBaseByAttackId(int id)
		{
			NexusBase? tmpBase = null;

			try
			{
				await using MySqlConnection conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();


				string sqlBase =
						@"
                    SELECT * FROM maxhanna.nexus_bases n
                    LEFT JOIN maxhanna.nexus_attacks_sent a ON a.origin_coords_x = n.coords_x AND a.origin_coords_y = n.coords_y
                    LEFT JOIN maxhanna.nexus_attacks_sent b ON b.destination_coords_x = n.coords_x AND b.destination_coords_y = n.coords_y
                    WHERE a.id = @AttackId or b.id = @AttackId AND user_id IS NOT NULL LIMIT 1;";

				using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn))
				{
					cmdBase.Parameters.AddWithValue("@AttackId", id);

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
				Console.WriteLine("GetNexusBaseByAttackId Query ERROR: " + ex.Message);
			}

			return tmpBase;
		}
		 

		public async Task ProcessAttack(int attackId)
		{
			await _semaphore.WaitAsync();
			try
			{
				NexusBase? nexus = await GetNexusBaseByAttackId(attackId);
				if (nexus != null)
				{
					var nexusController = new NexusController(_log, _config);
					await nexusController.UpdateNexusAttacks(nexus);
				}
				else
				{
					_ = _log.Db($"No NexusBase found for attack ID: {attackId}", null, "NABS", true);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️ProcessAttack exception for ID {attackId}: {ex.Message}", null, "NABS", true);
			}
			finally
			{
				_queuedAttacks.TryRemove(attackId, out _);
				_semaphore.Release();
			}
		}


		public override void Dispose()
		{
			foreach (var timer in _timers.Values)
			{
				timer.Dispose();
			}
			_checkForNewAttacksTimer?.Dispose();
			// Complete the channel so the background reader can finish
			try { _attackChannel.Writer.Complete(); } catch { }
			_loadLock.Dispose();
			_semaphore.Dispose();
			base.Dispose();
		}
	}
}