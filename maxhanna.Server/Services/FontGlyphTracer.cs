using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace maxhanna.Server.Services
{
  public class GlyphResult
  {
    public char Character { get; set; }
    public List<List<PointF>> Contours { get; set; } = new List<List<PointF>>();
    public float AdvanceWidth { get; set; }
    public float XMin { get; set; }
    public float YMin { get; set; }
    public float XMax { get; set; }
    public float YMax { get; set; }
  }

  public static class FontGlyphTracer
  {
    public const float UnitsPerEm = 1024f;
    public const float CapHeight = 700f;

    // 8-neighbour directions, clockwise in screen coordinates (y grows downward).
    private static readonly int[] DirX = { 1, 1, 0, -1, -1, -1, 0, 1 };
    private static readonly int[] DirY = { 0, 1, 1, 1, 0, -1, -1, -1 };

    /// <summary>
    /// Extracts glyphs from an image and traces their outer boundaries.
    /// Foreground detection is adaptive (dark-on-light or light-on-dark both work).
    /// Components separated by large horizontal gaps are treated as separate glyphs.
    /// </summary>
    public static List<GlyphResult> TraceGlyphs(Image<Rgba32> image, string? knownText = null)
    {
      bool[,] mask = Binarize(image);
      var components = FindComponents(mask);
      var glyphPieces = GroupIntoGlyphs(components);
      var results = new List<GlyphResult>();

      foreach (var piece in glyphPieces)
      {
        var glyph = TraceGlyph(mask, piece);
        if (glyph != null) results.Add(glyph);
      }

      if (knownText != null && knownText.Length == results.Count)
      {
        for (int i = 0; i < results.Count; i++) results[i].Character = knownText[i];
      }
      else
      {
        var fallback = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (int i = 0; i < results.Count; i++)
        {
          results[i].Character = i < fallback.Length ? fallback[i] : (char)(0xE000 + i);
        }
      }

      return results;
    }

    private static bool[,] Binarize(Image<Rgba32> image)
    {
      int w = image.Width, h = image.Height;
      var alpha = new float[w * h];
      var luminance = new float[w * h];
      float sum = 0, count = 0;

      for (int y = 0; y < h; y++)
      {
        for (int x = 0; x < w; x++)
        {
          var p = image[x, y];
          int i = y * w + x;
          alpha[i] = p.A / 255f;
          luminance[i] = 0.2126f * p.R + 0.7152f * p.G + 0.0722f * p.B;
          if (alpha[i] > 0.25f) { sum += luminance[i]; count++; }
        }
      }

      float mean = count > 0 ? sum / count : 128f;
      bool lightBackground = mean >= 128f;
      var mask = new bool[h, w];

      for (int y = 0; y < h; y++)
      {
        for (int x = 0; x < w; x++)
        {
          int i = y * w + x;
          bool opaque = alpha[i] > 0.45f;
          bool isDark = luminance[i] < mean - 40f;
          bool isBright = luminance[i] > mean + 40f;
          mask[y, x] = opaque && (lightBackground ? isDark : isBright);
        }
      }
      return mask;
    }

    private static List<List<(int x, int y)>> FindComponents(bool[,] mask)
    {
      int h = mask.GetLength(0), w = mask.GetLength(1);
      var visited = new bool[h, w];
      var components = new List<List<(int x, int y)>>();

      for (int y = 0; y < h; y++)
      {
        for (int x = 0; x < w; x++)
        {
          if (!mask[y, x] || visited[y, x]) continue;
          var stack = new Stack<(int x, int y)>();
          stack.Push((x, y));
          visited[y, x] = true;
          var component = new List<(int x, int y)>();
          while (stack.Count > 0)
          {
            var (cx, cy) = stack.Pop();
            component.Add((cx, cy));
            for (int dx = -1; dx <= 1; dx++)
            {
              for (int dy = -1; dy <= 1; dy++)
              {
                if (dx == 0 && dy == 0) continue;
                int nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                if (mask[ny, nx] && !visited[ny, nx])
                {
                  visited[ny, nx] = true;
                  stack.Push((nx, ny));
                }
              }
            }
          }
          if (component.Count >= 4) components.Add(component);
        }
      }
      return components;
    }

    private static List<List<(int x, int y)>> GroupIntoGlyphs(List<List<(int x, int y)>> components)
    {
      if (components.Count == 0) return new List<List<(int x, int y)>>();

      // 1. Cluster components into rows by vertical overlap.
      var rows = new List<List<List<(int x, int y)>>>();
      foreach (var comp in components)
      {
        var (minX, minY, maxX, maxY) = Bounds(comp);
        int placed = -1;
        for (int r = 0; r < rows.Count; r++)
        {
          var rowComps = rows[r];
          var (_, ryMin, _, ryMax) = Bounds(rowComps.SelectMany(c => c).ToList());
          int overlap = Math.Min(maxY, ryMax) - Math.Max(minY, ryMin);
          int rowHeight = ryMax - ryMin + 1;
          if (overlap > 0 || (rowHeight > 0 && overlap > -rowHeight * 0.5f))
          {
            placed = r;
            break;
          }
        }
        if (placed == -1)
        {
          rows.Add(new List<List<(int x, int y)>> { comp });
        }
        else
        {
          rows[placed].Add(comp);
        }
      }

      // 2. Within each row, sort left-to-right and split on large gaps.
      var glyphs = new List<List<(int x, int y)>>();
      foreach (var row in rows)
      {
        var sorted = row.OrderBy(c => Bounds(c).minX).ToList();
        var widths = sorted.Select(c => (float)(Bounds(c).maxX - Bounds(c).minX + 1)).ToList();
        float median = widths.Count > 0 ? widths.OrderBy(v => v).ElementAt(widths.Count / 2) : 8f;

        var current = new List<(int x, int y)>();
        int prevMaxX = -1;
        foreach (var comp in sorted)
        {
          var (cMinX, _, cMaxX, _) = Bounds(comp);
          if (current.Count > 0 && cMinX - prevMaxX > Math.Max(16f, median * 1.5f))
          {
            if (current.Count > 0) glyphs.Add(current);
            current = new List<(int x, int y)>();
          }
          current.AddRange(comp);
          prevMaxX = Math.Max(prevMaxX, cMaxX);
        }
        if (current.Count > 0) glyphs.Add(current);
      }

      return glyphs;
    }

    private static GlyphResult? TraceGlyph(bool[,] mask, List<(int x, int y)> component)
    {
      int h = mask.GetLength(0), w = mask.GetLength(1);
      var (minX, minY, maxX, maxY) = Bounds(component);

      bool IsFg(int x, int y) => x >= 0 && y >= 0 && x < w && y < h && mask[y, x];

      // Outer boundary: walk the component's contour.
      var outer = TraceBoundary(IsFg, component);
      if (outer.Count < 3) return null;

      // Holes: background pixels inside the glyph's bounding box that are NOT
      // connected (4-neighbour) to the box border — i.e. enclosed counter
      // regions. Without these, letters like A, B, O, P, 0, 6, 8 render as
      // solid filled shapes.
      var holes = FindHoles(mask, minX, minY, maxX, maxY);

      // Normalize: flip Y (up is positive), baseline = lowest black pixel row (maxY).
      float scale = CapHeight / Math.Max(1f, (float)(maxY - minY + 1));
      int midX = (minX + maxX) / 2;

      var contours = new List<List<PointF>>();
      var outerFont = ToFontPoints(outer, midX, maxY, scale);
      if (outerFont.Count < 3) return null;
      outerFont.Add(outerFont[0]); // close the loop
      contours.Add(outerFont);

      foreach (var hole in holes)
      {
        // The hole is a region of background pixels; walk it as its own
        // foreground (relative to the glyph) so we trace the counter's edge.
        var holeSet = new HashSet<(int x, int y)>(hole);
        bool IsHole(int x, int y) => holeSet.Contains((x, y));
        var holeBoundary = TraceBoundary(IsHole, hole);
        if (holeBoundary.Count < 3) continue;
        var holeFont = ToFontPoints(holeBoundary, midX, maxY, scale);
        if (holeFont.Count < 3) continue;
        holeFont.Add(holeFont[0]);
        // Holes must wind opposite the outer contour so the TrueType nonzero
        // winding rule cuts them out rather than filling them.
        if (SignedArea(holeFont) > 0 == SignedArea(outerFont) > 0) holeFont.Reverse();
        contours.Add(holeFont);
      }

      float xMin = contours.SelectMany(c => c).Min(p => p.X), xMax = contours.SelectMany(c => c).Max(p => p.X);
      float yMin = contours.SelectMany(c => c).Min(p => p.Y), yMax = contours.SelectMany(c => c).Max(p => p.Y);

      return new GlyphResult
      {
        Character = '?',
        Contours = contours,
        AdvanceWidth = Math.Max(160f, (xMax - xMin) + CapHeight * 0.12f),
        XMin = xMin,
        YMin = yMin,
        XMax = xMax,
        YMax = yMax
      };
    }

    /// <summary>
    /// Moore-neighbour boundary walk over a region of foreground pixels,
    /// returning the contour points in screen coordinates (y grows downward).
    /// </summary>
    private static List<(int x, int y)> TraceBoundary(Func<int, int, bool> IsFg, List<(int x, int y)> region)
    {
      // Start pixel: topmost, then leftmost.
      (int x, int y) start = region.OrderBy(p => p.y).ThenBy(p => p.x).First();

      var contour = new List<(int x, int y)>();
      var seen = new HashSet<(int x, int y, int dir)>();
      (int x, int y) b = start;
      int backtrack = 4; // assume we entered from the west
      int safety = region.Count * 8 + 1024;

      while (safety-- > 0)
      {
        if (!seen.Add((b.x, b.y, backtrack))) break;
        contour.Add(b);

        int found = -1;
        for (int s = 1; s <= 7; s++)
        {
          int d = (backtrack + s) % 8;
          if (IsFg(b.x + DirX[d], b.y + DirY[d])) { found = d; break; }
        }
        if (found == -1) break;

        b = (b.x + DirX[found], b.y + DirY[found]);
        backtrack = (found + 4) % 8;
      }

      return contour;
    }

    /// <summary>
    /// Finds enclosed background (hole) regions within the given bounding box:
    /// background pixels that are not 4-connected to the box border.
    /// </summary>
    private static List<List<(int x, int y)>> FindHoles(bool[,] mask, int minX, int minY, int maxX, int maxY)
    {
      int h = mask.GetLength(0), w = mask.GetLength(1);
      var outside = new bool[h, w]; // background reachable from the box border
      var queue = new Queue<(int x, int y)>();

      bool IsBg(int x, int y) => x >= 0 && y >= 0 && x < w && y < h && !mask[y, x];

      // Seed from every border cell that is background.
      for (int x = minX; x <= maxX; x++)
      {
        if (IsBg(x, minY) && !outside[minY, x]) { outside[minY, x] = true; queue.Enqueue((x, minY)); }
        if (IsBg(x, maxY) && !outside[maxY, x]) { outside[maxY, x] = true; queue.Enqueue((x, maxY)); }
      }
      for (int y = minY; y <= maxY; y++)
      {
        if (IsBg(minX, y) && !outside[y, minX]) { outside[y, minX] = true; queue.Enqueue((minX, y)); }
        if (IsBg(maxX, y) && !outside[y, maxX]) { outside[y, maxX] = true; queue.Enqueue((maxX, y)); }
      }

      var dir4 = new[] { (1, 0), (-1, 0), (0, 1), (0, -1) };
      while (queue.Count > 0)
      {
        var (cx, cy) = queue.Dequeue();
        foreach (var (dx, dy) in dir4)
        {
          int nx = cx + dx, ny = cy + dy;
          if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
          if (IsBg(nx, ny) && !outside[ny, nx])
          {
            outside[ny, nx] = true;
            queue.Enqueue((nx, ny));
          }
        }
      }

      // Remaining background cells inside the box that aren't 'outside' are holes.
      var visited = new bool[h, w];
      var holes = new List<List<(int x, int y)>>();
      for (int y = minY; y <= maxY; y++)
      {
        for (int x = minX; x <= maxX; x++)
        {
          if (!IsBg(x, y) || outside[y, x] || visited[y, x]) continue;
          var hole = new List<(int x, int y)>();
          var stack = new Stack<(int x, int y)>();
          stack.Push((x, y));
          visited[y, x] = true;
          while (stack.Count > 0)
          {
            var (cx, cy) = stack.Pop();
            hole.Add((cx, cy));
            foreach (var (dx, dy) in dir4)
            {
              int nx = cx + dx, ny = cy + dy;
              if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
              if (IsBg(nx, ny) && !outside[ny, nx] && !visited[ny, nx])
              {
                visited[ny, nx] = true;
                stack.Push((nx, ny));
              }
            }
          }
          if (hole.Count >= 2) holes.Add(hole);
        }
      }
      return holes;
    }

    private static List<PointF> ToFontPoints(List<(int x, int y)> contour, int midX, int maxY, float scale)
    {
      var points = new List<PointF>();
      (int x, int y)? prev = null;
      foreach (var p in contour)
      {
        if (prev.HasValue && prev.Value == p) continue;
        prev = p;
        points.Add(new PointF((p.x - midX) * scale, (maxY - p.y) * scale));
      }
      return points;
    }

    private static float SignedArea(List<PointF> pts)
    {
      float a = 0f;
      for (int i = 0; i < pts.Count - 1; i++)
      {
        a += pts[i].X * pts[i + 1].Y - pts[i + 1].X * pts[i].Y;
      }
      return a / 2f;
    }

    private static (int minX, int minY, int maxX, int maxY) Bounds(List<(int x, int y)> component)
    {
      int minX = int.MaxValue, minY = int.MaxValue, maxX = int.MinValue, maxY = int.MinValue;
      foreach (var (x, y) in component)
      {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return (minX, minY, maxX, maxY);
    }
  }
}
