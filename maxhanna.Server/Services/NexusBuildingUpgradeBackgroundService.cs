using maxhanna.Server.Controllers;

namespace maxhanna.Server.Services
{
	public class NexusBuildingUpgradeBackgroundService : BackgroundService
	{
		private readonly IConfiguration _config;
		// private readonly IServiceProvider _serviceProvider;
		private readonly Log _log;
		private Timer? _checkForNewUpgradesTimer;
		private static readonly SemaphoreSlim _loadLock = new SemaphoreSlim(1, 1);



		public NexusBuildingUpgradeBackgroundService(IConfiguration config, Log log)
		{
			_config = config;

			var serviceCollection = new ServiceCollection();
			ConfigureServices(serviceCollection);
			// _serviceProvider = serviceCollection.BuildServiceProvider();
			_log = log;
		}


		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

			_checkForNewUpgradesTimer = new Timer(
					async _ => await CheckForNewUpgrades(stoppingToken),
					null,
					TimeSpan.FromSeconds(1),
					TimeSpan.FromSeconds(1)
			);
		}
		private async Task CheckForNewUpgrades(CancellationToken stoppingToken)
		{
			_checkForNewUpgradesTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			try
			{
				await LoadAndScheduleExistingUpgrades();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️NexusBuildingUpgradeBackgroundService CheckForNewUpgrades failed: {ex.Message}", null, "NBUS", true);
			}
			finally
			{
				if (!stoppingToken.IsCancellationRequested)
				{
					_checkForNewUpgradesTimer?.Change(TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
				}
			}
		}
		private async Task LoadAndScheduleExistingUpgrades()
		{
			if (!await _loadLock.WaitAsync(0)) return; // Skip if already loading
			try
			{
				var nexusController = new NexusController(_log, _config);
				await nexusController.UpdateNexusBuildings();
			}
			finally
			{
				_loadLock.Release();
			}
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
			if (_checkForNewUpgradesTimer != null)
			{ 
				_checkForNewUpgradesTimer.Dispose();
			}
			_loadLock.Dispose();
			base.Dispose();
		}
	}
}