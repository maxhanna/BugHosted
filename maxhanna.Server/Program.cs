
using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;
using maxhanna.Server.Controllers;
using maxhanna.Server.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using MySqlConnector;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMySqlDataSource(builder.Configuration.GetConnectionString("ConnectionStrings:maxhanna")!);
builder.Services.AddControllers();
builder.Services.Configure<FormOptions>(options =>
{
	options.MultipartBodyLengthLimit = long.MaxValue; // Allows for large files
});
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
	options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
	options.KnownNetworks.Clear();
	options.KnownProxies.Clear();
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddHttpClient();
builder.Services.AddHttpClient<maxhanna.Server.Helpers.NewsHttpClient>();
builder.Services.AddHostedService<SystemBackgroundService>();
builder.Services.AddHostedService<NexusAttackBackgroundService>();
builder.Services.AddHostedService<NexusGoldUpdateBackgroundService>();
builder.Services.AddHostedService<NexusUnitUpgradeBackgroundService>();
builder.Services.AddHostedService<NexusBuildingUpgradeBackgroundService>();
builder.Services.AddHostedService<NexusUnitBackgroundService>(); 
builder.Services.AddHostedService<NexusDefenceBackgroundService>();
builder.Services.AddHttpClient<KrakenService>();
builder.Services.AddHttpClient<WebCrawler>();
builder.Services.AddSingleton<Log>();
builder.Services.AddSingleton<WebCrawler>();
builder.Services.AddSingleton<AiController>();
builder.Services.AddSingleton<NewsService>();
builder.Services.AddSingleton<ProfitCalculationService>();
builder.Services.AddSingleton<TradeIndicatorService>();
builder.Services.AddSingleton<KrakenService>();  

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = long.MaxValue); // Allows for large files

var defaultApp = FirebaseApp.Create(new AppOptions
{
	Credential = GoogleCredential.FromFile("./Properties/bughosted-firebase-adminsdk-yz2go-c8f6d83bb6.json"),
	ProjectId = "bughosted",
}); 
var defaultAuth = FirebaseAuth.GetAuth(defaultApp);
defaultAuth = FirebaseAuth.DefaultInstance;

var app = builder.Build();
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
	ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

// Add Content Security Policy headers
app.Use(async (context, next) =>
{
	// CSP header that allows the necessary resources while maintaining security
	// We add script-src-attr/script-src-elem directives to allow legacy inline event handlers
	// Short-term: enables existing inline handlers; long-term: refactor to remove inline handlers
	context.Response.Headers.Append(
		"Content-Security-Policy",
		"default-src 'self' https:; " +
		"script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
		"script-src-attr 'unsafe-inline'; " +
		"script-src-elem 'unsafe-inline'; " +
		"style-src 'self' 'unsafe-inline' https:; " +
		"img-src 'self' data: https:; " +
		"font-src 'self' data: https:; " +
		"connect-src 'self' https: wss: http://localhost:* https://localhost:*; " +
		"frame-src 'self' https:; " +
		"object-src 'none'; " +
		"base-uri 'self'; " +
		"form-action 'self';"
	);
	await next();
});

app.UseDefaultFiles();

app.MapWhen(context => context.Request.Path.Value != null && context.Request.Path.Value.Contains("firebase-messaging-sw.js"), appBranch =>
{
	appBranch.Run(async context =>
	{
		context.Response.StatusCode = StatusCodes.Status403Forbidden;
		await context.Response.WriteAsync("Access Denied");
	});
});
//app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
	app.UseSwagger(); 
	app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseRouting();

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");
try
{
	app.Run();
}
catch (Exception ex)
{
	Console.WriteLine(ex.ToString());
}
