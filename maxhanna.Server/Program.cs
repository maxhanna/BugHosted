using Microsoft.AspNetCore.Http.Features;
using MySqlConnector;

var builder = WebApplication.CreateBuilder(args);

// Configure CORS globally
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAllOrigins",
        builder =>
        {
            builder.AllowAnyOrigin()
                   .AllowAnyMethod()
                   .AllowAnyHeader();
        });
});

builder.Services.AddMySqlDataSource(builder.Configuration.GetConnectionString("ConnectionStrings:maxhanna")!);
builder.Services.AddControllers();
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = long.MaxValue; // Allows for large files
});
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = long.MaxValue); // Allows for large files

var app = builder.Build();

// Set custom headers for all responses
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers.Append("Cross-Origin-Opener-Policy", "same-origin");
        context.Response.Headers.Append("Cross-Origin-Embedder-Policy", "require-corp");
        return Task.CompletedTask;
    });

    await next();
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

// Enable CORS
app.UseCors("AllowAllOrigins");

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");
try
{ 
    app.Run();
} catch (Exception ex)
{
    Console.WriteLine(ex.ToString());
}
