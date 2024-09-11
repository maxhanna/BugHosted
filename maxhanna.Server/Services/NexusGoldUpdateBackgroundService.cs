using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector; 

namespace maxhanna.Server.Services
{
    public class NexusGoldUpdateBackgroundService : BackgroundService
    {
        private readonly IConfiguration _config;
        private readonly string _connectionString;
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<NexusController> _logger;

        private Timer _checkForNewBaseUpdates; 

        private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(10);


        public NexusGoldUpdateBackgroundService(IConfiguration config)
        { 
            _config = config;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
            var serviceCollection = new ServiceCollection();
            ConfigureServices(serviceCollection);
            _serviceProvider = serviceCollection.BuildServiceProvider();
            _logger = _serviceProvider.GetRequiredService<ILogger<NexusController>>(); 
        }


        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Load existing attacks from the database and schedule them
            Task.Run(async () => await LoadAndScheduleExistingNexus(), stoppingToken)
                .ContinueWith(t =>
                {
                    if (t.Exception != null)
                    {
                        Console.WriteLine("UpdateGoldException!! " + t.Exception.Message);
                    }
                }, TaskContinuationOptions.OnlyOnFaulted);
            _checkForNewBaseUpdates = new Timer(CheckForNewUpdates, null, TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3));

            return Task.CompletedTask;
        } 

        private async void CheckForNewUpdates(object state)
        {
            _checkForNewBaseUpdates?.Change(Timeout.Infinite, Timeout.Infinite); // Disable timer
            try
            {
                await LoadAndScheduleExistingNexus();
            }
            finally
            {
                _checkForNewBaseUpdates?.Change(TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(3)); // Re-enable timer
            }
        }

        private async Task LoadAndScheduleExistingNexus()
        {

            using (MySqlConnection conn = new MySqlConnection(_connectionString))
            {
                await conn.OpenAsync();
                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    var coordsList = new List<(int coordsX, int coordsY)>();
                    int limit = 20;

                    string query = $@"
                        SELECT 
                            coords_x, coords_y, updated
                        FROM 
                            nexus_bases
                        WHERE
                            mines_level > 0 
                        AND updated < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                        ORDER BY updated ASC 
                        LIMIT {limit};";

                    MySqlCommand cmd = new MySqlCommand(query, conn, transaction);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            int coordsX = reader.GetInt32("coords_x");
                            int coordsY = reader.GetInt32("coords_y");
                            coordsList.Add((coordsX, coordsY));  
                        }
                    }

                    foreach (var (x, y) in coordsList.ToArray())
                    {
                        await Task.Delay(TimeSpan.FromMilliseconds(120)); 
                        await ProcessNexusGold(x, y, conn, transaction); 
                    }
                    await transaction.CommitAsync();
                }
            }
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

        public async Task<NexusBase?> GetNexusBaseByCoords(int coordsX, int coordsY, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            NexusBase? tmpBase = null;

            try
            {
                if (conn == null)
                {
                    await using var newConn = new MySqlConnection(_connectionString);
                    await newConn.OpenAsync();
                    conn = newConn;

                    tmpBase = await QueryNexusBaseAsync(coordsX, coordsY, conn, transaction);
                }
                else
                {
                    tmpBase = await QueryNexusBaseAsync(coordsX, coordsY, conn, transaction);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("GetNexusBaseByCoords Query ERROR: " + ex.Message);
            }

            return tmpBase;
        }

        private async Task<NexusBase?> QueryNexusBaseAsync(int coordsX, int coordsY, MySqlConnection conn, MySqlTransaction? transaction)
        {
            NexusBase? tmpBase = null;

            string sqlBase = "SELECT * FROM maxhanna.nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY LIMIT 1;";
            using var cmdBase = new MySqlCommand(sqlBase, conn, transaction);
            cmdBase.Parameters.AddWithValue("@CoordsX", coordsX);
            cmdBase.Parameters.AddWithValue("@CoordsY", coordsY);

            using var readerBase = await cmdBase.ExecuteReaderAsync();
            if (await readerBase.ReadAsync())
            {
                int? userId = readerBase.IsDBNull(readerBase.GetOrdinal("user_id")) ? (int?)null : readerBase.GetInt32("user_id");
                tmpBase = new NexusBase
                {
                    User = new User(userId ?? 0, "Anonymous"),
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

            return tmpBase;
        } 

        public async Task ProcessNexusGold(int coordsX, int coordsY, MySqlConnection conn, MySqlTransaction transaction)
        { 
            await _semaphore.WaitAsync(); 

            try
            { 
                NexusBase? nexus = await GetNexusBaseByCoords(coordsX,coordsY, conn, transaction);
                if (nexus != null)
                {
                    var nexusController = new NexusController(_logger, _config); 
                    await nexusController.UpdateNexusGold(nexus);
                }
                else
                {
                    Console.WriteLine($"No NexusBase found with coords: {coordsX},{coordsY}"); 
                } 
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);  
            }
            finally
            {
                _semaphore.Release();
            }
        } 
        public override void Dispose()
        {
            _checkForNewBaseUpdates?.Dispose();
            _semaphore.Dispose();
            base.Dispose();
        }
    }
}