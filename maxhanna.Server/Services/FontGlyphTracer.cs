using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using System;
using System.Collections.Generic;
using System.Linq;

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

      // Start pixel: topmost, then leftmost.
      (int x, int y) start = component.OrderBy(p => p.y).ThenBy(p => p.x).First();

      bool IsFg(int x, int y) => x >= 0 && y >= 0 && x < w && y < h && mask[y, x];

      var contour = new List<(int x, int y)>();
      var seen = new HashSet<(int x, int y, int dir)>();
      (int x, int y) b = start;
      int backtrack = 4; // assume we entered from the west
      int safety = component.Count * 8 + 1024;

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

      if (contour.Count < 3) return null;

      // Normalize: flip Y (up is positive), baseline = lowest black pixel row (maxY).
      float scale = CapHeight / Math.Max(1f, (float)(maxY - minY + 1));
      int midX = (minX + maxX) / 2;

      var points = new List<PointF>();
      (int x, int y)? prev = null;
      foreach (var p in contour)
      {
        if (prev.HasValue && prev.Value == p) continue;
        prev = p;
        points.Add(new PointF((p.x - midX) * scale, (maxY - p.y) * scale));
      }
      if (points.Count < 3) return null;
      points.Add(points[0]); // close the loop

      float xMin = points.Min(p => p.X), xMax = points.Max(p => p.X);
      float yMin = points.Min(p => p.Y), yMax = points.Max(p => p.Y);

      return new GlyphResult
      {
        Character = '?',
        Contours = new List<List<PointF>> { points },
        AdvanceWidth = Math.Max(160f, (xMax - xMin) + CapHeight * 0.12f),
        XMin = xMin,
        YMin = yMin,
        XMax = xMax,
        YMax = yMax
      };
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
