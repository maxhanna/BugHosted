export class Resources {

  // Separate collections for images and audio
  private imageToLoad: { [key: string]: string };
  private audioToLoad: { [key: string]: string };
  images: { [key: string]: { image: HTMLImageElement; isLoaded: boolean } } = {};
  audios: { [key: string]: { audio: HTMLAudioElement; isLoaded: boolean } } = {};
  dir = "assets/bones/";
  initialized = false;
  // Separate mute flags for music and sound effects
  musicMuted = false;
  sfxMuted = false;
  constructor() {
    this.imageToLoad = {
      armobot: `${this.dir}armobot.png`,
      spiderBot: `${this.dir}spiderbot.png`,
      fontWhite: `${this.dir}sprite-font-white.png`,
      fontBlack: `${this.dir}sprite-font-black.png`,
      groundFire: `${this.dir}groundFire.png`,
      hero: `${this.dir}herospritesheet.png`,
      pointer: `${this.dir}pointer.png`,
      portraits: `${this.dir}portraits-sheet.png`,
      referee: `${this.dir}referee-spritesheet.png`,
      shadow: `${this.dir}shadow.png`,
      shipsprite: `${this.dir}shipsprite.png`,
      skeleton: `${this.dir}skeletonspritesheet.png`,
      stars: `${this.dir}stars.png`,
      textBox: `${this.dir}sprite-text-background.png`,
      warpbase: `${this.dir}warpBase.png`,
    };
    this.audioToLoad = {
      arcadeUi: `${this.dir}arcade-ui.mp4`,
      pixelDreams: `${this.dir}pixeldreams.mp4`,
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
    pixelDreams: 'music',
    wilhelmScream: 'sfx',
    arcadeUi: 'sfx'
  };

  playSound(key: string, opts?: { volume?: number; loop?: boolean; allowOverlap?: boolean }) {
    const category = this.audioCategories[key] ?? 'sfx';
    if (category === 'music' && this.musicMuted) return;
    if (category === 'sfx' && this.sfxMuted) return;
    const entry = this.audios[key];
    if (!entry) return;
    const base = entry.audio;
    const volume = opts?.volume ?? 1;
    const loop = opts?.loop ?? false;
    const allowOverlap = opts?.allowOverlap ?? true;
    if (allowOverlap) {
      try {
        const clone = base.cloneNode(true) as HTMLAudioElement;
        clone.volume = volume;
        clone.loop = loop;
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

  stopSound(key: string) {
    const entry = this.audios[key];
    if (!entry) return;
    try {
      entry.audio.pause();
      entry.audio.currentTime = 0;
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
