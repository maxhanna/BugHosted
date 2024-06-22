using maxhanna.Server.Controllers;
using maxhanna.Server.Controllers.Helpers;
using Microsoft.AspNetCore.Http.Features;
using MySqlConnector;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMySqlDataSource(builder.Configuration.GetConnectionString("ConnectionStrings:maxhanna")!);
builder.Services.AddControllers();
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = long.MaxValue; // Allows for large files
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
 
builder.Services.AddHttpClient();

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = long.MaxValue); // Allows for large files

var app = builder.Build();

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
