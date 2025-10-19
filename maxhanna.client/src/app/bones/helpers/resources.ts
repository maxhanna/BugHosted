export class Resources {
  toLoad: { [key: string]: string }; images: { [key: string]: any } = {}; dir = "assets/metabots/"; initialized = false;
  constructor() { this.toLoad = { hero: `${this.dir}herospritesheet.png`, botFrame: `${this.dir}botframe.png`, white:`${this.dir}white.png`, shadow:`${this.dir}shadow.png`, fontWhite:`${this.dir}sprite-font-white.png`, fontBlack:`${this.dir}sprite-font-black.png` }; }
  loadResources() { if (this.initialized) return; this.initialized = true; Object.keys(this.toLoad).forEach(key => { if (!this.images[key]) { const img = new Image(); img.src = this.toLoad[key]; this.images[key] = { image: img, isLoaded:false }; img.onload = () => { this.images[key].isLoaded = true; }; } }); }
  ensureLoaded() { if (!this.initialized) this.loadResources(); }
}
export const resources = new Resources();
export function hexToRgb(hex: string) { hex = hex.replace(/^#/, ''); const r = parseInt(hex.substring(0,2),16); const g = parseInt(hex.substring(2,4),16); const b = parseInt(hex.substring(4,6),16); return [r,g,b]; }
export interface Resource { image: HTMLImageElement; isLoaded: boolean; }
