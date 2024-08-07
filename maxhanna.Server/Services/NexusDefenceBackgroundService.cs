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
        private readonly IConfiguration _config;
        private Timer _checkForNewDefencesTimer;


        public NexusDefenceBackgroundService(IConfiguration config)
        {
            _config = config;
        }

        public void ScheduleDefence(int defenceId, TimeSpan delay, Action<int> callback)
        {
            if (_timers.ContainsKey(defenceId))
            {
                return;
            }
            var timer = new Timer(state =>
            {
                var id = (int)state;
                callback(id);
                _timers.TryRemove(id, out _);
            }, defenceId, delay, Timeout.InfiniteTimeSpan);

            Console.WriteLine("defence scheduled for : " + delay);

            if (!_timers.TryAdd(defenceId, timer))
            {
                // In case the upgradeId was added by another thread between the check and the add
                timer.Dispose();
            }
        }

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Load existing attacks from the database and schedule them
            Task.Run(() => LoadAndScheduleExistingDefences(), stoppingToken);
            _checkForNewDefencesTimer = new Timer(CheckForNewDefences, null, TimeSpan.FromSeconds(20), TimeSpan.FromSeconds(20));

            return Task.CompletedTask;
        }
        private async void CheckForNewDefences(object state)
        {
            await LoadAndScheduleExistingDefences();
        }

        private async Task LoadAndScheduleExistingDefences()
        {
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();

                string query = "SELECT id, timestamp, duration FROM nexus_defences_sent where arrived = 0";
                MySqlCommand cmd = new MySqlCommand(query, conn);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        int attackId = reader.GetInt32("id");
                        DateTime timestamp = reader.GetDateTime("timestamp");
                        int duration = reader.GetInt32("duration");

                        TimeSpan delay = timestamp.AddSeconds(duration) - DateTime.Now;

                        if (delay > TimeSpan.Zero)
                        {
                            ScheduleDefence(attackId, delay, ProcessDefence);
                        }
                        else
                        {
                            // Process immediately if the attack is overdue
                            ProcessDefence(attackId);
                        }
                    }
                }
            }
        }

        public async Task<NexusBase> GetNexusBaseByDefenceId(int id, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
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
                    @"
                    SELECT * FROM maxhanna.nexus_bases n
                    LEFT JOIN maxhanna.nexus_defences_sent a ON a.origin_coords_x = n.coords_x AND a.origin_coords_y = n.coords_y
                    LEFT JOIN maxhanna.nexus_defences_sent b ON b.destination_coords_x = n.coords_x AND b.destination_coords_y = n.coords_y
                    WHERE a.id = @DefenceId or b.id = @DefenceId;";

                using (MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction))
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

        public async void ProcessDefence(int defenceId)
        {
            Console.WriteLine($"Processing defence with ID: {defenceId}");

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();
                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    try
                    {
                        // Load the NexusBase and pass it to UpdateNexusAttacks
                        NexusBase nexus = await GetNexusBaseByDefenceId(defenceId, conn, transaction);
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
                            await nexusController.UpdateNexusDefences(nexus);
                        }
                        else
                        {
                            Console.WriteLine($"No NexusBase found for defence ID: {defenceId}");
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