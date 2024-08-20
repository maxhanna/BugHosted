using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Collections.Concurrent; 

namespace maxhanna.Server.Services
{
    public class NexusBuildingUpgradeBackgroundService : BackgroundService
    { 
        private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
        private readonly IConfiguration _config;
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<NexusController> _logger;
        private Timer _checkForNewUpgradesTimer;

        public NexusBuildingUpgradeBackgroundService(IConfiguration config)
        {
            _config = config;
            var serviceCollection = new ServiceCollection();
            ConfigureServices(serviceCollection);
            _serviceProvider = serviceCollection.BuildServiceProvider();
            _logger = _serviceProvider.GetRequiredService<ILogger<NexusController>>();
        }
      

        public void ScheduleUpgrade(int upgradeId, TimeSpan delay, Func<int, Task> callback)
        {
            if (_timers.ContainsKey(upgradeId))
            {
                 return;
            }
            var timer = new Timer(state =>
            {
                var id = (int)state;
                callback(id);
                _timers.TryRemove(id, out _);
            }, upgradeId, delay, Timeout.InfiniteTimeSpan);


            if (!_timers.TryAdd(upgradeId, timer))
            {
                // In case the upgradeId was added by another thread between the check and the add
                timer.Dispose();
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await LoadAndScheduleExistingUpgrades();

            _checkForNewUpgradesTimer = new Timer(
                async _ => await CheckForNewUpgrades(stoppingToken),
                null,
                TimeSpan.FromSeconds(15),
                TimeSpan.FromSeconds(15)
            ); 
        }
        private async Task CheckForNewUpgrades(CancellationToken stoppingToken)
        {
            _checkForNewUpgradesTimer?.Change(Timeout.Infinite, Timeout.Infinite); // Disable timer
            try
            {
                await LoadAndScheduleExistingUpgrades();
            }
            finally
            {
                if (!stoppingToken.IsCancellationRequested)
                {
                    _checkForNewUpgradesTimer?.Change(TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(15)); // Re-enable timer
                }
            } 
        }
        private async Task LoadAndScheduleExistingUpgrades()
        {
            List<int> upgradeIds = new List<int>();
            await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();

            string query = @"
                SELECT 
                    bu.id, bu.coords_x, bu.coords_y, 
                    bu.command_center_upgraded, bu.mines_upgraded, bu.supply_depot_upgraded, 
                    bu.factory_upgraded, bu.starport_upgraded, bu.warehouse_upgraded, bu.engineering_bay_upgraded,
                    b.command_center_level, b.mines_level, b.supply_depot_level, 
                    b.factory_level, b.starport_level, b.warehouse_level, b.engineering_bay_level,
                    scc.duration as command_center_duration, 
                    sm.duration as mines_duration, 
                    ssd.duration as supply_depot_duration,
                    sf.duration as factory_duration,
                    ss.duration as starport_duration,
                    sw.duration as warehouse_duration,
                    seb.duration as engineering_bay_duration
                FROM nexus_base_upgrades bu
                JOIN nexus_bases b ON bu.coords_x = b.coords_x AND bu.coords_y = b.coords_y
                LEFT JOIN nexus_base_upgrade_stats scc ON scc.building_type = 1 AND scc.building_level = b.command_center_level
                LEFT JOIN nexus_base_upgrade_stats sm ON sm.building_type = 5 AND sm.building_level = b.mines_level
                LEFT JOIN nexus_base_upgrade_stats ssd ON ssd.building_type = 2 AND ssd.building_level = b.supply_depot_level
                LEFT JOIN nexus_base_upgrade_stats sf ON sf.building_type = 3 AND sf.building_level = b.factory_level
                LEFT JOIN nexus_base_upgrade_stats ss ON ss.building_type = 4 AND ss.building_level = b.starport_level
                LEFT JOIN nexus_base_upgrade_stats sw ON sw.building_type = 6 AND sw.building_level = b.warehouse_level
                LEFT JOIN nexus_base_upgrade_stats seb ON seb.building_type = 7 AND seb.building_level = b.engineering_bay_level
                WHERE 
                    bu.command_center_upgraded IS NOT NULL OR bu.mines_upgraded IS NOT NULL OR 
                    bu.supply_depot_upgraded IS NOT NULL OR bu.factory_upgraded IS NOT NULL OR 
                    bu.starport_upgraded IS NOT NULL OR bu.warehouse_upgraded IS NOT NULL OR 
                    bu.engineering_bay_upgraded IS NOT NULL";

            await using var cmd = new MySqlCommand(query, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            var upgradeDetails = new Dictionary<int, Dictionary<string, (DateTime? timestamp, int duration)>>();

            while (await reader.ReadAsync())
            {
                int upgradeId = reader.GetInt32("id");
                var upgrades = new Dictionary<string, (DateTime? timestamp, int duration)>();

                if (reader["command_center_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("command_center_upgraded");
                    int duration = reader.GetInt32("command_center_duration");
                    upgrades["command_center"] = (timestamp, duration);
                }
                if (reader["mines_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("mines_upgraded");
                    int duration = reader.GetInt32("mines_duration");
                    upgrades["mines"] = (timestamp, duration);
                }
                if (reader["supply_depot_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("supply_depot_upgraded");
                    int duration = reader.GetInt32("supply_depot_duration");
                    upgrades["supply_depot"] = (timestamp, duration);
                }
                if (reader["factory_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("factory_upgraded");
                    int duration = reader.GetInt32("factory_duration");
                    upgrades["factory"] = (timestamp, duration);
                }
                if (reader["starport_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("starport_upgraded");
                    int duration = reader.GetInt32("starport_duration");
                    upgrades["starport"] = (timestamp, duration);
                }
                if (reader["warehouse_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("warehouse_upgraded");
                    int duration = reader.GetInt32("warehouse_duration");
                    upgrades["warehouse"] = (timestamp, duration);
                }
                if (reader["engineering_bay_upgraded"] != DBNull.Value)
                {
                    DateTime? timestamp = reader.GetDateTime("engineering_bay_upgraded");
                    int duration = reader.GetInt32("engineering_bay_duration");
                    upgrades["engineering_bay"] = (timestamp, duration);
                }

                if (upgrades.Count > 0)
                {
                    upgradeDetails[upgradeId] = upgrades;
                }
            }

            await reader.CloseAsync();
            await conn.CloseAsync();

            // Process each upgrade
            foreach (var (upgradeId, upgrades) in upgradeDetails)
            {
                foreach (var (upgradeType, details) in upgrades)
                {
                    if (details.timestamp.HasValue)
                    {
                        DateTime timestamp = details.timestamp.Value;
                        int duration = details.duration;

                        TimeSpan delay = timestamp.AddSeconds(duration) - DateTime.Now;

                        if (delay > TimeSpan.Zero)
                        {
                            ScheduleUpgrade(upgradeId, delay, ProcessUpgrade);
                        }
                        else
                        {
                            if (!upgradeIds.Contains(upgradeId))
                            {
                                upgradeIds.Add(upgradeId); 
                            }
                        }
                    }
                }
            }

            // Process upgrades that are already overdue
            foreach (var upgradeId in upgradeIds)
            {
                await ProcessUpgrade(upgradeId);
            }
        }


        private async Task ProcessUpgrade(int upgradeId)
        {
            Console.WriteLine($"Processing upgrade with ID: {upgradeId}"); 

            await using MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();  
            await using MySqlTransaction transaction = await conn.BeginTransactionAsync(); 
             

            try
            {
                // Load the NexusBase and pass it to UpdateNexusAttacks
                NexusBase? nexus = await GetNexusBaseByUpgradeId(upgradeId, conn, transaction);
                await transaction.CommitAsync();

                if (nexus != null)
                { 
                    // Instantiate the NexusController with the logger and configuration
                    var nexusController = new NexusController(_logger, _config);
                    await nexusController.UpdateNexusBuildings(nexus);
                }
                else
                {
                    Console.WriteLine($"No NexusBase found for attack ID: {upgradeId}");
                } 
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
                await transaction.RollbackAsync();
            } 
        }


        public async Task<NexusBase> GetNexusBaseByUpgradeId(int id, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            NexusBase tmpBase = new NexusBase();
            bool createdConnection = false;

            try
            {
                if (conn == null)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                    createdConnection = true;
                }

                string sqlBase =
                    @"SELECT * FROM maxhanna.nexus_bases n
                      LEFT JOIN maxhanna.nexus_base_upgrades a ON a.coords_x = n.coords_x AND a.coords_y = n.coords_y
                      WHERE a.id = @UpgradeId LIMIT 1;";

                using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction))
                {
                    cmdBase.Parameters.AddWithValue("@UpgradeId", id);

                    using (var readerBase = await cmdBase.ExecuteReaderAsync())
                    {
                        if (await readerBase.ReadAsync())
                        {
                            tmpBase = new NexusBase
                            {
                                User = new User(readerBase.IsDBNull(readerBase.GetOrdinal("user_id")) ? 0 : readerBase.GetInt32("user_id"), "Anonymous"),
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
                Console.WriteLine("Query ERROR: " + ex.Message);
            }
            finally
            {
                if (createdConnection && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return tmpBase;
        }


        private void ConfigureServices(IServiceCollection services)
        { 
            services.AddLogging(configure => configure.AddConsole())
                    .Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Information);
             
            services.AddSingleton<IConfiguration>(new ConfigurationBuilder()
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .Build()); 
        } 
         

        public override void Dispose()
        {
            foreach (var timer in _timers.Values)
            {
                timer.Dispose();
            }
            base.Dispose();
        }
    }
}