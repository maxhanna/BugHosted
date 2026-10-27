# D2 Survivors art credits

Existing assets below are third-party assets released under CC0 (public domain dedication). They are not from Blizzard or any Diablo product.

| File | Source | License |
|---|---|---|
| hero.png, skeleton.png | Square characters animated 8 directions top down (https://opengameart.org/content/hand-drawn-square-characters-animated-8-directions-top-down-free-cc0) | CC0 |
| denzi_tiles.png (floor tiles), denzi_monsters.png (demon enemies) | DENZI's public domain art (https://opengameart.org/content/denzis-public-domain-art) | CC0 |
| fallen.png | Mini Daemon (https://opengameart.org/content/mini-daemon). No longer used by the game. | CC0 |
| zombie.png | Zombie and Zombie RPG sprites (https://opengameart.org/content/zombie-rpg-sprites). No longer used by the game. | CC0 |
| lord.png | Zombie RPG sprites, fat zombie. No longer used by the game. | CC0 |
| bat.gif | Bat (32x32) (https://opengameart.org/content/bat-32x32) | CC0 |
| panel.png, header.png, bar.png | Tiny RPG - Dark Dwellers GUI (https://opengameart.org/content/tiny-rpg-dark-dwellers-gui) | CC0 |

## Locally supplied monster images and animation sheets

The static `enemies/act*.png` images and the `enemy-anim-*.png` animation sheets used by D2 Survivors are derived from images or converted DCC/COF animation files supplied locally by the user from Diablo II data. They are not redistributable game assets. Verify permission before publishing or redistributing these files. The animation sheets retain their direction rows and frame columns for runtime animation; the game uses a generated approximate palette because the original base palette was not supplied.

## Locally supplied monster sheets

`monster-fallen.png`, `monster-zombie.png`, `monster-skeleton.png`, `monster-demon.png`, `monster-lord.png`, `monster-acidbeast.png`, `monster-goatman.png`, `monster-succubus.png`, `monster-knight.png`, `monster-clawviper.png`, `monster-darkmage.png`, and `monster-gargoyle.png` are converted animation sheets made from DCC/COF files in the user's local `Data/Global/Monsters` directory. They are derived from user-provided Diablo II data, not redistributable game assets. The sheets are included as project assets so the app can load them; verify you have permission before publishing or redistributing them.

`monster-palette-approx.dat` is a generated, 256-entry BGR palette used only because the supplied files did not include a base `pal.dat`. The colors are approximate and are not the original game palette. The sheets were assembled with the COF layer order; direction rows and frame columns are retained for runtime animation. The local converter defaults to seven verified tokens and selects a complete armor variant when a local DCC variant is truncated; Diablo's supplied A1 DCC is incomplete and was excluded.

## Locally supplied level backgrounds

`maps/act1-barracks.png`, `maps/act2-caves.png`, `maps/act3-jungle.png`, `maps/act4-catacombs.png`, and `maps/act5-worldstone.png` are isometric room/map images from the user's local `D2 Tiles Collection/images` folder. `maps/tiles/act1-floor-tiles.png` through `maps/tiles/act5-floor-tiles.png` are generated sprite atlases of selected floor tiles extracted from the corresponding Act 1–5 floor atlas images in that collection. These are user-supplied Diablo II images, not CC0 artwork; verify that you have permission before publishing or redistributing them.

## Locally supplied DC6 interface, skill icon, and level-name sprites

`skills/jab-spear.png` is frame 0 from the user's supplied `Work/File00005453.dc6`, decoded with the supplied `File00009884.pcx` palette. It is an original D2 spear sprite used as the Jab HUD icon (not missile art). `ui/dc6/800borderframe`, `ui/dc6/800ctrlpnl7`, and `ui/dc6/loadingscreen` contain transparent WebP conversions of 27 frames from the user's supplied Diablo II UI DC6 files. `ui/dc6/act1` through `ui/dc6/act5` contain 143 additional converted frames from the corresponding `A1L*`, `A2L*`, `A3L*`, `A4L*`, and `A5L*` level-label DC6s. The player UI imports the supplied control-panel and border sprites; the extracted area-name images are preserved as reference assets, while the campaign HUD displays locally transcribed level names. Palette indices are resolved using the 256-color table embedded in the user's supplied `File00009884.pcx`; transparent skip runs remain alpha-transparent. The source assets are user-provided Diablo II data, not redistributable game assets; verify that you have permission before publishing or redistributing them.

