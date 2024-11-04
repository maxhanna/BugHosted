 
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
builder.Services.Configure<ForwardedHeadersOptions>(options => {
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
 
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = long.MaxValue); // Allows for large files

var app = builder.Build();
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
	ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});
app.UseDefaultFiles();
app.UseStaticFiles();
 
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
