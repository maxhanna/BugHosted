using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace maxhanna.Server.Authentication;

public sealed class SessionAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
  public const string SchemeName = "SessionToken";
  private readonly IConfiguration _configuration;

  public SessionAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    IConfiguration configuration)
    : base(options, logger, encoder)
  {
    _configuration = configuration;
  }

  protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
  {
    string token = Request.Headers["Encrypted-UserId"].ToString();
    if (string.IsNullOrWhiteSpace(token))
      token = Request.Cookies["BHUserToken"] ?? string.Empty;

    if (string.IsNullOrWhiteSpace(token))
      return AuthenticateResult.NoResult();

    string connectionString = _configuration.GetConnectionString("maxhanna") ?? string.Empty;
    int? userId = await Log.ValidateSessionUserId(connectionString, token);
    if (userId is null)
      return AuthenticateResult.Fail("Invalid or expired session token.");

    var identity = new ClaimsIdentity(SchemeName);
    identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString()));
    identity.AddClaim(new Claim(ClaimTypes.Name, userId.Value.ToString()));
    return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
  }
}
