using maxhanna.Server.Controllers;
using Microsoft.Extensions.DependencyInjection;
namespace maxhanna.Server.Services
{
	public class NexusUnitBackgroundService : BackgroundService
	{
		private readonly IConfiguration? _config;
		private readonly IServiceProvider? _serviceProvider;
		private readonly Log _log;

		private readonly bool _enabled;

		private Timer? _checkForNewUnitsTimer; 

		private int timerDuration = 1;
		private static readonly SemaphoreSlim _loadLock = new SemaphoreSlim(1, 1);


		public NexusUnitBackgroundService(IConfiguration config, Log log, IServiceProvider serviceProvider)
		{
			_config = config;
			_log = log;
			_serviceProvider = serviceProvider;

			var cs = _config?.GetValue<string>("ConnectionStrings:maxhanna");
			_enabled = !string.IsNullOrWhiteSpace(cs);
			if (!_enabled)
			{
				_ = _log.Db("Connection string 'maxhanna' missing; NexusUnitBackgroundService disabled.", null, "NEXUS_UNIT_SVC", true);
			}
		} 
		protected override Task ExecuteAsync(CancellationToken stoppingToken)
		{
			if (!_enabled)
			{
				return Task.CompletedTask; // DB not configured; skip scheduling
			}

			_checkForNewUnitsTimer = new Timer(
					async _ => await CheckForNewPurchases(stoppingToken),
					null,
					TimeSpan.FromSeconds(timerDuration),
					TimeSpan.FromSeconds(timerDuration)
			);
			return Task.CompletedTask;
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
			if (!await _loadLock.WaitAsync(0)) return; // Skip if already loading
			try
			{
				if (_serviceProvider == null)
				{
					// No DI scope available — skip execution to avoid creating controller
					// outside of DI (which can cause shared/pooled DB resources to be reused
					// across threads and trigger concurrent read errors).
					_ = _log.Db("⚠️NexusUnitBackgroundService: IServiceProvider unavailable; skipping scheduled work.", null, "NEXUS_UNIT_SVC", true);
					return;
				}

				using var scope = _serviceProvider.CreateScope();
				// Create a controller instance within the scope so any scoped services it uses get fresh lifetimes
				var nexusController = ActivatorUtilities.CreateInstance<NexusController>(scope.ServiceProvider, _log, _config ?? new ConfigurationBuilder().Build());
				await nexusController.UpdateNexusUnitTrainingCompletes();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"⚠️NexusUnitBackgroundService failed in LoadAndScheduleExistingPurchases: {ex.Message}", null, "NEXUS_UNIT_SVC", true);
				// Do not rethrow — keep background service running
			}
			finally
			{
				_loadLock.Release();
			}
		}

		public override void Dispose()
		{ 
			_checkForNewUnitsTimer?.Change(Timeout.Infinite, Timeout.Infinite); 
			_checkForNewUnitsTimer?.Dispose();
			_loadLock.Dispose();
			base.Dispose();
		}
	}
}