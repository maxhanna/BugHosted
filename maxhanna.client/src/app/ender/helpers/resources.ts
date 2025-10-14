export class Resources {

  // Separate collections for images and audio
  private imageToLoad: { [key: string]: string };
  private audioToLoad: { [key: string]: string };
  images: { [key: string]: { image: HTMLImageElement; isLoaded: boolean } } = {};
  audios: { [key: string]: { audio: HTMLAudioElement; isLoaded: boolean } } = {};
  dir = "assets/ender/";
  initialized = false;
  muted = false; // global mute flag for Ender-related sounds
  constructor() {
    this.imageToLoad = {
      bikewall: `${this.dir}bikewall.png`,
      fontWhite: `${this.dir}sprite-font-white.png`,
      fontBlack: `${this.dir}sprite-font-black.png`,
      groundFire: `${this.dir}groundFire.png`,
      pointer: `${this.dir}pointer.png`,
      portraits: `${this.dir}portraits-sheet.png`,
      referee: `${this.dir}referee-spritesheet.png`,
      shadow: `${this.dir}shadow.png`,
      shipsprite: `${this.dir}shipsprite.png`,
      stars: `${this.dir}stars.png`, 
      textBox: `${this.dir}text-box.png`,
      warpbase: `${this.dir}warpBase.png`,
    };
    this.audioToLoad = {
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

  playSound(key: string, opts?: { volume?: number; loop?: boolean; allowOverlap?: boolean }) {
  if (this.muted) return; // respect global mute
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

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      // stop all currently looping/background sounds
      Object.keys(this.audios).forEach(k => {
        try { this.audios[k].audio.pause(); } catch { }
      });
    }
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
