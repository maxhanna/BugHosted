using maxhanna.Server.Controllers;
namespace maxhanna.Server.Services
{
	public class NexusUnitBackgroundService : BackgroundService
	{
		private readonly IConfiguration _config;
		private readonly IServiceProvider _serviceProvider;
		private readonly Log _log;

		private Timer _checkForNewUnitsTimer;
		private Timer _processUnitQueueTimer;

		private int timerDuration = 1;


		public NexusUnitBackgroundService(IConfiguration config, Log log)
		{
			_config = config;
			_log = log;
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

		protected override async Task ExecuteAsync(CancellationToken stoppingToken)
		{
			_checkForNewUnitsTimer = new Timer(
					async _ => await CheckForNewPurchases(stoppingToken),
					null,
					TimeSpan.FromSeconds(timerDuration),
					TimeSpan.FromSeconds(timerDuration)
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
				_checkForNewUnitsTimer?.Change(TimeSpan.FromSeconds(timerDuration), TimeSpan.FromSeconds(timerDuration)); // Re-enable timer
			}
		}

		private async Task LoadAndScheduleExistingPurchases(CancellationToken stoppingToken)
		{

			var nexusController = new NexusController(_log, _config);
			await nexusController.UpdateNexusUnitTrainingCompletes();
		}

		public override void Dispose()
		{
			_processUnitQueueTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_checkForNewUnitsTimer?.Change(Timeout.Infinite, Timeout.Infinite);
			_processUnitQueueTimer?.Dispose();
			_checkForNewUnitsTimer?.Dispose();
			base.Dispose();
		}
	}
}