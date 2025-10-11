export class Resources {

  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};
  dir = "assets/ender/";
  initialized = false;
  constructor() {
    this.toLoad = {
      bikewall: `${this.dir}bikewall.png`,
      fontWhite: `${this.dir}sprite-font-white.png`,
      fontBlack: `${this.dir}sprite-font-black.png`,
      groundFire: `${this.dir}groundFire.png`,
      menuBorder: `${this.dir}menuborder.png`,
      pointer: `${this.dir}pointer.png`,
      portraits: `${this.dir}portraits-sheet.png`,
      referee: `${this.dir}referee-spritesheet.png`,
      shadow: `${this.dir}shadow.png`,
      ship: `${this.dir}ship.png`,
      shipsprite: `${this.dir}shipsprite.png`,
      textBox: `${this.dir}text-box.png`,
      warpbase: `${this.dir}warpBase.png`,
    };
    this.images = {};
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
    Object.keys(this.toLoad).forEach((key: string) => {
      if (!this.images[key]) {
        const img = new Image();
        img.src = this.toLoad[key];
        this.images[key] = {
          image: img,
          isLoaded: false,
        };

        img.onload = () => {
          this.images[key].isLoaded = true;
        };
      }
    });
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
