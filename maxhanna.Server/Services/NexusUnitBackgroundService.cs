using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.Extensions.DependencyInjection;
using MySqlConnector;
using System.Collections.Concurrent; 

namespace maxhanna.Server.Services
{
    public class NexusUnitBackgroundService : BackgroundService
    {
        private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
        private readonly ConcurrentQueue<int> _unitPurchaseQueue = new ConcurrentQueue<int>(); // Queue for attack IDs

        private readonly IConfiguration _config;
        private readonly string _connectionString;
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<NexusController> _logger;

        private Timer _checkForNewUnitsTimer;
        private Timer _processUnitQueueTimer; // Timer to process the attack queue

        private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(10); // limit to 10 concurrent connections


        public NexusUnitBackgroundService(IConfiguration config)
        {
            _config = config;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
            var serviceCollection = new ServiceCollection();
            ConfigureServices(serviceCollection);
            _serviceProvider = serviceCollection.BuildServiceProvider();
            _logger = _serviceProvider.GetRequiredService<ILogger<NexusController>>();
            _processUnitQueueTimer = new Timer(ProcessUnitPurchaseQueue, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(300));  

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

        public void AddUnitPurchaseToQueue(int attackId)
        {
            if (_unitPurchaseQueue.Contains(attackId)) return;
            _unitPurchaseQueue.Enqueue(attackId);
        }

        private async void ProcessUnitPurchaseQueue(object state)
        {
            if (_unitPurchaseQueue.TryDequeue(out var attackId))
            {
                await ProcessPurchase(attackId);
            }
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
                if (_timers.TryRemove(id, out var removedTimer))
                {
                    removedTimer.Dispose();
                }
            }, purchaseId, delay, Timeout.InfiniteTimeSpan);


            if (!_timers.TryAdd(purchaseId, timer))
            { 
                timer.Dispose();  
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await LoadAndScheduleExistingPurchases(stoppingToken);

            _checkForNewUnitsTimer = new Timer(
                async _ => await CheckForNewPurchases(stoppingToken),
                null,
                TimeSpan.FromSeconds(20),
                TimeSpan.FromSeconds(20)
            ); 
        }

        private async Task CheckForNewPurchases(CancellationToken stoppingToken)
        {
            _checkForNewUnitsTimer?.Change(Timeout.Infinite, Timeout.Infinite);  
            try
            {
                await LoadAndScheduleExistingPurchases(stoppingToken);
            }
            finally
            {
                _checkForNewUnitsTimer?.Change(TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(20)); // Re-enable timer
            }
        }

        private async Task LoadAndScheduleExistingPurchases(CancellationToken stoppingToken)
        {
            await using var conn = new MySqlConnection(_connectionString);
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

            await using var cmd = new MySqlCommand(query, conn);
            await using var reader = await cmd.ExecuteReaderAsync(stoppingToken);

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
                    SchedulePurchase(purchaseId, delay, AddUnitPurchaseToQueue);
                }
                else
                {
                    AddUnitPurchaseToQueue(purchaseId); // Add to queue immediately if delay is in the past
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

        public async Task<NexusBase?> GetNexusBaseByPurchaseId(int id)
        {
            NexusBase? tmpBase = null;

            try
            {
                await using MySqlConnection conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync(); 

                string sqlBase =
                    @"SELECT * FROM maxhanna.nexus_bases n
                      LEFT JOIN maxhanna.nexus_unit_purchases a ON a.coords_x = n.coords_x AND a.coords_y = n.coords_y
                      WHERE a.id = @PurchaseId LIMIT 1;";

                using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn))
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

            return tmpBase;
        }
         
        public async Task ProcessPurchase(int purchaseId)
        {
            await _semaphore.WaitAsync(); // Wait for a free slot
            try
            {
                Console.WriteLine($"Processing purchase with ID: {purchaseId}");
                 
                NexusBase? nexus = await GetNexusBaseByPurchaseId(purchaseId);
                if (nexus != null)
                {
                    var nexusController = new NexusController(_logger, _config);
                    await nexusController.UpdateNexusUnitTrainingCompletes(nexus);
                }
                else
                {
                    Console.WriteLine($"No NexusBase found for purchase ID: {purchaseId}");
                } 
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error processing purchase! " + ex.Message);
            }
            finally
            {
                _semaphore.Release(); // Release the semaphore
            }
        }


        public override void Dispose()
        { 
            _processUnitQueueTimer?.Change(Timeout.Infinite, Timeout.Infinite);
            _checkForNewUnitsTimer?.Change(Timeout.Infinite, Timeout.Infinite);
            _processUnitQueueTimer?.Dispose();
            _checkForNewUnitsTimer?.Dispose();
            _semaphore.Dispose();
            foreach (var timer in _timers.Values)
            {
                timer.Dispose();
            }
            base.Dispose();
        }
    }
}