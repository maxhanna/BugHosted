using System.Text;
using SixLabors.ImageSharp;

namespace maxhanna.Server.Services
{
  /// <summary>
  /// Minimal TrueType font (TTF) writer. Builds the classic set of sfnt tables
  /// (cmap format 12, glyf, head, hhea, hmtx, loca, maxp, name, OS/2, post)
  /// from quadratic-contour glyph outlines. Glyph source data is traced from
  /// pixel art via <see cref="FontGlyphTracer"/>, so curves are emitted as
  /// alternating on/off points for broad renderer compatibility.
  /// </summary>
  public static class FontBuilder
  {
    public const ushort UnitsPerEm = 1024;

    public static byte[] BuildTtf(string familyName, IReadOnlyList<GlyphResult> glyphs)
    {
      var ordered = glyphs.OrderBy(g => (int)g.Character).ToList();

      var glyf = BuildGlyfAndLoca(ordered, out var locaOffsets);
      var cmap = BuildCmap(ordered);
      var hhea = BuildHhea(ordered);
      var hmtx = BuildHmtx(ordered);
      var maxp = BuildMaxp(ordered);
      var name = BuildName(familyName);
      var os2 = BuildOS2(ordered);
      var post = BuildPost();
      var head = BuildHead(ordered);

      var glyphCount = ordered.Count + 1; // + .notdef

      // ---- loca (indexToLocFormat 0: offset/2 as uint16) ----
      var loca = new byte[(glyphCount + 1) * 2];
      var locaWriter = new BE(loca);
      for (int i = 0; i <= glyphCount; i++)
      {
        locaWriter.WriteUInt16((ushort)(locaOffsets[i] / 2));
      }

      var tables = new List<(string tag, byte[] data)>
      {
        ("cmap", cmap),
        ("glyf", glyf),
        ("head", head),
        ("hhea", hhea),
        ("hmtx", hmtx),
        ("loca", loca),
        ("maxp", maxp),
        ("name", name),
        ("OS/2", os2),
        ("post", post)
      };

      return Assemble(tables, false);
    }

    // ---------------------------------------------------------------- glyf/loca

    private static byte[] BuildGlyfAndLoca(IReadOnlyList<GlyphResult> ordered, out int[] offsets)
    {
      int glyphCount = ordered.Count + 1;
      var glyphBlobs = new List<byte[]>(glyphCount);
      for (int g = 0; g < glyphCount; g++)
      {
        glyphBlobs.Add(g == 0 ? EmptyGlyph() : SingleContourGlyph(ordered[g - 1].Contours));
      }

      offsets = new int[glyphCount + 1];
      int running = 0;
      for (int g = 0; g < glyphCount; g++)
      {
        offsets[g] = running;
        running += glyphBlobs[g].Length;
      }
      offsets[glyphCount] = running;

      var buffer = new byte[running];
      int pos = 0;
      foreach (var blob in glyphBlobs)
      {
        Buffer.BlockCopy(blob, 0, buffer, pos, blob.Length);
        pos += blob.Length;
      }
      return buffer;
    }

    private static byte[] EmptyGlyph()
    {
      // numberOfContours = 0: no outline data.
      return new byte[10];
    }

    private static byte[] SingleContourGlyph(List<List<PointF>> contours)
    {
      var validContours = contours.Where(c => c.Count >= 3).ToList();
      var allPoints = new List<(int x, int y, bool on)>();
      foreach (var contour in validContours)
      {
        // Pixel-art outlines must stay crisp: emit every traced point as an
        // on-curve corner so consecutive points render as straight edges.
        // Alternating on/off points would turn each 90-degree pixel corner
        // into a smooth quadratic bulge, which is what made the output look
        // like a generic rounded font instead of the source art.
        foreach (var p in contour)
        {
          allPoints.Add(((int)Math.Round(p.X), (int)Math.Round(p.Y), true));
        }
      }

      int minX = allPoints.Count > 0 ? allPoints.Min(p => p.x) : 0;
      int minY = allPoints.Count > 0 ? allPoints.Min(p => p.y) : 0;
      int maxX = allPoints.Count > 0 ? allPoints.Max(p => p.x) : 0;
      int maxY = allPoints.Count > 0 ? allPoints.Max(p => p.y) : 0;

      using var ms = new System.IO.MemoryStream();
      var w = new BE(ms);

      w.WriteInt16((short)validContours.Count);
      w.WriteInt16((short)minX);
      w.WriteInt16((short)minY);
      w.WriteInt16((short)maxX);
      w.WriteInt16((short)maxY);

      // endPtsOfContours
      int count = 0;
      foreach (var contour in validContours)
      {
        count += contour.Count;
        w.WriteUInt16((ushort)(count - 1));
      }

      // instructionLength = 0
      w.WriteUInt16(0);

      // flags, then x deltas, then y deltas
      var flags = new List<byte>();
      var xData = new List<byte>();
      var yData = new List<byte>();

      int prevX = 0, prevY = 0;
      foreach (var (x, y, on) in allPoints)
      {
        int dx = x - prevX;
        int dy = y - prevY;
        prevX = x;
        prevY = y;

        byte f = (byte)(on ? 1 : 0);
        if (dx == 0) { f |= 0x10; }
        else if (dx >= -255 && dx <= 255)
        {
          f |= 0x02;
          if (dx > 0) f |= 0x10;
          xData.Add((byte)Math.Abs(dx));
        }
        else
        {
          xData.AddRange(BE.GetBytes((short)dx));
        }

        if (dy == 0) { f |= 0x20; }
        else if (dy >= -255 && dy <= 255)
        {
          f |= 0x04;
          if (dy > 0) f |= 0x20;
          yData.Add((byte)Math.Abs(dy));
        }
        else
        {
          yData.AddRange(BE.GetBytes((short)dy));
        }

        flags.Add(f);
      }

      foreach (var f in flags) w.WriteByte(f);
      foreach (var b in xData) w.WriteByte(b);
      foreach (var b in yData) w.WriteByte(b);

      return ms.ToArray();
    }

    // ------------------------------------------------------------------ Tables

    private static byte[] BuildCmap(IReadOnlyList<GlyphResult> ordered)
    {
      int glyphCount = ordered.Count + 1;
      int groupCount = ordered.Count; // one group per real glyph

      // subtable (format 12)
      int subLen = 16 + groupCount * 12;
      var sub = new byte[subLen];
      var sw = new BE(sub);
      sw.WriteUInt16(12);
      sw.WriteUInt16(0);
      sw.WriteUInt32((uint)subLen);
      sw.WriteUInt32(0);
      sw.WriteUInt32((uint)groupCount);
      for (int i = 0; i < ordered.Count; i++)
      {
        uint cp = (uint)ordered[i].Character;
        sw.WriteUInt32(cp);
        sw.WriteUInt32(cp);
        sw.WriteUInt32((uint)(1 + i));
      }

      // cmap header
      var header = new byte[12];
      var hw = new BE(header);
      hw.WriteUInt16(0);             // version
      hw.WriteUInt16(1);             // numTables
      hw.WriteUInt16(3);             // platformID (Windows)
      hw.WriteUInt16(10);            // encodingID (Unicode full repertoire)
      hw.WriteUInt32(12);            // offset to subtable

      return header.Concat(sub).ToArray();
    }

    private static byte[] BuildHead(IReadOnlyList<GlyphResult> ordered)
    {
      var data = new byte[54];
      var w = new BE(data);
      w.WriteUInt32(0x00010000);        // version
      w.WriteUInt32(0x00010000);        // fontRevision
      w.WriteUInt32(0);                 // checkSumAdjustment (padded later by Assemble)
      w.WriteUInt32(0x5F0F3CF5);        // magicNumber
      w.WriteUInt16(0x0003);            // flags
      w.WriteUInt16(UnitsPerEm);        // unitsPerEm
      long ts = 3423427200;             // fixed timestamp (~2008)
      w.WriteInt64(ts);                 // created
      w.WriteInt64(ts);                 // modified
      w.WriteInt16((short)(ordered.Count > 0 ? ordered.Min(g => (int)Math.Floor(g.XMin)) : 0));
      w.WriteInt16((short)(ordered.Count > 0 ? ordered.Min(g => (int)Math.Floor(g.YMin)) : 0));
      w.WriteInt16((short)(ordered.Count > 0 ? ordered.Max(g => (int)Math.Ceiling(g.XMax)) : 0));
      w.WriteInt16((short)(ordered.Count > 0 ? ordered.Max(g => (int)Math.Ceiling(g.YMax)) : 0));
      w.WriteUInt16(0);                 // macStyle
      w.WriteUInt16(8);                 // lowestRecPPEM
      w.WriteInt16(2);                  // fontDirectionHint
      w.WriteInt16(0);                  // indexToLocFormat (short loca)
      w.WriteInt16(0);                  // glyphDataFormat
      return data;
    }

    private static byte[] BuildHhea(IReadOnlyList<GlyphResult> ordered)
    {
      var data = new byte[36];
      var w = new BE(data);
      w.WriteUInt32(0x00010000);
      w.WriteInt16(700);                       // ascent
      w.WriteInt16(-200);                      // descent
      w.WriteInt16(0);                         // lineGap
      w.WriteUInt16((ushort)(ordered.Count > 0 ? (int)Math.Ceiling(ordered.Max(g => g.AdvanceWidth)) : 1024)); // advanceWidthMax
      w.WriteInt16(0);                         // minLeftSideBearing
      w.WriteInt16(0);                         // minRightSideBearing
      w.WriteInt16(0);                         // xMaxExtent
      w.WriteInt16(1);                         // caretSlopeRise
      w.WriteInt16(0);                         // caretSlopeRun
      w.WriteInt16(0);                         // caretOffset
      w.WriteInt16(0); w.WriteInt16(0); w.WriteInt16(0); w.WriteInt16(0); // reserved
      w.WriteInt16(0);                         // metricDataFormat
      w.WriteUInt16((ushort)(ordered.Count + 1)); // numberOfHMetrics
      return data;
    }

    private static byte[] BuildHmtx(IReadOnlyList<GlyphResult> ordered)
    {
      int count = ordered.Count + 1;
      var data = new byte[count * 4];
      var w = new BE(data);
      for (int i = 0; i < count; i++)
      {
        int advance = i == 0 ? 1024 : (int)Math.Ceiling(ordered[i - 1].AdvanceWidth);
        int lsb = i == 0 ? 0 : (int)Math.Max(0, Math.Floor(ordered[i - 1].XMin));
        w.WriteUInt16((ushort)advance);
        w.WriteInt16((short)lsb);
      }
      return data;
    }

    private static byte[] BuildMaxp(IReadOnlyList<GlyphResult> ordered)
    {
      int glyphCount = ordered.Count + 1;
      int maxPoints = 1, maxContours = 1;
      foreach (var g in ordered)
      {
        foreach (var contour in g.Contours)
        {
          maxContours = Math.Max(maxContours, g.Contours.Count);
          maxPoints = Math.Max(maxPoints, contour.Count);
        }
      }

      var data = new byte[32];
      var w = new BE(data);
      w.WriteUInt32(0x00010000);    // version 1.0
      w.WriteUInt16((ushort)glyphCount);
      w.WriteUInt16((ushort)maxPoints);
      w.WriteUInt16((ushort)maxContours);
      w.WriteUInt16(0);             // maxCompositePoints
      w.WriteUInt16(0);             // maxCompositeContours
      w.WriteUInt16(2);             // maxZones
      w.WriteUInt16(0);             // maxTwilightPoints
      w.WriteUInt16(0);             // maxStorage
      w.WriteUInt16(0);             // maxFunctionDefs
      w.WriteUInt16(0);             // maxInstructionDefs
      w.WriteUInt16(0);             // maxStackElements
      w.WriteUInt16(0);             // maxSizeOfInstructions
      w.WriteUInt16(0);             // maxComponentElements
      w.WriteUInt16(0);             // maxComponentDepth
      return data;
    }

    private static byte[] BuildName(string familyName)
    {
      string psName = new string(familyName.Where(c => char.IsLetterOrDigit(c) || c == '-').ToArray());
      if (string.IsNullOrEmpty(psName)) psName = "MaxhannaConvert";
      string full = familyName + " Regular";

      var entries = new (ushort nameId, string value)[]
      {
        (1, familyName),       // Family
        (2, "Regular"),        // Subfamily
        (3, full),             // Unique ID
        (4, full),             // Full name
        (6, psName),           // PostScript name
        (16, familyName),      // Typographic Family
        (17, "Regular")        // Typographic Subfamily
      };

      var strings = new List<byte[]>();
      foreach (var (_, value) in entries) strings.Add(Encoding.BigEndianUnicode.GetBytes(value));

      ushort count = (ushort)entries.Length;
      ushort stringOffset = (ushort)(6 + 12 * count);
      var data = new byte[stringOffset + strings.Sum(s => s.Length)];
      var w = new BE(data);
      w.WriteUInt16(0); // format
      w.WriteUInt16(count);
      w.WriteUInt16(stringOffset);

      int cursor = 0;
      for (int i = 0; i < entries.Length; i++)
      {
        w.WriteUInt16(3);        // platformID (Windows)
        w.WriteUInt16(1);        // encodingID (UCS-2)
        w.WriteUInt16(0x409);    // languageID (en-US)
        w.WriteUInt16(entries[i].nameId);
        w.WriteUInt16((ushort)strings[i].Length);
        w.WriteUInt16((ushort)cursor);
        cursor += strings[i].Length;
      }

      int pos = stringOffset;
      foreach (var s in strings)
      {
        Buffer.BlockCopy(s, 0, data, pos, s.Length);
        pos += s.Length;
      }
      return data;
    }

    private static byte[] BuildOS2(IReadOnlyList<GlyphResult> ordered)
    {
      uint first = ordered.Count > 0 ? (uint)ordered.Min(g => (int)g.Character) : 0x20;
      uint last = ordered.Count > 0 ? (uint)ordered.Max(g => (int)g.Character) : 0x20;

      var data = new byte[86];
      var w = new BE(data);
      w.WriteUInt16(0);                    // version
      w.WriteInt16(500);                   // xAvgCharWidth
      w.WriteUInt16(400);                  // usWeightClass
      w.WriteUInt16(5);                    // usWidthClass
      w.WriteUInt16(0);                    // fsType
      w.WriteInt16(650); w.WriteInt16(600); w.WriteInt16(0); w.WriteInt16(75);   // ySubscript*
      w.WriteInt16(650); w.WriteInt16(600); w.WriteInt16(0); w.WriteInt16(350);  // ySuperscript*
      w.WriteInt16(50); w.WriteInt16(325); // yStrikeout*
      w.WriteInt16(0);                     // sFamilyClass
      w.WriteBytes(new byte[] { 0, 0, 2, 0, 0, 0, 0, 0, 0, 0 }); // panose
      w.WriteUInt32(0x00000001);           // ulUnicodeRange1 (Basic Latin)
      w.WriteUInt32(0);
      w.WriteUInt32(0);
      w.WriteUInt32(0);
      w.WriteBytes(Encoding.ASCII.GetBytes("MAXH")); // achVendID
      w.WriteUInt16(0x0040);               // fsSelection (REGULAR)
      w.WriteUInt16((ushort)first);        // usFirstCharIndex
      w.WriteUInt16((ushort)last);         // usLastCharIndex
      w.WriteInt16(700);                   // sTypoAscender
      w.WriteInt16(-200);                  // sTypoDescender
      w.WriteInt16(0);                     // sTypoLineGap
      w.WriteUInt16(700);                  // usWinAscent
      w.WriteUInt16(200);                  // usWinDescent
      w.WriteUInt32(0x00000001);           // ulCodePageRange1
      w.WriteUInt32(0);                    // ulCodePageRange2
      return data;
    }

    private static byte[] BuildPost()
    {
      var data = new byte[32];
      var w = new BE(data);
      w.WriteUInt32(0x00030000); // version 3.0 (no glyph names)
      w.WriteUInt32(0);          // italicAngle
      w.WriteInt16(0);           // underlinePosition
      w.WriteInt16(0);           // underlineThickness
      w.WriteUInt32(0);          // isFixedPitch
      w.WriteUInt32(0); w.WriteUInt32(0); w.WriteUInt32(0); w.WriteUInt32(0); // min/max mem
      return data;
    }

    // --------------------------------------------------------------- Assembly

    private static byte[] Assemble(List<(string tag, byte[] data)> tables, bool _ignored)
    {
      int numTables = tables.Count;
      int entrySelector = (int)Math.Log(numTables, 2);
      int searchRange = (int)Math.Pow(2, entrySelector) * 16;
      int rangeShift = numTables * 16 - searchRange;

      int headerSize = 12 + numTables * 16;
      int offset = headerSize;

      var records = new List<(string tag, int checksum, int offset, int length)>();
      foreach (var (tag, data) in tables)
      {
        int checksum = Checksum(data);
        records.Add((tag, checksum, offset, data.Length));
        offset += Align4(data.Length);
      }

      // Full file (head data will be patched with checkSumAdjustment).
      var buffer = new byte[offset];
      var w = new BE(buffer);

      w.WriteUInt32(0x00010000);
      w.WriteUInt16((ushort)numTables);
      w.WriteUInt16((ushort)searchRange);
      w.WriteUInt16((ushort)entrySelector);
      w.WriteUInt16((ushort)rangeShift);

      foreach (var (tag, checksum, off, len) in records)
      {
        w.WriteBytes(Encoding.ASCII.GetBytes(tag));
        w.WriteUInt32((uint)checksum);
        w.WriteUInt32((uint)off);
        w.WriteUInt32((uint)len);
      }

      foreach (var (tag, _, off, _) in records)
      {
        var data = tables.First(t => t.tag == tag).data;
        Array.Copy(data, 0, buffer, off, data.Length);
      }

      // head.checkSumAdjustment = 0xB1B0AFBA - sum(entire font as uint32 BE)
      int headIndex = records.FindIndex(r => r.tag == "head");
      int headOffset = records[headIndex].offset;
      long whole = 0;
      for (int i = 0; i + 3 < buffer.Length; i += 4)
      {
        whole += ((uint)buffer[i] << 24) | ((uint)buffer[i + 1] << 16) | ((uint)buffer[i + 2] << 8) | buffer[i + 3];
      }
      uint adjustment = (uint)(0xB1B0AFBA - (whole & 0xFFFFFFFFu));
      var adjBytes = BE.GetBytes(adjustment);
      Array.Copy(adjBytes, 0, buffer, headOffset + 8, 4);

      return buffer;
    }

    private static int Checksum(byte[] data)
    {
      long sum = 0;
      for (int i = 0; i + 3 < data.Length; i += 4)
      {
        sum += ((uint)data[i] << 24) | ((uint)data[i + 1] << 16) | ((uint)data[i + 2] << 8) | data[i + 3];
      }
      if (data.Length % 4 != 0)
      {
        int rem = data.Length & 3;
        uint last = 0;
        for (int j = 0; j < rem; j++) last |= (uint)data[data.Length - rem + j] << (8 * (3 - j));
        sum += last;
      }
      return (int)(sum & 0xFFFFFFFFu);
    }

    private static int Align4(int n) => (n + 3) & ~3;

    // ---------------------------------------------------------- Big-endian IO

    private sealed class BE
    {
      private readonly System.IO.Stream _s;
      private int _pos;

      public BE(byte[] buffer) { _s = new System.IO.MemoryStream(buffer, true) { Position = 0 }; }
      public BE(System.IO.MemoryStream ms) { _s = ms; }

      public static byte[] GetBytes(short value) => new[]
      {
        (byte)((value >> 8) & 0xFF), (byte)(value & 0xFF)
      };

      public static byte[] GetBytes(uint value) => new[]
      {
        (byte)((value >> 24) & 0xFF), (byte)((value >> 16) & 0xFF),
        (byte)((value >> 8) & 0xFF), (byte)(value & 0xFF)
      };

      public void WriteByte(byte b) { _s.WriteByte(b); _pos++; }
      public void WriteBytes(byte[] bytes) { _s.Write(bytes, 0, bytes.Length); _pos += bytes.Length; }
      public void WriteUInt16(ushort v) => WriteBytes(GetBytes((short)v));
      public void WriteInt16(short v) => WriteBytes(GetBytes(v));
      public void WriteUInt32(uint v) => WriteBytes(GetBytes(v));
      public void WriteInt64(long v)
      {
        WriteUInt32((uint)((v >> 32) & 0xFFFFFFFF));
        WriteUInt32((uint)(v & 0xFFFFFFFF));
      }
    }
  }
}