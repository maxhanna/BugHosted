using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using System;
using System.Threading;
using System.Threading.Tasks;
using maxhanna.Server.Controllers;

public class SlimChoicesBackgroundService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<SlimChoicesBackgroundService> _logger;
    private readonly IConfiguration _config;

    public SlimChoicesBackgroundService(IServiceProvider services, ILogger<SlimChoicesBackgroundService> logger, IConfiguration config)
    {
        _services = services;
        _logger = logger;
        _config = config;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using (var scope = _services.CreateScope())
            {
                var wordlerController = scope.ServiceProvider.GetRequiredService<WordlerController>();
                await wordlerController.SlimChoicesDown();
            }

            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
