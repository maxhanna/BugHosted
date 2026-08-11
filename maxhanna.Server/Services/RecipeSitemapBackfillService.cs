namespace maxhanna.Server.Services
{
    /// <summary>
    /// One-time startup job: writes sitemap entries for every recipe in the DB
    /// (recipes created before the sitemap feature never got entries, so
    /// search engines only indexed newly created/edited ones). The controller's
    /// backfill is idempotent — it no-ops once /recipe/ entries exist — so
    /// this is safe to run on every boot.
    /// </summary>
    public class RecipeSitemapBackfillService : BackgroundService
    {
        private readonly RecipeController _recipeController;
        private readonly Log _log;

        public RecipeSitemapBackfillService(RecipeController recipeController, Log log)
        {
            _recipeController = recipeController;
            _log = log;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Defer so the app finishes booting and the DB is ready; then run
            // once. The backfill self-skips once the sitemap has recipe rows.
            try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
            catch (OperationCanceledException) { return; }

            try
            {
                var count = await _recipeController.BackfillSitemapAsync();
                if (count > 0)
                {
                    _ = _log.Db($"Sitemap backfill: wrote {count} recipe entr(ies).", null, "RECIPE", outputToConsole: true);
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Sitemap backfill failed: {ex.Message}", null, "RECIPE", outputToConsole: true);
            }
        }
    }
}
