using maxhanna.Server.Controllers;

namespace maxhanna.Server.Services
{
	public class NexusGoldUpdateBackgroundService : BackgroundService
	{
		private readonly IConfiguration _config;
		// private readonly IServiceProvider? _serviceProvider;
		private readonly Log _log;

		private Timer? _checkForNewBaseUpdates;
		private int timerDuration = 20;

		private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(10);


		public NexusGoldUpdateBackgroundService(IConfiguration config, Log log)
		{
			_config = config; 
			_log = log;
		}


		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); // random initail delay
			_checkForNewBaseUpdates = new Timer(CheckForNewUpdates, null, TimeSpan.FromSeconds(timerDuration), TimeSpan.FromSeconds(timerDuration));
		}
		private async void CheckForNewUpdates(object? state)
		{
			_checkForNewBaseUpdates?.Change(Timeout.Infinite, Timeout.Infinite);
			try
			{
				await ProcessNexusGold();
			}
			finally
			{
				_checkForNewBaseUpdates?.Change(TimeSpan.FromSeconds(timerDuration), TimeSpan.FromSeconds(timerDuration));
			}
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

		public async Task ProcessNexusGold()
		{
			await _semaphore.WaitAsync();

			try
			{
				var nexusController = new NexusController(_log, _config);
				int basesUpdated = await nexusController.UpdateNexusGold();
				//Console.WriteLine($"Updated gold for {basesUpdated} bases.");
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