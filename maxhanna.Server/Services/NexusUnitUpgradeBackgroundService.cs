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
        private readonly IConfiguration _config;
        private Timer _checkForNewUnitUpgradesTimer;
        private int timedCheckEveryXSeconds = 20;

        public NexusUnitUpgradeBackgroundService(IConfiguration config)
        { 
            _config = config;
        }

        public void ScheduleUpgrade(int upgradeId, TimeSpan delay, Action<int> callback)
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

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Load existing attacks from the database and schedule them
            Task.Run(() => LoadAndScheduleExistingUnitUpgrades(), stoppingToken);
            _checkForNewUnitUpgradesTimer = new Timer(CheckForNewUnitUpgrades, null, TimeSpan.FromSeconds(timedCheckEveryXSeconds), TimeSpan.FromSeconds(20));

            return Task.CompletedTask;
        }

        private async void CheckForNewUnitUpgrades(object state)
        { 
            await LoadAndScheduleExistingUnitUpgrades();
        }

        private async Task LoadAndScheduleExistingUnitUpgrades()
        {
            List<int> upgradeIds = new List<int>();
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                //Console.WriteLine("Checking for unit upgrades");
                await conn.OpenAsync();

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

                MySqlCommand cmd = new MySqlCommand(query, conn);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        int upgradeId = reader.GetInt32("id");
                        DateTime timestamp = reader.GetDateTime("timestamp");
                        int unitId = reader.GetInt32("unit_id_upgraded");
                        int totalDuration = reader.GetInt32("total_duration");
                        //Console.WriteLine($"Found ({upgradeId}) : {unitId} {totalDuration} {timestamp}");
                        TimeSpan delay = timestamp.AddSeconds(totalDuration) - DateTime.Now;
                        if (delay > TimeSpan.Zero)
                        {
                            //Console.WriteLine("scheduling this one for later");
                            ScheduleUpgrade(upgradeId, delay, ProcessUnitUpgrade);
                        }
                        else
                        {
                            upgradeIds.Add(upgradeId);
                        }
                    }
                }
            }
            foreach (var upgradeId in upgradeIds)
            { 
                //Console.WriteLine("Processing upgrade");
                ProcessUnitUpgrade(upgradeId);
            }
        }


        public async Task<NexusBase> GetNexusBaseByUnitUpgradeId(int id, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
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
                      LEFT JOIN maxhanna.nexus_unit_upgrades a ON a.coords_x = n.coords_x AND a.coords_y = n.coords_y
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
            // Configure logging
            services.AddLogging(configure => configure.AddConsole())
                    .Configure<LoggerFilterOptions>(options => options.MinLevel = LogLevel.Information);

            // Configure configuration
            services.AddSingleton<IConfiguration>(new ConfigurationBuilder()
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .Build()); 
        }

        public async void ProcessUnitUpgrade(int unitUpgradeId)
        {
            Console.WriteLine($"Processing unit upgrade with ID: {unitUpgradeId}");
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();
                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    try
                    {
                        // Load the NexusBase and pass it to UpdateNexusAttacks
                        NexusBase nexus = await GetNexusBaseByUnitUpgradeId(unitUpgradeId, conn, transaction);
                        if (nexus != null)
                        {
                            var serviceCollection = new ServiceCollection();
                            ConfigureServices(serviceCollection);
                            var serviceProvider = serviceCollection.BuildServiceProvider();

                            // Create the logger
                            var logger = serviceProvider.GetRequiredService<ILogger<NexusController>>();

                            // Create the configuration
                            var configuration = serviceProvider.GetRequiredService<IConfiguration>();

                            // Instantiate the NexusController with the logger and configuration
                            var nexusController = new NexusController(logger, configuration);
                            await nexusController.UpdateNexusUnitUpgradesCompletes(nexus);
                        }
                        else
                        {
                            Console.WriteLine($"No NexusBase found for unitUpgradeId: {unitUpgradeId}"); 
                        }
                        await transaction.CommitAsync();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine(ex.Message); 
                        await transaction.RollbackAsync();
                    }
                }
            }
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