using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Collections.Concurrent; 

namespace maxhanna.Server.Services
{
    public class NexusUnitBackgroundService : BackgroundService
    { 
        private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
        private readonly IConfiguration _config;
        private Timer _checkForNewUnitsTimer;


        public NexusUnitBackgroundService(IConfiguration config)
        { 
            _config = config;
        }

        public void SchedulePurchase(int purchaseId, TimeSpan delay, Action<int> callback)
        {
            if (_timers.ContainsKey(purchaseId))
            {
                return;
            }
            var timer = new Timer(state =>
            {
                var id = (int)state;
                callback(id);
                _timers.TryRemove(id, out _);
            }, purchaseId, delay, Timeout.InfiniteTimeSpan);


            if (!_timers.TryAdd(purchaseId, timer))
            {
                // In case the upgradeId was added by another thread between the check and the add
                timer.Dispose();
            }
        }

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Load existing attacks from the database and schedule them
            Task.Run(() => LoadAndScheduleExistingPurchases(), stoppingToken);
            _checkForNewUnitsTimer = new Timer(CheckForNewPurchases, null, TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(20));

            return Task.CompletedTask;
        }

        private async void CheckForNewPurchases(object state)
        { 
            await LoadAndScheduleExistingPurchases();
        }

        private async Task LoadAndScheduleExistingPurchases()
        {
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();

                string query = @"
                SELECT 
                    p.id, 
                    p.timestamp,
                    p.quantity_purchased,
                    s.duration,
                    b.marine_level, b.goliath_level, b.siege_tank_level, 
                    b.scout_level, b.wraith_level, b.battlecruiser_level, 
                    b.glitcher_level, p.unit_id_purchased
                FROM 
                    nexus_unit_purchases p
                JOIN 
                    nexus_bases b ON p.coords_x = b.coords_x AND p.coords_y = b.coords_y
                JOIN 
                    nexus_unit_stats s ON p.unit_id_purchased = s.unit_id";

                MySqlCommand cmd = new MySqlCommand(query, conn);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        int purchaseId = reader.GetInt32("id");
                        DateTime timestamp = reader.GetDateTime("timestamp");
                        int unitId = reader.GetInt32("unit_id_purchased");
                        int unitLevel = GetUnitLevel(reader, unitId);
                        int duration = reader.GetInt32("duration") * reader.GetInt32("quantity_purchased");

                        TimeSpan delay = timestamp.AddSeconds(duration) - DateTime.Now; 
                        if (delay > TimeSpan.Zero)
                        {
                            //Console.WriteLine("Purchase scheduled for: " + delay);
                            SchedulePurchase(purchaseId, delay, ProcessPurchase);
                        }
                        else
                        {
                            ProcessPurchase(purchaseId);
                        }
                    }
                }
            }
        }

        private int GetUnitLevel(MySqlDataReader reader, int unitId)
        {
            switch (unitId)
            {
                case 1: return reader.GetInt32("marine_level");
                case 2: return reader.GetInt32("goliath_level");
                case 3: return reader.GetInt32("siege_tank_level");
                case 4: return reader.GetInt32("scout_level");
                case 5: return reader.GetInt32("wraith_level");
                case 6: return reader.GetInt32("battlecruiser_level");
                case 7: return reader.GetInt32("glitcher_level");
                default: return 1;
            }
        } 

        public async Task<NexusBase> GetNexusBaseByPurchaseId(int id, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
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
                      LEFT JOIN maxhanna.nexus_unit_purchases a ON a.coords_x = n.coords_x AND a.coords_y = n.coords_y
                      WHERE a.id = @PurchaseId LIMIT 1;";

                using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction))
                {
                    cmdBase.Parameters.AddWithValue("@PurchaseId", id);

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

        public async void ProcessPurchase(int purchaseId)
        {
            Console.WriteLine($"Processing purchase with ID: {purchaseId}");
            try
            {
                using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                    {
                        try
                        {
                            // Load the NexusBase and pass it to UpdateNexusAttacks
                            NexusBase nexus = await GetNexusBaseByPurchaseId(purchaseId, conn, transaction);
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
                                await nexusController.UpdateNexusUnitTrainingCompletes(nexus);
                            }
                            else
                            {
                                Console.WriteLine($"No NexusBase found for attack ID: {purchaseId}");
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
            catch(Exception ex)
            {
                Console.WriteLine("Error processing purchase! " + ex.Message);
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