import { Bugcatcher } from "../objects/Npc/Bugcatcher/bugcatcher";

 
export class Resources {
  toLoad: { [key: string]: string };
  images: { [key: string]: any } = {};

  constructor() {
    this.toLoad = {
      apple: "assets/metabots/apple.png", 
      armobot: "assets/metabots/armobot.png", 
      blinds: "assets/metabots/blinds.png", 
      bedroomFloor: "assets/metabots/bedroom-floor.png",
      biggerBush: "assets/metabots/biggerbush.png",
      botcasing: "assets/metabots/botcasing.png",
      botFrame: "assets/metabots/botframe.png",
      botFrame2: "assets/metabots/botframe2.png",
      botFrame3: "assets/metabots/botframe3.png",
      botFrame4: "assets/metabots/botframe4.png",
      botFrame5: "assets/metabots/botframe5.png",
      botFrame6: "assets/metabots/botframe6.png",
      botFrame7: "assets/metabots/botframe7.png",
      botFrame8: "assets/metabots/botframe8.png",
      brickRoad: "assets/metabots/brickroad.png",
      bugcatcher: "assets/metabots/bugcatcher.png",
      cave: "assets/metabots/cave.png",
      caveGround: "assets/metabots/cave-ground.png",
      carpet: "assets/metabots/carpet.png",
      chair: "assets/metabots/chair.png",
      chicken: "assets/metabots/chicken.png",
      cornercounter: "assets/metabots/cornercounter.png",
      counter: "assets/metabots/counter.png",
      counterNoLedge: "assets/metabots/counternoledge.png",
      deer: "assets/metabots/deer.png",
      exit: "assets/metabots/exit.png",
      exit2: "assets/metabots/exit2.png",
      fenceHorizontal: "assets/metabots/fence-horizontal.png",
      fenceVertical: "assets/metabots/fence-vertical.png",
      flowerbush: "assets/metabots/flowerbush.png", 
      fontWhite: "assets/metabots/sprite-font-white.png", 
      fontBlack: "assets/metabots/sprite-font-black.png", 
      fountain: "assets/metabots/fountain.png", 
      fridge: "assets/metabots/fridge.png",
      gangster: "assets/metabots/gangsprite.png",
      goldenPath: "assets/metabots/golden-path.png",
      graphiti1: "assets/metabots/graphiti1.png",
      graphiti2: "assets/metabots/graphiti2.png",
      graphitibunny: "assets/metabots/graphitibunny.png",
      graphitifrog: "assets/metabots/graphitifrog.png",
      graphiticornermonster: "assets/metabots/graphiticornermonster.png",
      graphitiskull: "assets/metabots/graphitiskull.png",
      graphitisun: "assets/metabots/graphitisun.png",
      graphitiyack: "assets/metabots/graphitiyack.png",
      grassBlade: "assets/metabots/grassblade.png",
      hero: "assets/metabots/herospritesheet.png",
      heroHome: "assets/metabots/hero-home.png",
      house: "assets/metabots/house.png",
      houseSide: "assets/metabots/house-side.png",
      knight: "assets/metabots/knight-sheet-1.png",
      menuBorder: "assets/metabots/menuborder.png",
      mom: "assets/metabots/mom-sprite.png",
      museum: "assets/metabots/museum.png",
      painting: "assets/metabots/painting.png",
      pointer: "assets/metabots/pointer.png",
      portraits: "assets/metabots/portraits-sheet.png",
      referee: "assets/metabots/referee-spritesheet.png", 
      salesPerson: "assets/metabots/salesperson.png", 
      sign: "assets/metabots/sign.png", 
      sign2: "assets/metabots/sign2.png", 
      sink: "assets/metabots/sink.png", 
      shadow: "assets/metabots/shadow.png", 
      shop: "assets/metabots/shop.png", 
      shopFloor: "assets/metabots/shopfloor.png", 
      shrub: "assets/metabots/shrub.png", 
      shortgrass: "assets/metabots/shortgrass.png", 
      spiderBot: "assets/metabots/spiderbot.png", 
      stand: "assets/metabots/stand.png", 
      stove: "assets/metabots/stove.png", 
      stoneCircle: "assets/metabots/stonecircle.png", 
      stoneroad: "assets/metabots/stoneroad.png", 
      textBox: "assets/metabots/text-box.png",  
      tree: "assets/metabots/tree.png",  
      tv: "assets/metabots/tv.png",  
      watch: "assets/metabots/watch.png",
      water: "assets/metabots/Water.png",
      wardrobe: "assets/metabots/wardrobe.png",
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
export function hexToRgb(hex: string) {
  // Remove the leading '#' if present
  hex = hex.replace(/^#/, '');

  // Parse the hex string into RGB components
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);

  return [r, g, b]; // Return the RGB values as an array
}
