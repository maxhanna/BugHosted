 
export class Resources {
  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};

  constructor() {
    this.toLoad = {
      blinds: "assets/metabots/blinds.png", 
      bedroomFloor: "assets/metabots/bedroom-floor.png",
      biggerBush: "assets/metabots/biggerbush.png",
      botFrame: "assets/metabots/botframe.png",
      brickRoad: "assets/metabots/brickroad.png",
      cave: "assets/metabots/cave.png",
      caveGround: "assets/metabots/cave-ground.png",
      carpet: "assets/metabots/carpet.png",
      chair: "assets/metabots/chair.png",
      chicken: "assets/metabots/chicken.png",
      cornercounter: "assets/metabots/cornercounter.png",
      deer: "assets/metabots/deer.png",
      exit: "assets/metabots/exit.png",
      exit2: "assets/metabots/exit2.png",
      fenceHorizontal: "assets/metabots/fence-horizontal.png",
      fenceVertical: "assets/metabots/fence-vertical.png",
      flowerbush: "assets/metabots/flowerbush.png", 
      fontWhite: "assets/metabots/sprite-font-white.png", 
      fridge: "assets/metabots/fridge.png",
      gangster: "assets/metabots/gangsprite.png",
      goldenPath: "assets/metabots/golden-path.png",
      hero: "assets/metabots/herospritesheet.png",
      heroHome: "assets/metabots/hero-home.png",
      house: "assets/metabots/house.png",
      knight: "assets/metabots/knight-sheet-1.png",
      mom: "assets/metabots/mom-sprite.png",
      painting: "assets/metabots/painting.png",
      portraits: "assets/metabots/portraits-sheet.png",
      referee: "assets/metabots/referee-spritesheet.png", 
      sign: "assets/metabots/sign.png", 
      sink: "assets/metabots/sink.png", 
      shadow: "assets/metabots/shadow.png", 
      shrub: "assets/metabots/shrub.png", 
      stove: "assets/metabots/stove.png", 
      textBox: "assets/metabots/text-box.png",  
      tree: "assets/metabots/tree.png",  
      watch: "assets/metabots/watch.png",
      water: "assets/metabots/Water.png",
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
