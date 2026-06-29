using Microsoft.Extensions.DependencyInjection;
using maxhanna.Infrastructure;

namespace maxhanna.Api.Extensions
{
    public static class ServiceCollectionExtensions
    {
        /// <summary>
        /// Registers the DbOperationQueue as a singleton.
        /// </summary>
        public static IServiceCollection AddDbOperationQueue(this IServiceCollection services)
        {
            services.AddSingleton<DbOperationQueue>();
            return services;
        }
    }
}