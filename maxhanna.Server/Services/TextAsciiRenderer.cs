using System;
using System.Collections.Generic;
using System.Text;

namespace maxhanna.Server.Services
{
  /// <summary>
  /// Turns plain text into artistic ASCII art using a built-in 5x7 bitmap font
  /// (A-Z, 0-9 and common punctuation). Zero external font data required.
  ///
  /// Styles are more than plain fills: some render hollow/outlined letters,
  /// shaded edges, dithered textures or gradients, so the output looks like
  /// real ASCII art rather than a simple block effect.
  /// </summary>
  public static class TextAsciiRenderer
  {
    public static readonly string[] StyleNames =
    {
      "Blocks", "Solid", "Dots", "Hash",
      "Slash", "Backslash", "Bars", "Stars", "Dashes",
      "Outline", "Bubbles", "Sparkle", "Shade",
      "Dither", "Checker", "Fade"
    };

    private static readonly string FadeRamp = "#@*|-=!";

    private static readonly Dictionary<char, string[]> Glyphs = BuildGlyphs();
    private static readonly string[] Blank = new[] { "00000", "00000", "00000", "00000", "00000", "00000", "00000" };

    /// <param name="style">One of StyleNames (case-insensitive), defaults to Blocks.</param>
    /// <param name="text">Input text; multi-line (\n) lines are stacked. Caller caps length.</param>
    /// <param name="scale">Pixel cell size 1-3; larger = chunkier.</param>
    public static string Render(string? text, string? style = "Blocks", int scale = 1)
    {
      scale = Math.Clamp(scale, 1, 3);
      var resolved = ResolveStyle(style);
      if (string.IsNullOrWhiteSpace(text)) return "";

      var inputLines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
      var output = new List<string>();

      foreach (var raw in inputLines)
      {
        var line = raw.ToUpperInvariant();
        var maps = new List<string[]>();
        for (int i = 0; i < line.Length; i++)
        {
          var ch = line[i];
          maps.Add(StyleGlyph(resolved, Glyphs.TryGetValue(ch, out var g) ? g : Blank));
        }
        if (maps.Count == 0) continue;

        // Compose the 7 base rows across all letters (separator column between letters).
        var baseRows = new string[7];
        for (int r = 0; r < 7; r++)
        {
          var sb = new StringBuilder();
          for (int m = 0; m < maps.Count; m++)
          {
            if (m > 0) sb.Append(' ');
            sb.Append(maps[m][r]);
          }
          baseRows[r] = sb.ToString();
        }

        // Pixel scaling: every base cell expands to a scale-by-scale block.
        for (int v = 0; v < scale; v++)
        {
          foreach (var baseRow in baseRows)
          {
            var rowSb = new StringBuilder();
            foreach (char cell in baseRow)
            {
              for (int h = 0; h < scale; h++) rowSb.Append(cell);
            }
            output.Add(rowSb.ToString());
          }
        }
      }

      return string.Join("\n", output);
    }

    private static string ResolveStyle(string? style)
    {
      var name = (style ?? "").Trim();
      foreach (var s in StyleNames)
      {
        if (string.Equals(s, name, StringComparison.OrdinalIgnoreCase)) return s;
      }
      return "Blocks";
    }

    /// <summary>Renders one glyph (7 rows of 5 chars) according to the style.</summary>
    private static string[] StyleGlyph(string style, string[] glyph)
    {
      var rows = new string[7];
      for (int r = 0; r < 7; r++)
      {
        var sb = new StringBuilder(5);
        for (int c = 0; c < 5; c++)
        {
          var filled = glyph[r][c] == '1';
          sb.Append(StyleCell(style, filled, filled && IsEdge(glyph, r, c), r, c));
        }
        rows[r] = sb.ToString();
      }
      return rows;
    }

    /// <summary>True when the cell is on the border of the shape (any neighbour is empty).</summary>
    private static bool IsEdge(string[] glyph, int r, int c)
    {
      if (glyph[r][c] != '1') return false;
      if (c == 0 || c == 4 || r == 0 || r == 6) return true;
      return glyph[r][c - 1] == '0' || glyph[r][c + 1] == '0' || glyph[r - 1][c] == '0' || glyph[r + 1][c] == '0';
    }

    private static char StyleCell(string style, bool filled, bool edge, int r, int c)
    {
      if (!filled) return ' ';

      switch (style)
      {
        // Solid fills
        case "Blocks": return '#';
        case "Solid": return '@';
        case "Dots": return '.';
        case "Hash": return '█';
        case "Slash": return '/';
        case "Backslash": return '\\';
        case "Bars": return '|';
        case "Stars": return '*';
        case "Dashes": return '-';

        // Hollow / edge styles — only the outline of each letter is drawn.
        case "Outline": return edge ? '#' : ' ';
        case "Bubbles": return edge ? 'o' : ' ';

        // Shaded styles
        case "Sparkle": return edge ? '*' : ' ';
        case "Shade": return edge ? '#' : '@';

        // Textured (dithered) fills, alternating by pixel position
        case "Dither": return ((r + c) & 1) == 0 ? '█' : '▒';
        case "Checker": return ((r + c) & 1) == 0 ? '#' : '.';

        // Vertical gradient: dark at the top, light at the bottom
        case "Fade": return FadeRamp[Math.Min(r, FadeRamp.Length - 1)];

        default: return '#';
      }
    }

    private static Dictionary<char, string[]> BuildGlyphs()
    {
      var map = new Dictionary<char, string[]>();
      void Add(char c, params string[] rows) => map[c] = rows;

      Add('A', "01110", "10001", "10001", "11111", "10001", "10001", "10001");
      Add('B', "11110", "10001", "10001", "11110", "10001", "10001", "11110");
      Add('C', "01110", "10001", "10000", "10000", "10000", "10001", "01110");
      Add('D', "11110", "10001", "10001", "10001", "10001", "10001", "11110");
      Add('E', "11111", "10000", "10000", "11110", "10000", "10000", "11111");
      Add('F', "11111", "10000", "10000", "11110", "10000", "10000", "10000");
      Add('G', "01110", "10001", "10000", "10111", "10001", "10001", "01111");
      Add('H', "10001", "10001", "10001", "11111", "10001", "10001", "10001");
      Add('I', "01110", "00100", "00100", "00100", "00100", "00100", "01110");
      Add('J', "00111", "00010", "00010", "00010", "00010", "10010", "01100");
      Add('K', "10001", "10010", "10100", "11000", "10100", "10010", "10001");
      Add('L', "10000", "10000", "10000", "10000", "10000", "10000", "11111");
      Add('M', "10001", "11011", "10101", "10101", "10001", "10001", "10001");
      Add('N', "10001", "11001", "10101", "10011", "10001", "10001", "10001");
      Add('O', "01110", "10001", "10001", "10001", "10001", "10001", "01110");
      Add('P', "11110", "10001", "10001", "11110", "10000", "10000", "10000");
      Add('Q', "01110", "10001", "10001", "10001", "10101", "10010", "01101");
      Add('R', "11110", "10001", "10001", "11110", "10100", "10010", "10001");
      Add('S', "01111", "10000", "10000", "01110", "00001", "00001", "11110");
      Add('T', "11111", "00100", "00100", "00100", "00100", "00100", "00100");
      Add('U', "10001", "10001", "10001", "10001", "10001", "10001", "01110");
      Add('V', "10001", "10001", "10001", "10001", "10001", "01010", "00100");
      Add('W', "10001", "10001", "10001", "10101", "10101", "11011", "10001");
      Add('X', "10001", "10001", "01010", "00100", "01010", "10001", "10001");
      Add('Y', "10001", "10001", "01010", "00100", "00100", "00100", "00100");
      Add('Z', "11111", "00001", "00010", "00100", "01000", "10000", "11111");

      Add('0', "01110", "10001", "10011", "10101", "11001", "10001", "01110");
      Add('1', "00100", "01100", "00100", "00100", "00100", "00100", "01110");
      Add('2', "01110", "10001", "00001", "00010", "00100", "01000", "11111");
      Add('3', "11111", "00010", "00100", "00010", "00001", "10001", "01110");
      Add('4', "00010", "00110", "01010", "10010", "11111", "00010", "00010");
      Add('5', "11111", "10000", "10000", "11110", "00001", "00001", "11110");
      Add('6', "01110", "10000", "10000", "11110", "10001", "10001", "01110");
      Add('7', "11111", "00001", "00010", "00100", "01000", "01000", "01000");
      Add('8', "01110", "10001", "10001", "01110", "10001", "10001", "01110");
      Add('9', "01110", "10001", "10001", "01111", "00001", "00001", "01110");

      Add(' ', "00000", "00000", "00000", "00000", "00000", "00000", "00000");
      Add('!', "00100", "00100", "00100", "00100", "00100", "00000", "00100");
      Add('?', "01110", "10001", "00001", "00010", "00100", "00000", "00100");
      Add('.', "00000", "00000", "00000", "00000", "00000", "01100", "01100");
      Add(',', "00000", "00000", "00000", "00000", "00000", "00100", "01000");
      Add(':', "00000", "00000", "01100", "00000", "00000", "01100", "00000");
      Add(';', "00000", "00000", "01100", "00000", "00000", "00100", "01000");
      Add('\'', "00000", "00100", "00100", "00000", "00000", "00000", "00000");
      Add('"', "00100", "00100", "00000", "00100", "00100", "00000", "00000");
      Add('-', "00000", "00000", "00000", "01110", "00000", "00000", "00000");
      Add('_', "00000", "00000", "00000", "00000", "00000", "00000", "11111");
      Add('+', "00000", "00000", "00100", "01110", "00100", "00000", "00000");
      Add('=', "00000", "00000", "01110", "00000", "01110", "00000", "00000");
      Add('/', "00001", "00010", "00010", "00100", "01000", "01000", "10000");
      Add('\\', "10000", "01000", "01000", "00100", "00010", "00010", "00001");
      Add('(', "00100", "01000", "10000", "10000", "10000", "01000", "00100");
      Add(')', "00100", "00010", "00001", "00001", "00001", "00010", "00100");
      Add('*', "00000", "00000", "10101", "01110", "10101", "00000", "00000");
      Add('#', "01010", "01010", "11111", "01010", "11111", "01010", "01010");
      Add('$', "00100", "01111", "10100", "01110", "00101", "11110", "00100");
      Add('@', "01110", "10001", "10111", "10101", "10111", "10000", "01110");
      Add('&', "01100", "10010", "10010", "01100", "10010", "10010", "01101");
      Add('%', "10001", "10010", "00010", "00100", "01000", "01001", "10001");

      return map;
    }
  }
}