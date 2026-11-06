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

## Elemental missiles: the D1 import mistake

`Data/Global/Missiles` in the local game data is a *mod* overlay, not the base
D2 missile folder. Its `Missiles.txt` fragment adds the D1 entries as ids 684+
and its DCCs are `D1FireBolt`, `D1FireBall`, `D1Lightning`, `D1Inferno` and
`D1MagmaBallTravel` — converted Diablo 1 sprites. Importing from that folder is
what made the fire and lightning skills look like Diablo 1 missiles, because
`SKILL_MISSILE_OVERLAYS` sends most classes' projectile skills to those five
ids.

The base D2 missile art in `d2data`/`d2exp` is only reachable as opaque
`File########.xxx` DCCs, and the extraction keeps no name index: the block order
is not the archive's directory order either (checked by aligning the
`Missiles.txt` CelFile layouts against the extracted sequence), so a DCC cannot
be tied back to a named `CelFile`. Do not claim a name match for unnamed DCCs.

What *is* addressable D2 art is `Desktop/d2/missile_overlays`, the numbered
missile/effect animation folders that the runtime's numeric missile ids already
come from. `tools/import_d2_missile_overlays.py --ids <a,b,c>` imports one folder
per id under `src/assets/d2survivors/missiles/<id>/` and records it in
`manifest.json`. Frames are downscaled to 160px on the long edge because the
renderer draws a missile at roughly 28 CSS px; the source cels are up to 900px
wide and cost megabytes each. Keep the source BMP matte as alpha (the importer
converts luminance to alpha and recentres frames) so the additive glow of these
cels stays soft; keying them like opaque sprites leaves a dark halo.

## Which overlay is which

The overlay folders are not named, so the mapping was made by rendering the whole
catalogue and reading what each animation shows. The current assignment:

| Element | Overlay ids | Used for |
|---|---|---|
| Arrow | `d2-fire-arrow`, `5`, `131` | Fire Arrow (dedicated sheet), Magic Arrow (`5`, blue bolt), Multiple/Guided Shot and Strafe (`131`, white comet) |
| Fire | `18` `31` `35` `41` `47` `48` `55` `74` `76` `84` `90` | Fire Bolt/Fire Ball/Inferno/Wake skills/Fire Wall/Blaze/Meteor/Hydra/Firestorm/Fissure/Volcano/Molten Boulder/Armageddon |
| Cold | `24` `51` `58` `85` `91` `93` `106` `137`, `d2-arctic-blast` | Ice/Cold/Freezing Arrow and Ice Bolt (`91`), Glacial Spike and Blades of Ice (`93`), Frozen Orb (`137`), Blizzard (`106`), Frost Nova (`51`), armours (`24`, `58`), Hurricane/Tornado/Twister (`85`), Arctic Blast (dedicated sheet) |
| Lightning | `43` `52` `113` `134`, `61` | Lightning/Chain Lightning/Thunder Storm/Lightning Fury (`43`), Charged Bolt/Nova/Static Field/Charged Bolt Sentry (`52`), Lightning and Death Sentry/Claws of Thunder (`134`), Energy Shield (`113`), Teleport/Telekinesis (`61`) |
| Poison and bone | `59` `65` `82` `88` `100` `108` `133` `135` `136` `139` `146` `147` `149` | Poison Javelin (`65`), Poison Nova (`139`), Poison Dagger/Venom (`147`), Cobra Strike/Poison Explosion (`146`), Phoenix Strike/Rabies (`149`), creeper cast (`59`), Bone Spear (`135`), Bone Spirit (`136`), Teeth (`133`), Bone Armor/Wall/Prison (`100`), Corpse Explosion (`108`), Life Tap (`88`) |
| Holy | `42` `72` `99` `110` `116` | Holy Bolt (`116`), Blessed Hammer (`110`), Holy Shield (`42`), auras (`72`) |
| Blade and melee | `68` `96` `97` `110` | Blade Sentinel/Fury/Shield and the claw skills (`110`), melee strikes (`96`), warcries and leaps (`97`), wereforms (`68`) |
| Curses | `88` `127` | Necromancer curses (`127`), Life Tap (`88`) |

`MISSILE_ELEMENTS` in `d2survivors.component.ts` records the damage kind of each
art id so art and gameplay stay independent. `MISSILE_FRAME_COUNTS` and
`MISSILE_FRAME_DURATIONS_MS` are generated from `manifest.json`; regenerate them
after importing (or pruning) ids, and keep every id that any table references.

## Summon art

The summons no longer use procedural silhouettes. `SUMMON_SPECIES` maps each
summon skill to a monster sheet, and `drawSummon` renders that species with the
same direction/frame logic as enemies:

| Summon | Art |
|---|---|
| Raven, Poison Creeper, Carrion Vine, Solar Creeper | `models/druid/animations/raven.png` and `poison-creeper.png` (the three vines are one model recoloured, as in D2) |
| Raise Skeleton, Skeletal Mage, Revive | `skeleton` sheet, revived monsters use the `goatman` sheet |
| Clay/Blood/Iron/Fire Golem | `minotaur`, `deathMauler`, `siegeBeast`, `salamander` sheets |
| Spirit/Dire Wolf, Grizzly | `wendigo` sheet, scaled up per summon |
| Oak Sage, Heart of Wolverine, Spirit of Barbs | `council`, `blunderbore`, `boneFetish` sheets |
| Valkyrie, Decoy | `sandRaider` sheet |
| Shadow Warrior, Shadow Master | `nihlathak` sheet |

Known limitation: no wolf, bear, sage, vine, golem or shadow DCC survives the
extraction with a name (see above), and `enemies/willowisp.png`, `wraith.png` and
`vulture-demon.png` are broken rips of an unrelated glyph atlas, so the closest
intact monster sheet stands in for each minion. Replacing them needs named summon
DCCs imported through `tools/import_d2_skill_visuals.py`.
