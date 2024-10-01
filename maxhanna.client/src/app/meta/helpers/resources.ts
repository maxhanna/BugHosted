 
export class Resources {
  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};

  constructor() {
    this.toLoad = {
      blinds: "assets/metabots/blinds.png", 
      bedroomFloor: "assets/metabots/bedroom-floor.png",
      cave: "assets/metabots/cave.png",
      caveGround: "assets/metabots/cave-ground.png",
      carpet: "assets/metabots/carpet.png",
      chair: "assets/metabots/chair.png",
      exit: "assets/metabots/exit.png",
      exit2: "assets/metabots/exit2.png",
      fenceHorizontal: "assets/metabots/fence-horizontal.png",
      fenceVertical: "assets/metabots/fence-vertical.png",
      gangster: "assets/metabots/gangsprite.png",
      goldenPath: "assets/metabots/golden-path.png",
      hero: "assets/metabots/herospritesheet.png",
      heroHome: "assets/metabots/hero-home.png",
      knight: "assets/metabots/knight-sheet-1.png",
      painting: "assets/metabots/painting.png",
      portraits: "assets/metabots/portraits-sheet.png",
      referee: "assets/metabots/referee-spritesheet.png", 
      shadow: "assets/metabots/shadow.png", 
      shrub: "assets/metabots/shrub.png", 
      fontWhite: "assets/metabots/sprite-font-white.png", 
      textBox: "assets/metabots/text-box.png",  
      watch: "assets/metabots/watch.png",
      white: "assets/metabots/white.png",
      xbox: "assets/metabots/xbox.png",
    };
    this.images = {};
     
    Object.keys(this.toLoad).forEach((key: string) => {
      const img = new Image();
      img.src = this.toLoad[key];
      this.images[key] = {
        image: img,
        isLoaded: false
      };
      img.onload = () => {
        this.images[key].isLoaded = true;
      };
    });
  }
}
export const resources = new Resources();
