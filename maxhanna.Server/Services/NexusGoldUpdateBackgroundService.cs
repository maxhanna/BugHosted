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
		private static readonly SemaphoreSlim _loadLock = new SemaphoreSlim(1, 1);


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
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️NexusGoldUpdateBackgroundService CheckForNewUpdates failed: {ex.Message}", null, "NGUS", true);
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
			if (!await _loadLock.WaitAsync(0)) return; // Skip if already processing
			try
			{
				await _semaphore.WaitAsync();
				try
				{
					var nexusController = new NexusController(_log, _config);
					int basesUpdated = await nexusController.UpdateNexusGold();
				}
				catch (Exception ex)
				{
					_ = _log.Db($"⚠️NexusGoldUpdateBackgroundService ProcessNexusGold failed: {ex.Message}", null, "NGUS", true);
				}
				finally
				{
					_semaphore.Release();
				}
			}
			finally
			{
				_loadLock.Release();
			}
		}
		public override void Dispose()
		{
			_checkForNewBaseUpdates?.Dispose();
			_loadLock.Dispose();
			_semaphore.Dispose();
			base.Dispose();
		}
	}
}