
using System.Text.RegularExpressions;
public static class FileNameCleaner
{
    // Matches one or more trailing sequences like: [sep][digits≥5][letters?]
    // e.g., "-1767331413899", "_123456abc", "  987654" at the end.
    private static readonly Regex TrailingLongNumber =
        new Regex(@"(?:[\s_\-]*\d{5,}[A-Za-z]*)+\s*$", RegexOptions.Compiled);

    // Any non-space separator run → single space
    private static readonly Regex MultiSpace =
        new Regex(@"\s{2,}", RegexOptions.Compiled);

    // Any run of dash/underscore -> single space
    private static readonly Regex DashUnderscoreToSpace =
        new Regex(@"[\-_]+", RegexOptions.Compiled);

    // Trim leftover leading/trailing separators and punctuation
    private static readonly Regex EdgePunct =
        new Regex(@"^[\s\-_\.]+|[\s\-_\.]+$", RegexOptions.Compiled);

    /// <summary>
    /// Cleans a filename slug like:
    /// "Oh-the-memories-and-the-ackwardness-Brewstew-Films-1767331413899.mp4"
    /// into: "Oh the memories and the ackwardness Brewstew Films"
    /// </summary>
    public static string CleanHumanFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return string.Empty;

        // Separate extension; work on the stem only
        var ext = Path.GetExtension(fileName);
        var stem = Path.GetFileNameWithoutExtension(fileName) ?? "";

        // Replace dashes/underscores with spaces (preserve original letters’ case)
        stem = DashUnderscoreToSpace.Replace(stem, " ");

        // Remove trailing long numeric garbage (>= 5 digits)
        stem = TrailingLongNumber.Replace(stem, "");

        // Collapse multiple spaces
        stem = MultiSpace.Replace(stem, " ");

        // Trim lingering separators/punct/spaces
        stem = EdgePunct.Replace(stem, "");
        stem = stem.Trim();

        // If we somehow emptied it, fall back to original stem
        if (string.IsNullOrWhiteSpace(stem))
            stem = Path.GetFileNameWithoutExtension(fileName) ?? "";

        return stem;
    }
}
