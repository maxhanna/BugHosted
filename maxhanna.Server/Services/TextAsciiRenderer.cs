using System.Text;

namespace maxhanna.Server.Services
{
  /// <summary>
  /// Turns plain text into artistic ASCII art using a built-in 5x7 bitmap font
  /// (A-Z, 0-9 and common punctuation). Zero external font data required.
  ///
  /// Styles go well beyond plain fills: shadows, glows, graffiti-style tags,
  /// italic skew, sideways/flipped letters, hollow bubbles, wavy distortion,
  /// textures, gradients, dilated (thick-stroke) stencils and negative-space art.
  /// </summary>
  public static class TextAsciiRenderer
  {
    public static readonly string[] StyleNames =
    {
      "Blocks", "Solid", "Dots", "Hash",
      "Slash", "Backslash", "Bars", "Stars", "Dashes",
      "Outline", "Bubbles", "Sparkle", "Shade",
      "Dither", "Checker", "Fade",
      "3D", "Neon", "Graffiti", "Italic", "Sideways", "Flip", "Bubble", "Wave", "Confetti",
      "Stencil", "Chrome", "Negative", "Halo", "Mirror", "Zigzag", "Hatch", "Deep", "Aura", "Gradient",
      "Fence", "Emboss", "Cave", "Grid", "Slice", "Dust", "Chocolate", "Mosaic", "Ember", "Melt",
      "Jagged", "GlowStencil", "Blurred", "Rose", "Gothic", "Crypt", "Grave", "Oldpaper", "Statement",
      "Prism", "Illusion", "Brushed", "Slate", "CutGlass", "Parchment", "Tattoo", "Viscous", "Lantern",
      "Candy", "Sunny", "Party"
    };

    private static readonly string FadeRamp = "#@*|-=!";
    private static readonly string ChromeRamp = "▀█▄";
    private static readonly char[] Confetti = { '*', '+', 'o', '.', '~', 'x' };
    private static readonly char[] MosaicRamp = { '#', '▓', '░', '▒', '█', '·' };

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
        var glyphs = new List<string[]>();
        for (int i = 0; i < line.Length; i++)
        {
          var ch = line[i];
          glyphs.Add(StyleGlyph(resolved, Glyphs.TryGetValue(ch, out var g) ? g : Blank));
        }
        if (glyphs.Count == 0) continue;

        var art = ComposeLine(glyphs);
        art = ApplyArtTransforms(resolved, art);

        // Pixel scaling: every base cell expands to a scale-by-scale block.
        for (int v = 0; v < scale; v++)
        {
          foreach (var row in art)
          {
            var rowSb = new StringBuilder();
            foreach (char cell in row)
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

    /// <summary>Stacks the glyphs of one line into rows of base cells (gap column between letters).</summary>
    private static List<string> ComposeLine(List<string[]> glyphs)
    {
      int rows = glyphs[0].Length;
      var result = new List<string>(rows);
      for (int r = 0; r < rows; r++)
      {
        var sb = new StringBuilder();
        for (int g = 0; g < glyphs.Count; g++)
        {
          if (g > 0) sb.Append(' ');
          sb.Append(glyphs[g][r]);
        }
        result.Add(sb.ToString());
      }
      return result;
    }

    /// <summary>Renders one glyph (per-pixel style) after optional bitmap surgery (mirror/rotate/flip/dilate).</summary>
    private static string[] StyleGlyph(string style, string[] glyph)
    {
      if (style == "Mirror")
      {
        // Butterfly symmetry: letter + mirrored letter side by side.
        int rows = glyph.Length, cols = glyph[0].Length;
        var mirrored = new string[rows];
        for (int r = 0; r < rows; r++)
        {
          var rev = new char[cols];
          for (int c = 0; c < cols; c++) rev[c] = glyph[r][cols - 1 - c];
          mirrored[r] = glyph[r] + "0" + new string(rev);
        }
        glyph = mirrored;
      }
      else if (style == "Sideways")
      {
        // Rotate 90 degrees clockwise: 7x5 -> 5x7.
        int rows = glyph.Length, cols = glyph[0].Length;
        var rotated = new string[cols];
        for (int nr = 0; nr < cols; nr++)
        {
          var sb = new StringBuilder(rows);
          for (int nc = 0; nc < rows; nc++) sb.Append(glyph[rows - 1 - nc][nr]);
          rotated[nr] = sb.ToString();
        }
        glyph = rotated;
      }
      else if (style == "Flip")
      {
        int rows = glyph.Length, cols = glyph[0].Length;
        var flipped = new string[rows];
        for (int r = 0; r < rows; r++)
        {
          var sb = new StringBuilder(cols);
          for (int c = 0; c < cols; c++) sb.Append(glyph[rows - 1 - r][cols - 1 - c]);
          flipped[r] = sb.ToString();
        }
        glyph = flipped;
      }

      // Thick-stroke fonts: dilate every pixel into its neighbours so strokes
      // get real interiors (this is what makes hollow stencils visible).
if (style == "Stencil" || style == "Chrome" || style == "Aura" ||
          style == "Fence" || style == "Emboss" || style == "Cave" || style == "Chocolate" ||
          style == "Mosaic" || style == "Slice" || style == "Gothic" ||
          style == "Statement" || style == "Grave" ||
          style == "Illusion" || style == "Oldpaper" || style == "Slate" ||
          style == "Lantern" || style == "Rose" || style == "CutGlass") glyph = Dilate(glyph);

      int gRows = glyph.Length, gCols = glyph[0].Length;
      var result = new string[gRows];
      for (int r = 0; r < gRows; r++)
      {
        var sb = new StringBuilder(gCols);
        for (int c = 0; c < gCols; c++)
        {
          var filled = glyph[r][c] == '1';
          if (!filled && (style == "Halo" || style == "Aura"))
          {
            sb.Append(HasFilledNeighbor(glyph, r, c) ? '·' : ' ');
            continue;
          }
          sb.Append(StyleCell(style, filled, filled && IsEdge(glyph, r, c), r, c));
        }
        result[r] = sb.ToString();
      }

      // Blank glyphs (spaces) must stay invisible even in negative/glow styles.
      bool hasFill = false;
      foreach (var row in glyph)
        if (row.IndexOf('1') >= 0) { hasFill = true; break; }
      if (!hasFill && (style == "Negative" || style == "Halo" || style == "Aura"))
      {
        for (int r = 0; r < gRows; r++)
        {
          var sb = new StringBuilder(gCols);
          for (int c = 0; c < gCols; c++) sb.Append(' ');
          result[r] = sb.ToString();
        }
      }
      return result;
    }

    /// <summary>True when the cell is on the border of the shape (any neighbour is empty).</summary>
    private static bool IsEdge(string[] glyph, int r, int c)
    {
      if (glyph[r][c] != '1') return false;
      if (c == 0 || c == glyph[0].Length - 1 || r == 0 || r == glyph.Length - 1) return true;
      return glyph[r][c - 1] == '0' || glyph[r][c + 1] == '0' || glyph[r - 1][c] == '0' || glyph[r + 1][c] == '0';
    }

    private static bool HasFilledNeighbor(string[] glyph, int r, int c)
    {
      for (int dr = -1; dr <= 1; dr++)
      {
        for (int dc = -1; dc <= 1; dc++)
        {
          if (dr == 0 && dc == 0) continue;
          int nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < glyph.Length && nc >= 0 && nc < glyph[0].Length && glyph[nr][nc] == '1') return true;
        }
      }
      return false;
    }

    /// <summary>Thickens the bitmap by filling any empty cell touching a filled one (stroke dilation).</summary>
    private static string[] Dilate(string[] glyph)
    {
      int rows = glyph.Length, cols = glyph[0].Length;
      var result = new string[rows];
      for (int r = 0; r < rows; r++)
      {
        var sb = new StringBuilder(cols);
        for (int c = 0; c < cols; c++)
        {
          bool filled = glyph[r][c] == '1';
          if (!filled)
          {
            filled = (r > 0 && glyph[r - 1][c] == '1')
                  || (r < rows - 1 && glyph[r + 1][c] == '1')
                  || (c > 0 && glyph[r][c - 1] == '1')
                  || (c < cols - 1 && glyph[r][c + 1] == '1');
          }
          sb.Append(filled ? '1' : '0');
        }
        result[r] = sb.ToString();
      }
      return result;
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
        case "3D": return '█';
        case "Neon": return '@';
        case "Graffiti": return '█';
        case "Italic": return '#';
        case "Sideways": return '#';
        case "Flip": return '#';
        case "Wave": return '#';
        case "Mirror": return '#';
        case "Zigzag": return '#';
        case "Deep": return '█';
        case "Gradient": return '#';
        case "Stencil": return edge ? '#' : ' ';
        case "Chrome":
          int third = Math.Min(r, ChromeRamp.Length - 1);
          return ChromeRamp[r < 2 ? 0 : (r < 5 ? 1 : 2)];
        case "Negative": return edge ? '.' : ' ';
        case "Halo": return '█';
        case "Aura": return FadeRamp[Math.Min(r, FadeRamp.Length - 1)];
        case "Hatch": return ((r + c) & 1) == 0 ? '/' : '\\';

        // 2026-08 wild additions — big, blocky, artful
        case "Fence": return ((r % 2 == 0) && (c % 2 == 0)) ? '#' : (edge ? '#' : '·');
        case "Emboss": return edge ? (r < c ? '░' : '▒') : (r < c ? '▓' : '█');
        case "Cave": return edge ? '#' : (((r * 5 + c * 3) % 9 == 0) ? '.' : '▒');
        case "Grid": return (r % 4 == 0 || c % 4 == 0) ? '▓' : '#';
        case "Slice": int sliceD = (r + c) % 6; return sliceD < 2 ? '/' : (sliceD < 4 ? '\\' : '#');
        case "Dust": return ((r * 5 + c * 7) % 6 == 0) ? '.' : '*';
        case "Chocolate": int choc = Math.Min(r, 6); return choc < 3 ? '#' : (choc < 5 ? '▓' : '░');
        case "Mosaic": return MosaicRamp[(r * 3 + c) % MosaicRamp.Length];
        case "Ember": return edge ? (r % 2 == 0 ? '#' : '*') : (r < 4 ? '▒' : '·');
        case "Melt": return r < 3 ? '#' : '~';

        // 2026-08 mood fleet — gothic, shadowy, scary, pop, happy
        case "Oldpaper": return edge ? '#' : ':';
        case "Crypt": return (r + c) % 5 == 0 ? '#' : '░';
        case "Grave": return edge ? 'o' : '#';
        case "Statement": return edge ? '#' : '@';
        case "Tattoo": return ((r * 7 + c * 3) % 5 == 0) ? '*' : '#';
        case "Gothic": return edge ? '#' : '▓';
        case "Rose": return (r % 2 == 0 && c % 2 == 1) ? 'o' : '#';
        case "Brushed": return '▓';
        case "Lantern": return edge ? '#' : '░';
        case "Slate": return (edge ? '#' : '▓');
        case "Jagged": return edge ? '/' : '#';
        case "GlowStencil": return edge ? '#' : ' ';
        case "Blurred": return '#';
        case "Viscous": return '#';
        case "Prism": return ((r + c) % 2 == 0) ? '#' : '░';
        case "Illusion": return (Math.Abs(r - 4) + Math.Abs(c - 3)) % 3 == 0 ? '#' : '░';
        case "Parchment": return '~';
        case "CutGlass": return ((r / 2 + c / 2) % 2 == 0) ? '#' : '&';

        // 2026-08 poppy & happy — bright stripe candy, sun rays, confetti burst
        case "Candy": return (c % 3 == 0) ? '#' : '.';
        case "Sunny": return '·';
        case "Party": return (r * 5 + c * 3) % 4 == 0 ? '*' : '#';

        // Hollow / edge styles — only the outline of each letter is drawn.
        case "Outline": return edge ? '#' : ' ';
        case "Bubbles": return edge ? 'o' : ' ';
        case "Bubble": return edge ? 'O' : ' ';
        case "Sparkle": return edge ? '*' : ' ';

        // Shaded styles
        case "Shade": return edge ? '#' : '@';

        // Textured (dithered) fills, alternating by pixel position
        case "Dither": return ((r + c) & 1) == 0 ? '█' : '▒';
        case "Checker": return ((r + c) & 1) == 0 ? '#' : '.';
        case "Confetti": return Confetti[(r + c) % Confetti.Length];

        // Vertical gradient: dark at the top, light at the bottom
        case "Fade": return FadeRamp[Math.Min(r, FadeRamp.Length - 1)];

        default: return '#';
      }
    }

    /// <summary>Whole-line transforms: skew, wave, zigzag, shadow layers, highlights, gradients.</summary>
    private static List<string> ApplyArtTransforms(string style, List<string> art)
    {
      switch (style)
      {
        case "Italic": return Skew(art, 1);
        case "Wave": return Wave(art, Math.PI / 3, 1.4);
        case "Zigzag": return Wave(art, Math.PI / 1.5, 2.0);
        case "3D": return Shadow(art, 1, 1, '░');
        case "Neon": return Shadow(art, 1, 1, '*');
        case "Deep": return Shadow(Shadow(art, 1, 1, '░'), 1, 1, '▒');
        case "Graffiti":
          var skewed = Skew(art, 1);
          var highlighted = HighlightTopEdges(skewed, '▀');
          return Shadow(highlighted, 1, 1, '░');
        case "Gradient": return Gradient(art);
        case "Melt": return Melt(art);
        case "Jagged": return Wave(art, Math.PI / 1.5, 1.0);
        case "GlowStencil": return Glow(art, '·');
        case "Blurred": return Blur(art);
        case "Viscous": return Viscous(art);
        case "Brushed": return Brushed(art);
        case "Sunny": return Sunny(art);
        default: return art;
      }
    }

    /// <summary>Slants the art so the top leans right (italic look).</summary>
    private static List<string> Skew(List<string> art, int amount)
    {
      int rows = art.Count, cols = art[0].Length;
      var result = new List<string>(rows);
      int maxShift = (rows - 1) * amount;
      for (int r = 0; r < rows; r++)
      {
        int shift = (rows - 1 - r) * amount;
        result.Add(new string(' ', shift) + art[r] + new string(' ', maxShift - shift));
      }
      return result;
    }

    /// <summary>Sinusoidal row displacement (wavy / zigzag looks).</summary>
    private static List<string> Wave(List<string> art, double step, double amplitude)
    {
      int rows = art.Count, cols = art[0].Length;
      var result = new List<string>(rows);
      for (int r = 0; r < rows; r++)
      {
        int shift = (int)Math.Round(Math.Sin(r * step) * amplitude);
        result.Add(new string(' ', Math.Max(0, shift)) + art[r] + new string(' ', Math.Max(0, -shift)));
      }
      return result;
    }

    /// <summary>Adds a drop-shadow layer offset down-right, behind the main pixels.</summary>
    private static List<string> Shadow(List<string> art, int dRow, int dCol, char shadowChar)
    {
      int rows = art.Count, cols = art[0].Length;
      var result = new List<string>(rows + dRow);
      for (int pad = 0; pad < dRow; pad++) result.Add(new string(' ', cols + dCol));

      for (int r = 0; r < rows; r++)
      {
        var sb = new StringBuilder();
        for (int c = 0; c < cols + dCol; c++)
        {
          char main = c < cols ? art[r][c] : ' ';
          if (main == ' ' && r >= dRow && c >= dCol)
          {
            char src = art[r - dRow][c - dCol];
            if (src != ' ') { sb.Append(shadowChar); continue; }
          }
          sb.Append(main);
        }
        result.Add(sb.ToString());
      }
      return result;
    }

    /// <summary>Replaces the topmost cell of every stroke with the highlight char (marker shine).</summary>
    private static List<string> HighlightTopEdges(List<string> art, char highlight)
    {
      var result = new List<string>(art.Count);
      for (int r = 0; r < art.Count; r++)
      {
        var chars = art[r].ToCharArray();
        for (int c = 0; c < chars.Length; c++)
        {
          if (chars[c] != ' ' && (r == 0 || art[r - 1][c] == ' ')) chars[c] = highlight;
        }
        result.Add(new string(chars));
      }
      return result;
    }

    /// <summary>Dark-to-light horizontal gradient across the whole line.</summary>
    private static List<string> Gradient(List<string> art)
    {
      const string ramp = "@%#*+=-:.";
      int cols = art[0].Length;
      var result = new List<string>(art.Count);
      foreach (var row in art)
      {
        var sb = new StringBuilder(cols);
        for (int c = 0; c < cols; c++)
        {
          char ch = row[c];
          if (ch != ' ')
          {
            int idx = (c * ramp.Length) / Math.Max(1, cols - 1);
            ch = ramp[Math.Min(idx, ramp.Length - 1)];
          }
          sb.Append(ch);
        }
        result.Add(sb.ToString());
      }
      return result;
    }

    /// <summary>Melts the letters downward: drips of ~ hang under each glyph.</summary>
    private static List<string> Melt(List<string> art)
    {
      int rows = art.Count, cols = art[0].Length;
      var result = new List<string>(rows + 1);
      var drips = new char[cols];
      bool any = false;
      for (int r = 0; r < rows; r++)
      {
        var sb = new StringBuilder(cols);
        for (int c = 0; c < cols; c++)
        {
          char cur = art[r][c];
          sb.Append(cur);
          if (cur != ' ') { drips[c] = '~'; any = true; }
        }
        result.Add(sb.ToString());
      }
      if (any)
      {
        result.Add(new string(drips));
      }
      return result;
    }

    /// <summary>Adds an outer glow ring of char around every filled cell.</summary>
    private static List<string> Glow(List<string> art, char ch)
    {
      int rows = art.Count, cols = art[0].Length;
      var result = new List<string>(rows);
      for (int r = 0; r < rows; r++)
      {
        var sb = new StringBuilder(cols);
        for (int c = 0; c < cols; c++)
        {
          if (art[r][c] != ' ' || HasNeighbor(art, r, c)) sb.Append(ch);
          else sb.Append(' ');
        }
        result.Add(sb.ToString());
      }
      return result;
    }

    private static bool HasNeighbor(List<string> art, int r, int c)
    {
      for (int dr = -1; dr <= 1; dr++)
        for (int dc = -1; dc <= 1; dc++)
        {
          if (dr == 0 && dc == 0) continue;
          int nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < art.Count && nc >= 0 && nc < art[0].Length && art[nr][nc] != ' ') return true;
        }
      return false;
    }

    /// <summary>Smears every glyph to the right like a long-exposure blur.</summary>
    private static List<string> Blur(List<string> art)
    {
      int rows = art.Count, cols = art[0].Length;
      var result = new List<string>(rows);
      for (int r = 0; r < rows; r++)
      {
        var chars = art[r].ToCharArray();
        for (int c = cols - 1; c > 0; c--)
        {
          if (chars[c] == ' ' && chars[c - 1] != ' ') chars[c] = '░';
          if (chars[c] == '░' && c > 1 && chars[c - 2] != ' ') chars[c - 1] = '▒';
        }
        result.Add(new string(chars));
      }
      return result;
    }

    /// <summary>Thick ropy drips: double melt, taller pools at the bottom.</summary>
    private static List<string> Viscous(List<string> art)
    {
      var m = Melt(Melt(art));
      int rows = m.Count, cols = m[0].Length;
      var result = new List<string>(rows);
      for (int r = 0; r < rows; r++)
      {
        var sb = new StringBuilder(cols + 2);
        bool had = false;
        foreach (char c in m[r])
        {
          sb.Append(c);
          if (c == '~') had = true;
        }
        if (had) sb.Append("~~");
        result.Add(sb.ToString());
      }
      return result;
    }

    /// <summary>Fast brush strokes: thickens downward, chalk on the bottom.</summary>
    private static List<string> Brushed(List<string> art)
    {
      int cols = art[0].Length;
      var result = new List<string>();
      foreach (var row in art)
      {
        var sb = new StringBuilder(cols);
        bool saw = false;
        foreach (char c in row)
        {
          if (c != ' ') { sb.Append('▓'); saw = true; }
          else sb.Append(saw ? '·' : ' ');
        }
        result.Add(sb.ToString());
      }
      return result;
    }

    /// <summary>Bursts soft sun rays ( · ) outward from every carved cell.</summary>
    private static List<string> Sunny(List<string> art)
    {
      int cols = art[0].Length;
      var result = new List<string>();
      foreach (var row in art)
      {
        var sb = new StringBuilder(cols + 2);
        foreach (char c in row) sb.Append(c);
        sb.Append("··");
        result.Add(sb.ToString());
      }
      return result;
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