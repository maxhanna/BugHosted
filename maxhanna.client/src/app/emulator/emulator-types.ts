export type SystemCandidate = { label: string; core?: Core };
 
export type CoreDescriptor = {
  core: Core;
  label: string;
  exts?: string[];
  maybeExts?: string[];
  hints?: RegExp[];
};

export type VPadItem =
  | {
    type: 'button';
    text: string;
    id?: string;
    location: 'left' | 'right' | 'center' | 'top';
    left?: number;
    right?: number;
    top?: number;
    fontSize?: number;
    bold?: boolean;
    block?: boolean;
    input_value: number;
  }
  | {
    type: 'dpad';
    location: 'left' | 'right' | 'center' | 'top';
    left?: string;
    right?: string;
    joystickInput?: boolean;
    inputValues: [number, number, number, number];
  }
  | {
    type: 'zone';
    location: 'left' | 'right' | 'center' | 'top';
    left?: string;
    right?: string;
    top?: string;
    joystickInput: true;
    color?: string;
    inputValues: [number, number, number, number];
  };

export type System =
  | 'nes' | 'gb' | 'gbc' | 'gba'
  | 'snes'
  | 'genesis'
  | 'nds'
  | 'psp'
  | 'saturn'
  | 'sega_cd'
  | 'dreamcast'
  | 'wonderswan' | 'wonderswan_color'
  | 'virtual_boy'
  | 'gamegear'
  | 'master_system'
  | '3do'
  | 'n64'
  | 'ps1' | 'ps2' | 'ps3' | 'ps4' | 'ps5'
  | 'gamecube'
  | 'wii' | 'wiiu'
  | 'xbox' | 'xbox_360' | 'xbox_one' | 'xbox_series_x'
  | 'coleco'
  | 'dos'
  | 'atari_2600' | 'atari_5200' | 'atari_7800' | 'atari_lynx' | 'atari_jaguar' | 'atari'
  | 'c64' | 'c128' | 'amiga' | 'pet' | 'plus4' | 'vic20'
  | 'arcade';
  
export type Core =
  | 'fceumm'
  | 'gambatte'
  | 'mgba'
  | 'genesis_plus_gx'
  | 'snes9x'
  | 'picodrive'
  | 'mupen64plus_next'
  | 'mednafen_psx'
  | 'mednafen_psx_hw'
  | 'pcsx_rearmed'
  | 'duckstation'
  | 'melonds'
  | 'melonDS'
  | 'nds'
  | 'psp'
  | 'ppsspp'
  | 'dolphin'
  | 'flycast'
  | 'dreamcast'
  | 'naomi'
  | 'prosystem'
  | 'opera'
  | '3do'
  | 'genesis'
  | 'megadrive'
  | 'blastem'
  | 'pcsx2'
  | 'ps2'
  | 'lrps2'
  | 'gamecube'
  | 'gc'
  | 'wii'
  | 'gba'
  | 'gbc'
  | 'gbx'
  | 'gb'
  | 'yabause'
  | 'segaSaturn'
  | 'sega_saturn'
  | 'fbneo'
  | 'mame2003_plus'
  | 'sega_saturn'
  | 'fbneo'
  | 'desmume'
  | 'mednafen_vb'
  | 'stella2014'
  | 'handy'
  | 'virtualjaguar'
  | 'gearcoleco'
  | 'puae'
  | 'vitaquake3'
  | 'vice_x64'
  | 'mame2003_plus';

export interface BuildOpts {
  useJoystick: boolean;
  showControls?: boolean;
  twoButtonMode?: boolean;
  buttonSize?: number;
  genesisSix?: boolean;
}

export const MIN_STATE_SIZE: Record<string, number> = {
  // Light cores
  'fceumm': 8 * 1024,
  'gambatte': 8 * 1024,
  'mgba': 32 * 1024,
  'genesis_plus_gx': 16 * 1024,
  'snes9x': 64 * 1024,
  'picodrive': 16 * 1024,

  // Heavy cores – use conservative minimums
  'mupen64plus_next': 16 * 1024 * 1024,
  'mednafen_psx_hw': 1 * 1024 * 1024,
  'pcsx_rearmed': 1 * 1024 * 1024,
  'duckstation': 1 * 1024 * 1024,
  'melonds': 512 * 1024,
};

export const FAQ_ITEMS: { question: string; answerHtml: string; expanded: boolean }[] = [
  {
    question: 'My controller is connected but doesn\'t work — what should I do?',
    answerHtml:
      `Unpair all controllers from the PC, then pair and test one controller at a time.\n      Multiple paired controllers or leftover Bluetooth pairings can cause input routing conflicts.\n      Try restarting the browser after pairing.\n      If using a virtual gamepad, confirm the correct mapping in the on-screen controls.\n      If using regular gamepads, try re-mapping controls by clicking on the "Remap Controls" button\n      when a rom is loaded, or press the controller button in the emulator to bring up the controls mapping screen.`,
    expanded: false
  },
  {
    question: 'I don\'t hear any audio from the game.',
    answerHtml: `Check that the browser tab isn't muted, confirm the correct audio output device is selected in your OS, and ensure the emulator volume (in the menu) is not set to zero. Some browsers require user gesture before audio will play — try clicking the page first.`,
    expanded: false
  },
  {
    question: 'Save states aren\'t persisting between sessions.',
    answerHtml: `Make sure you're logged in and autosave is enabled. Manual saves are available via the "Manual Save" button which calls the emulator save API. Network interruptions or very large save files (PS1/N64) can delay or prevent uploads.`,
    expanded: false
  },
  {
    question: 'The game runs slowly or stutters.',
    answerHtml: `Close other heavy apps/tabs, enable hardware acceleration in your browser, and try reducing the emulator rendering size. On low-end devices, disabling on-screen controls or switching to simpler touch layouts can help.`,
    expanded: false
  },
  {
    question: 'What systems and games are supported?',
    answerHtml: `Available systems include:<ul>\n        <li><strong>Nintendo</strong>: Game Boy Advance, Famicom / NES, Virtual Boy, Game Boy, SNES, DS, N64</li>\n        <li><strong>Sega</strong>: Master System, Mega Drive / Genesis, Game Gear, Saturn, 32X, CD</li>\n        <li><strong>Atari</strong>: 2600, 5200, 7800, Lynx, Jaguar</li>\n        <li><strong>Commodore</strong>: Commodore 64, Commodore 128, Amiga, PET, Plus/4, VIC-20</li>\n        <li><strong>Other</strong>: PlayStation, PlayStation Portable (PSP), Arcade (MAME/3DO/MAME2003/ColecoVision)</li>\n      </ul>\n      The emulator supports a wide set of systems.`,
    expanded: false
  },
  {
    question: 'What does the "Autosave" button do?',
    answerHtml: `Toggles automatic periodic saving of the emulator state. (default 3 minutes; increased for large cores like N64/PS1).`,
    expanded: false
  },
  {
    question: 'What does "Enter Fullscreen" do?',
    answerHtml: `This hides the surrounding UI for a native fullscreen experience.`,
    expanded: false
  },
  {
    question: 'What does "Stop Emulator & Return to ROM Selection" do?',
    answerHtml: `Stops the running emulator, cleans up resources, and returns you to the ROM selection UI so you can choose another game. This calls the component's stop/cleanup logic (stopEmulator()).`,
    expanded: false
  },
  {
    question: 'What are the two "Reset Game" buttons?',
    answerHtml: `There are two reset options: "Reset Game (No Save)" restarts the ROM without saving the current state (useful for quick restarts). "Reset Game (Keep Save)" restarts but preserves the current persistent save file so your profile progress remains intact.`,
    expanded: false
  },
  {
    question: 'What does "Manual Save" do?',
    answerHtml: `Triggers an immediate save of the current emulator state to the server. Use this before closing if you don\'t rely on autosave.`,
    expanded: false
  },
  {
    question: 'What does the "Upload Rom(s)" control do?',
    answerHtml: `Uploads selected ROM files to the server (uploads go to the Roms directory).`,
    expanded: false
  },
  {
    question: 'What is "Enable/Disable Joystick" on mobile?',
    answerHtml: `Toggles the touch input mode between a D-pad and an analog joystick-like "zone" layout. The component builds different on-screen layouts depending on this flag (useJoystick) and other settings like two-button mode or Genesis six-button handling.`,
    expanded: false
  },
  {
    question: 'What are the "Fast" and "Slow" speed buttons?',
    answerHtml: `Small on-screen buttons are provided for temporary speed toggles.`,
    expanded: false
  },
  {
    question: 'How are save sizes and autosave intervals handled?',
    answerHtml: `The component enforces a minimum state size per core and adjusts autosave interval time: default is 3 minutes; for large-save cores like N64/PS1 it increases to 10 minutes to reduce upload frequency and prevent timeouts.`,
    expanded: false
  },
  {
    question: 'How can I auto-load a preset ROM via URL?',
    answerHtml: `You can pass query parameters when navigating to /Emulator: use <strong>?rom=FILE_NAME&amp;romId=ID</strong>. The component checks for these and will attempt to load them automatically if provided.`,
    expanded: false
  }
];

export const GENESIS_6BUTTON = new Set([
  "street-fighter-2-special-champion-edition",
  "super-street-fighter-2",
  "mortal-kombat-2",
  "mortal-kombat-3",
  "ultimate-mk3",
  "eternal-champions",
  "samurai-shodown",
  "weaponlord",
  "fatal-fury-2",
  "fatal-fury-special",
  "art-of-fighting",
  "comix-zone",
  "splatterhouse-3",
  "ranger-x"
]);

export const GENESIS_FORCE_THREE = new Set<string>([
  "forgotten-worlds",
  "golden-axe-ii",
  "ms-pac-man"
]);

export const PSP_DEFAULT_OPTIONS: Record<string, string> = {
  'rewindEnabled': 'Disabled',
  'vsync': 'Disabled',
  'ppsspp_cpu_core': 'JIT',
  'ppsspp_fast_memory': 'enabled',
  'ppsspp_locked_cpu_speed': '333MHz',
  'ppsspp_internal_resolution': '480x272',
  'ppsspp_software_rendering': 'disabled',
  'ppsspp_lazy_texture_caching': 'enabled',
  'ppsspp_gpu_hardware_transform': 'enabled'
};

declare global {
  interface Window {
    EJS_player?: string | HTMLElement;
    EJS_core?: string;
    EJS_controlScheme?: string;
    EJS_pathtodata?: string;
    EJS_coreUrl?: string;
    EJS_biosUrl?: string;
    EJS_gameUrl?: string;
    EJS_softLoad?: boolean;
    EJS_gameID?: number;
    EJS_gameIDKey?: string;
    EJS_gameName?: string;
    EJS_gameParent?: string;
    EJS_language?: string;
    EJS_startOnLoaded?: boolean;
    EJS_fullscreenOnLoad?: boolean;
    EJS_fullscreenOnLoaded?: boolean;
    EJS_fullscreen?: boolean;
    EJS_paths?: { [key: string]: string };
    EJS_volume?: number;
    EJS_threads?: boolean;
    EJS_netplayServer?: string;
    EJS_netplayUrl?: string;
    EJS_netplayICEServers?: any;
    EJS_maxThreads?: number;
    EJS_color?: string;
    EJS_backgroundColor?: string;
    EJS_backgroundImage?: string;
    EJS_lightgun?: boolean;
    EJS_onSaveState?: (state: Uint8Array) => void;
    EJS_onLoadState?: () => void;
    __ejsLoaderInjected?: boolean;
    __EJS_ALIVE__?: boolean;
    EJS_defaultOptionsForce?: boolean;
    EJS_defaultOptions?: Record<string, string | number>;
    EJS_disableLocalStorage?: boolean;
    EJS_directKeyboardInput?: boolean;
    EJS_enableGamepads?: boolean;
    EJS_disableAltKey?: boolean;
    EJS_webrtcConfig?: any;
    EJS_iceServers?: any;
    EJS_DEBUG_XX?: boolean;
    EJS_EXPERIMENTAL_NETPLAY?: boolean;
    EJS_logCoreInfo?: boolean;
    EJS_logSaves?: boolean;
    EJS_logVideo?: boolean;
    EJS_logAudio?: boolean;
    EJS_logInput?: boolean;
    EJS_vsync?: boolean;
    EJS_VirtualGamepadSettings?: any;
    EJS_defaultControls?: any;
    EJS_GL_Options?: any;
    EJS?: any;
    EJS_emulator?: any;
    EJS_Buttons?: any;
    EJS_GameManager?: any;
    __EJS__?: any;
    EJS_externalFiles?: Record<string, string>;
    Module?: any;
    FS?: any;
    EJS_afterStart?: () => void;
    EJS_ready?: (api: any) => void;
  }
}
