export class Resources {

  // Separate collections for images and audio
  private imageToLoad: { [key: string]: string };
  private audioToLoad: { [key: string]: string };
  images: { [key: string]: { image: HTMLImageElement; isLoaded: boolean } } = {};
  audios: { [key: string]: { audio: HTMLAudioElement; isLoaded: boolean } } = {};
  // Track currently-playing cloned audio elements for allowOverlap plays so we can adjust their volume live
  private activeAudioClones: { [key: string]: Set<HTMLAudioElement> } = {};
  dir = "assets/bones/";
  initialized = false;
  // Separate mute flags for music and sound effects
  musicMuted = false;
  sfxMuted = false;
  // Global multiplier applied to all playback volumes (0.0 - 1.0)
  volumeMultiplier: number = 1.0;
  constructor() {
    this.imageToLoad = {
      armobot: `${this.dir}armobot.png`,
      lootbag: `${this.dir}lootbag.png`,
      spiderBot: `${this.dir}spiderbot.png`,
      floorbigtile: `${this.dir}floorbigtile.png`,
      fontWhite: `${this.dir}sprite-font-white.png`,
      fontBlack: `${this.dir}sprite-font-black.png`,
      groundFire: `${this.dir}groundFire.png`,
      knight: `${this.dir}knightspritesheet.png`,
      pointer: `${this.dir}pointer.png`,
      portraits: `${this.dir}portraits-sheet.png`,
      referee: `${this.dir}referee-spritesheet.png`,
      shadow: `${this.dir}shadow.png`,
      shipsprite: `${this.dir}shipsprite.png`,
      skeleton: `${this.dir}skeletonspritesheet.png`,
      stars: `${this.dir}stars.png`,
      textBox: `${this.dir}sprite-text-background.png`,
      townbg: `${this.dir}townbg.png`,
      townbg2: `${this.dir}townbg2.png`,
      warpbase: `${this.dir}warpBase.png`,
    };
    this.audioToLoad = {
      arcadeUi: `${this.dir}arcade-ui.mp4`,
      shadowsUnleashed: `${this.dir}shadows_unleashed.mp4`,
      maleDeathScream: `${this.dir}male_death_voice.mp4`,
      punchOrImpact: `${this.dir}punch_or_impact.mp4`,
      wilhelmScream: `${this.dir}wilhelm_scream.mp3`,
    };
    this.waitForCanvas();
  }

  waitForCanvas() {
    const observer = new MutationObserver((mutations, obs) => {
      if (document.getElementById("gameCanvas")) {
        obs.disconnect();
        this.loadResources();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  loadResources() {
    if (this.initialized) return;
    this.initialized = true;
    // Images
    Object.keys(this.imageToLoad).forEach((key: string) => {
      if (!this.images[key]) {
        const img = new Image();
        img.src = this.imageToLoad[key];
        this.images[key] = { image: img, isLoaded: false };
        img.onload = () => { this.images[key].isLoaded = true; };
      }
    });
    // Audio
    Object.keys(this.audioToLoad).forEach((key: string) => {
      if (!this.audios[key]) {
        const audio = new Audio(this.audioToLoad[key]);
        audio.preload = "auto";
        this.audios[key] = { audio, isLoaded: false };
        audio.addEventListener("canplaythrough", () => { this.audios[key].isLoaded = true; }, { once: true });
      }
    });
  }

  // audio categories help decide which mute flag applies
  private audioCategories: { [key: string]: 'music' | 'sfx' } = {
    shadowsUnleashed: 'music',
    wilhelmScream: 'sfx',
    arcadeUi: 'sfx',
    maleDeathScream: 'sfx',
    punchOrImpact: 'sfx',
  };


  playSound(key: string, opts?: { volume?: number; loop?: boolean; allowOverlap?: boolean }) {
    const category = this.audioCategories[key] ?? 'sfx';
    if (category === 'music' && this.musicMuted) return;
    if (category === 'sfx' && this.sfxMuted) return;
    const entry = this.audios[key];
    if (!entry) return;
    const base = entry.audio;
  // Apply per-play volume and global multiplier, clamped to [0,1]
  const requested = opts?.volume ?? 1;
  let volume = requested * (this.volumeMultiplier ?? 1);
  volume = Math.max(0, Math.min(1, volume));
    const loop = opts?.loop ?? false;
    const allowOverlap = opts?.allowOverlap ?? true;
    if (allowOverlap) {
      try {
        const clone = base.cloneNode(true) as HTMLAudioElement;
        clone.volume = volume;
        clone.loop = loop;
        // Keep track of clones so we can update volume later
        try {
          if (!this.activeAudioClones[key]) this.activeAudioClones[key] = new Set<HTMLAudioElement>();
          this.activeAudioClones[key].add(clone);
          const removeClone = () => { try { this.activeAudioClones[key].delete(clone); } catch { } };
          clone.addEventListener('ended', removeClone, { once: true });
          clone.addEventListener('pause', removeClone, { once: true });
        } catch { }
        void clone.play();
      } catch { }
    } else {
      try {
        base.pause();
        base.currentTime = 0;
        base.volume = volume;
        base.loop = loop;
        void base.play();
      } catch { }
    }
  }

  setVolumeMultiplier(mult: number) {
    if (typeof mult !== 'number' || isNaN(mult)) return;
    // Clamp to sensible range and compute scale relative to previous multiplier
    const oldMult = this.volumeMultiplier || 0;
    const newMult = Math.max(0, Math.min(1, mult));
    // If multiplier hasn't changed, nothing to do
    if (Math.abs(newMult - oldMult) < 1e-6) { this.volumeMultiplier = newMult; return; }
    this.volumeMultiplier = newMult;
    const scale = oldMult > 0 ? (newMult / oldMult) : newMult;
    // Immediately apply new multiplier to any currently-playing audio (base elements and tracked clones)
    try {
      Object.keys(this.audios).forEach(k => {
        const entry = this.audios[k];
        if (!entry) return;
        try {
          // Scale the base audio's volume by the factor
          entry.audio.volume = Math.max(0, Math.min(1, (entry.audio.volume || 0) * scale));
        } catch { }
        // Update any tracked clones
        try {
          const set = this.activeAudioClones[k];
          if (set) {
            set.forEach((clone) => {
              try {
                clone.volume = Math.max(0, Math.min(1, (clone.volume || 0) * scale));
              } catch { }
            });
          }
        } catch { }
      });
    } catch { }
  }

  stopSound(key: string) {
    const entry = this.audios[key];
    if (!entry) return;
    try {
      entry.audio.pause();
      entry.audio.currentTime = 0;
      // Also stop and clear any tracked clones for this key
      try {
        const set = this.activeAudioClones[key];
        if (set) {
          set.forEach(c => { try { c.pause(); c.currentTime = 0; } catch { } });
          set.clear();
        }
      } catch { }
    } catch { }
  }

  setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    if (muted) {
      // stop currently playing music
      Object.keys(this.audioCategories).forEach(k => {
        if (this.audioCategories[k] === 'music' && this.audios[k]) {
          try { this.audios[k].audio.pause(); } catch { }
        }
      });
    }
  }

  setSfxMuted(muted: boolean) {
    this.sfxMuted = muted;
    if (muted) {
      // stop any looping sfx
      Object.keys(this.audioCategories).forEach(k => {
        if (this.audioCategories[k] === 'sfx' && this.audios[k]) {
          try { this.audios[k].audio.pause(); } catch { }
        }
      });
    }
  }

  // Backwards-compatible helper to set both
  setMuted(muted: boolean) {
    this.setMusicMuted(muted);
    this.setSfxMuted(muted);
  }
}
export const resources = new Resources();
export function hexToRgb(hex: string) {
  // Remove the leading '#' if present
  hex = hex.replace(/^#/, '');

  // Parse the hex string into RGB components
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  return [r, g, b]; // Return the RGB values as an array
}
export interface Resource {
  image: HTMLImageElement;
  isLoaded: boolean;
}
