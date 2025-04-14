
using FirebaseAdmin;
using FirebaseAdmin.Auth;
using Google.Apis.Auth.OAuth2;
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
builder.Services.AddSingleton<NewsService>(); 
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

app.UseDefaultFiles();

app.MapWhen(context => context.Request.Path.Value.Contains("firebase-messaging-sw.js"), appBranch =>
{
	appBranch.Run(async context =>
	{
		context.Response.StatusCode = StatusCodes.Status403Forbidden;
		await context.Response.WriteAsync("Access Denied");
	});
});
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
	app.UseSwagger();
	app.UseHttpsRedirection();
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
