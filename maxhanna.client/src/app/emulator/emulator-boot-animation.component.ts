import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { System } from './emulator-types';

/** What physically goes into the hardware on the boot screen. */
export type BootMedia = 'disc' | 'cartridge' | 'floppy' | 'coin';

/** Silhouette of the hardware that medium is inserted into. */
export type BootBody = 'console' | 'handheld' | 'desk' | 'cabinet';

/** Brand mark printed on the badge next to the wordmark. */
export type BootMark = 'ps' | 'sega' | 'nintendo' | 'xbox' | 'atari' | 'commodore';

export interface BootVisual {
  media: BootMedia;
  body: BootBody;
  /** Name printed on the hardware itself. */
  hardware: string;
  /** Body paint, used as a CSS background. */
  shell: string;
  /** LED, trim and cart/disc label colour. */
  accent: string;
  /** Ink for printed text; defaults to a light grey. */
  ink?: string;
  /** Manufacturer badge; omitted on machines that get a plain wordmark. */
  mark?: BootMark;
  /** Wordmark beside the badge, e.g. "PlayStation". */
  wordmark?: string;
  /** Small ribbon text, e.g. "16-BIT". */
  tagline?: string;
  /** Visible lid/flap the medium physically goes through. */
  lid?: 'disc' | 'cartridge';
  /** Controller ports on the front panel. */
  ports?: number;
  /** Front-panel buttons (power/reset/eject). */
  buttons?: number;
  /** Wood-grain front panel (Atari 2600 and friends). */
  wood?: boolean;
  /** Landscape handheld (PSP, GBA, Game Gear, Lynx). */
  wide?: boolean;
}

const visual = (
  media: BootMedia,
  body: BootBody,
  hardware: string,
  shell: string,
  accent: string,
  ink?: string,
  chrome: Partial<BootVisual> = {}
): BootVisual => ({ media, body, hardware, shell, accent, ink, ...chrome });

const DEFAULT_VISUAL = visual(
  'disc', 'console', 'SYSTEM',
  'linear-gradient(180deg,#3b4048,#1b1e23)', '#4aa8ff'
);

/**
 * One entry per system: the medium a player would actually handle, the shape of
 * the hardware, its paint, and the physical details that make the machine
 * recognisable (lid, cartridge flap, ports, buttons, badge).
 */
const BOOT_VISUALS: Partial<Record<System, BootVisual>> = {
  // Sony — light grey top-loader through to the black slabs.
  ps1: visual('disc', 'console', 'PlayStation', 'linear-gradient(180deg,#c8c9cc,#9a9ba0)', '#3f4a63', '#22252b',
    { mark: 'ps', wordmark: 'PlayStation', lid: 'disc', ports: 2, buttons: 3 }),
  ps2: visual('disc', 'console', 'PlayStation 2', 'linear-gradient(180deg,#33373e,#111316)', '#2f6fd0', undefined,
    { mark: 'ps', wordmark: 'PlayStation 2', lid: 'disc', ports: 2, buttons: 2 }),
  ps3: visual('disc', 'console', 'PlayStation 3', 'linear-gradient(180deg,#44494f,#15181c)', '#7fb2ff', undefined,
    { mark: 'ps', wordmark: 'PlayStation 3', lid: 'disc', buttons: 2 }),
  ps4: visual('disc', 'console', 'PlayStation 4', 'linear-gradient(180deg,#24272c,#0a0c0f)', '#4a8fe0', undefined,
    { mark: 'ps', wordmark: 'PlayStation 4', lid: 'disc', buttons: 1 }),
  ps5: visual('disc', 'console', 'PlayStation 5', 'linear-gradient(180deg,#f2f3f5,#c7cad1)', '#2f6fd0', '#1d2026',
    { mark: 'ps', wordmark: 'PlayStation 5', lid: 'disc', buttons: 1 }),
  psp: visual('disc', 'handheld', 'PSP', 'linear-gradient(180deg,#2b2f37,#0d0f13)', '#4aa8ff', undefined,
    { mark: 'ps', wordmark: 'PSP', wide: true }),

  // Sega.
  saturn: visual('disc', 'console', 'SEGA SATURN', 'linear-gradient(180deg,#4b4b45,#1f1f1b)', '#e0b64a', undefined,
    { mark: 'sega', wordmark: 'SEGA SATURN', lid: 'disc', ports: 2, buttons: 2 }),
  sega_cd: visual('disc', 'console', 'SEGA CD', 'linear-gradient(180deg,#2b2d33,#121316)', '#e04a4a', undefined,
    { mark: 'sega', wordmark: 'SEGA CD', lid: 'disc', buttons: 2 }),
  dreamcast: visual('disc', 'console', 'Dreamcast', 'linear-gradient(180deg,#f3f1ec,#d2cfc7)', '#e8683c', '#2b2b2b',
    { mark: 'sega', wordmark: 'Dreamcast', lid: 'disc', ports: 4, buttons: 2 }),
  genesis: visual('cartridge', 'console', 'MEGA DRIVE', 'linear-gradient(180deg,#2a2c31,#101113)', '#d63b3b', undefined,
    { mark: 'sega', wordmark: 'GENESIS', tagline: '16-BIT', lid: 'cartridge', ports: 2, buttons: 2 }),
  sega_master_system: visual('cartridge', 'console', 'MASTER SYSTEM', 'linear-gradient(180deg,#23252a,#0d0e11)', '#d63b3b', undefined,
    { mark: 'sega', wordmark: 'MASTER SYSTEM', lid: 'cartridge', ports: 2, buttons: 2 }),
  gamegear: visual('cartridge', 'handheld', 'GAME GEAR', 'linear-gradient(180deg,#2f343d,#101318)', '#3aa0e0', undefined,
    { mark: 'sega', wordmark: 'GAME GEAR', wide: true }),

  // Nintendo.
  nes: visual('cartridge', 'console', 'NINTENDO', 'linear-gradient(180deg,#d7d7d3,#a7a7a2)', '#c0392b', '#2a2a2a',
    { mark: 'nintendo', wordmark: 'Nintendo', lid: 'cartridge', ports: 2, buttons: 3 }),
  snes: visual('cartridge', 'console', 'SUPER NINTENDO', 'linear-gradient(180deg,#dadad5,#aeaeaa)', '#7d4fc0', '#2a2a2a',
    { mark: 'nintendo', wordmark: 'Super Nintendo', lid: 'cartridge', ports: 2, buttons: 3 }),
  n64: visual('cartridge', 'console', 'NINTENDO 64', 'linear-gradient(180deg,#41454c,#1a1c20)', '#f0b429', undefined,
    { mark: 'nintendo', wordmark: 'Nintendo 64', lid: 'cartridge', ports: 4, buttons: 2 }),
  gamecube: visual('disc', 'console', 'NINTENDO GAMECUBE', 'linear-gradient(180deg,#5b45a6,#2f2257)', '#c0a8ff', undefined,
    { mark: 'nintendo', wordmark: 'GAMECUBE', lid: 'disc', ports: 4, buttons: 1 }),
  wii: visual('disc', 'console', 'Wii', 'linear-gradient(180deg,#f4f3f0,#d3d2cd)', '#4aa8ff', '#232323',
    { mark: 'nintendo', wordmark: 'Wii', lid: 'disc', buttons: 2 }),
  wiiu: visual('disc', 'console', 'Wii U', 'linear-gradient(180deg,#26292e,#0e1014)', '#4aa8ff', undefined,
    { mark: 'nintendo', wordmark: 'Wii U', lid: 'disc', buttons: 2 }),
  gb: visual('cartridge', 'handheld', 'GAME BOY', 'linear-gradient(180deg,#d4cebe,#a7a18e)', '#8d3b53', '#2a2731',
    { mark: 'nintendo', wordmark: 'GAME BOY' }),
  gbc: visual('cartridge', 'handheld', 'GAME BOY COLOR', 'linear-gradient(180deg,#6e5da3,#382c62)', '#f0d24a', undefined,
    { mark: 'nintendo', wordmark: 'GAME BOY COLOR' }),
  gba: visual('cartridge', 'handheld', 'GAME BOY ADVANCE', 'linear-gradient(180deg,#4d4393,#211d4e)', '#9a8bff', undefined,
    { mark: 'nintendo', wordmark: 'GAME BOY ADVANCE', wide: true }),
  nds: visual('cartridge', 'handheld', 'NINTENDO DS', 'linear-gradient(180deg,#dcdfe3,#a6abb2)', '#3a6fd0', '#22252a',
    { mark: 'nintendo', wordmark: 'Nintendo DS' }),
  ndsi: visual('cartridge', 'handheld', 'NINTENDO DSi', 'linear-gradient(180deg,#2d3036,#101215)', '#3a6fd0', undefined,
    { mark: 'nintendo', wordmark: 'Nintendo DSi' }),
  virtual_boy: visual('cartridge', 'handheld', 'VIRTUAL BOY', 'linear-gradient(180deg,#363636,#111111)', '#d42b2b', undefined,
    { mark: 'nintendo', wordmark: 'Virtual Boy' }),

  // Atari — the wood-grain front is the giveaway.
  atari_2600: visual('cartridge', 'console', 'ATARI 2600', 'linear-gradient(180deg,#c9c6bd,#9c9990)', '#c98b2e', '#241f1a',
    { mark: 'atari', wordmark: '2600', wood: true, lid: 'cartridge', ports: 2, buttons: 2 }),
  atari_5200: visual('cartridge', 'console', 'ATARI 5200', 'linear-gradient(180deg,#33312c,#151412)', '#c98b2e', undefined,
    { mark: 'atari', wordmark: '5200', lid: 'cartridge', ports: 4, buttons: 2 }),
  atari_7800: visual('cartridge', 'console', 'ATARI 7800', 'linear-gradient(180deg,#2f2d29,#111110)', '#c98b2e', undefined,
    { mark: 'atari', wordmark: '7800', lid: 'cartridge', ports: 2, buttons: 2 }),
  atari_jaguar: visual('cartridge', 'console', 'JAGUAR', 'linear-gradient(180deg,#23252b,#0c0d10)', '#e04a4a', undefined,
    { mark: 'atari', wordmark: 'Jaguar', lid: 'cartridge', ports: 2, buttons: 2 }),
  atari_lynx: visual('cartridge', 'handheld', 'LYNX', 'linear-gradient(180deg,#c0bbab,#8b8678)', '#d94a3a', '#2a2731',
    { mark: 'atari', wordmark: 'Lynx', wide: true }),
  atari: visual('cartridge', 'console', 'ATARI', 'linear-gradient(180deg,#37342e,#151312)', '#c98b2e', undefined,
    { mark: 'atari', wordmark: 'VCS', wood: true, lid: 'cartridge', ports: 2 }),

  // Everything else.
  wonderswan: visual('cartridge', 'handheld', 'WONDERSWAN', 'linear-gradient(180deg,#ccc6b4,#9a9483)', '#3a4a8a', '#2a2731',
    { wordmark: 'WONDERSWAN', wide: true }),
  wonderswan_color: visual('cartridge', 'handheld', 'WONDERSWAN COLOR', 'linear-gradient(180deg,#3e4c8e,#1b224e)', '#7fc4ff', undefined,
    { wordmark: 'WONDERSWAN' }),
  coleco: visual('cartridge', 'console', 'COLECOVISION', 'linear-gradient(180deg,#2d2f33,#0e1013)', '#4aa8ff', undefined,
    { wordmark: 'COLECOVISION', lid: 'cartridge', ports: 2, buttons: 2 }),
  colecovision: visual('cartridge', 'console', 'COLECOVISION', 'linear-gradient(180deg,#2d2f33,#0e1013)', '#4aa8ff', undefined,
    { wordmark: 'COLECOVISION', lid: 'cartridge', ports: 2, buttons: 2 }),
  '3do': visual('disc', 'console', '3DO', 'linear-gradient(180deg,#2c2e33,#0f1114)', '#d8b25a', undefined,
    { wordmark: '3DO', lid: 'disc', ports: 2, buttons: 2 }),
  xbox: visual('disc', 'console', 'XBOX', 'linear-gradient(180deg,#242c24,#0a0f0a)', '#7cd94a', undefined,
    { mark: 'xbox', wordmark: 'Xbox', lid: 'disc', ports: 4, buttons: 2 }),
  xbox_360: visual('disc', 'console', 'XBOX 360', 'linear-gradient(180deg,#eaeae5,#c0c0bb)', '#5aa832', '#222',
    { mark: 'xbox', wordmark: 'Xbox 360', lid: 'disc', ports: 2, buttons: 2 }),
  xbox_one: visual('disc', 'console', 'XBOX ONE', 'linear-gradient(180deg,#1c1f23,#08090b)', '#7cd94a', undefined,
    { mark: 'xbox', wordmark: 'Xbox One', lid: 'disc', buttons: 1 }),
  xbox_series_x: visual('disc', 'console', 'XBOX SERIES X', 'linear-gradient(180deg,#1a1d21,#07080a)', '#7cd94a', undefined,
    { mark: 'xbox', wordmark: 'Xbox Series X', lid: 'disc', buttons: 1 }),

  // 8/16-bit home computers took floppies.
  c64: visual('floppy', 'desk', 'COMMODORE 64', 'linear-gradient(180deg,#dcd3b3,#b6ad8f)', '#8a5a3a', '#453f31',
    { mark: 'commodore', wordmark: 'commodore 64' }),
  c128: visual('floppy', 'desk', 'COMMODORE 128', 'linear-gradient(180deg,#d8cfaf,#b0a78a)', '#8a5a3a', '#453f31',
    { mark: 'commodore', wordmark: 'commodore 128' }),
  amiga: visual('floppy', 'desk', 'AMIGA', 'linear-gradient(180deg,#dcdacf,#b1aea4)', '#c0562f', '#2f2c26',
    { mark: 'commodore', wordmark: 'Amiga' }),
  pet: visual('floppy', 'desk', 'PET', 'linear-gradient(180deg,#d2caae,#a7a086)', '#6b5a3a', '#453f31',
    { wordmark: 'PET' }),
  plus4: visual('floppy', 'desk', 'PLUS/4', 'linear-gradient(180deg,#d4ccb0,#a8a187)', '#6b5a3a', '#453f31',
    { mark: 'commodore', wordmark: 'plus/4' }),
  vic20: visual('floppy', 'desk', 'VIC-20', 'linear-gradient(180deg,#d6cdb2,#aca58a)', '#6b5a3a', '#453f31',
    { mark: 'commodore', wordmark: 'VIC-20' }),
  dos: visual('floppy', 'desk', 'PC', 'linear-gradient(180deg,#d2ccbd,#a7a18e)', '#4a8fe0', '#37322a',
    { wordmark: 'PC' }),
  dosbox: visual('floppy', 'desk', 'PC', 'linear-gradient(180deg,#d2ccbd,#a7a18e)', '#4a8fe0', '#37322a',
    { wordmark: 'PC' }),
  arcade: visual('coin', 'cabinet', 'ARCADE', 'linear-gradient(180deg,#1e232d,#0a0c11)', '#ffc542'),
};

const MARK_TEXT: Record<BootMark, string> = {
  ps: 'PS',
  sega: 'SEGA',
  nintendo: 'N',
  xbox: 'X',
  atari: 'ATARI',
  commodore: ''
};

@Component({
  selector: 'app-emulator-boot-animation',
  templateUrl: './emulator-boot-animation.component.html',
  styleUrls: ['./emulator-boot-animation.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class EmulatorBootAnimationComponent {
  /** System being booted; decides the hardware, the medium and the colours. */
  @Input() system?: System | null;
  /** ROM file name; the disc/cart label is taken from it. */
  @Input() gameName?: string;
  /** Cover art from the ROM's FileEntry; printed on the label when it loads. */
  @Input() coverUrl?: string | null;
  /** Status line, e.g. "Downloading ROM - 12.30 / 44.50 MB (27%)". */
  @Input() status = '';
  /** 0-100 while the ROM is downloading; null when unknown. */
  @Input() progressPct: number | null = null;
  /** 'load' while the ROM downloads, 'boot' once the core is starting. */
  @Input() phase: 'load' | 'boot' = 'load';

  /** Set when the cover fails to load, so the label falls back to the title. */
  coverFailed = false;

  get visual(): BootVisual {
    return (this.system && BOOT_VISUALS[this.system]) || DEFAULT_VISUAL;
  }

  /** Glyph inside the manufacturer badge. */
  get markText(): string {
    return this.visual.mark ? MARK_TEXT[this.visual.mark] : '';
  }

  /** *ngFor helper so port/button counts stay declarative in the template. */
  slots(count?: number): number[] {
    return Array.from({ length: count ?? 0 }, (_, i) => i);
  }

  /** Cover art to print on the label, or null to print the ROM's name. */
  get coverSrc(): string | null {
    return this.coverUrl && !this.coverFailed ? this.coverUrl : null;
  }

  onCoverError(): void {
    this.coverFailed = true;
  }

  get caption(): string {
    if (this.phase === 'boot') {
      return `Starting ${this.visual.hardware}`;
    }
    switch (this.visual.media) {
      case 'cartridge': return 'Inserting the cartridge';
      case 'floppy': return 'Inserting the disk';
      case 'coin': return 'Inserting a coin';
      default: return 'Inserting the disc';
    }
  }

  /** ROM file name as it would be printed on the label: no tags, no extension. */
  get title(): string {
    const raw = (this.gameName ?? '')
      .replace(/\.(zip|7z|iso|bin|cue|chd|cso|pbp|gcm|nes|fds|unf|sfc|smc|swc|gb|gbc|gba|n64|z64|v64|nds|dsi|gen|md|smd|32x|sms|gg|pce|sgx|lnx|a26|a52|a78|j64|col|rom|d64|t64|adf|dsk|ipf|crt|prg|d81|woz|tap|cas|do|exe|com|iso)$/i, '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const cleaned = raw || (this.gameName ?? '').trim();
    return cleaned ? cleaned.slice(0, 30) : 'UNTITLED';
  }
}
