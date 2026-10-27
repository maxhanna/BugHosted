# Importing original D2 skill missile art

The local extraction is `~/Desktop/d2/Work`. It is MPQ-flattened: thousands of DCCs have opaque `File########.xxx` names, and its `(listfile)` is only a partial index that does not map these missile files to names. There are many DCCs with the same direction/frame layout, so a header match narrows candidates but does not prove an identity. Do not label an asset as a confirmed skill solely from its filename, header, or color tint.

## Verify the source first

1. Read `File00009882.xxx`, the extracted tab-separated `Missiles.txt`, and find the skill's missile row. `CelFile`, `AnimLen`, `AnimSpeed`, and `NumDirections` identify the intended art and animation layout. For example, Fire Arrow's row says `CelFile=FireArrow`, `AnimLen=8`, and `NumDirections=32`.
2. Search `Work` for named missile DCCs (including `data/global/missiles`) and inspect the extracted missile table. If sources are numbered, inventory DCC headers as candidate evidence only. For Arctic Blast, `File00005568.xxx` has a 16-direction, 16-frame DCC header and decodes to a looped, expanding ice cloud. It matches the missile table and visible effect better than the previous generic IceBolt. `File00005569.xxx` has the same layout and a similar expansion animation; because this layout is not unique and names are absent, record the mapping as a best-match, not certain identity. `File00005601.xxx` has a 32-direction, 8-frame header (256 cels) and rendered cels that look like a small arrow/fire effect; this is also a best-match Fire Arrow candidate, not uniquely proven.
3. Decode a candidate to a temporary directory with the local converter at `Work/maxhanna.client/dcc-converter-bin/dcc-convert.exe`. Pass an input path ending in the logical `.dcc` name so the DCC decoder emits named frame files; never modify the supplied extraction. Review multiple frames and directions (and use the correct D2 palette when available) before promoting a candidate. The DCC decoder's grayscale output can be tinted from the missile table's Red/Green/Blue values, but this is not a substitute for validating the source art.

## Import a matched missile candidate

- Add a runtime asset ID -> DCC name to `SKILL_ANIMATIONS` and tint to `MISSILE_TINTS` in `tools/import_d2_skill_visuals.py`.
- When its source is opaque-numbered rather than named, add an exact, verified logical DCC name -> filename entry in `EXTRACTED_SOURCE_FILES`.
- Add the ID, frame duration, and frame count in `MISSILE_FRAME_DURATIONS_MS` and `MISSILE_FRAME_COUNTS` in `d2survivors.component.ts`; map only the skill(s) that actually use that missile in `SKILL_MISSILE_OVERLAYS`.
- Run `python tools/import_d2_skill_visuals.py --only <asset-id>` from `maxhanna.client` for a single source. The importer stores output in `src/assets/d2survivors/missiles/<asset-id>/` and records its source in `manifest.json`. Without `--only`, the script imports all configured DCCs, so those should all be confirmed and available first.
- Confirm the number and dimensions of generated frames against the manifest, then run the focused build and `git diff --check`. Remove any temporary contact sheets from the extraction/workspace after review; keep only runtime assets and this reference note.

## Imported candidate and known limitations

| Skill | Missile table CelFile | Work file | Layout | Runtime ID | Confidence |
|---|---|---|---|---|---|
| Arctic Blast | `expansion\ArcticBlastIce` | `File00005568.xxx` | 16 directions x 16 frames | `d2-arctic-blast` | Best match after decoding all directions/frames: expanding icy cloud; same-layout candidate `File00005569.xxx` is an alternate variant, so filename identity is not provable. `ArcticBlastIce_2` remains unresolved. |
| Fire Arrow | `FireArrow` | `File00005601.xxx` | 32 directions x 8 frames | `d2-fire-arrow` | Best-match candidate: table layout plus arrow-like rendered cels; not uniquely proven by header. DCC animates a small flame/arrowhead, so the runtime adds a small shaft to complete the projectile. |

The extraction has thousands of DCCs but no named missile directory; only a small set of unrelated test DCCs are named. Exact name/header searching found no separately named Molten Boulder, Tornado, Firebolt, Fireball, or other missile DCC sources under `Work`. Arctic Blast's first animation now uses the best matching decoded candidate noted above; its opaque filename remains an inference, not an original named-file match, and the second animation variant still needs locating. Some existing runtime missile sheets were already imported from supplied DCCs, but do not assume they all map to the exact `CelFile` in `Missiles.txt`. Continue to search and verify, and document unresolved skills rather than substituting unrelated art or reporting full original-asset coverage.
