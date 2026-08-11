using System.Xml.Linq;
using Microsoft.Extensions.Configuration;
using MySqlConnector;

namespace maxhanna.Server.Services
{
    /// <summary>
    /// One-time startup job: writes sitemap entries for every recipe in the DB
    /// (recipes created before the sitemap feature never got entries, so
    /// search engines only indexed newly created/edited ones). Idempotent —
    /// it no-ops once /recipe/ entries exist — so this is safe to run on
    /// every boot. Runs as a hosted service (not through a controller) so its
    /// dependencies resolve from DI.
    /// </summary>
    public class RecipeSitemapBackfillService : BackgroundService
    {
        private readonly string _connectionString;
        private readonly Log _log;
        private readonly string _sitemapPath = Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.Client/src/sitemap.xml");

        public RecipeSitemapBackfillService(IConfiguration configuration, Log log)
        {
            _connectionString = configuration.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;
            _log = log;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Defer so the app finishes booting and the DB is ready; then run
            // once. The backfill self-skips once the sitemap has recipe rows.
            try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
            catch (OperationCanceledException) { return; }

            await BackfillSitemapAsync();
        }

        /// <summary>
        /// Write sitemap entries for every recipe in the DB in a single
        /// document pass (one load, one save, one lock acquisition). Shares
        /// the controller's sitemap lock and metadata builders so the live
        /// create/update append path and this backfill can never race.
        /// </summary>
        private async Task BackfillSitemapAsync()
        {
            await RecipeController._sitemapLock.WaitAsync();
            try
            {
                if (System.IO.File.Exists(_sitemapPath))
                {
                    var existing = XDocument.Load(_sitemapPath);
                    if (existing.Descendants().Any(x => x.Name.LocalName == "loc" && x.Value.Contains("/recipe/")))
                    {
                        return; // already backfilled — nothing to do
                    }
                }

                var recipes = new List<RecipeDto>();
                await using (var conn = new MySqlConnection(_connectionString))
                {
                    await conn.OpenAsync();
                    const string query = @"SELECT r.id, r.name, r.description, r.image_file_ids, r.external_links
                        FROM recipes r
                        ORDER BY r.id";
                    await using var cmd = new MySqlCommand(query, conn);
                    await using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        recipes.Add(new RecipeDto
                        {
                            Id = reader.GetInt32(reader.GetOrdinal("id")),
                            Name = reader.GetString(reader.GetOrdinal("name")),
                            Description = reader.IsDBNull(reader.GetOrdinal("description")) ? string.Empty : reader.GetString(reader.GetOrdinal("description")),
                            ImageFileIds = RecipeController.ParseIntList(reader, "image_file_ids"),
                            ExternalLinks = RecipeController.ParseList(reader, "external_links"),
                        });
                    }
                }

                if (recipes.Count == 0) return;

                XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
                XNamespace imageNs = "http://www.google.com/schemas/sitemap-image/1.1";
                XNamespace videoNs = "http://www.google.com/schemas/sitemap-video/1.1";
                XDocument sitemap;
                if (System.IO.File.Exists(_sitemapPath))
                {
                    sitemap = XDocument.Load(_sitemapPath);
                }
                else
                {
                    sitemap = new XDocument(new XElement(ns + "urlset"));
                }
                sitemap.Root?.SetAttributeValue(XNamespace.Xmlns + "image", imageNs);
                sitemap.Root?.SetAttributeValue(XNamespace.Xmlns + "video", videoNs);

                var lastMod = DateTime.UtcNow.ToString("yyyy-MM-dd");
                var written = 0;
                foreach (var r in recipes)
                {
                    var url = $"https://bughosted.com/recipe/{r.Id}";
                    var existingEntry = sitemap.Descendants(ns + "url")
                        .FirstOrDefault(x => x.Element(ns + "loc")?.Value == url);
                    existingEntry?.Remove();
                    sitemap.Root?.Add(RecipeController.BuildSitemapUrlElement(url, r.Name, r.Description, lastMod, r.ImageFileIds, r.ExternalLinks, ns, imageNs, videoNs));
                    written++;
                }

                sitemap.Save(_sitemapPath);
                _ = _log.Db($"Sitemap backfill: wrote {written} recipe entr(ies).", null, "RECIPE", true);
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Sitemap backfill failed: {ex.Message}", null, "RECIPE", true);
            }
            finally
            {
                RecipeController._sitemapLock.Release();
            }
        }
    }
}
