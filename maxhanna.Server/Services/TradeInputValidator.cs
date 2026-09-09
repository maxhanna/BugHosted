namespace maxhanna.Server.Services;

public static class TradeInputValidator
{
  private static readonly IReadOnlyDictionary<string, string> CoinAliases =
    new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
      ["BTC"] = "BTC", ["XBT"] = "BTC",
      ["ETH"] = "ETH", ["SOL"] = "SOL", ["ADA"] = "ADA",
      ["XRP"] = "XRP", ["XDG"] = "XDG", ["DOGE"] = "XDG"
    };

  private static readonly IReadOnlySet<string> SupportedStrategies =
    new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "DCA", "IND", "HFT" };

  public static bool TryNormalizeCoin(string? value, out string normalized)
  {
    normalized = string.Empty;
    if (string.IsNullOrWhiteSpace(value)) return false;
    return CoinAliases.TryGetValue(value.Trim(), out normalized!);
  }

  public static bool TryNormalizeStrategy(string? value, out string normalized)
  {
    normalized = string.Empty;
    if (string.IsNullOrWhiteSpace(value)) return false;
    string candidate = value.Trim().ToUpperInvariant();
    if (!SupportedStrategies.Contains(candidate)) return false;
    normalized = candidate;
    return true;
  }

  public static bool TryNormalize(string? coin, string? strategy, out string normalizedCoin, out string normalizedStrategy)
  {
    bool coinValid = TryNormalizeCoin(coin, out normalizedCoin);
    bool strategyValid = TryNormalizeStrategy(strategy, out normalizedStrategy);
    return coinValid && strategyValid;
  }
}
