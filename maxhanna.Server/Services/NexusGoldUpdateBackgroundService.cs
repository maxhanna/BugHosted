using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Collections.Concurrent; 

namespace maxhanna.Server.Services
{
    public class NexusGoldUpdateBackgroundService : BackgroundService
    { 
        private readonly ConcurrentDictionary<int, Timer> _timers = new ConcurrentDictionary<int, Timer>();
        private readonly IConfiguration _config;
        private Timer _checkForNewBaseUpdates;


        public NexusGoldUpdateBackgroundService(IConfiguration config)
        { 
            _config = config;
        }
         

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Load existing attacks from the database and schedule them
            Task.Run(() => LoadAndScheduleExistingNexus(), stoppingToken);
            _checkForNewBaseUpdates = new Timer(CheckForNewUpdates, null, TimeSpan.FromSeconds(120), TimeSpan.FromSeconds(120));

            return Task.CompletedTask;
        }

        private async void CheckForNewUpdates(object state)
        { 
            await LoadAndScheduleExistingNexus();
        }

        private async Task LoadAndScheduleExistingNexus()
        {

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();
                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    var coordsList = new List<(int coordsX, int coordsY)>();

                    string query = @"
                        SELECT 
                            coords_x, coords_y, updated
                        FROM 
                            nexus_bases
                        WHERE
                            mines_level > 0 
                        AND updated < DATE_SUB(NOW(), INTERVAL 10 MINUTE);";

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
                    int limit = 10;

                    foreach (var (x, y) in coordsList.ToArray())
                    {
                        limit--;
                        await ProcessNexusGold(x, y, conn, transaction);
                        if (limit == 0)
                        {
                            break;
                        }
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

        public async Task<NexusBase> GetNexusBaseByCoords(int coordsX, int coordsY, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
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

                string sqlBase = "SELECT * FROM maxhanna.nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY LIMIT 1;";

                using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction))
                {
                    cmdBase.Parameters.AddWithValue("@CoordsX", coordsX);
                    cmdBase.Parameters.AddWithValue("@CoordsY", coordsY);

                    using (var readerBase = await cmdBase.ExecuteReaderAsync())
                    {
                        if (await readerBase.ReadAsync())
                        {
                            int? userId = readerBase.IsDBNull(readerBase.GetOrdinal("user_id")) ? 0 : readerBase.GetInt32("user_id");
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

        public async Task ProcessNexusGold(int coordsX, int coordsY, MySqlConnection conn, MySqlTransaction transaction)
        {
            //Console.WriteLine($"Processing ProcessNexusGold with coords: {coordsX},{coordsY}");

            try
            {
                // Load the NexusBase and pass it to UpdateNexusAttacks
                NexusBase nexus = await GetNexusBaseByCoords(coordsX,coordsY, conn, transaction);
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
                    //Console.WriteLine($"Updating gold automatically for nexus: {nexus.CoordsX}{nexus.CoordsY}");
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